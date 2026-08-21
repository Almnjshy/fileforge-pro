package pro.fileforge.app.plugins

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.Settings
import android.util.Base64
import android.util.Log
import android.webkit.MimeTypeMap
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PluginResult
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.app.PendingIntent
import java.nio.charset.StandardCharsets
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import pro.fileforge.app.core.storage.NativeStorageService
import pro.fileforge.app.core.model.NativeFileMetadata
import android.media.MediaMetadataRetriever
import pro.fileforge.app.core.operations.NativeFileOperationService
import pro.fileforge.app.core.operations.NativeOperationEngine
import pro.fileforge.app.core.operations.NativeTransactionalOperationService
import pro.fileforge.app.core.media.NativeMediaService
import pro.fileforge.app.core.media.NativeThumbnailService
import pro.fileforge.app.core.recovery.NativeOperationJournal

@CapacitorPlugin(
    name = "FileForgeFileAccess",
    permissions = [
        Permission(
            alias = "storage",
            strings = [
                Manifest.permission.READ_EXTERNAL_STORAGE,
                Manifest.permission.WRITE_EXTERNAL_STORAGE
            ]
        ),
        Permission(
            alias = "media",
            strings = [
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VIDEO,
                Manifest.permission.READ_MEDIA_AUDIO
            ]
        ),
        Permission(alias = "camera", strings = [Manifest.permission.CAMERA]),
        Permission(alias = "microphone", strings = [Manifest.permission.RECORD_AUDIO]),
        Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS]),
        Permission(
            alias = "location",
            strings = [
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            ]
        )
    ]
)
class FileForgeFileAccessPlugin : Plugin() {
    // Native core services. The Capacitor plugin is intentionally only an adapter:
    // request validation + JS serialization live here; filesystem/media mechanics
    // live in dedicated testable services.
    private val nativeStorage = NativeStorageService()
    private val unifiedStorage by lazy { pro.fileforge.app.core.storage.UnifiedStorageService(context, nativeStorage) }
    private val nativeOperations by lazy { NativeFileOperationService(context, nativeStorage) }
    private val nativeOperationEngine by lazy { NativeOperationEngine(context, unifiedStorage) }
    private val nativeMedia by lazy { NativeMediaService(context) }
    private val nativeThumbnails by lazy { NativeThumbnailService(File(context.cacheDir, "fileforge"), context) }
    private val operationJournal by lazy { NativeOperationJournal(context) }
    private val recoveryEngine by lazy { pro.fileforge.app.core.recovery.RecoveryDecisionEngine(context) }
    private val transactionalOperations by lazy { NativeTransactionalOperationService(context, operationJournal) }


    companion object {
        private const val TAG = "FileForgeFileAccess"
        // Raised to 200MB so media files (audio/video/PDF) can be read for playback.
        // Previous 5MB limit blocked virtually every real media file.
        private const val MAX_TEXT_READ_BYTES = 200_000_000L
    }

    // Single supervisor-backed IO scope — cancellation propagates cleanly,
    // exceptions in one operation never crash the scope.
    private val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private data class NativeOperationControl(
        val cancelled: AtomicBoolean = AtomicBoolean(false),
        val paused: AtomicBoolean = AtomicBoolean(false),
        @Volatile var status: String = "pending",
        @Volatile var bytesProcessed: Long = 0L,
        @Volatile var totalBytes: Long = 0L,
        @Volatile var currentPath: String = "",
        @Volatile var type: String = "",
        @Volatile var error: String? = null,
    )

    private val nativeOperationsById = ConcurrentHashMap<String, NativeOperationControl>()

    private fun operationControl(id: String, type: String): NativeOperationControl =
        nativeOperationsById.computeIfAbsent(id) { NativeOperationControl(type = type) }

    private fun notifyOperationState(id: String, type: String, status: String, message: String? = null) {
        val control = nativeOperationsById[id]
        if (control != null) control.status = status
        notifyListeners("fileOperationState", JSObject().apply {
            put("operationId", id)
            put("type", type)
            put("status", status)
            if (message != null) put("message", message)
        })
    }

    // ============ Resolve logical root IDs to real Android paths ============
    private fun resolveLogicalPath(path: String?): String? {
        if (path.isNullOrEmpty()) {
            return Environment.getExternalStorageDirectory().absolutePath
        }
        return when (path) {
            "root", "internal", "internal-storage" ->
                Environment.getExternalStorageDirectory().absolutePath
            "sd-card", "sdcard" -> {
                val externals = context.getExternalFilesDirs(null)
                if (externals != null && externals.size > 1 && externals[1] != null) {
                    val sdPath = externals[1]!!.absolutePath
                    val androidIdx = sdPath.indexOf("/Android/")
                    if (androidIdx > 0) sdPath.substring(0, androidIdx) else sdPath
                } else null
            }
            "usb-storage", "usb" -> {
                var usbDir = File("/storage/usb0")
                if (usbDir.exists()) usbDir.absolutePath
                else {
                    usbDir = File("/storage/usb1")
                    if (usbDir.exists()) usbDir.absolutePath else null
                }
            }
            else -> {
                if (path.startsWith("/")) {
                    validatePathWithinAllowedRoots(path)
                } else {
                    // Treat as subdirectory — canonicalize so "../" cannot escape
                    val resolved = File(Environment.getExternalStorageDirectory(), path).canonicalFile
                    validatePathWithinAllowedRoots(resolved.absolutePath)
                }
            }
        }
    }

    /** Resolve either a direct Android path or a SAF content URI without coercing it to File. */
    private fun resolveStorageRef(path: String?): String? {
        if (path.isNullOrEmpty()) return Environment.getExternalStorageDirectory().absolutePath
        if (path.startsWith("content://", ignoreCase = true)) return path
        return resolveLogicalPath(path)
    }

    private fun validatePathWithinAllowedRoots(rawPath: String): String? {
        return try {
            val candidate = File(rawPath).canonicalFile
            val canonical = candidate.absolutePath
            val allowedRoots = mutableListOf<String>()
            allowedRoots.add(Environment.getExternalStorageDirectory().absolutePath)
            val externals = context.getExternalFilesDirs(null)
            if (externals != null) {
                for (ext in externals) {
                    if (ext == null) continue
                    val extPath = ext.absolutePath
                    val androidIdx = extPath.indexOf("/Android/")
                    allowedRoots.add(if (androidIdx > 0) extPath.substring(0, androidIdx) else extPath)
                }
            }
            allowedRoots.add("/storage/usb0")
            allowedRoots.add("/storage/usb1")
            for (root in allowedRoots) {
                if (canonical == root || canonical.startsWith(root + File.separator)) {
                    return canonical
                }
            }
            Log.w(TAG, "Rejected out-of-scope path: $rawPath")
            null
        } catch (e: IOException) {
            Log.e(TAG, "Path validation failed for: $rawPath", e)
            null
        }
    }

