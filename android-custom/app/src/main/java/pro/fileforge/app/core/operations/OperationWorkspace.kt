package pro.fileforge.app.core.operations

import java.io.File
import java.util.UUID

/**
 * Crash-safe staging workspace for destructive local filesystem operations.
 * A staged result is never exposed as the final destination until it has been
 * fully written and fsynced. Existing destinations are moved aside first so
 * a failed commit can restore the previous file/tree.
 */
class OperationWorkspace private constructor(private val root: File) {
    companion object {
        private const val DIR = ".fileforge-work"
        private const val STALE_AGE_MS = 24L * 60L * 60L * 1000L

        fun forTarget(target: File): OperationWorkspace {
            val parent = target.parentFile ?: error("Target must have a parent directory")
            val root = File(parent, DIR)
            require(root.exists() || root.mkdirs()) { "Unable to create operation workspace" }
            return OperationWorkspace(root)
        }

        /** Removes orphaned staging/backup artifacts left by a crashed process. */
        fun cleanupOrphans(parent: File, now: Long = System.currentTimeMillis()): Int {
            val root = File(parent, DIR)
            if (!root.isDirectory) return 0
            var removed = 0
            root.listFiles()?.forEach { file ->
                if (now - file.lastModified() >= STALE_AGE_MS && file.deleteRecursively()) removed++
            }
            if (root.listFiles()?.isEmpty() == true) root.delete()
            return removed
        }
    }

    fun stagingTarget(target: File): File = File(root, "${target.name}.${UUID.randomUUID()}.part")

    fun backupTarget(target: File): File = File(root, "${target.name}.${UUID.randomUUID()}.backup")

    fun commitFile(staging: File, target: File) {
        target.parentFile?.mkdirs()
        require(staging.isFile) { "Staging file is missing" }
        val backup = if (target.exists()) backupTarget(target) else null
        try {
            if (backup != null) {
                require(target.renameTo(backup)) { "Unable to stage existing destination" }
            }
            if (!staging.renameTo(target)) {
                staging.copyTo(target, overwrite = false)
                require(staging.delete()) { "Unable to remove staging file" }
            }
            backup?.deleteRecursively()
        } catch (t: Throwable) {
            if (target.exists() && backup != null) target.deleteRecursively()
            if (backup != null && backup.exists()) backup.renameTo(target)
            throw t
        } finally {
            if (staging.exists()) staging.deleteRecursively()
            if (backup?.exists() == true) backup.deleteRecursively()
            cleanupEmptyRoot()
        }
    }

    fun commitDirectory(staging: File, target: File) {
        target.parentFile?.mkdirs()
        require(staging.isDirectory) { "Staging directory is missing" }
        val backup = if (target.exists()) backupTarget(target) else null
        try {
            if (backup != null) require(target.renameTo(backup)) { "Unable to stage existing destination" }
            if (!staging.renameTo(target)) {
                staging.copyRecursively(target, overwrite = false)
                staging.deleteRecursively()
            }
            backup?.deleteRecursively()
        } catch (t: Throwable) {
            if (target.exists() && backup != null) target.deleteRecursively()
            if (backup != null && backup.exists()) backup.renameTo(target)
            throw t
        } finally {
            if (staging.exists()) staging.deleteRecursively()
            if (backup?.exists() == true) backup.deleteRecursively()
            cleanupEmptyRoot()
        }
    }

    fun cleanup(path: File) {
        if (path.exists()) path.deleteRecursively()
        cleanupEmptyRoot()
    }

    private fun cleanupEmptyRoot() {
        if (root.listFiles()?.isEmpty() == true) root.delete()
    }
}
