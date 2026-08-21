package pro.fileforge.app.core.operations

import android.content.Context
import pro.fileforge.app.core.model.NativeFileMetadata
import pro.fileforge.app.core.storage.StorageReference
import pro.fileforge.app.core.storage.PendingSaf
import pro.fileforge.app.core.storage.UnifiedStorageService
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Phase 3 operation engine. It is the single native implementation for
 * copy/move/delete and is provider-aware through UnifiedStorageService.
 *
 * Contract:
 *  - local target: exact destination path
 *  - SAF target: destination directory; targetName selects the child name
 *  - if SAF target is an existing file, it is treated as an exact destination
 */
class NativeOperationEngine(
    private val context: Context,
    private val storage: UnifiedStorageService,
) {
    enum class ConflictPolicy { FAIL, REPLACE, SKIP, RENAME }

    data class Progress(val bytesProcessed: Long, val totalBytes: Long, val currentPath: String, val currentItem: String? = null) {
        val fraction get() = if (totalBytes <= 0L) 0.0 else (bytesProcessed.toDouble() / totalBytes).coerceIn(0.0, 1.0)
    }

    data class Result(val ref: String, val skipped: Boolean = false, val crossProvider: Boolean = false)

    fun copy(sourceRaw: String, targetRaw: String, targetName: String?, policy: ConflictPolicy, cancelled: AtomicBoolean, paused: AtomicBoolean, progress: ((Progress) -> Unit)?): Result {
        val source = storage.parse(sourceRaw)
        val target = resolveTarget(source, targetRaw, targetName)
        validateOverlap(source, target)
        val sourceMeta = storage.metadata(source.value)
        val total = treeSize(source)
        val destination = prepareDestination(sourceMeta, target, policy) ?: return Result(target.value, skipped = true, crossProvider = source::class != target::class)
        val done = longArrayOf(0L)
        if (destination is StorageReference.Local) {
            val workspace = OperationWorkspace.forTarget(destination.file)
            val staging = workspace.stagingTarget(destination.file)
            try {
                if (sourceMeta.isDirectory) require(staging.mkdirs() || staging.isDirectory) { "Unable to create staging directory" }
                else staging.parentFile?.mkdirs()
                copyNode(source, StorageReference.Local(staging), total, done, cancelled, paused, progress)
                checkCancelled(cancelled)
                if (sourceMeta.isDirectory) workspace.commitDirectory(staging, destination.file) else workspace.commitFile(staging, destination.file)
            } catch (t: Throwable) {
                workspace.cleanup(staging)
                throw t
            }
        } else {
            copyNode(source, destination, total, done, cancelled, paused, progress)
        }
        checkCancelled(cancelled)
        progress?.invoke(Progress(total, total, destination.value, sourceMeta.name))
        return Result(destination.value, crossProvider = source::class != destination::class)
    }

    fun move(sourceRaw: String, targetRaw: String, targetName: String?, policy: ConflictPolicy, cancelled: AtomicBoolean, paused: AtomicBoolean, progress: ((Progress) -> Unit)?): Result {
        val source = storage.parse(sourceRaw)
        val target = resolveTarget(source, targetRaw, targetName)
        validateOverlap(source, target)
        val meta = storage.metadata(source.value)
        val destination = prepareDestination(meta, target, policy) ?: return Result(target.value, skipped = true, crossProvider = source::class != target::class)

        if (source is StorageReference.Local && destination is StorageReference.Local && !meta.isDirectory && !destination.file.exists() && source.file.parentFile?.canonicalFile == destination.file.parentFile?.canonicalFile) {
            checkCancelled(cancelled)
            if (!source.file.renameTo(destination.file)) throw IllegalStateException("Unable to atomically rename source")
            progress?.invoke(Progress(meta.size, meta.size, destination.value, meta.name))
            return Result(destination.value)
        }

        val result = copy(source.value, destination.value, null, policy, cancelled, paused, progress)
        checkCancelled(cancelled)
        if (!storage.delete(source.value)) throw IllegalStateException("Copy completed but source could not be deleted; destination preserved at ${result.ref}")
        return result
    }

    fun delete(sourceRaw: String, cancelled: AtomicBoolean, paused: AtomicBoolean, progress: ((Progress) -> Unit)?): Boolean {
        val source = storage.parse(sourceRaw)
        val total = treeSize(source)
        val done = longArrayOf(0L)
        deleteNode(source, total, done, cancelled, paused, progress)
        checkCancelled(cancelled)
        return true
    }

    private fun resolveTarget(source: StorageReference, raw: String, targetName: String?): StorageReference {
        val base = storage.parse(raw)
        if (base is StorageReference.Local) {
            return if (targetName.isNullOrBlank()) base else StorageReference.Local(File(base.file, safeName(targetName)).canonicalFile)
        }
        val existing = runCatching { storage.metadata(base.value) }.getOrNull()
        if (existing?.isDirectory == false && targetName.isNullOrBlank()) return base
        val name = safeName(targetName ?: storage.metadata(source.value).name)
        return existingChild(base, name)
    }

    private fun existingChild(parent: StorageReference, name: String): StorageReference {
        val found = storage.list(parent.value, true).firstOrNull { it.name == name }
        if (found != null) return storage.parse(found.path)
        return when (parent) {
            is StorageReference.Local -> StorageReference.Local(File(parent.file, name).canonicalFile)
            is StorageReference.Saf -> PendingSaf(parent, name)
            is PendingSaf -> throw IllegalStateException("Cannot create child below pending SAF destination")
        }
    }

    private fun prepareDestination(source: NativeFileMetadata, target: StorageReference, policy: ConflictPolicy): StorageReference? {
        if (target is PendingSaf) {
            return createSafChild(target.parent, target.name, source)
        }
        val existing = runCatching { storage.metadata(target.value) }.getOrNull() ?: return target
        return when (policy) {
            ConflictPolicy.FAIL -> throw IllegalStateException("Destination already exists: ${existing.path}")
            ConflictPolicy.SKIP -> null
            ConflictPolicy.REPLACE -> {
                if (target is StorageReference.Saf) storage.delete(target.value)
                target
            }
            ConflictPolicy.RENAME -> createUniqueChild(target, source)
        }
    }

    private fun createUniqueChild(target: StorageReference, source: NativeFileMetadata): StorageReference {
        val parent = parentOf(target)
        val base = source.name.substringBeforeLast('.', source.name)
        val ext = source.name.substringAfterLast('.', "").let { if (it.isBlank() || source.isDirectory) "" else ".${it}" }
        for (i in 1..10000) {
            val name = safeName("$base ($i)$ext")
            if (parent is StorageReference.Local) {
                val candidate = StorageReference.Local(File(parent.file, name))
                if (!candidate.file.exists()) return candidate
            } else {
                val safParent = parent as? StorageReference.Saf ?: throw IllegalStateException("Expected a SAF parent")
                if (storage.list(safParent.value, true).none { it.name == name }) return createSafChild(safParent, name, source)
            }
        }
        throw IllegalStateException("Unable to generate a unique destination name")
    }

    private fun createSafChild(parent: StorageReference.Saf, name: String, source: NativeFileMetadata, failIfExists: Boolean = false): StorageReference {
        if (failIfExists && storage.list(parent.value, true).any { it.name == name }) throw IllegalStateException("Destination already exists")
        val existing = storage.list(parent.value, true).firstOrNull { it.name == name }
        if (existing != null) return storage.parse(existing.path)
        val raw = if (source.isDirectory) storage.createDirectory(parent.value, name) else storage.createFile(parent.value, name, source.mimeType)
        return storage.parse(raw)
    }

    private fun copyNode(source: StorageReference, destination: StorageReference, total: Long, done: LongArray, cancelled: AtomicBoolean, paused: AtomicBoolean, progress: ((Progress) -> Unit)?) {
        checkCancelled(cancelled); waitIfPaused(paused, cancelled)
        val meta = storage.metadata(source.value)
        if (meta.isDirectory) {
            val actual = if (destination is PendingSaf) createSafChild(destination.parent, destination.name, meta) else ensureDirectory(destination, meta.name)
            for (child in storage.list(source.value, true)) {
                val childSource = storage.parse(child.path)
                val childTarget = childReference(actual, child.name)
                val prepared = prepareDestination(child, childTarget, ConflictPolicy.REPLACE) ?: continue
                copyNode(childSource, prepared, total, done, cancelled, paused, progress)
            }
        } else {
            copyFile(source, destination, meta, total, done, cancelled, paused, progress)
        }
    }

    private fun copyFile(source: StorageReference, destination: StorageReference, meta: NativeFileMetadata, total: Long, done: LongArray, cancelled: AtomicBoolean, paused: AtomicBoolean, progress: ((Progress) -> Unit)?) {
        val localDestination = destination as? StorageReference.Local
        val staging = localDestination?.let { StorageReference.Local(File(it.file.parentFile, ".${it.file.name}.fileforge-${System.nanoTime()}.part")) }
        val writeTarget = staging ?: destination
        try {
            storage.openInput(source.value).buffered(BUFFER).use { input ->
                storage.openOutput(writeTarget.value).buffered(BUFFER).use { output ->
                    val buffer = ByteArray(BUFFER)
                    while (true) {
                        checkCancelled(cancelled); waitIfPaused(paused, cancelled)
                        val n = input.read(buffer); if (n < 0) break
                        output.write(buffer, 0, n); done[0] += n
                        progress?.invoke(Progress(done[0], total, source.value, meta.name))
                    }
                }
            }
            if (staging != null && localDestination != null) {
                if (localDestination.file.exists() && !localDestination.file.deleteRecursively()) throw IllegalStateException("Unable to replace destination")
                if (!staging.file.renameTo(localDestination.file)) staging.file.copyTo(localDestination.file, overwrite = true).also { staging.file.delete() }
                localDestination.file.setLastModified(meta.lastModified)
            }
        } catch (t: Throwable) {
            staging?.file?.delete()
            throw t
        }
    }

    private fun deleteNode(source: StorageReference, total: Long, done: LongArray, cancelled: AtomicBoolean, paused: AtomicBoolean, progress: ((Progress) -> Unit)?) {
        checkCancelled(cancelled); waitIfPaused(paused, cancelled)
        val meta = storage.metadata(source.value)
        if (meta.isDirectory) storage.list(source.value, true).forEach { deleteNode(storage.parse(it.path), total, done, cancelled, paused, progress) }
        else { done[0] += meta.size; progress?.invoke(Progress(done[0], total, source.value, meta.name)) }
        if (!storage.delete(source.value)) throw IllegalStateException("Unable to delete ${source.value}")
    }

    private fun ensureDirectory(ref: StorageReference, name: String): StorageReference {
        val existing = runCatching { storage.metadata(ref.value) }.getOrNull()
        if (existing != null) { require(existing.isDirectory) { "Destination is not a directory" }; return ref }
        val parent = parentOf(ref)
        return storage.parse(storage.createDirectory(parent.value, name))
    }

    private fun childReference(parent: StorageReference, name: String): StorageReference = when (parent) {
        is StorageReference.Local -> StorageReference.Local(File(parent.file, safeName(name)).canonicalFile)
        is StorageReference.Saf -> existingChild(parent, safeName(name))
        is PendingSaf -> throw IllegalStateException("Cannot create child below pending SAF destination")
    }

    private fun parentOf(ref: StorageReference): StorageReference = when (ref) {
        is StorageReference.Local -> StorageReference.Local(ref.file.parentFile ?: throw IllegalStateException("Destination has no parent"))
        is StorageReference.Saf -> {
            val doc = androidx.documentfile.provider.DocumentFile.fromSingleUri(context, ref.uri) ?: androidx.documentfile.provider.DocumentFile.fromTreeUri(context, ref.uri)
            StorageReference.Saf(doc?.parentFile?.uri ?: throw IllegalStateException("SAF parent unavailable"))
        }
        is PendingSaf -> ref.parent
    }

    private fun treeSize(ref: StorageReference): Long {
        val meta = storage.metadata(ref.value)
        if (!meta.isDirectory) return meta.size
        return storage.list(ref.value, true).sumOf { treeSize(storage.parse(it.path)) }
    }

    private fun validateOverlap(source: StorageReference, target: StorageReference) {
        if (source is StorageReference.Local && target is StorageReference.Local) {
            val s = source.file.canonicalFile.toPath(); val t = target.file.canonicalFile.toPath()
            require(s != t && !(source.file.isDirectory && t.startsWith(s))) { "Source and destination overlap" }
        }
    }

    private fun safeName(name: String): String {
        require(name.isNotBlank() && name != "." && name != "..") { "Invalid child name" }
        require(!name.contains('/') && !name.contains('\\') && name.indexOf('\u0000') < 0) { "Invalid child name" }
        return name
    }

    private fun waitIfPaused(paused: AtomicBoolean, cancelled: AtomicBoolean) { while (paused.get() && !cancelled.get()) Thread.sleep(PAUSE_MS) }
    private fun checkCancelled(cancelled: AtomicBoolean) { if (cancelled.get()) throw OperationCancelledException() }
    class OperationCancelledException : RuntimeException("Operation cancelled")

    companion object { const val BUFFER = 128 * 1024; const val PAUSE_MS = 100L }
}