    // ============ List Directory ============
    @PluginMethod
    fun listDirectory(call: PluginCall) {
        val rawPath = call.getString("path", "")
        val showHidden = call.getBoolean("showHidden", false) ?: false
        val path = resolveStorageRef(rawPath)
        if (path == null) { call.reject("Storage location not available: $rawPath"); return }
        if (!path.startsWith("content://", ignoreCase = true) && !hasReadPermission()) { requestReadPermission(call); return }
        ioScope.launch {
            try {
                val entries = withContext(Dispatchers.IO) { unifiedStorage.list(path, showHidden) }
                val files = JSArray()
                entries.forEach { e ->
                    files.put(JSObject().apply {
                        put("name", e.name); put("path", e.path)
                        put("isDirectory", e.isDirectory); put("size", e.size)
                        put("lastModified", e.lastModified); put("mimeType", e.mimeType)
                    })
                }
                val ret = JSObject()
                ret.put("files", files)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "listDirectory error", e)
                call.reject("Failed to list directory: ${e.message}")
            }
        }
    }

    // ============ Create Directory ============
    @PluginMethod
    fun createDirectory(call: PluginCall) {
        val path = resolveStorageRef(call.getString("path", ""))
        val name = call.getString("name", "") ?: ""
        if (path.isNullOrEmpty() || name.isBlank()) { call.reject("Path and name are required, or path is outside allowed storage"); return }
        ioScope.launch {
            try {
                val created = withContext(Dispatchers.IO) { unifiedStorage.createDirectory(path, name) }
                val ret = JSObject()
                ret.put("success", created.isNotBlank())
                ret.put("ref", created)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Failed to create directory: ${e.message}")
            }
        }
    }

    // ============ Delete File ============
    @PluginMethod
    fun deleteFile(call: PluginCall) {
        val path = resolveStorageRef(call.getString("path", ""))
        if (path.isNullOrBlank()) { call.reject("Path is required"); return }
        val operationId = call.getString("operationId") ?: "delete-${System.nanoTime()}"
        val control = operationControl(operationId, "delete")
        operationJournal.begin(operationId, "delete", "Delete $path", source = path, resumable = false)
        notifyOperationState(operationId, "delete", "running")
        ioScope.launch {
            try {
                withContext(Dispatchers.IO) { nativeOperationEngine.delete(path, control.cancelled, control.paused) { p ->
                    control.bytesProcessed = p.bytesProcessed; control.totalBytes = p.totalBytes; control.currentPath = p.currentPath
                    operationJournal.update(operationId, "running", p.bytesProcessed, p.totalBytes, p.currentPath)
                    notifyOperationProgress(operationId, "delete", p.bytesProcessed, p.totalBytes, p.currentPath)
                } }
                operationJournal.complete(operationId); notifyOperationState(operationId, "delete", "completed")
                call.resolve(JSObject().apply { put("success", true); put("operationId", operationId) })
            } catch (e: Exception) {
                val cancelled = control.cancelled.get() || e is NativeOperationEngine.OperationCancelledException
                operationJournal.update(operationId, if (cancelled) "cancelled" else "failed", control.bytesProcessed, control.totalBytes, control.currentPath, e.message)
                notifyOperationState(operationId, "delete", if (cancelled) "cancelled" else "failed", e.message)
                notifyOperationError(operationId, "delete", e.message ?: "Delete failed"); call.reject("Failed to delete: ${e.message}")
            } finally { nativeOperationsById.remove(operationId) }
        }
    }

    // ============ Rename File ============
    @PluginMethod
    fun renameFile(call: PluginCall) {
        val path = resolveStorageRef(call.getString("path", ""))
        val newName = call.getString("newName", "") ?: ""
        if (path.isNullOrEmpty() || newName.isBlank()) { call.reject("Path and newName are required"); return }
        ioScope.launch {
            try {
                val renamed = withContext(Dispatchers.IO) { unifiedStorage.rename(path, newName) }
                call.resolve(JSObject().apply { put("success", true); put("newPath", renamed); put("ref", renamed) })
            } catch (e: Exception) {
                call.reject("Failed to rename: ${e.message}")
            }
        }
    }

    // ============ Provider-aware File Operations ============
    private fun conflictPolicy(call: PluginCall): NativeOperationEngine.ConflictPolicy = when (call.getString("conflictPolicy", "fail")?.lowercase()) {
        "replace", "overwrite" -> NativeOperationEngine.ConflictPolicy.REPLACE
        "skip" -> NativeOperationEngine.ConflictPolicy.SKIP
        "rename", "keep_both" -> NativeOperationEngine.ConflictPolicy.RENAME
        else -> NativeOperationEngine.ConflictPolicy.FAIL
    }

    @PluginMethod
    fun copyFile(call: PluginCall) {
        executeNativeFileOperation(call, "copy") { from, to, targetName, policy, control, progress ->
            nativeOperationEngine.copy(from, to, targetName, policy, control.cancelled, control.paused, progress)
        }
    }

    @PluginMethod
    fun moveFile(call: PluginCall) {
        executeNativeFileOperation(call, "move") { from, to, targetName, policy, control, progress ->
            nativeOperationEngine.move(from, to, targetName, policy, control.cancelled, control.paused, progress)
        }
    }

    private fun executeNativeFileOperation(
        call: PluginCall,
        type: String,
        execute: (String, String, String?, NativeOperationEngine.ConflictPolicy, NativeOperationControl, ((NativeOperationEngine.Progress) -> Unit)?) -> NativeOperationEngine.Result,
    ) {
        val from = call.getString("from", "") ?: ""; val to = call.getString("to", "") ?: ""
        if (from.isBlank() || to.isBlank()) { call.reject("from and to are required"); return }
        val operationId = call.getString("operationId") ?: "$type-${System.nanoTime()}"
        val control = operationControl(operationId, type)
        val targetName = call.getString("targetName")
        val policy = conflictPolicy(call)
        operationJournal.begin(operationId, type, "$type $from", source = from, target = to, resumable = false)
        notifyOperationState(operationId, type, "running")
        ioScope.launch {
            try {
                val localFrom = if (!from.startsWith("content://", true)) runCatching { File(from).canonicalFile }.getOrNull() else null
                val localTo = if (!to.startsWith("content://", true)) runCatching { File(to).canonicalFile }.getOrNull() else null
                val result = withContext(Dispatchers.IO) {
                    if ((type == "copy" || type == "move") && localFrom != null && localTo != null) {
                        val target = if (targetName.isNullOrBlank()) localTo else File(localTo, targetName).canonicalFile
                        val tx = transactionalOperations.execute(operationId, type, localFrom, target, policy, control.cancelled, control.paused) { p ->
                            control.bytesProcessed = p.bytesProcessed; control.totalBytes = p.totalBytes; control.currentPath = p.currentPath
                            operationJournal.update(operationId, "running", p.bytesProcessed, p.totalBytes, p.currentPath)
                            notifyOperationProgress(operationId, type, p.bytesProcessed, p.totalBytes, p.currentPath)
                        }
                        NativeOperationEngine.Result(tx.target.absolutePath, tx.skipped, false)
                    } else execute(from, to, targetName, policy, control) { p ->
                    control.bytesProcessed = p.bytesProcessed; control.totalBytes = p.totalBytes; control.currentPath = p.currentPath
                    operationJournal.update(operationId, "running", p.bytesProcessed, p.totalBytes, p.currentPath)
                    notifyOperationProgress(operationId, type, p.bytesProcessed, p.totalBytes, p.currentPath)
                } }
                operationJournal.complete(operationId); notifyOperationState(operationId, type, if (result.skipped) "skipped" else "completed")
                call.resolve(JSObject().apply { put("success", true); put("operationId", operationId); put("ref", result.ref); put("skipped", result.skipped); put("crossProvider", result.crossProvider) })
            } catch (e: Exception) {
                val cancelled = control.cancelled.get() || e is NativeOperationEngine.OperationCancelledException
                operationJournal.update(operationId, if (cancelled) "cancelled" else "failed", control.bytesProcessed, control.totalBytes, control.currentPath, e.message)
                notifyOperationState(operationId, type, if (cancelled) "cancelled" else "failed", e.message)
                notifyOperationError(operationId, type, e.message ?: "$type failed"); call.reject("Failed to $type: ${e.message}")
            } finally { nativeOperationsById.remove(operationId) }
        }
    }

    @PluginMethod
    fun getOperationHistory(call: PluginCall) {
        val limit = call.getInt("limit", 100) ?: 100
        call.resolve(JSObject().apply { put("operations", operationJournal.listHistory(limit)) })
    }

    @PluginMethod
    fun getRecoveryDecisions(call: PluginCall) {
        val recovered = operationJournal.recoverInterrupted()
        val decisions = JSArray()
        for (i in 0 until recovered.length()) {
            val record = recovered.optJSONObject(i) ?: continue
            decisions.put(recoveryEngine.evaluate(record))
        }
        call.resolve(JSObject().apply { put("operations", decisions) })
    }

    /**
     * Executes the deterministic recovery decision instead of merely reporting it.
     * The decision is re-evaluated immediately before execution so a stale UI decision
     * cannot accidentally resume or recover a changed file.
     */
    @PluginMethod
    fun executeRecoveryDecision(call: PluginCall) {
        val id = call.getString("operationId", "") ?: ""
        val requested = call.getString("decision", "")?.lowercase() ?: ""
        val record = operationJournal.get(id)
        if (record == null) { call.reject("Recovery record not found"); return }
        if (record.optString("status") != "interrupted") { call.reject("Operation is not interrupted"); return }

        val evaluated = recoveryEngine.evaluate(record)
        val actual = evaluated.optString("decision")
        if (requested.isBlank() || requested != actual) {
            call.reject("Recovery decision is stale; current decision is $actual")
            return
        }

        val type = record.optString("type")
        val sourceRaw = record.optString("source", "")
        val targetRaw = record.optString("target", "")
        val source = resolveLogicalPath(sourceRaw)
        val target = resolveLogicalPath(targetRaw)

        if (actual == "manual") { call.reject("Manual recovery is required"); return }
        if ((type == "copy" || type == "move") && (source.isNullOrBlank() || target.isNullOrBlank())) {
            call.reject("Stored paths are no longer accessible"); return
        }

        when (actual) {
            "discard" -> {
                operationJournal.get(id)?.let { transactionalOperations.discard(it) }
                operationJournal.remove(id)
                notifyOperationState(id, type, "discarded", "Interrupted operation discarded")
                call.resolve(JSObject().apply { put("success", true); put("operationId", id); put("decision", actual) })
            }
            "rollback" -> {
                ioScope.launch {
                    try {
                        val txRecord = operationJournal.get(id)
                        if (txRecord?.optString("transactionState")?.isNotBlank() == true) transactionalOperations.rollback(txRecord)
                        else {
                            val targetFile = File(target!!)
                            if (targetFile.exists() && !targetFile.deleteRecursively()) error("Unable to remove partial destination")
                        }
                        operationJournal.remove(id)
                        notifyOperationState(id, type, "rolled_back", "Partial destination removed")
                        call.resolve(JSObject().apply { put("success", true); put("operationId", id); put("decision", actual) })
                    } catch (e: Exception) { call.reject("Rollback failed: ${e.message}") }
                }
            }
            "recover" -> {
                ioScope.launch {
                    try {
                        val txRecord = operationJournal.get(id)
                        if (txRecord?.optString("transactionState")?.isNotBlank() == true) {
                            if (type == "move") transactionalOperations.finalizeMoveRecovery(txRecord)
                            else transactionalOperations.discard(txRecord)
                        } else if (type == "move") {
                            val sourceFile = File(source!!)
                            if (!sourceFile.delete()) error("Destination is complete but source could not be removed")
                        }
                        operationJournal.complete(id)
                        notifyOperationState(id, type, "completed", "Recovered completed destination")
                        call.resolve(JSObject().apply { put("success", true); put("operationId", id); put("decision", actual) })
                    } catch (e: Exception) { call.reject("Recovery finalize failed: ${e.message}") }
                }
            }
            "resume" -> startRecoveredCopyMove(id, type, source!!, target!!, true, call)
            "restart" -> startRecoveredCopyMove(id, type, source!!, target!!, false, call)
            else -> call.reject("Unsupported recovery decision: $actual")
        }
    }

    private fun startRecoveredCopyMove(id: String, type: String, source: String, target: String, resume: Boolean, call: PluginCall) {
        val sourceFile = File(source)
        val targetFile = File(target)
        if (!sourceFile.isFile) { call.reject("Source file no longer exists"); return }
        val control = operationControl(id, type)
        control.status = "running"
        control.cancelled.set(false); control.paused.set(false)
        notifyOperationState(id, type, "running", if (resume) "Resuming from verified checkpoint" else "Restarting from a clean destination")
        ioScope.launch {
            try {
                if (!resume && targetFile.exists() && !targetFile.deleteRecursively()) error("Unable to remove partial destination")
                val progress = { p: NativeFileOperationService.Progress ->
                    control.bytesProcessed = p.bytesProcessed; control.totalBytes = p.totalBytes; control.currentPath = p.currentPath
                    operationJournal.update(id, "running", p.bytesProcessed, p.totalBytes, p.currentPath)
                    notifyOperationProgress(id, type, p.bytesProcessed, p.totalBytes, p.currentPath)
                }
                if (resume) {
                    nativeOperations.resumeSingleFileCopy(sourceFile, targetFile, control.cancelled, control.paused, progress)
                } else {
                    nativeOperations.copy(sourceFile, targetFile, control.cancelled, control.paused, progress)
                }
                if (type == "move") {
                    if (!sourceFile.delete()) error("Copy completed but source could not be deleted")
                }
                operationJournal.complete(id)
                notifyOperationState(id, type, "completed", if (resume) "Recovered and completed" else "Restarted and completed")
                call.resolve(JSObject().apply { put("success", true); put("operationId", id); put("decision", if (resume) "resume" else "restart") })
            } catch (e: Exception) {
                val cancelled = control.cancelled.get() || e.message?.contains("cancel", true) == true
                operationJournal.update(id, if (cancelled) "cancelled" else "failed", control.bytesProcessed, control.totalBytes, control.currentPath, e.message)
                notifyOperationState(id, type, if (cancelled) "cancelled" else "failed", e.message)
                notifyOperationError(id, type, e.message ?: "Recovery execution failed")
                call.reject("Recovery execution failed: ${e.message}")
            } finally { nativeOperationsById.remove(id) }
        }
    }

    @PluginMethod
    fun getRecoveredFileOperations(call: PluginCall) {
        val recovered = operationJournal.recoverInterrupted()
        call.resolve(JSObject().apply { put("operations", recovered) })
    }

    /**
     * True resume for a single-file local copy/move. The destination length is
     * the durable checkpoint; the native engine validates it before appending.
     */
    @PluginMethod
    fun resumeRecoveredFileOperation(call: PluginCall) {
        val id = call.getString("operationId", "") ?: ""
        val record = operationJournal.get(id)
        if (record == null || !record.optBoolean("resumable", false)) {
            call.reject("Operation is not resumable")
            return
        }
        if (record.optString("status") != "interrupted") {
            call.reject("Operation is not interrupted")
            return
        }
        val type = record.optString("type")
        if (type != "copy" && type != "move") {
            call.reject("Only local copy/move operations support true resume in this phase")
            return
        }
        val source = resolveLogicalPath(record.optString("source"))
        val target = resolveLogicalPath(record.optString("target"))
        if (source.isNullOrBlank() || target.isNullOrBlank()) { call.reject("Stored paths are no longer accessible"); return }
        val sourceFile = File(source)
        val targetFile = File(target)
        if (!sourceFile.isFile) { call.reject("Source file no longer exists"); return }
        val control = operationControl(id, type)
        control.status = "running"
        control.cancelled.set(false)
        control.paused.set(false)
        notifyOperationState(id, type, "running", "Resuming from verified destination checkpoint")
        ioScope.launch {
            try {
                nativeOperations.resumeSingleFileCopy(sourceFile, targetFile, control.cancelled, control.paused) { p ->
                    control.bytesProcessed = p.bytesProcessed; control.totalBytes = p.totalBytes; control.currentPath = p.currentPath
                    control.totalBytes = p.totalBytes
                    operationJournal.update(id, "running", p.bytesProcessed, p.totalBytes, p.currentPath)
                    notifyOperationProgress(id, type, p.bytesProcessed, p.totalBytes, p.currentPath)
                }
                if (type == "move") {
                    if (!sourceFile.delete()) error("Copy resumed successfully but source could not be deleted")
                }
                operationJournal.complete(id)
                notifyOperationState(id, type, "completed", "Operation resumed and completed")
                call.resolve(JSObject().apply { put("success", true); put("operationId", id) })
            } catch (e: Exception) {
                val cancelled = control.cancelled.get() || e.message?.contains("cancel", true) == true
                operationJournal.update(id, if (cancelled) "cancelled" else "failed", control.bytesProcessed, control.totalBytes, control.currentPath, e.message)
                notifyOperationState(id, type, if (cancelled) "cancelled" else "failed", e.message)
                notifyOperationError(id, type, e.message ?: "Resume failed")
                call.reject("Resume failed: ${e.message}")
            } finally {
                nativeOperationsById.remove(id)
            }
        }
    }

    @PluginMethod
    fun cancelFileOperation(call: PluginCall) {
        val id = call.getString("operationId", "") ?: ""
        val control = nativeOperationsById[id]
        if (control == null) { call.resolve(JSObject().apply { put("accepted", false); put("status", "not_found") }); return }
        control.cancelled.set(true); control.paused.set(false)
        notifyOperationState(id, control.type, "cancelling")
        call.resolve(JSObject().apply { put("accepted", true); put("status", "cancelling") })
    }

    @PluginMethod
    fun pauseFileOperation(call: PluginCall) {
        val id = call.getString("operationId", "") ?: ""
        val control = nativeOperationsById[id]
        if (control == null) { call.resolve(JSObject().apply { put("accepted", false); put("status", "not_found") }); return }
        control.paused.set(true)
        notifyOperationState(id, control.type, "paused")
        call.resolve(JSObject().apply { put("accepted", true); put("status", "paused") })
    }

    @PluginMethod
    fun resumeFileOperation(call: PluginCall) {
        val id = call.getString("operationId", "") ?: ""
        val control = nativeOperationsById[id]
        if (control == null || control.cancelled.get()) { call.resolve(JSObject().apply { put("accepted", false); put("status", "not_found") }); return }
        control.paused.set(false)
        notifyOperationState(id, control.type, "running")
        call.resolve(JSObject().apply { put("accepted", true); put("status", "running") })
    }

    @PluginMethod
    fun getFileOperationStatus(call: PluginCall) {
        val id = call.getString("operationId", "") ?: ""
        val control = nativeOperationsById[id]
        if (control == null) { call.resolve(JSObject().apply { put("found", false); put("operationId", id) }); return }
        call.resolve(JSObject().apply {
            put("found", true); put("operationId", id); put("type", control.type); put("status", control.status)
            put("bytesProcessed", control.bytesProcessed); put("totalBytes", control.totalBytes); put("currentPath", control.currentPath)
            put("fraction", if (control.totalBytes > 0) control.bytesProcessed.toDouble() / control.totalBytes else 0.0)
            control.error?.let { put("error", it) }
        })
    }

    // ============ Read File ============
    @PluginMethod
    fun readFile(call: PluginCall) {
        val path = resolveLogicalPath(call.getString("path", ""))
        val encoding = call.getString("encoding", "utf8") ?: "utf8"
        if (path.isNullOrEmpty()) { call.reject("Path is required, or path is outside allowed storage"); return }
        ioScope.launch {
            try {
                val file = File(path)
                if (!file.exists() || file.isDirectory) { call.reject("File does not exist or is a directory"); return@launch }
                if (file.length() > MAX_TEXT_READ_BYTES) {
                    call.reject("File too large for text reading (limit ${MAX_TEXT_READ_BYTES / 1_000_000}MB)")
                    return@launch
                }
                val content = withContext(Dispatchers.IO) {
                    if (encoding.equals("base64", true)) {
                        file.inputStream().use { Base64.encodeToString(it.readBytes(), Base64.NO_WRAP) }
                    } else nativeStorage.readText(file, Charsets.UTF_8)
                }
                call.resolve(JSObject().apply {
                    put("content", content)
                    put("encoding", encoding)
                })
            } catch (e: Exception) {
                call.reject("Failed to read file: ${e.message}")
            }
        }
    }

    // ============ Write File ============
    @PluginMethod
    fun writeFile(call: PluginCall) {
        val path = resolveLogicalPath(call.getString("path", ""))
        val content = call.getString("content", "") ?: ""
        val encoding = call.getString("encoding", "utf8") ?: "utf8"
        if (path.isNullOrEmpty()) { call.reject("Path is required, or path is outside allowed storage"); return }
        ioScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    val file = File(path)
                    if (encoding.equals("base64", true)) {
                        file.parentFile?.mkdirs()
                        FileOutputStream(file).use { it.write(Base64.decode(content, Base64.DEFAULT)) }
                    } else nativeStorage.writeText(file, content, Charsets.UTF_8)
                }
                val ret = JSObject()
                ret.put("success", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Failed to write file: ${e.message}")
            }
        }
    }

    // ============ Get File Metadata ============
    @PluginMethod
    fun getFileMetadata(call: PluginCall) {
        val path = resolveStorageRef(call.getString("path", ""))
        if (path.isNullOrEmpty()) { call.reject("Path is required, or path is outside allowed storage"); return }
        ioScope.launch {
            try {
                val meta = withContext(Dispatchers.IO) { unifiedStorage.metadata(path) }
                call.resolve(JSObject().apply {
                    put("name", meta.name)
                    put("size", meta.size)
                    put("lastModified", meta.lastModified)
                    put("mimeType", meta.mimeType)
                    put("isDirectory", meta.isDirectory)
                    put("path", meta.path)
                })
            } catch (e: Exception) {
                call.reject("Failed to get metadata: ${e.message}")
            }
        }
    }

    // ============ Generate Thumbnail ============
    @PluginMethod
    fun generateThumbnail(call: PluginCall) {
        val raw = call.getString("path", "") ?: ""
        val maxSize = call.getInt("maxSize", 200) ?: 200
        if (raw.isBlank()) { call.reject("Path is required"); return }
        ioScope.launch {
            try {
                val ref = if (raw.startsWith("content://", true)) raw else (resolveLogicalPath(raw) ?: run { call.reject("Path is outside allowed storage"); return@launch })
                val result = nativeThumbnails.generate(ref, maxSize)
                if (result.base64 == null) {
                    call.reject("Unsupported media type or thumbnail generation failed")
                    return@launch
                }
                call.resolve(JSObject().apply {
                    put("thumbnail", result.base64)
                    put("cached", result.cached)
                })
            } catch (e: Exception) {
                Log.e(TAG, "Thumbnail generation failed", e)
                call.reject("Thumbnail generation failed: ${e.message}")
            }
        }
    }

    // ============ Get Storage Info ============
    @PluginMethod
    fun getStorageInfo(call: PluginCall) {
        try {
            val external = Environment.getExternalStorageDirectory()
            val stat = StatFs(external.path)
            val total = stat.totalBytes
            val free = stat.freeBytes
            val used = total - free
            val ret = JSObject()
            ret.put("total", total)
            ret.put("free", free)
            ret.put("used", used)
            // Also enumerate SD/USB volumes
            val volumes = JSArray()
            val externals = context.getExternalFilesDirs(null)
            if (externals != null) {
                for (ext in externals) {
                    if (ext == null) continue
                    val extPath = ext.absolutePath
                    val androidIdx = extPath.indexOf("/Android/")
                    val root = if (androidIdx > 0) extPath.substring(0, androidIdx) else extPath
                    if (root == external.absolutePath) continue
                    try {
                        val s = StatFs(root)
                        val v = JSObject()
                        v.put("path", root)
                        v.put("total", s.totalBytes)
                        v.put("free", s.freeBytes)
                        v.put("used", s.totalBytes - s.freeBytes)
                        volumes.put(v)
                    } catch (_: Exception) { /* volume not mounted */ }
                }
            }
            ret.put("volumes", volumes)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to get storage info: ${e.message}")
        }
    }

    // ============ List Storage Volumes (SD / USB detection) ============
    /**
     * Enumerate all available storage volumes: primary external + removable
     * (SD cards, USB OTG). Returns an array of {path, label, isRemovable,
     * total, free, used}. Used by the Sidebar to show real SD/USB entries
     * instead of always-present fake ones.
     */
    @PluginMethod
    fun listStorageVolumes(call: PluginCall) {
        try {
            val volumes = JSArray()

            // Primary external storage (always present)
            val primary = Environment.getExternalStorageDirectory()
            val primaryStat = StatFs(primary.path)
            val primaryEntry = JSObject().apply {
                put("path", primary.absolutePath)
                put("label", "Internal Storage")
                put("isRemovable", false)
                put("isPrimary", true)
                put("total", primaryStat.totalBytes)
                put("free", primaryStat.freeBytes)
                put("used", primaryStat.totalBytes - primaryStat.freeBytes)
            }
            volumes.put(primaryEntry)

            // Removable storage via context.getExternalFilesDirs(null)
            // Returns null entries for non-mounted volumes, so we filter them.
            val externals = context.getExternalFilesDirs(null)
            if (externals != null) {
                for (ext in externals) {
                    if (ext == null) continue
                    val extPath = ext.absolutePath
                    // Extract the volume root from /storage/XXXX-XXXX/Android/data/...
                    val androidIdx = extPath.indexOf("/Android/")
                    val root = if (androidIdx > 0) extPath.substring(0, androidIdx) else extPath
                    if (root == primary.absolutePath) continue

                    try {
                        val stat = StatFs(root)
                        // Determine label — use the volume's mount-point name
                        val label = File(root).name ?: "Removable"
                        val entry = JSObject().apply {
                            put("path", root)
                            put("label", label)
                            put("isRemovable", true)
                            put("isPrimary", false)
                            put("total", stat.totalBytes)
                            put("free", stat.freeBytes)
                            put("used", stat.totalBytes - stat.freeBytes)
                        }
                        volumes.put(entry)
                    } catch (_: Exception) {
                        // Volume not mountable — skip
                    }
                }
            }

            // Also check /storage/usb0 and /storage/usb1 for legacy USB OTG paths
            // that don't surface via getExternalFilesDirs.
            for (usbPath in listOf("/storage/usb0", "/storage/usb1")) {
                val usbDir = File(usbPath)
                if (!usbDir.exists() || !usbDir.isDirectory) continue
                // Skip if already covered above
                val alreadyListed = (0 until volumes.length()).any { i ->
                    volumes.getJSONObject(i).getString("path") == usbPath
                }
                if (alreadyListed) continue
                try {
                    val stat = StatFs(usbPath)
                    val entry = JSObject().apply {
                        put("path", usbPath)
                        put("label", "USB Storage")
                        put("isRemovable", true)
                        put("isPrimary", false)
                        put("total", stat.totalBytes)
                        put("free", stat.freeBytes)
                        put("used", stat.totalBytes - stat.freeBytes)
                    }
                    volumes.put(entry)
                } catch (_: Exception) { /* not mounted */ }
            }

            val ret = JSObject()
            ret.put("volumes", volumes)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to list storage volumes: ${e.message}")
        }
    }

    // ============ File Hash (SHA-256 for duplicate detection) ============
    /**
     * Compute SHA-256 hash of a file's content. Used by the Storage Analyzer
     * for real duplicate detection (not just name+size heuristic).
     */
    @PluginMethod
    fun getFileHash(call: PluginCall) {
        val rawPath = call.getString("path", "") ?: ""
        val path = resolveLogicalPath(rawPath)
        if (path.isNullOrEmpty()) {
            call.reject("Path is required, or path is outside allowed storage")
            return
        }
        ioScope.launch {
            try {
                val file = File(path)
                if (!file.exists() || file.isDirectory) {
                    call.reject("File does not exist or is a directory")
                    return@launch
                }
                // Don't hash files > 500MB (too slow)
                if (file.length() > 500_000_000) {
                    call.reject("File too large for hashing (>500MB)")
                    return@launch
                }
                val md = java.security.MessageDigest.getInstance("SHA-256")
                FileInputStream(file).use { fis ->
                    val buffer = ByteArray(64 * 1024)
                    var read: Int
                    while (fis.read(buffer).also { read = it } > 0) {
                        md.update(buffer, 0, read)
                    }
                }
                val hash = md.digest()
                // Convert to hex string
                val hex = StringBuilder()
                for (b in hash) {
                    hex.append(String.format("%02x", b))
                }
                val ret = JSObject()
                ret.put("hash", hex.toString())
                ret.put("algorithm", "SHA-256")
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Hash computation failed: ${e.message}")
            }
        }
    }

    // ============ Folder Summary (real file count + folder count + size) ============
    /**
     * Walks a directory tree on a background thread and returns:
     *   fileCount   — number of files (recursively)
     *   folderCount — number of subdirectories (recursively)
     *   totalSize   — sum of all file sizes (recursively)
     *
     * Used by Sidebar / StatusBar / FileBrowser to show real folder counts
     * instead of the always-zero `childrenIds.length` for native folders.
     */
    @PluginMethod
    fun getFolderSummary(call: PluginCall) {
        val rawPath = call.getString("path", "") ?: ""
        val path = resolveLogicalPath(rawPath)
        if (path.isNullOrEmpty()) {
            call.reject("Path is required, or path is outside allowed storage")
            return
        }
        ioScope.launch {
            try {
                val root = File(path)
                if (!root.exists() || !root.isDirectory) {
                    call.reject("Directory does not exist or is not a directory")
                    return@launch
                }
                var fileCount = 0L
                var folderCount = 0L
                var totalSize = 0L
                val stack = ArrayDeque<File>()
                stack.addLast(root)
                val visited = mutableSetOf<String>()
                while (stack.isNotEmpty()) {
                    val dir = stack.removeLast()
                    val canonical = dir.absolutePath
                    if (visited.contains(canonical)) continue
                    visited.add(canonical)
                    val children = dir.listFiles() ?: continue
                    for (child in children) {
                        if (child.isDirectory) {
                            folderCount++
                            stack.addLast(child)
                        } else {
                            fileCount++
                            totalSize += child.length()
                        }
                    }
                }
                val ret = JSObject()
                ret.put("fileCount", fileCount)
                ret.put("folderCount", folderCount)
                ret.put("totalSize", totalSize)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Failed to get folder summary: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun storageFolderSummary(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                var fileCount = 0L; var folderCount = 0L; var totalSize = 0L
                val stack = ArrayDeque<String>(); stack.addLast(ref)
                while (stack.isNotEmpty()) {
                    val dirRef = stack.removeLast()
                    val entries = unifiedStorage.list(dirRef, true)
                    for (e in entries) {
                        if (e.isDirectory) { folderCount++; stack.addLast(e.path) }
                        else { fileCount++; totalSize += e.size }
                    }
                }
                call.resolve(JSObject().apply { put("fileCount", fileCount); put("folderCount", folderCount); put("totalSize", totalSize) })
            } catch (e: Exception) { call.reject("Storage folder summary failed: ${e.message}") }
        }
    }

    // ============ Native Search ============
    /**
     * Search for files by name pattern in a directory tree.
     * Walks the directory tree on a background thread and returns matching
     * files. This replaces the broken mock-tree search that only searched
     * in-memory nodes.
     */
    @PluginMethod
    fun searchFiles(call: PluginCall) {
        val rawPath = call.getString("path", "") ?: ""
        val query = call.getString("query", "") ?: ""
        val maxResults = call.getInt("maxResults", 500) ?: 500
        val path = resolveStorageRef(rawPath)
        if (path.isNullOrEmpty()) { call.reject("Path is required, or path is outside allowed storage"); return }
        if (query.isBlank()) { call.resolve(JSObject().apply { put("results", JSArray()); put("count", 0); put("truncated", false) }); return }

        ioScope.launch {
            try {
                val queryLower = query.lowercase()
                val results = JSArray()
                var count = 0
                if (path.startsWith("content://", true)) {
                    val stack = ArrayDeque<String>()
                    val visited = mutableSetOf<String>()
                    stack.addLast(path)
                    while (stack.isNotEmpty() && count < maxResults) {
                        val dirRef = stack.removeLast()
                        if (!visited.add(dirRef)) continue
                        val children = withContext(Dispatchers.IO) { unifiedStorage.list(dirRef, false) }
                        for (child in children) {
                            if (count >= maxResults) break
                            if (child.isDirectory) stack.addLast(child.path)
                            if (child.name.lowercase().contains(queryLower)) {
                                results.put(JSObject().apply {
                                    put("name", child.name); put("path", child.path)
                                    put("isDirectory", child.isDirectory); put("size", child.size)
                                    put("lastModified", child.lastModified); put("mimeType", child.mimeType)
                                })
                                count++
                            }
                        }
                    }
                } else {
                    val root = File(path)
                    if (!root.exists() || !root.isDirectory) { call.reject("Directory does not exist or is not a directory"); return@launch }
                    val visited = mutableSetOf<String>()
                    val stack = ArrayDeque<File>()
                    stack.addLast(root)
                    while (stack.isNotEmpty() && count < maxResults) {
                        val dir = stack.removeLast()
                        val canonical = runCatching { dir.canonicalPath }.getOrElse { dir.absolutePath }
                        if (!visited.add(canonical)) continue
                        val children = dir.listFiles() ?: continue
                        for (child in children) {
                            if (count >= maxResults) break
                            if (child.isDirectory) stack.addLast(child)
                            if (child.name.lowercase().contains(queryLower)) {
                                results.put(JSObject().apply {
                                    put("name", child.name); put("path", child.absolutePath)
                                    put("isDirectory", child.isDirectory); put("size", if (child.isFile) child.length() else 0L)
                                    put("lastModified", child.lastModified()); put("mimeType", getMimeType(child))
                                })
                                count++
                            }
                        }
                    }
                }
                call.resolve(JSObject().apply { put("results", results); put("count", count); put("truncated", count >= maxResults) })
            } catch (e: Exception) { call.reject("Search failed: ${e.message}") }
        }
    }

    // ============ Archive Operations ============
    @PluginMethod
    fun archiveList(call: PluginCall) {
        val rawPath = call.getString("path", "") ?: ""
        val password = (call.getString("password", "") ?: "").takeIf { it.isNotEmpty() }
        val path = resolveStorageRef(rawPath)
        if (path.isNullOrEmpty()) { call.reject("Path is required, or path is outside allowed storage"); return }
        ioScope.launch {
            val staged = runCatching { stageArchiveInput(path) }.getOrElse { call.reject("Archive input failed: ${it.message}"); return@launch }
            try {
                val result = withContext(Dispatchers.IO) { pro.fileforge.app.archive.ArchiveEngine.openArchive(staged.file, password) }
                val entries = JSArray()
                result.entries.forEach { e -> entries.put(JSObject().apply {
                    put("path", e.path); put("isDirectory", e.isDirectory); put("size", e.size)
                    put("compressedSize", e.compressedSize); put("modified", e.modified); put("isEncrypted", e.isEncrypted)
                }) }
                call.resolve(JSObject().apply {
                    put("entries", entries); put("isEncrypted", result.isEncrypted)
                    put("needsPassword", result.needsPassword); put("format", result.formatHint)
                })
            } catch (e: pro.fileforge.app.archive.ArchiveError.PasswordRequired) {
                call.resolve(JSObject().apply { put("entries", JSArray()); put("needsPassword", true); put("isEncrypted", true); put("format", "unknown") })
            } catch (e: pro.fileforge.app.archive.ArchiveError.WrongPassword) { call.reject("Wrong password. Please try again.")
            } catch (e: Exception) { call.reject("Archive open failed: ${e.message}")
            } finally { staged.cleanup() }
        }
    }

    @PluginMethod
    fun archiveExtractEntry(call: PluginCall) {
        val rawPath = call.getString("path", "") ?: ""
        val entryPath = call.getString("entryPath", "") ?: ""
        val targetPath = call.getString("targetPath", "") ?: ""
        val password = (call.getString("password", "") ?: "").takeIf { it.isNotEmpty() }
        val path = resolveStorageRef(rawPath)
        val targetResolved = resolveStorageRef(targetPath)
        if (path.isNullOrEmpty() || targetResolved.isNullOrEmpty() || entryPath.isEmpty()) { call.reject("path, entryPath and targetPath are required"); return }
        ioScope.launch {
            val input = runCatching { stageArchiveInput(path) }.getOrElse { call.reject("Archive input failed: ${it.message}"); return@launch }
            val target = runCatching { stageArchiveTarget(targetResolved) }.getOrElse { input.cleanup(); call.reject("Target preparation failed: ${it.message}"); return@launch }
            try {
                val ok = withContext(Dispatchers.IO) { pro.fileforge.app.archive.ArchiveEngine.extractEntry(input.file, entryPath, target.file.absolutePath, password) }
                if (ok && target.copyBack) copyTempTreeToStorage(target.file, target.ref)
                call.resolve(JSObject().apply { put("success", ok) })
            } catch (e: pro.fileforge.app.archive.ArchiveError.WrongPassword) { call.reject("Wrong password. Please try again.")
            } catch (e: Exception) { call.reject("Extract failed: ${e.message}")
            } finally { input.cleanup(); target.cleanup() }
        }
    }

    @PluginMethod
    fun archiveExtractAll(call: PluginCall) {
        val rawPath = call.getString("path", "") ?: ""
        val targetDir = call.getString("targetDir", "") ?: ""
        val password = (call.getString("password", "") ?: "").takeIf { it.isNotEmpty() }
        val operationId = call.getString("operationId", "")?.takeIf { it.isNotBlank() }
        val path = resolveStorageRef(rawPath)
        val targetResolved = resolveStorageRef(targetDir)
        if (path.isNullOrEmpty() || targetResolved.isNullOrEmpty()) { call.reject("path and targetDir are required"); return }
        val id = operationId ?: "extract-${System.nanoTime()}"
        val control = operationControl(id, "extract")
        operationJournal.begin(id, "extract", "Extract archive", source = path, target = targetResolved, resumable = false)
        notifyOperationState(id, "extract", "running")
        ioScope.launch {
            var input: StagedArchive? = null
            var target: StagedArchive? = null
            try {
                input = stageArchiveInput(path); target = stageArchiveTarget(targetResolved)
                val file = input.file
                val result = withContext(Dispatchers.IO) {
                    val archive = pro.fileforge.app.archive.ArchiveEngine.openArchive(file, password)
                    control.totalBytes = archive.entries.filterNot { it.isDirectory }.sumOf { if (it.size > 0) it.size else 0L }.let { if (it > 0) it else file.length() }
                    pro.fileforge.app.archive.ArchiveEngine.extractAll(file, target!!.file, password,
                        control = pro.fileforge.app.archive.ArchiveEngine.OperationControl(control.cancelled, control.paused),
                        onProgress = { p -> control.bytesProcessed = p.bytesProcessed; control.totalBytes = p.totalBytes; control.currentPath = p.currentPath; notifyOperationProgress(id, "extract", p.bytesProcessed, p.totalBytes, p.currentPath) })
                }
                if (control.cancelled.get()) {
                    operationJournal.update(id, "cancelled", control.bytesProcessed, control.totalBytes, control.currentPath, "Operation cancelled")
                    notifyOperationState(id, "extract", "cancelled")
                } else {
                    if (target!!.copyBack) copyTempTreeToStorage(target!!.file, target!!.ref)
                    operationJournal.complete(id); notifyOperationState(id, "extract", "completed")
                }
                call.resolve(JSObject().apply { put("success", !control.cancelled.get()); put("extracted", result); put("operationId", id) })
            } catch (e: pro.fileforge.app.archive.ArchiveError.PasswordRequired) {
                operationJournal.update(id, "failed", control.bytesProcessed, control.totalBytes, control.currentPath, e.message)
                notifyOperationState(id, "extract", "failed", e.message); call.reject(e.message)
            } catch (e: pro.fileforge.app.archive.ArchiveError.WrongPassword) { call.reject("Wrong password. Please try again.")
            } catch (e: Exception) {
                operationJournal.update(id, "failed", control.bytesProcessed, control.totalBytes, control.currentPath, e.message)
                notifyOperationState(id, "extract", "failed", e.message); call.reject("ExtractAll failed: ${e.message}")
            } finally { input?.cleanup(); target?.cleanup(); nativeOperationsById.remove(id) }
        }
    }

    @PluginMethod
    fun archiveReadEntry(call: PluginCall) {
        val rawPath = call.getString("path", "") ?: ""
        val entryPath = call.getString("entryPath", "") ?: ""
        val password = (call.getString("password", "") ?: "").takeIf { it.isNotEmpty() }
        val path = resolveStorageRef(rawPath)
        if (path.isNullOrEmpty() || entryPath.isEmpty()) { call.reject("path and entryPath are required"); return }
        ioScope.launch {
            val staged = runCatching { stageArchiveInput(path) }.getOrElse { call.reject("Archive input failed: ${it.message}"); return@launch }
            try {
                val bytes = withContext(Dispatchers.IO) { pro.fileforge.app.archive.ArchiveEngine.readEntryBytes(staged.file, entryPath, password) }
                if (bytes == null) { call.reject("Entry not found"); return@launch }
                call.resolve(JSObject().apply { put("content", Base64.encodeToString(bytes, Base64.NO_WRAP)); put("encoding", "base64"); put("size", bytes.size) })
            } catch (e: pro.fileforge.app.archive.ArchiveError.WrongPassword) { call.reject("Wrong password. Please try again.")
            } catch (e: Exception) { call.reject("Read entry failed: ${e.message}")
            } finally { staged.cleanup() }
        }
    }

    @PluginMethod
    fun archiveCreate(call: PluginCall) {
        val sourcesArray = call.getArray("sources", JSArray()) ?: JSArray()
        val targetRaw = call.getString("target", "") ?: ""
        val operationId = call.getString("operationId", "")?.takeIf { it.isNotBlank() }
        val targetPath = resolveStorageRef(targetRaw)
        if (targetPath.isNullOrEmpty()) { call.reject("target is required, or path is outside allowed storage"); return }
        val sources = mutableListOf<String>()
        for (i in 0 until sourcesArray.length()) resolveStorageRef(sourcesArray.optString(i, ""))?.let(sources::add)
        if (sources.isEmpty()) { call.reject("No valid source paths provided"); return }
        val id = operationId ?: "compress-${System.nanoTime()}"
        val control = operationControl(id, "compress")
        operationJournal.begin(id, "compress", "Create archive", source = sources.joinToString("\n"), target = targetPath, resumable = false)
        notifyOperationState(id, "compress", "running")
        ioScope.launch {
            val stagedSources = mutableListOf<StagedArchive>(); var stagedTarget: StagedArchive? = null
            try {
                sources.forEach { stagedSources += stageArchiveInput(it) }
                stagedTarget = stageArchiveOutput(targetPath)
                val localSources = stagedSources.map { it.file.absolutePath }
                val ok = withContext(Dispatchers.IO) {
                    control.totalBytes = localSources.sumOf { computePathSize(File(it)) }.coerceAtLeast(1L)
                    pro.fileforge.app.archive.ArchiveEngine.createArchive(localSources, stagedTarget!!.file.absolutePath,
                        format = (call.getString("format", "zip") ?: "zip"),
                        control = pro.fileforge.app.archive.ArchiveEngine.OperationControl(control.cancelled, control.paused),
                        onProgress = { p -> control.bytesProcessed = p.bytesProcessed; control.totalBytes = p.totalBytes; control.currentPath = p.currentPath; notifyOperationProgress(id, "compress", p.bytesProcessed, p.totalBytes, p.currentPath) })
                }
                if (ok && !control.cancelled.get() && stagedTarget!!.copyBack) copyTempFileToStorage(stagedTarget!!.file, stagedTarget!!.ref)
                if (ok && !control.cancelled.get()) { operationJournal.complete(id); notifyOperationState(id, "compress", "completed") }
                else if (control.cancelled.get()) { operationJournal.update(id, "cancelled", control.bytesProcessed, control.totalBytes, control.currentPath, "Operation cancelled"); notifyOperationState(id, "compress", "cancelled") }
                else { operationJournal.update(id, "failed", control.bytesProcessed, control.totalBytes, control.currentPath, "Archive creation failed"); notifyOperationState(id, "compress", "failed", "Archive creation failed") }
                call.resolve(JSObject().apply { put("success", ok && !control.cancelled.get()); put("operationId", id) })
            } catch (e: Exception) { operationJournal.update(id, "failed", control.bytesProcessed, control.totalBytes, control.currentPath, e.message); notifyOperationState(id, "compress", "failed", e.message); call.reject("Archive creation failed: ${e.message}")
            } finally { stagedSources.forEach { it.cleanup() }; stagedTarget?.cleanup(); nativeOperationsById.remove(id) }
        }
    }

    private data class StagedArchive(val file: File, val ref: String? = null, val copyBack: Boolean = false, val deleteAfter: Boolean = false) {
        fun cleanup() { if (deleteAfter) file.deleteRecursively() }
    }

    private fun stageArchiveInput(ref: String): StagedArchive {
        if (!ref.startsWith("content://", true)) return StagedArchive(File(ref))
        val meta = unifiedStorage.metadata(ref)
        val dir = File(context.cacheDir, "archive-stage").apply { mkdirs() }
        val target = File(dir, "${System.nanoTime()}-${meta.name.replace(Regex("[^A-Za-z0-9._-]"), "_")}")
        if (meta.isDirectory) {
            target.mkdirs()
            stageSafTree(ref, target)
        } else {
            target.parentFile?.mkdirs()
            unifiedStorage.openInput(ref).use { input -> target.outputStream().use { output -> input.copyTo(output, 64 * 1024) } }
        }
        return StagedArchive(target, deleteAfter = true)
    }

    private fun stageSafTree(ref: String, target: File) {
        val children = unifiedStorage.list(ref, true)
        for (child in children) {
            val safeName = child.name.replace(Regex("[\\\\/:*?\"<>|\\u0000]"), "_")
            val local = File(target, safeName)
            if (child.isDirectory) {
                local.mkdirs()
                stageSafTree(child.path, local)
            } else {
                unifiedStorage.openInput(child.path).use { input -> local.outputStream().use { output -> input.copyTo(output, 64 * 1024) } }
            }
        }
    }

    private fun stageArchiveTarget(ref: String): StagedArchive {
        if (!ref.startsWith("content://", true)) return StagedArchive(File(ref), copyBack = false)
        val dir = File(context.cacheDir, "archive-stage-${System.nanoTime()}").apply { mkdirs() }
        return StagedArchive(dir, ref = ref, copyBack = true, deleteAfter = true)
    }

    private fun stageArchiveOutput(ref: String): StagedArchive {
        if (!ref.startsWith("content://", true)) return StagedArchive(File(ref), copyBack = false)
        val dir = File(context.cacheDir, "archive-stage-${System.nanoTime()}").apply { mkdirs() }
        val name = runCatching { unifiedStorage.metadata(ref).name }.getOrDefault("archive.zip")
        return StagedArchive(File(dir, name), ref = ref, copyBack = true, deleteAfter = true)
    }

    private fun copyTempFileToStorage(source: File, targetRef: String?) {
        if (targetRef.isNullOrBlank()) return
        unifiedStorage.openOutput(targetRef).use { output -> source.inputStream().use { input -> input.copyTo(output, 64 * 1024) } }
    }

    private fun copyTempTreeToStorage(sourceRoot: File, targetRef: String?) {
        if (targetRef.isNullOrBlank()) return
        sourceRoot.listFiles()?.forEach { child ->
            if (child.isDirectory) {
                val childRef = unifiedStorage.createDirectory(targetRef, child.name)
                copyTempTreeToStorage(child, childRef)
            } else {
                val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(child.extension.lowercase()) ?: "application/octet-stream"
                val childRef = unifiedStorage.createFile(targetRef, child.name, mime)
                unifiedStorage.openOutput(childRef).use { output -> child.inputStream().use { input -> input.copyTo(output, 64 * 1024) } }
            }
        }
    }

    private fun computePathSize(file: File): Long {
        if (file.isFile) return file.length()
        var total = 0L
        val stack = ArrayDeque<File>()
        stack.addLast(file)
        while (stack.isNotEmpty()) {
            val current = stack.removeLast()
            val children = current.listFiles() ?: continue
            for (child in children) {
                if (child.isDirectory) stack.addLast(child) else total += child.length()
            }
        }
        return total
    }

    @PluginMethod
    fun decodeHeic(call: PluginCall) {
        val rawPath = call.getString("path", "")
        val maxDim = call.getInt("maxDim", 1920) ?: 1920
        val path = resolveLogicalPath(rawPath)
        if (path.isNullOrEmpty()) {
            call.reject("Path is required, or path is outside allowed storage")
            return
        }
        ioScope.launch {
            try {
                val file = File(path)
                if (!file.exists()) {
                    call.reject("File does not exist")
                    return@launch
                }
                val base64 = withContext(Dispatchers.IO) {
                    pro.fileforge.app.archive.HeicDecoder.decodeToBase64Jpeg(file, maxDim)
                }
                if (base64 != null) {
                    val ret = JSObject()
                    ret.put("data", "data:image/jpeg;base64,$base64")
                    ret.put("supported", true)
                    call.resolve(ret)
                } else {
                    val ret = JSObject()
                    ret.put("supported", false)
                    ret.put("error", "HEIC decoding is not supported on this device")
                    call.resolve(ret)
                }
            } catch (e: Exception) {
                call.reject("HEIC decode failed: ${e.message}")
            }
        }
    }

    // ============ Stream URI for WebView playback ============
    /**
     * Returns a content:// URI for the given file path, suitable for use as
     * the src attribute of <video> or <audio> elements in the WebView.
     *
     * This eliminates the need to read the entire file into a base64 string,
     * decode it, wrap it in a Blob, and create an object URL — which consumed
     * 2-3x the file size in RAM and caused OOM on large media files.
     *
     * The URI is granted with read permission to the WebView's package.
     */
    // ============ Native Media Viewer ============
    /** Launch the real Android/Media3 player for a local or SAF reference. */
    @PluginMethod
    fun createNativeMediaSurface(call: PluginCall) {
        val windowId = call.getString("windowId", "") ?: ""
        val ref = call.getString("ref", "") ?: ""
        if (windowId.isBlank() || ref.isBlank()) { call.reject("windowId and ref are required"); return }
        val activity = activity as? pro.fileforge.app.MainActivity
        if (activity == null) { call.reject("MainActivity is required"); return }
        try {
            activity.nativeMediaSurfaces().createOrUpdate(
                windowId, ref, call.getString("mime"), call.getString("title"),
                (call.getDouble("left", 0.0) ?: 0.0).toFloat(), (call.getDouble("top", 0.0) ?: 0.0).toFloat(),
                (call.getDouble("width", 1.0) ?: 1.0).toFloat(), (call.getDouble("height", 1.0) ?: 1.0).toFloat(),
                (call.getBoolean("visible", true) ?: true)
            )
            call.resolve(JSObject().apply { put("created", true) })
        } catch (e: Exception) {
            call.reject("Failed to create native media surface: ${e.message}")
        }
    }

    @PluginMethod
    fun updateNativeMediaSurface(call: PluginCall) {
        val windowId = call.getString("windowId", "") ?: ""
        if (windowId.isBlank()) { call.reject("windowId is required"); return }
        val activity = activity as? pro.fileforge.app.MainActivity
        if (activity == null) { call.reject("MainActivity is required"); return }
        activity.nativeMediaSurfaces().update(
            windowId, (call.getDouble("left", 0.0) ?: 0.0).toFloat(), (call.getDouble("top", 0.0) ?: 0.0).toFloat(),
            (call.getDouble("width", 1.0) ?: 1.0).toFloat(), (call.getDouble("height", 1.0) ?: 1.0).toFloat(),
            (call.getBoolean("visible", true) ?: true)
        )
        call.resolve(JSObject().apply { put("updated", true) })
    }

    @PluginMethod
    fun setNativeMediaSurfaceVisibility(call: PluginCall) {
        val windowId = call.getString("windowId", "") ?: ""
        if (windowId.isBlank()) { call.reject("windowId is required"); return }
        val activity = activity as? pro.fileforge.app.MainActivity
        if (activity == null) { call.reject("MainActivity is required"); return }
        activity.nativeMediaSurfaces().setVisibility(windowId, call.getBoolean("visible", true) ?: true)
        call.resolve(JSObject().apply { put("updated", true) })
    }

    @PluginMethod
    fun destroyNativeMediaSurface(call: PluginCall) {
        val windowId = call.getString("windowId", "") ?: ""
        if (windowId.isBlank()) { call.reject("windowId is required"); return }
        val activity = activity as? pro.fileforge.app.MainActivity
        if (activity == null) { call.reject("MainActivity is required"); return }
        activity.nativeMediaSurfaces().destroy(windowId)
        call.resolve(JSObject().apply { put("destroyed", true) })
    }

    @PluginMethod
    fun openNativeImage(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        if (ref.isBlank()) { call.reject("Image reference is required"); return }
        try {
            val intent = Intent(context, pro.fileforge.app.NativeImageViewerActivity::class.java).apply {
                putExtra(pro.fileforge.app.NativeImageViewerActivity.EXTRA_REF, ref)
                putExtra(pro.fileforge.app.NativeImageViewerActivity.EXTRA_TITLE, call.getString("title", ""))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            if (!ref.startsWith("content://", true) && !ref.startsWith("file://", true)) {
                val file = File(resolveLogicalPath(ref) ?: throw IOException("Path is outside allowed storage"))
                val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                context.grantUriPermission(context.packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(intent)
            call.resolve(JSObject().apply { put("opened", true) })
        } catch (e: Exception) {
            Log.e(TAG, "openNativeImage failed", e)
            call.reject("Failed to open native image viewer: ${e.message}")
        }
    }

    @PluginMethod
    fun openNativeMedia(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        if (ref.isBlank()) { call.reject("Media reference is required"); return }
        try {
            val intent = Intent(context, pro.fileforge.app.NativeMediaViewerActivity::class.java).apply {
                putExtra(pro.fileforge.app.NativeMediaViewerActivity.EXTRA_REF, ref)
                putExtra(pro.fileforge.app.NativeMediaViewerActivity.EXTRA_MIME, call.getString("mime", "application/octet-stream"))
                putExtra(pro.fileforge.app.NativeMediaViewerActivity.EXTRA_TITLE, call.getString("title", ""))
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            if (!ref.startsWith("content://", true)) {
                val file = File(resolveLogicalPath(ref) ?: throw IOException("Path is outside allowed storage"))
                val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                intent.putExtra(pro.fileforge.app.NativeMediaViewerActivity.EXTRA_REF, uri.toString())
                context.grantUriPermission(context.packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            context.startActivity(intent)
            call.resolve(JSObject().apply { put("opened", true) })
        } catch (e: Exception) {
            Log.e(TAG, "openNativeMedia failed", e)
            call.reject("Failed to open native media player: ${e.message}")
        }
    }


    @PluginMethod
    fun getApkInfo(call: PluginCall) {
        val raw = call.getString("path", "") ?: ""
        if (raw.isBlank()) { call.reject("APK path is required"); return }
        ioScope.launch {
            var staged: StagedArchive? = null
            try {
                staged = stageArchiveInput(resolveStorageRef(raw) ?: raw)
                val archivePath = staged.file.absolutePath
                val pm = context.packageManager
                val pkg = pm.getPackageArchiveInfo(archivePath, PackageManager.GET_META_DATA)
                    ?: throw IOException("Invalid APK")
                val appInfo = pkg.applicationInfo ?: throw IOException("Invalid APK: missing application info")
                appInfo.sourceDir = archivePath
                appInfo.publicSourceDir = archivePath
                val icon = runCatching { appInfo.loadIcon(pm) }.getOrNull()
                val iconBase64 = icon?.let { drawableToBase64(it) }
                call.resolve(JSObject().apply {
                    put("packageName", pkg.packageName)
                    put("appName", appInfo.loadLabel(pm).toString())
                    put("versionName", pkg.versionName ?: "")
                    put("versionCode", if (Build.VERSION.SDK_INT >= 28) pkg.longVersionCode else pkg.versionCode.toLong())
                    if (iconBase64 != null) put("icon", iconBase64)
                })
            } catch (e: Exception) {
                call.reject("Unable to inspect APK: ${e.message}")
            } finally { staged?.cleanup() }
        }
    }

    @PluginMethod
    fun installApk(call: PluginCall) {
        val raw = call.getString("path", "") ?: ""
        if (raw.isBlank()) { call.reject("APK path is required"); return }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
                val settings = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(settings)
                call.resolve(JSObject().apply {
                    put("installed", false)
                    put("permissionRequired", true)
                })
                return
            }
            if (raw.startsWith("content://", true)) {
                val uri = Uri.parse(raw)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            } else {
                val file = File(resolveLogicalPath(raw) ?: throw IOException("Path is outside allowed storage"))
                if (!file.isFile) throw IOException("APK does not exist")
                val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                context.startActivity(intent)
            }
            call.resolve(JSObject().apply { put("installed", true); put("permissionRequired", false) })
        } catch (e: Exception) {
            call.reject("APK installation failed: ${e.message}")
        }
    }


    @PluginMethod
    fun installXapk(call: PluginCall) {
        val raw = call.getString("path", "") ?: ""
        if (raw.isBlank()) { call.reject("XAPK path is required"); return }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            val settings = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES).apply {
                data = Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(settings)
            call.resolve(JSObject().apply { put("installed", false); put("permissionRequired", true) })
            return
        }
        ioScope.launch {
            var stageDir: File? = null
            var stagedInput: StagedArchive? = null
            try {
                val input = resolveStorageRef(raw) ?: raw
                stagedInput = stageArchiveInput(input)
                val source = stagedInput!!.file
                stageDir = File(context.cacheDir, "xapk-install-${System.currentTimeMillis()}").apply { mkdirs() }
                val apkFiles = mutableListOf<File>()
                val obbEntries = mutableListOf<Pair<String, File>>()
                ZipFile(source).use { zip ->
                    val entries = zip.entries()
                    while (entries.hasMoreElements()) {
                        val entry = entries.nextElement()
                        if (entry.isDirectory) continue
                        val name = entry.name.replace('\\', '/')
                        if (name.contains("..") || name.startsWith("/")) continue
                        val lower = name.lowercase()
                        if (lower.endsWith(".apk")) {
                            val out = File(stageDir, "apk-${apkFiles.size}.apk")
                            zip.getInputStream(entry).use { it.copyTo(FileOutputStream(out)) }
                            apkFiles += out
                        } else if (lower.startsWith("android/obb/") && lower.endsWith(".obb")) {
                            val safe = name.removePrefix("Android/obb/")
                            val out = File(stageDir, "obb/$safe").apply { parentFile?.mkdirs() }
                            zip.getInputStream(entry).use { it.copyTo(FileOutputStream(out)) }
                            obbEntries += safe to out
                        }
                    }
                }
                if (apkFiles.isEmpty()) throw IOException("XAPK contains no APK files")

                val packageName = runCatching {
                    context.packageManager.getPackageArchiveInfo(apkFiles.first().absolutePath, PackageManager.GET_META_DATA)?.packageName
                }.getOrNull() ?: throw IOException("Unable to determine XAPK package name")
                val installer = context.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                    setSize(apkFiles.sumOf { it.length() })
                    setAppPackageName(packageName)
                    if (Build.VERSION.SDK_INT >= 31) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
                }
                val sessionId = installer.createSession(params)
                val session = installer.openSession(sessionId)
                try {
                    apkFiles.forEachIndexed { index, file ->
                        FileInputStream(file).use { input ->
                            session.openWrite("apk-$index.apk", 0, file.length()).use { output -> input.copyTo(output) }
                        }
                    }
                    val intent = Intent(context, pro.fileforge.app.XapkInstallReceiver::class.java).apply {
                        putExtra(pro.fileforge.app.XapkInstallReceiver.EXTRA_SESSION_ID, sessionId)
                        putExtra(pro.fileforge.app.XapkInstallReceiver.EXTRA_STAGE_DIR, stageDir!!.absolutePath)
                        putExtra(pro.fileforge.app.XapkInstallReceiver.EXTRA_OBB_COUNT, obbEntries.size)
                        putExtra(pro.fileforge.app.XapkInstallReceiver.EXTRA_PACKAGE_NAME, packageName)
                    }
                    val pending = PendingIntent.getBroadcast(
                        context,
                        sessionId,
                        intent,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
                    )
                    session.commit(pending.intentSender)
                } finally {
                    session.close()
                }
                stagedInput?.cleanup()
                stagedInput = null
                // Keep staged files until the installer reports success/failure.
                stageDir = null
                call.resolve(JSObject().apply {
                    put("installed", true)
                    put("permissionRequired", false)
                    put("apps", apkFiles.size)
                    put("obbFiles", obbEntries.size)
                })
            } catch (e: Exception) {
                stagedInput?.cleanup()
                stageDir?.deleteRecursively()
                call.reject("XAPK installation failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun listInstalledApps(call: PluginCall) {
        val includeSystem = call.getBoolean("includeSystem", false) ?: false
        ioScope.launch {
            try {
                val pm = context.packageManager
                val flags = if (Build.VERSION.SDK_INT >= 33) PackageManager.ApplicationInfoFlags.of(PackageManager.GET_META_DATA.toLong()) else null
                val apps = if (Build.VERSION.SDK_INT >= 33) pm.getInstalledApplications(flags!!) else @Suppress("DEPRECATION") pm.getInstalledApplications(PackageManager.GET_META_DATA)
                val result = JSArray()
                apps.asSequence()
                    .filter { includeSystem || (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 }
                    .sortedBy { it.loadLabel(pm).toString().lowercase() }
                    .forEach { info ->
                        val pkgInfo = runCatching { pm.getPackageInfo(info.packageName, PackageManager.GET_META_DATA) }.getOrNull()
                        val icon = runCatching { drawableToBase64(info.loadIcon(pm)) }.getOrNull()
                        val apkPaths = buildList {
                            add(info.sourceDir)
                            if (Build.VERSION.SDK_INT >= 21) info.splitSourceDirs?.let { addAll(it) }
                        }
                        val size = apkPaths.mapNotNull { runCatching { File(it).length() }.getOrNull() }.sum()
                        result.put(JSObject().apply {
                            put("packageName", info.packageName)
                            put("label", info.loadLabel(pm).toString())
                            put("versionName", pkgInfo?.versionName ?: "")
                            put("versionCode", if (Build.VERSION.SDK_INT >= 28) (pkgInfo?.longVersionCode ?: 0L) else @Suppress("DEPRECATION") (pkgInfo?.versionCode?.toLong() ?: 0L))
                            put("isSystem", (info.flags and ApplicationInfo.FLAG_SYSTEM) != 0)
                            put("isEnabled", info.enabled)
                            put("apkPath", info.sourceDir)
                            put("size", size)
                            if (icon != null) put("icon", icon)
                        })
                    }
                call.resolve(JSObject().apply { put("apps", result) })
            } catch (e: Exception) { call.reject("Unable to list installed apps: ${e.message}") }
        }
    }

    @PluginMethod
    fun backupInstalledApp(call: PluginCall) {
        val packageName = call.getString("packageName", "") ?: ""
        if (packageName.isBlank()) { call.reject("Package name is required"); return }
        ioScope.launch {
            try {
                val pm = context.packageManager
                val info = pm.getApplicationInfo(packageName, PackageManager.GET_META_DATA)
                val pkg = pm.getPackageInfo(packageName, PackageManager.GET_META_DATA)
                val apkPaths = buildList {
                    add(info.sourceDir)
                    if (Build.VERSION.SDK_INT >= 21) info.splitSourceDirs?.let { addAll(it) }
                }.filter { File(it).isFile }
                if (apkPaths.isEmpty()) throw IOException("No readable APK files for $packageName")
                val label = info.loadLabel(pm).toString().replace(Regex("[^A-Za-z0-9._-]+"), "_").take(80).ifBlank { packageName }
                val version = pkg.versionName?.replace(Regex("[^A-Za-z0-9._-]+"), "_") ?: "unknown"
                val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "Backup").apply { mkdirs() }
                if (!dir.exists() || !dir.canWrite()) throw IOException("Backup directory is not writable")
                val output = if (apkPaths.size == 1) File(dir, "${label}_${version}.apk") else File(dir, "${label}_${version}.xapk")
                if (output.exists()) output.delete()
                if (apkPaths.size == 1) {
                    FileInputStream(apkPaths.first()).use { input -> FileOutputStream(output).use { input.copyTo(it) } }
                } else {
                    ZipOutputStream(FileOutputStream(output)).use { zip ->
                        apkPaths.forEachIndexed { i, path ->
                            zip.putNextEntry(ZipEntry(if (i == 0) "base.apk" else "split-${i}.apk"))
                            FileInputStream(path).use { it.copyTo(zip) }
                            zip.closeEntry()
                        }
                        val manifest = "{\"package_name\":\"$packageName\",\"name\":\"${label.replace("\\", "\\\\").replace("\"", "\\\"")}\",\"version_name\":\"$version\"}"
                        zip.putNextEntry(ZipEntry("manifest.json")); zip.write(manifest.toByteArray(StandardCharsets.UTF_8)); zip.closeEntry()
                    }
                }
                call.resolve(JSObject().apply { put("success", true); put("path", output.absolutePath); put("name", output.name) })
            } catch (e: Exception) { call.resolve(JSObject().apply { put("success", false); put("error", e.message ?: "Backup failed") }) }
        }
    }

    @PluginMethod
    fun uninstallApp(call: PluginCall) {
        val packageName = call.getString("packageName", "") ?: ""
        if (packageName.isBlank()) { call.reject("Package name is required"); return }
        try {
            val intent = Intent(Intent.ACTION_DELETE, Uri.parse("package:$packageName")).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
            context.startActivity(intent)
            call.resolve(JSObject().apply { put("started", true) })
        } catch (e: Exception) { call.resolve(JSObject().apply { put("started", false); put("error", e.message ?: "Unable to start uninstall") }) }
    }

    private fun drawableToBase64(drawable: android.graphics.drawable.Drawable): String {
        val width = 128
        val height = 128
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = android.graphics.Canvas(bitmap)
        drawable.setBounds(0, 0, width, height)
        drawable.draw(canvas)
        val out = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
        bitmap.recycle()
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    @PluginMethod
    fun getStreamUri(call: PluginCall) {
        val raw = call.getString("path", "") ?: ""
        if (raw.isBlank()) { call.reject("Path is required"); return }
        ioScope.launch {
            try {
                if (raw.startsWith("content://", true)) {
                    val uri = Uri.parse(raw)
                    val meta = unifiedStorage.metadata(raw)
                    val mime = meta.mimeType ?: context.contentResolver.getType(uri) ?: getMimeTypeFromName(meta.name)
                    call.resolve(JSObject().apply { put("uri", raw); put("mimeType", mime); put("size", meta.size) })
                    return@launch
                }
                val path = resolveLogicalPath(raw) ?: run { call.reject("Path is outside allowed storage"); return@launch }
                val file = File(path)
                if (!file.isFile) { call.reject("File does not exist or is a directory"); return@launch }
                val authority = "${context.packageName}.fileprovider"
                val uri = androidx.core.content.FileProvider.getUriForFile(context, authority, file)
                context.grantUriPermission(context.packageName, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                call.resolve(JSObject().apply { put("uri", uri.toString()); put("mimeType", getMimeType(file)); put("size", file.length()) })
            } catch (e: Exception) {
                Log.e(TAG, "getStreamUri failed", e); call.reject("Failed to get stream URI: ${e.message}")
            }
        }
    }

    // ============ Media Metadata ============
    /**
     * Extract metadata from a media file (video or audio) using
     * MediaMetadataRetriever. Returns duration, resolution, codec info,
     * and embedded ID3 tags (title, artist, album, etc.).
     */
    @PluginMethod
    fun getMediaMetadata(call: PluginCall) {
        val path = call.getString("path", "") ?: ""
        if (path.isBlank()) { call.reject("Path is required"); return }
        ioScope.launch {
            try {
                val meta = withContext(Dispatchers.IO) { nativeMedia.metadata(path) }
                val ret = JSObject().apply {
                    put("duration", meta.duration)
                    put("width", meta.width ?: 0)
                    put("height", meta.height ?: 0)
                    put("rotation", meta.rotation ?: 0)
                    put("fps", meta.fps ?: 0f)
                    put("isVideo", meta.isVideo)
                    put("bitrate", meta.bitrate)
                    meta.title?.let { put("title", it) }
                    meta.artist?.let { put("artist", it) }
                    meta.album?.let { put("album", it) }
                    meta.genre?.let { put("genre", it) }
                    meta.year?.let { put("year", it) }
                    meta.track?.let { put("track", it) }
                    meta.author?.let { put("author", it) }
                    meta.composer?.let { put("composer", it) }
                    meta.mimeType?.let { put("mimeType", it) }
                    put("hasEmbeddedArtwork", meta.hasEmbeddedArtwork)
                }
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "getMediaMetadata failed", e)
                call.reject("Failed to get media metadata: ${e.message}")
            }
        }
    }

    // ============ Unified Storage Reference API ============
    // These methods are the migration boundary for both /storage paths and
    // content:// SAF documents. Existing path APIs remain backward compatible.

    @PluginMethod
    fun storageList(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        val showHidden = call.getBoolean("showHidden", false) ?: false
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                val entries = withContext(Dispatchers.IO) { unifiedStorage.list(ref, showHidden) }
                val arr = JSArray()
                entries.forEach { e -> arr.put(JSObject().apply {
                    put("id", e.path); put("name", e.name); put("path", e.path)
                    put("isDirectory", e.isDirectory); put("size", e.size)
                    put("lastModified", e.lastModified); put("mimeType", e.mimeType)
                }) }
                call.resolve(JSObject().apply { put("files", arr) })
            } catch (e: Exception) { call.reject("Storage list failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageMetadata(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                val m = withContext(Dispatchers.IO) { unifiedStorage.metadata(ref) }
                call.resolve(JSObject().apply {
                    put("id", m.path); put("path", m.path); put("name", m.name)
                    put("size", m.size); put("lastModified", m.lastModified)
                    put("mimeType", m.mimeType); put("isDirectory", m.isDirectory)
                })
            } catch (e: Exception) { call.reject("Storage metadata failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageReadText(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        val maxBytes = call.getLong("maxBytes", 10_000_000L) ?: 10_000_000L
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                val text = withContext(Dispatchers.IO) { unifiedStorage.readText(ref, maxBytes = maxBytes) }
                call.resolve(JSObject().apply { put("content", text); put("encoding", "utf8") })
            } catch (e: Exception) { call.reject("Storage read failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageReadChunk(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        val offset = call.getLong("offset", 0L) ?: 0L
        val length = (call.getInt("length", 65536) ?: 65536).coerceIn(1, 1024 * 1024)
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                val bytes = withContext(Dispatchers.IO) { unifiedStorage.readChunk(ref, offset, length) }
                call.resolve(JSObject().apply {
                    put("content", Base64.encodeToString(bytes, Base64.NO_WRAP))
                    put("encoding", "base64"); put("size", bytes.size); put("offset", offset)
                })
            } catch (e: Exception) { call.reject("Storage chunk read failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageBeginChunkedWrite(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                val temp = withContext(Dispatchers.IO) { unifiedStorage.beginChunkedWrite(ref) }
                call.resolve(JSObject().apply { put("success", true); put("tempRef", temp) })
            } catch (e: Exception) { call.reject("Begin chunked write failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageCommitChunkedWrite(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        val tempRef = call.getString("tempRef", "") ?: ""
        if (ref.isBlank() || tempRef.isBlank()) { call.reject("ref and tempRef are required"); return }
        ioScope.launch {
            try {
                withContext(Dispatchers.IO) { unifiedStorage.commitChunkedWrite(ref, tempRef) }
                call.resolve(JSObject().apply { put("success", true) })
            } catch (e: Exception) { call.reject("Commit chunked write failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageAbortChunkedWrite(call: PluginCall) {
        val tempRef = call.getString("tempRef", "") ?: ""
        if (tempRef.isBlank()) { call.reject("tempRef is required"); return }
        try {
            unifiedStorage.abortChunkedWrite(tempRef)
            call.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) { call.reject("Abort chunked write failed: ${e.message}") }
    }

    @PluginMethod
    fun storageWriteChunk(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        val offset = call.getLong("offset", 0L) ?: 0L
        val content = call.getString("content", "") ?: ""
        val truncate = call.getBoolean("truncate", false) ?: false
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                val bytes = Base64.decode(content, Base64.DEFAULT)
                withContext(Dispatchers.IO) { unifiedStorage.writeChunk(ref, offset, bytes, truncate) }
                call.resolve(JSObject().apply { put("success", true); put("bytesWritten", bytes.size); put("offset", offset) })
            } catch (e: Exception) { call.reject("Storage chunk write failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageWriteText(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        val content = call.getString("content", "") ?: ""
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                withContext(Dispatchers.IO) { unifiedStorage.writeText(ref, content) }
                call.resolve(JSObject().apply { put("success", true) })
            } catch (e: Exception) { call.reject("Storage write failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageCreateDirectory(call: PluginCall) {
        val parent = call.getString("parent", "") ?: ""
        val name = call.getString("name", "") ?: ""
        if (parent.isBlank() || name.isBlank()) { call.reject("parent and name are required"); return }
        ioScope.launch {
            try {
                val ref = withContext(Dispatchers.IO) { unifiedStorage.createDirectory(parent, name) }
                call.resolve(JSObject().apply { put("success", true); put("ref", ref) })
            } catch (e: Exception) { call.reject("Storage create directory failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageCreateFile(call: PluginCall) {
        val parent = call.getString("parent", "") ?: ""
        val name = call.getString("name", "") ?: ""
        val mimeType = call.getString("mimeType", "application/octet-stream") ?: "application/octet-stream"
        if (parent.isBlank() || name.isBlank()) { call.reject("parent and name are required"); return }
        ioScope.launch {
            try {
                val ref = withContext(Dispatchers.IO) { unifiedStorage.createFile(parent, name, mimeType) }
                call.resolve(JSObject().apply { put("success", true); put("ref", ref) })
            } catch (e: Exception) { call.reject("Storage create file failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageDelete(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                val ok = withContext(Dispatchers.IO) { unifiedStorage.delete(ref) }
                call.resolve(JSObject().apply { put("success", ok) })
            } catch (e: Exception) { call.reject("Storage delete failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageRename(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        val newName = call.getString("newName", "") ?: ""
        if (ref.isBlank() || newName.isBlank()) { call.reject("ref and newName are required"); return }
        ioScope.launch {
            try {
                val newRef = withContext(Dispatchers.IO) { unifiedStorage.rename(ref, newName) }
                call.resolve(JSObject().apply { put("success", true); put("ref", newRef) })
            } catch (e: Exception) { call.reject("Storage rename failed: ${e.message}") }
        }
    }

    @PluginMethod
    fun storageCopySaf(call: PluginCall) {
        val source = call.getString("source", "") ?: ""
        val targetParent = call.getString("targetParent", "") ?: ""
        val targetName = call.getString("targetName", "") ?: ""
        if (source.isBlank() || targetParent.isBlank() || targetName.isBlank()) { call.reject("source, targetParent and targetName are required"); return }
        ioScope.launch {
            try {
                val ref = withContext(Dispatchers.IO) { unifiedStorage.copySafFile(source, targetParent, targetName) }
                call.resolve(JSObject().apply { put("success", true); put("ref", ref) })
            } catch (e: Exception) { call.reject("Storage SAF copy failed: ${e.message}") }
        }
    }

    // ============ SAF (Storage Access Framework) Methods ============

    @PluginMethod
    fun safListDirectory(call: PluginCall) {
        val uriStr = call.getString("uri", "") ?: ""
        if (uriStr.isEmpty()) {
            call.reject("uri is required")
            return
        }
        ioScope.launch {
            try {
                val uri = Uri.parse(uriStr)
                val entries = pro.fileforge.app.saf.SafFileProvider.listDirectory(context, uri)
                val arr = JSArray()
                for (e in entries) {
                    val o = JSObject()
                    o.put("uri", e.uri.toString())
                    o.put("name", e.name)
                    o.put("isDirectory", e.isDirectory)
                    o.put("size", e.size)
                    o.put("lastModified", e.lastModified)
                    o.put("mimeType", e.mimeType)
                    arr.put(o)
                }
                val ret = JSObject()
                ret.put("entries", arr)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("SAF listDirectory failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun safReadText(call: PluginCall) {
        val uriStr = call.getString("uri", "") ?: ""
        val maxBytes = call.getLong("maxBytes", 10_000_000L) ?: 10_000_000L
        if (uriStr.isEmpty()) { call.reject("uri is required"); return }
        ioScope.launch {
            try {
                val content = pro.fileforge.app.saf.SafFileProvider.readText(context, Uri.parse(uriStr), maxBytes)
                if (content != null) {
                    val ret = JSObject()
                    ret.put("content", content)
                    call.resolve(ret)
                } else {
                    call.reject("Failed to read or file too large")
                }
            } catch (e: Exception) {
                call.reject("SAF readText failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun safReadBytes(call: PluginCall) {
        val uriStr = call.getString("uri", "") ?: ""
        val offset = call.getLong("offset", 0L) ?: 0L
        val length = call.getInt("length", 4096) ?: 4096
        if (uriStr.isEmpty()) { call.reject("uri is required"); return }
        ioScope.launch {
            try {
                val bytes = pro.fileforge.app.saf.SafFileProvider.readBytes(context, Uri.parse(uriStr), offset, length)
                if (bytes != null) {
                    val ret = JSObject()
                    ret.put("content", Base64.encodeToString(bytes, Base64.NO_WRAP))
                    ret.put("encoding", "base64")
                    ret.put("size", bytes.size)
                    call.resolve(ret)
                } else {
                    call.reject("Failed to read bytes")
                }
            } catch (e: Exception) {
                call.reject("SAF readBytes failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun safWriteText(call: PluginCall) {
        val uriStr = call.getString("uri", "") ?: ""
        val content = call.getString("content", "") ?: ""
        if (uriStr.isEmpty()) { call.reject("uri is required"); return }
        ioScope.launch {
            try {
                val ok = pro.fileforge.app.saf.SafFileProvider.writeText(context, Uri.parse(uriStr), content)
                val ret = JSObject()
                ret.put("success", ok)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("SAF writeText failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun safCreateDirectory(call: PluginCall) {
        val parentUri = call.getString("parentUri", "") ?: ""
        val name = call.getString("name", "") ?: ""
        if (parentUri.isEmpty() || name.isEmpty()) { call.reject("parentUri and name are required"); return }
        ioScope.launch {
            try {
                val uri = pro.fileforge.app.saf.SafFileProvider.createDirectory(context, Uri.parse(parentUri), name)
                if (uri != null) {
                    val ret = JSObject()
                    ret.put("uri", uri.toString())
                    ret.put("success", true)
                    call.resolve(ret)
                } else {
                    call.reject("Failed to create directory")
                }
            } catch (e: Exception) {
                call.reject("SAF createDirectory failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun safCreateFile(call: PluginCall) {
        val parentUri = call.getString("parentUri", "") ?: ""
        val name = call.getString("name", "") ?: ""
        val mimeType = call.getString("mimeType", "text/plain") ?: "text/plain"
        if (parentUri.isEmpty() || name.isEmpty()) { call.reject("parentUri and name are required"); return }
        ioScope.launch {
            try {
                val uri = pro.fileforge.app.saf.SafFileProvider.createFile(context, Uri.parse(parentUri), name, mimeType)
                if (uri != null) {
                    val ret = JSObject()
                    ret.put("uri", uri.toString())
                    ret.put("success", true)
                    call.resolve(ret)
                } else {
                    call.reject("Failed to create file")
                }
            } catch (e: Exception) {
                call.reject("SAF createFile failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun safDelete(call: PluginCall) {
        val uriStr = call.getString("uri", "") ?: ""
        if (uriStr.isEmpty()) { call.reject("uri is required"); return }
        ioScope.launch {
            try {
                val ok = pro.fileforge.app.saf.SafFileProvider.delete(context, Uri.parse(uriStr))
                val ret = JSObject()
                ret.put("success", ok)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("SAF delete failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun safRename(call: PluginCall) {
        val uriStr = call.getString("uri", "") ?: ""
        val newName = call.getString("newName", "") ?: ""
        if (uriStr.isEmpty() || newName.isEmpty()) { call.reject("uri and newName are required"); return }
        ioScope.launch {
            try {
                val ok = pro.fileforge.app.saf.SafFileProvider.rename(context, Uri.parse(uriStr), newName)
                val ret = JSObject()
                ret.put("success", ok)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("SAF rename failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun safGetMetadata(call: PluginCall) {
        val uriStr = call.getString("uri", "") ?: ""
        if (uriStr.isEmpty()) { call.reject("uri is required"); return }
        ioScope.launch {
            try {
                val meta = pro.fileforge.app.saf.SafFileProvider.getMetadata(context, Uri.parse(uriStr))
                if (meta != null) {
                    val ret = JSObject()
                    ret.put("name", meta.name)
                    ret.put("isDirectory", meta.isDirectory)
                    ret.put("size", meta.size)
                    ret.put("lastModified", meta.lastModified)
                    ret.put("mimeType", meta.mimeType)
                    call.resolve(ret)
                } else {
                    call.reject("File does not exist")
                }
            } catch (e: Exception) {
                call.reject("SAF getMetadata failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun safSaveTreeUri(call: PluginCall) {
        val uriStr = call.getString("uri", "") ?: ""
        val pathPrefix = call.getString("pathPrefix", "") ?: ""
        if (uriStr.isEmpty()) { call.reject("uri is required"); return }
        try {
            pro.fileforge.app.saf.SafFileProvider.saveTreeUri(context, Uri.parse(uriStr), pathPrefix)
            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to save tree URI: ${e.message}")
        }
    }

    @PluginMethod
    fun safGetTreeUris(call: PluginCall) {
        try {
            val uris = pro.fileforge.app.saf.SafFileProvider.getTreeUris(context)
            val arr = JSArray()
            for ((prefix, uri) in uris) {
                val o = JSObject()
                o.put("pathPrefix", prefix)
                o.put("uri", uri)
                arr.put(o)
            }
            val ret = JSObject()
            ret.put("treeUris", arr)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to get tree URIs: ${e.message}")
        }
    }

    @PluginMethod
    fun safRemoveTreeUri(call: PluginCall) {
        val pathPrefix = call.getString("pathPrefix", "") ?: ""
        if (pathPrefix.isEmpty()) { call.reject("pathPrefix is required"); return }
        try {
            pro.fileforge.app.saf.SafFileProvider.removeTreeUri(context, pathPrefix)
            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to remove tree URI: ${e.message}")
        }
    }


    // ============ Chunked File Reading (for Text/Hex editor) ============
    /**
     * Read a chunk of a file starting at offset, up to length bytes.
     * Returns base64-encoded bytes. Used by the Text Editor and Hex Viewer
     * for large file support without loading the entire file into RAM.
     */
    @PluginMethod
    fun readFileChunk(call: PluginCall) {
        val rawPath = call.getString("path", "") ?: ""
        val offset = call.getLong("offset", 0L) ?: 0L
        val length = call.getInt("length", 65536) ?: 65536
        val path = resolveLogicalPath(rawPath)
        if (path.isNullOrEmpty()) {
            call.reject("Path is required, or path is outside allowed storage")
            return
        }
        ioScope.launch {
            try {
                val file = File(path)
                if (!file.exists() || file.isDirectory) {
                    call.reject("File does not exist or is a directory")
                    return@launch
                }
                val fileSize = file.length()
                val actualOffset = Math.min(offset, fileSize)
                val actualLength = Math.min(length.toLong(), fileSize - actualOffset).toInt()
                if (actualLength <= 0) {
                    val ret = JSObject()
                    ret.put("content", "")
                    ret.put("bytesRead", 0)
                    ret.put("eof", true)
                    ret.put("fileSize", fileSize)
                    call.resolve(ret)
                    return@launch
                }
                val bytes = ByteArray(actualLength)
                java.io.RandomAccessFile(file, "r").use { raf ->
                    raf.seek(actualOffset)
                    raf.readFully(bytes)
                }
                val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                val ret = JSObject()
                ret.put("content", base64)
                ret.put("encoding", "base64")
                ret.put("bytesRead", actualLength)
                ret.put("offset", actualOffset)
                ret.put("fileSize", fileSize)
                ret.put("eof", actualOffset + actualLength >= fileSize)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Chunked read failed: ${e.message}")
            }
        }
    }

    // ============ Native PDF/Range Reading ============
    /**
     * Reads only the requested byte range. PDF.js uses this through
     * PDFDataRangeTransport, so large PDFs never need to become one giant
     * Base64 payload in JavaScript. The Base64 here is bounded to the requested
     * chunk only (max 1 MiB) and is immediately decoded by the caller.
     */
    @PluginMethod
    fun storageReadRange(call: PluginCall) {
        val ref = call.getString("ref", "") ?: ""
        val offset = call.getLong("offset", 0L) ?: 0L
        val length = (call.getInt("length", 1024 * 1024) ?: (1024 * 1024)).coerceIn(1, 1024 * 1024)
        if (ref.isBlank()) { call.reject("ref is required"); return }
        ioScope.launch {
            try {
                val meta = unifiedStorage.metadata(ref)
                if (meta.isDirectory) { call.reject("Reference is a directory"); return@launch }
                val size = meta.size.coerceAtLeast(0L)
                val actualOffset = offset.coerceIn(0L, size)
                val actualLength = minOf(length.toLong(), size - actualOffset).toInt()
                val bytes = if (actualLength > 0) unifiedStorage.readChunk(ref, actualOffset, actualLength) else ByteArray(0)
                val ret = JSObject().apply {
                    put("content", Base64.encodeToString(bytes, Base64.NO_WRAP))
                    put("encoding", "base64")
                    put("bytesRead", bytes.size)
                    put("offset", actualOffset)
                    put("fileSize", size)
                    put("eof", actualOffset + bytes.size >= size)
                }
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Range read failed: ${e.message}")
            }
        }
    }

    // ============ Open File in External App ============
    /**
     * Open a file using the system's default app via ACTION_VIEW.
     * Uses FileProvider to grant a content:// URI to the receiving app.
     */
    @PluginMethod
    fun openFileExternal(call: PluginCall) {
        val rawPath = call.getString("path", "")
        val mimeType = call.getString("mimeType", "") ?: ""
        val path = resolveLogicalPath(rawPath)
        if (path.isNullOrEmpty()) {
            call.reject("Path is required, or path is outside allowed storage")
            return
        }
        ioScope.launch {
            try {
                val file = File(path)
                if (!file.exists() || file.isDirectory) {
                    call.reject("File does not exist or is a directory")
                    return@launch
                }
                // Resolve mime type
                val mime = if (mimeType.isNotEmpty()) mimeType else getMimeType(file)

                // Build a content:// URI via FileProvider
                val authority = "${context.packageName}.fileprovider"
                val uri = androidx.core.content.FileProvider.getUriForFile(context, authority, file)

                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, mime)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }

                if (intent.resolveActivity(context.packageManager) != null) {
                    context.startActivity(intent)
                    val ret = JSObject()
                    ret.put("success", true)
                    call.resolve(ret)
                } else {
                    // No app to handle this MIME — try with wildcard
                    val wildcardIntent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "*/*")
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    if (wildcardIntent.resolveActivity(context.packageManager) != null) {
                        context.startActivity(wildcardIntent)
                        val ret = JSObject()
                        ret.put("success", true)
                        call.resolve(ret)
                    } else {
                        val ret = JSObject()
                        ret.put("success", false)
                        ret.put("error", "No app available to open this file type")
                        call.resolve(ret)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "openFileExternal failed", e)
                val ret = JSObject()
                ret.put("success", false)
                ret.put("error", e.message ?: "Unknown error")
                call.resolve(ret)
            }
        }
    }

    // ============ Permission Methods ============
    @PluginMethod
    fun requestStoragePermission(call: PluginCall) {
        if (hasReadPermission()) {
            val ret = JSObject()
            ret.put("granted", true)
            call.resolve(ret)
        } else {
            requestPermissionForAlias("storage", call, "storagePermissionCallback")
        }
    }

    @PermissionCallback
    private fun storagePermissionCallback(call: PluginCall) {
        val ret = JSObject()
        ret.put("granted", hasReadPermission())
        call.resolve(ret)
    }

    @PluginMethod
    fun checkStoragePermission(call: PluginCall) {
        val ret = JSObject()
        ret.put("granted", hasReadPermission())
        call.resolve(ret)
    }

    @PluginMethod
    fun hasManageAllFilesPermission(call: PluginCall) {
        val ret = JSObject()
        ret.put("granted", hasManageAllFilesPermission())
        call.resolve(ret)
    }

    @PluginMethod
    fun requestManageAllFilesPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (Environment.isExternalStorageManager()) {
                val ret = JSObject()
                ret.put("granted", true)
                call.resolve(ret)
            } else {
                try {
                    val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                    intent.addCategory("android.intent.category.DEFAULT")
                    intent.data = Uri.parse("package:" + context.packageName)
                    startActivityForResult(call, intent, "manageAllFilesCallback")
                } catch (e: Exception) {
                    try {
                        val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
                        startActivityForResult(call, intent, "manageAllFilesCallback")
                    } catch (e2: Exception) {
                        val ret = JSObject()
                        ret.put("granted", false)
                        call.resolve(ret)
                    }
                }
            }
        } else {
            if (hasReadPermission()) {
                val ret = JSObject()
                ret.put("granted", true)
                call.resolve(ret)
            } else {
                requestPermissionForAlias("storage", call, "storagePermissionCallback")
            }
        }
    }

    @ActivityCallback
    private fun manageAllFilesCallback(call: PluginCall, @Suppress("UNUSED_PARAMETER") result: PluginResult) {
        val ret = JSObject()
        ret.put("granted", hasManageAllFilesPermission())
        call.resolve(ret)
    }

    // ============ Request All Permissions at Once ============
    @PluginMethod
    fun requestAllPermissions(call: PluginCall) {
        requestPermissionForAlias("storage", call, "allPermissionsStorageCallback")
    }

    @PermissionCallback
    private fun allPermissionsStorageCallback(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("media", call, "allPermissionsMediaCallback")
        } else {
            allPermissionsMediaCallback(call)
        }
    }

    @PermissionCallback
    private fun allPermissionsMediaCallback(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("notifications", call, "allPermissionsNotificationsCallback")
        } else {
            allPermissionsNotificationsCallback(call)
        }
    }

    @PermissionCallback
    private fun allPermissionsNotificationsCallback(call: PluginCall) {
        requestPermissionForAlias("location", call, "allPermissionsLocationCallback")
    }

    @PermissionCallback
    private fun allPermissionsLocationCallback(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
            try {
                val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION)
                intent.addCategory("android.intent.category.DEFAULT")
                intent.data = Uri.parse("package:" + context.packageName)
                startActivityForResult(call, intent, "manageAllFilesCallback")
            } catch (e: Exception) {
                val ret = JSObject()
                ret.put("granted", hasReadPermission())
                call.resolve(ret)
            }
        } else {
            val ret = JSObject()
            ret.put("granted", true)
            call.resolve(ret)
        }
    }

    // ============ Check Individual Permission ============
    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val permission = call.getString("permission", "") ?: ""
        val ret = JSObject()
        ret.put("granted", checkSpecificPermission(permission))
        call.resolve(ret)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        val permission = call.getString("permission", "") ?: ""
        val alias = getAliasForPermission(permission)
        if (alias != null) {
            requestPermissionForAlias(alias, call, "specificPermissionCallback")
        } else {
            val ret = JSObject()
            ret.put("granted", false)
            call.resolve(ret)
        }
    }

    @PermissionCallback
    private fun specificPermissionCallback(call: PluginCall) {
        val permission = call.getString("permission", "") ?: ""
        val ret = JSObject()
        ret.put("granted", checkSpecificPermission(permission))
        call.resolve(ret)
    }

    private fun checkSpecificPermission(permission: String?): Boolean {
        if (permission.isNullOrEmpty()) return false
        val ctx: Context = context
        return when (permission) {
            "storage" -> hasReadPermission()
            "media_images" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                ctx.checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED
            else hasReadPermission()
            "media_video" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                ctx.checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO) == PackageManager.PERMISSION_GRANTED
            else hasReadPermission()
            "media_audio" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                ctx.checkSelfPermission(Manifest.permission.READ_MEDIA_AUDIO) == PackageManager.PERMISSION_GRANTED
            else hasReadPermission()
            "camera" -> ctx.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            "microphone" -> ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
            "notifications" -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
            else true
            "location" -> ctx.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            else -> false
        }
    }

    private fun getAliasForPermission(permission: String?): String? {
        if (permission == null) return null
        return when (permission) {
            "storage" -> "storage"
            "media_images", "media_video", "media_audio" -> "media"
            "camera" -> "camera"
            "microphone" -> "microphone"
            "notifications" -> "notifications"
            "location" -> "location"
            else -> null
        }
    }

    // ============ Helper Methods ============
    /**
     * True if EITHER MANAGE_EXTERNAL_STORAGE is granted OR READ_EXTERNAL_STORAGE is granted.
     * Previously this conflated the two, locking out devices that granted READ but declined all-files.
     */
    private fun hasReadPermission(): Boolean {
        val ctx: Context = context
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && Environment.isExternalStorageManager()) {
            return true
        }
        return ctx.checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
    }

    private fun hasManageAllFilesPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) Environment.isExternalStorageManager()
        else hasReadPermission()
    }

    private fun requestReadPermission(call: PluginCall) {
        requestPermissionForAlias("storage", call, "storagePermissionCallback")
    }

    private fun deleteRecursive(file: File): Boolean {
        if (file.isDirectory) {
            val children = file.listFiles()
            if (children != null) {
                for (child in children) {
                    deleteRecursive(child)
                }
            }
        }
        return file.delete()
    }

    @Throws(IOException::class)
    private fun copyFile(source: File, dest: File) {
        FileInputStream(source).use { input ->
            FileOutputStream(dest).use { output ->
                val buffer = ByteArray(8192)
                var length: Int
                while (input.read(buffer).also { length = it } > 0) {
                    output.write(buffer, 0, length)
                }
            }
        }
    }

    @Throws(IOException::class)
    private fun copyDirectory(source: File, dest: File) {
        if (!dest.exists()) dest.mkdirs()
        val children = source.listFiles() ?: return
        for (child in children) {
            val newDest = File(dest, child.name)
            if (child.isDirectory) copyDirectory(child, newDest) else copyFile(child, newDest)
        }
    }

    private fun getMimeType(file: File): String {
        if (file.isDirectory) return "inode/directory"
        val name = file.name
        val dotIndex = name.lastIndexOf(".")
        if (dotIndex < 0) return "application/octet-stream"
        val ext = name.substring(dotIndex + 1).lowercase()
        // Try system MimeTypeMap first for long-tail coverage
        try {
            val sys = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
            if (sys != null) return sys
        } catch (_: Throwable) { /* fall through to manual map */ }
        return when (ext) {
            "txt" -> "text/plain"
            "md" -> "text/markdown"
            "csv" -> "text/csv"
            "html", "htm" -> "text/html"
            "css" -> "text/css"
            "js" -> "application/javascript"
            "json" -> "application/json"
            "xml" -> "application/xml"
            "yaml", "yml" -> "application/x-yaml"
            "pdf" -> "application/pdf"
            "zip" -> "application/zip"
            "rar" -> "application/x-rar-compressed"
            "7z" -> "application/x-7z-compressed"
            "tar" -> "application/x-tar"
            "gz" -> "application/gzip"
            "bz2" -> "application/x-bzip2"
            "xz" -> "application/x-xz"
            "jpg", "jpeg" -> "image/jpeg"
            "png" -> "image/png"
            "gif" -> "image/gif"
            "webp" -> "image/webp"
            "bmp" -> "image/bmp"
            "svg" -> "image/svg+xml"
            "heic", "heif" -> "image/heic"
            "mp4" -> "video/mp4"
            "mkv" -> "video/x-matroska"
            "avi" -> "video/x-msvideo"
            "mov" -> "video/quicktime"
            "webm" -> "video/webm"
            "flv" -> "video/x-flv"
            "wmv" -> "video/x-ms-wmv"
            "3gp" -> "video/3gpp"
            "mp3" -> "audio/mpeg"
            "wav" -> "audio/wav"
            "ogg" -> "audio/ogg"
            "flac" -> "audio/flac"
            "m4a" -> "audio/mp4"
            "aac" -> "audio/aac"
            "opus" -> "audio/opus"
            "doc" -> "application/msword"
            "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            "xls" -> "application/vnd.ms-excel"
            "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            "ppt" -> "application/vnd.ms-powerpoint"
            "pptx" -> "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            "apk" -> "application/vnd.android.package-archive"
            "ttf" -> "font/ttf"
            "otf" -> "font/otf"
            "woff" -> "font/woff"
            "woff2" -> "font/woff2"
            else -> "application/octet-stream"
        }
    }

    private fun generateImageThumbnail(imageFile: File, maxSize: Int): String? {
        var decoded: Bitmap? = null
        var scaled: Bitmap? = null
        var rotated: Bitmap? = null
        try {
            val options = BitmapFactory.Options()
            options.inJustDecodeBounds = true
            BitmapFactory.decodeFile(imageFile.absolutePath, options)
            var width = options.outWidth
            var height = options.outHeight
            var scale = 1
            while (width / 2 >= maxSize || height / 2 >= maxSize) {
                width /= 2
                height /= 2
                scale *= 2
            }
            options.inJustDecodeBounds = false
            options.inSampleSize = scale
            decoded = BitmapFactory.decodeFile(imageFile.absolutePath, options) ?: return null

            // Apply EXIF rotation so portrait photos don't appear sideways
            val sourceBitmap = applyExifRotation(imageFile, decoded)
            rotated = sourceBitmap

            val ratio = minOf(maxSize.toFloat() / sourceBitmap.width, maxSize.toFloat() / sourceBitmap.height)
            val scaledWidth = Math.round(sourceBitmap.width * ratio)
            val scaledHeight = Math.round(sourceBitmap.height * ratio)
            scaled = Bitmap.createScaledBitmap(sourceBitmap, scaledWidth, scaledHeight, true)
            val baos = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 80, baos)
            return Base64.encodeToString(baos.toByteArray(), Base64.DEFAULT)
        } catch (e: Exception) {
            Log.e(TAG, "Image thumbnail generation failed", e)
            return null
        } finally {
            decoded?.recycle()
            rotated?.recycle()
            scaled?.recycle()
        }
    }

    /**
     * Read EXIF orientation from the image file and rotate the bitmap
     * accordingly. Without this, portrait phone photos appear sideways.
     */
    private fun applyExifRotation(file: File, bitmap: Bitmap): Bitmap {
        try {
            val exif = androidx.exifinterface.media.ExifInterface(file.absolutePath)
            val orientation = exif.getAttributeInt(
                androidx.exifinterface.media.ExifInterface.TAG_ORIENTATION,
                androidx.exifinterface.media.ExifInterface.ORIENTATION_NORMAL
            )
            val matrix = android.graphics.Matrix()
            when (orientation) {
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
                androidx.exifinterface.media.ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
                androidx.exifinterface.media.ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
                androidx.exifinterface.media.ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
                else -> return bitmap
            }
            val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
            if (rotated != bitmap) bitmap.recycle()
            return rotated ?: bitmap
        } catch (e: Exception) {
            return bitmap
        }
    }

    private fun generateVideoThumbnail(videoFile: File, maxSize: Int): String? {
        var retriever: MediaMetadataRetriever? = null
        var frame: Bitmap? = null
        var scaled: Bitmap? = null
        try {
            retriever = MediaMetadataRetriever()
            retriever.setDataSource(videoFile.absolutePath)

            // Try to extract duration and pick a frame at ~10% into the video
            // (avoids black intro frames on many encodings). Fall back to 1s
            // if duration is unavailable.
            val durationMs = try {
                retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLong() ?: 0L
            } catch (_: Exception) { 0L }

            val targetMs = if (durationMs > 0) {
                // 10% into the video, but at least 1 second
                Math.max(1_000, (durationMs * 0.1).toLong())
            } else {
                1_000L
            }

            // getFrameAtTime takes microseconds
            frame = retriever.getFrameAtTime(targetMs * 1_000, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
            if (frame == null) {
                // Fallback: try at time 0
                frame = retriever.getFrameAtTime(0)
            }
            if (frame == null) return null

            val ratio = minOf(maxSize.toFloat() / frame.width, maxSize.toFloat() / frame.height)
            val scaledWidth = Math.round(frame.width * ratio)
            val scaledHeight = Math.round(frame.height * ratio)
            scaled = Bitmap.createScaledBitmap(frame, scaledWidth, scaledHeight, true)
            val baos = ByteArrayOutputStream()
            scaled.compress(Bitmap.CompressFormat.JPEG, 80, baos)
            return Base64.encodeToString(baos.toByteArray(), Base64.DEFAULT)
        } catch (e: Exception) {
            Log.e(TAG, "Video thumbnail generation failed", e)
            return null
        } finally {
            scaled?.recycle()
            frame?.recycle()
            try { retriever?.release() } catch (_: Throwable) { /* best effort */ }
        }
    }

    private fun notifyOperationProgress(id: String, type: String, done: Long, total: Long, path: String) {
        notifyListeners("fileOperationProgress", JSObject().apply {
            put("operationId", id)
            put("type", type)
            put("bytesProcessed", done)
            put("totalBytes", total)
            put("fraction", if (total > 0) done.toDouble() / total.toDouble() else 0.0)
            put("currentPath", path)
        })
    }

    private fun notifyOperationError(id: String, type: String, message: String) {
        notifyListeners("fileOperationError", JSObject().apply {
            put("operationId", id)
            put("type", type)
            put("message", message)
        })
    }


    private fun getMimeTypeFromName(name: String): String {
        val ext = name.substringAfterLast('.', "").lowercase()
        return android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: "application/octet-stream"
    }

}
