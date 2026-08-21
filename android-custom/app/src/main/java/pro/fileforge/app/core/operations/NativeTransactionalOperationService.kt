package pro.fileforge.app.core.operations

import android.content.Context
import org.json.JSONObject
import pro.fileforge.app.core.recovery.NativeOperationJournal
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Durable local-filesystem transaction coordinator.
 *
 * A local copy/move is never exposed directly at the final destination while it
 * is being written. The operation is recorded in the journal before staging,
 * the staged tree is fsynced, and commit/cleanup phases are persisted. Existing
 * destinations are moved to a durable backup until the operation is terminal.
 * This deliberately does not pretend SAF/content:// can provide the same atomic
 * filesystem semantics.
 */
class NativeTransactionalOperationService(
    context: Context,
    private val journal: NativeOperationJournal,
) {
    private val appContext = context.applicationContext

    data class Result(val target: File, val skipped: Boolean = false)
    data class Progress(val bytesProcessed: Long, val totalBytes: Long, val currentPath: String)

    fun execute(
        operationId: String,
        type: String,
        source: File,
        target: File,
        policy: NativeOperationEngine.ConflictPolicy,
        cancelled: AtomicBoolean,
        paused: AtomicBoolean,
        onProgress: ((Progress) -> Unit)? = null,
    ): Result {
        require(type == "copy" || type == "move") { "Unsupported transactional operation: $type" }
        require(source.exists()) { "Source does not exist: ${source.absolutePath}" }
        require(source.canonicalFile != target.canonicalFile) { "Source and destination are identical" }
        require(!(source.isDirectory && target.canonicalFile.toPath().startsWith(source.canonicalFile.toPath()))) { "Source and destination overlap" }

        val actualTarget = resolveConflict(target, policy)
            ?: return Result(target, skipped = true)
        actualTarget.parentFile?.mkdirs()

        val total = sizeOf(source)
        val workspace = TransactionWorkspace(actualTarget)
        val staging = workspace.staging(actualTarget)
        val backup = if (actualTarget.exists()) workspace.backup(actualTarget) else null
        val sourceFingerprint = fingerprint(source)

        journal.setTransaction(
            operationId,
            state = "STAGING",
            stagingPath = staging.absolutePath,
            backupPath = backup?.absolutePath,
            sourceFingerprint = sourceFingerprint,
            targetPath = actualTarget.absolutePath,
            sourceSize = if (source.isFile) source.length() else total,
            sourceModifiedAt = source.lastModified(),
            resumable = false,
        )

        var committed = false
        try {
            journal.updateTransaction(operationId, "STAGING")
            copyToStaging(source, staging, total, longArrayOf(0L), cancelled, paused, onProgress)
            checkCancelled(cancelled)
            fsyncTree(staging)
            journal.updateTransaction(operationId, "STAGED")

            if (backup != null) {
                journal.updateTransaction(operationId, "BACKING_UP")
                require(actualTarget.renameTo(backup)) { "Unable to move existing destination to durable backup" }
                journal.updateTransaction(operationId, "BACKED_UP")
            }

            journal.updateTransaction(operationId, "COMMITTING")
            atomicInstall(staging, actualTarget)
            journal.updateTransaction(operationId, "COMMITTED")
            committed = true

            if (type == "move") {
                journal.updateTransaction(operationId, "SOURCE_CLEANUP")
                require(sourceFingerprint == fingerprint(source)) { "Source changed before move cleanup; refusing destructive delete" }
                require(deleteRecursively(source)) { "Destination committed but source cleanup failed" }
                journal.updateTransaction(operationId, "SOURCE_CLEANED")
            }

            journal.updateTransaction(operationId, "FINALIZING")
            backup?.deleteRecursively()
            workspace.cleanupEmpty()
            journal.updateTransaction(operationId, "COMPLETED")
            return Result(actualTarget)
        } catch (t: Throwable) {
            val safeToRollback = !committed
            if (safeToRollback) {
                runCatching { if (actualTarget.exists() && backup != null) actualTarget.deleteRecursively() }
                runCatching { if (backup != null && backup.exists() && !actualTarget.exists()) backup.renameTo(actualTarget) }
                runCatching { staging.deleteRecursively() }
                journal.updateTransaction(operationId, "ROLLED_BACK", error = t.message)
            } else {
                // The destination is already committed. Never delete it merely
                // because a post-commit cleanup failed; recovery must finish the
                // source/backup cleanup after re-verifying identities.
                journal.updateTransaction(operationId, "COMMITTED_PENDING_CLEANUP", error = t.message)
            }
            throw t
        }
    }

    fun rollback(record: JSONObject) {
        val target = record.optString("transactionTargetPath").takeIf { it.isNotBlank() }?.let(::File)
        val staging = record.optString("stagingPath").takeIf { it.isNotBlank() }?.let(::File)
        val backup = record.optString("backupPath").takeIf { it.isNotBlank() }?.let(::File)
        if (target?.exists() == true) target.deleteRecursively()
        if (staging?.exists() == true) staging.deleteRecursively()
        if (backup?.exists() == true && target != null && !target.exists()) require(backup.renameTo(target)) { "Unable to restore destination backup" }
    }

    fun finalizeMoveRecovery(record: JSONObject) {
        val source = record.optString("source").takeIf { it.isNotBlank() }?.let(::File) ?: error("Missing source")
        val target = record.optString("transactionTargetPath").takeIf { it.isNotBlank() }?.let(::File) ?: error("Missing target")
        require(target.exists()) { "Committed destination no longer exists" }
        val expected = record.optString("sourceFingerprint")
        require(expected.isNotBlank() && expected == fingerprint(source)) { "Source changed; refusing destructive recovery" }
        require(source.deleteRecursively()) { "Unable to remove source during recovery" }
        record.optString("backupPath").takeIf { it.isNotBlank() }?.let(::File)?.deleteRecursively()
        record.optString("stagingPath").takeIf { it.isNotBlank() }?.let(::File)?.deleteRecursively()
    }

    fun discard(record: JSONObject) {
        record.optString("stagingPath").takeIf { it.isNotBlank() }?.let(::File)?.deleteRecursively()
        record.optString("backupPath").takeIf { it.isNotBlank() }?.let(::File)?.deleteRecursively()
    }

    private fun resolveConflict(target: File, policy: NativeOperationEngine.ConflictPolicy): File? {
        if (!target.exists()) return target
        return when (policy) {
            NativeOperationEngine.ConflictPolicy.FAIL -> throw IllegalStateException("Destination already exists: ${target.absolutePath}")
            NativeOperationEngine.ConflictPolicy.SKIP -> null
            NativeOperationEngine.ConflictPolicy.REPLACE -> target
            NativeOperationEngine.ConflictPolicy.RENAME -> {
                val base = target.nameWithoutExtension
                val ext = target.extension.takeIf { it.isNotBlank() }?.let { ".${it}" } ?: ""
                for (i in 1..10000) {
                    val candidate = File(target.parentFile, "$base ($i)$ext")
                    if (!candidate.exists()) return candidate
                }
                throw IllegalStateException("Unable to generate a unique destination name")
            }
        }
    }

    private fun copyToStaging(source: File, staging: File, total: Long, done: LongArray, cancelled: AtomicBoolean, paused: AtomicBoolean, onProgress: ((Progress) -> Unit)?) {
        if (source.isDirectory) {
            require(staging.mkdirs() || staging.isDirectory) { "Unable to create staging directory" }
            source.listFiles()?.forEach { child ->
                checkCancelled(cancelled); waitIfPaused(paused, cancelled)
                copyToStaging(child, File(staging, child.name), total, done, cancelled, paused, onProgress)
            }
            staging.setLastModified(source.lastModified())
            return
        }
        staging.parentFile?.mkdirs()
        FileInputStream(source).use { input ->
            FileOutputStream(staging).use { output ->
                val buffer = ByteArray(BUFFER)
                while (true) {
                    checkCancelled(cancelled); waitIfPaused(paused, cancelled)
                    val n = input.read(buffer)
                    if (n < 0) break
                    output.write(buffer, 0, n)
                    done[0] += n
                    onProgress?.invoke(Progress(done[0], total, source.absolutePath))
                }
                output.fd.sync()
            }
        }
        staging.setLastModified(source.lastModified())
    }

    private fun atomicInstall(staging: File, target: File) {
        target.parentFile?.mkdirs()
        if (target.exists()) throw IllegalStateException("Destination unexpectedly appeared during commit")
        if (!staging.renameTo(target)) {
            if (staging.isDirectory) staging.copyRecursively(target, overwrite = false)
            else staging.copyTo(target, overwrite = false)
            require(staging.deleteRecursively()) { "Unable to remove staging after commit" }
        }
    }

    private fun fsyncTree(file: File) {
        if (file.isDirectory) { file.listFiles()?.forEach(::fsyncTree); return }
        FileOutputStream(file, true).use { it.fd.sync() }
    }

    private fun sizeOf(file: File): Long = if (file.isDirectory) file.listFiles()?.sumOf(::sizeOf) ?: 0L else file.length()

    private fun fingerprint(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        if (file.isFile) {
            FileInputStream(file).use { input ->
                val buffer = ByteArray(BUFFER)
                while (true) { val n = input.read(buffer); if (n < 0) break; if (n > 0) digest.update(buffer, 0, n) }
            }
        } else {
            digest.update(file.length().toString().toByteArray())
            digest.update(file.lastModified().toString().toByteArray())
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun deleteRecursively(file: File): Boolean = !file.exists() || file.deleteRecursively()
    private fun checkCancelled(flag: AtomicBoolean) { if (flag.get()) throw NativeOperationEngine.OperationCancelledException() }
    private fun waitIfPaused(paused: AtomicBoolean, cancelled: AtomicBoolean) { while (paused.get() && !cancelled.get()) Thread.sleep(PAUSE_MS) }

    private class TransactionWorkspace(target: File) {
        private val root = File(target.parentFile ?: error("Target has no parent"), WORK_DIR)
        init { require(root.exists() || root.mkdirs()) { "Unable to create transaction workspace" } }
        fun staging(target: File) = File(root, "${target.name}.${System.nanoTime()}.staging")
        fun backup(target: File) = File(root, "${target.name}.${System.nanoTime()}.backup")
        fun cleanupEmpty() { if (root.listFiles()?.isEmpty() == true) root.delete() }
        companion object { private const val WORK_DIR = ".fileforge-transactions" }
    }

    companion object { private const val BUFFER = 128 * 1024; private const val PAUSE_MS = 100L }
}
