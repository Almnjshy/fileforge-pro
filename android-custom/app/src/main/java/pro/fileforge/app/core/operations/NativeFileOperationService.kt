package pro.fileforge.app.core.operations

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import pro.fileforge.app.core.storage.NativeStorageService
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Provider-aware operation engine. Progress is measured in bytes whenever the
 * provider exposes sizes; SAF and direct files use the same operation model.
 */
class NativeFileOperationService(
    private val context: Context? = null,
    private val storage: NativeStorageService = NativeStorageService(),
) {
    data class Progress(val bytesProcessed: Long, val totalBytes: Long, val currentPath: String) {
        val fraction: Double
            get() = if (totalBytes <= 0L) 0.0 else (bytesProcessed.toDouble() / totalBytes).coerceIn(0.0, 1.0)
    }

    fun delete(source: File, cancelled: AtomicBoolean? = null): Boolean {
        if (cancelled?.get() == true) return false
        return storage.delete(source)
    }

    fun copy(source: File, target: File, cancelled: AtomicBoolean = AtomicBoolean(false), paused: AtomicBoolean = AtomicBoolean(false), onProgress: ((Progress) -> Unit)? = null) {
        require(source.exists()) { "Source does not exist" }
        val total = source.lengthRecursive()
        if (source.isFile) {
            atomicCopyFile(source, target, total, cancelled, paused, onProgress)
            return
        }
        val workspace = OperationWorkspace.forTarget(target)
        val staging = workspace.stagingTarget(target)
        try {
            var done = 0L
            copyRecursive(source, staging, total, cancelled, paused) { delta, path ->
                done += delta
                onProgress?.invoke(Progress(done, total, path))
            }
            if (cancelled.get()) error("Operation cancelled")
            workspace.commitDirectory(staging, target)
        } finally {
            if (cancelled.get()) workspace.cleanup(staging)
        }
    }

    /** Resume a single-file local copy from the verified existing target length.
     * The destination is treated as the durable checkpoint. If it is larger
     * than the source, resume is rejected instead of risking corruption.
     */
    fun resumeSingleFileCopy(
        source: File,
        target: File,
        cancelled: AtomicBoolean = AtomicBoolean(false),
        paused: AtomicBoolean = AtomicBoolean(false),
        onProgress: ((Progress) -> Unit)? = null,
    ): Long {
        require(source.isFile) { "Resumable copy requires a single source file" }
        val total = source.length()
        require(total >= 0L) { "Invalid source length" }
        val offset = if (target.exists()) target.length() else 0L
        require(offset in 0L..total) { "Destination checkpoint is invalid" }
        if (offset == total) {
            onProgress?.invoke(Progress(total, total, source.absolutePath))
            return total
        }
        target.parentFile?.mkdirs()
        java.io.RandomAccessFile(source, "r").use { input ->
            java.io.RandomAccessFile(target, "rw").use { output ->
                input.seek(offset)
                output.setLength(offset)
                output.seek(offset)
                var done = offset
                val buffer = ByteArray(NativeStorageService.DEFAULT_BUFFER)
                while (!cancelled.get()) {
                    while (paused.get() && !cancelled.get()) Thread.sleep(100)
                    if (cancelled.get()) break
                    val n = input.read(buffer)
                    if (n < 0) break
                    output.write(buffer, 0, n)
                    done += n
                    onProgress?.invoke(Progress(done, total, source.absolutePath))
                }
                output.fd.sync()
            }
        }
        if (cancelled.get()) error("Operation cancelled")
        if (target.length() != total) error("Resumable copy ended before the source was fully copied")
        return total
    }

    fun move(source: File, target: File, cancelled: AtomicBoolean = AtomicBoolean(false), paused: AtomicBoolean = AtomicBoolean(false), onProgress: ((Progress) -> Unit)? = null): Boolean {
        if (cancelled.get()) return false
        while (paused.get() && !cancelled.get()) Thread.sleep(100)
        if (cancelled.get()) return false
        if (storage.move(source, target)) {
            val total = target.lengthRecursive()
            onProgress?.invoke(Progress(total, total, target.absolutePath))
            return true
        }
        return false
    }

    /** Copies any supported reference (direct path or content:// URI) to a SAF directory. */
    fun copyToSaf(sourceRef: String, targetParentRef: String, targetName: String, cancelled: AtomicBoolean = AtomicBoolean(false), paused: AtomicBoolean = AtomicBoolean(false), onProgress: ((Progress) -> Unit)? = null): String {
        val ctx = requireNotNull(context) { "Context is required for SAF operations" }
        val targetParent = DocumentFile.fromTreeUri(ctx, Uri.parse(targetParentRef)) ?: error("Target directory unavailable")
        val sourceDoc = if (sourceRef.startsWith("content://", true)) DocumentFile.fromSingleUri(ctx, Uri.parse(sourceRef)) else null
        val sourceFile = if (sourceDoc == null) File(sourceRef) else null
        val total = sourceDoc?.let { if (it.isDirectory) directorySize(ctx, it) else it.length() } ?: sourceFile!!.lengthRecursive()
        val target = targetParent.createFile(sourceDoc?.type ?: mimeFor(sourceFile!!), targetName) ?: error("Unable to create target")
        var done = 0L
        val input = if (sourceDoc != null) ctx.contentResolver.openInputStream(sourceDoc.uri) else sourceFile!!.inputStream()
        input?.buffered(64 * 1024)?.use { inp ->
            ctx.contentResolver.openOutputStream(target.uri)?.buffered(64 * 1024)?.use { out ->
                val buffer = ByteArray(64 * 1024)
                while (!cancelled.get()) {
                    while (paused.get() && !cancelled.get()) Thread.sleep(100)
                    val n = inp.read(buffer)
                    if (n < 0) break
                    out.write(buffer, 0, n)
                    done += n
                    onProgress?.invoke(Progress(done, total, sourceRef))
                }
            } ?: error("Unable to open target output")
        } ?: error("Unable to open source input")
        if (cancelled.get()) {
            target.delete()
            error("Operation cancelled")
        }
        onProgress?.invoke(Progress(total, total, sourceRef))
        return target.uri.toString()
    }

    private fun atomicCopyFile(source: File, target: File, total: Long, cancelled: AtomicBoolean, paused: AtomicBoolean, onProgress: ((Progress) -> Unit)?) {
        val workspace = OperationWorkspace.forTarget(target)
        val staging = workspace.stagingTarget(target)
        var done = 0L
        try {
            staging.parentFile?.mkdirs()
            FileInputStream(source).use { input ->
                FileOutputStream(staging).use { output ->
                    val buffer = ByteArray(NativeStorageService.DEFAULT_BUFFER)
                    while (!cancelled.get()) {
                        while (paused.get() && !cancelled.get()) Thread.sleep(100)
                        val n = input.read(buffer)
                        if (n < 0) break
                        output.write(buffer, 0, n)
                        done += n
                        onProgress?.invoke(Progress(done, total, source.absolutePath))
                    }
                    output.fd.sync()
                }
            }
            if (cancelled.get()) error("Operation cancelled")
            workspace.commitFile(staging, target)
            target.setLastModified(source.lastModified())
        } finally {
            if (cancelled.get()) workspace.cleanup(staging)
        }
    }

    private fun copyRecursive(source: File, target: File, total: Long, cancelled: AtomicBoolean, paused: AtomicBoolean, onBytes: (Long, String) -> Unit) {
        if (cancelled.get()) return
        if (source.isDirectory) {
            target.mkdirs()
            source.listFiles()?.forEach { child -> copyRecursive(child, File(target, child.name), total, cancelled, paused, onBytes) }
            return
        }
        target.parentFile?.mkdirs()
        source.inputStream().buffered(NativeStorageService.DEFAULT_BUFFER).use { input ->
            target.outputStream().buffered(NativeStorageService.DEFAULT_BUFFER).use { output ->
                val buffer = ByteArray(NativeStorageService.DEFAULT_BUFFER)
                while (!cancelled.get()) {
                    while (paused.get() && !cancelled.get()) Thread.sleep(100)
                    val n = input.read(buffer)
                    if (n < 0) break
                    output.write(buffer, 0, n)
                    onBytes(n.toLong(), source.absolutePath)
                }
            }
        }
        target.setLastModified(source.lastModified())
    }

    private fun File.lengthRecursive(): Long = if (isDirectory) listFiles()?.sumOf { it.lengthRecursive() } ?: 0L else length()

    private fun directorySize(ctx: Context, doc: DocumentFile): Long = doc.listFiles().sumOf { child -> if (child.isDirectory) directorySize(ctx, child) else child.length() }

    private fun mimeFor(file: File): String = android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase()) ?: "application/octet-stream"
}
