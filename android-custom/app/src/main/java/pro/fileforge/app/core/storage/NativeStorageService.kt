package pro.fileforge.app.core.storage

import android.webkit.MimeTypeMap
import pro.fileforge.app.core.model.NativeFileMetadata
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset
import java.security.MessageDigest

/**
 * Native storage boundary.
 *
 * This class owns filesystem mechanics. Capacitor/React must only translate
 * requests and results; it must never become the place where filesystem
 * business logic lives.
 *
 * SAF is intentionally a separate provider and can be selected by the
 * higher-level StorageProvider when the path is a content:// URI.
 */
class NativeStorageService {

    fun metadata(file: File): NativeFileMetadata {
        require(file.exists()) { "File does not exist: ${file.absolutePath}" }
        return NativeFileMetadata(
            name = file.name,
            path = file.absolutePath,
            size = if (file.isFile) file.length() else 0L,
            lastModified = file.lastModified(),
            mimeType = mimeType(file),
            isDirectory = file.isDirectory,
        )
    }

    fun list(directory: File, showHidden: Boolean): List<NativeFileMetadata> {
        require(directory.isDirectory) { "Not a directory: ${directory.absolutePath}" }
        return directory.listFiles()
            ?.asSequence()
            ?.filter { showHidden || !it.isHidden }
            ?.sortedWith(compareBy<File>({ !it.isDirectory }, { it.name.lowercase() }))
            ?.map(::metadata)
            ?.toList()
            ?: emptyList()
    }

    fun createDirectory(parent: File, name: String): File {
        require(parent.isDirectory) { "Parent is not a directory: ${parent.absolutePath}" }
        validateChildName(name)
        val target = File(parent, name).canonicalFile
        require(target.parentFile?.canonicalFile == parent.canonicalFile) { "Invalid directory name" }
        require(!target.exists()) { "Directory already exists" }
        require(target.mkdirs()) { "Unable to create directory" }
        return target
    }

    fun delete(file: File): Boolean {
        if (!file.exists()) return false
        if (file.isDirectory) {
            file.listFiles()?.forEach { delete(it) }
        }
        return !file.exists() || file.delete()
    }

    fun rename(file: File, newName: String): File {
        require(file.exists()) { "Source does not exist" }
        validateChildName(newName)
        val parent = file.parentFile ?: error("Missing parent")
        val target = File(parent, newName).canonicalFile
        require(target.parentFile?.canonicalFile == parent.canonicalFile) { "Invalid new name" }
        require(!target.exists()) { "Target already exists" }
        require(file.renameTo(target)) { "Unable to rename file" }
        return target
    }

    fun copy(source: File, target: File) {
        require(source.exists()) { "Source does not exist" }
        require(source.canonicalFile != target.canonicalFile) { "Source and target are identical" }
        if (source.isDirectory) {
            require(!isDescendant(target, source)) { "Cannot copy a directory into itself" }
            require(!target.exists() || target.isDirectory) { "Target exists and is not a directory" }
            if (!target.exists()) require(target.mkdirs()) { "Unable to create target directory" }
            source.listFiles()?.forEach { child ->
                copy(child, File(target, child.name))
            }
        } else {
            require(!target.exists() || target.isFile) { "Target exists and is not a file" }
            target.parentFile?.mkdirs()
            FileInputStream(source).use { input ->
                FileOutputStream(target).use { output -> input.copyTo(output, DEFAULT_BUFFER) }
            }
            target.setLastModified(source.lastModified())
        }
    }

    fun move(source: File, target: File): Boolean {
        require(source.exists()) { "Source does not exist" }
        require(source.canonicalFile != target.canonicalFile) { "Source and target are identical" }
        require(!target.exists() || (source.isDirectory && target.isDirectory)) { "Target already exists" }
        target.parentFile?.mkdirs()
        if (source.renameTo(target)) return true
        copy(source, target)
        return delete(source)
    }

    fun openInput(file: File): InputStream = FileInputStream(file)

    fun openOutput(file: File): OutputStream {
        file.parentFile?.mkdirs()
        return FileOutputStream(file)
    }

    fun readText(file: File, charset: Charset): String {
        require(file.isFile) { "Not a file" }
        return openInput(file).buffered(DEFAULT_BUFFER).use { it.readBytes().toString(charset) }
    }

    fun writeText(file: File, text: String, charset: Charset) {
        file.parentFile?.mkdirs()
        val temp = File(file.parentFile ?: error("Missing parent"), ".${file.name}.fileforge-${System.nanoTime()}.tmp")
        val backup = File(file.parentFile ?: error("Missing parent"), ".${file.name}.fileforge-${System.nanoTime()}.bak")
        var backupCreated = false
        try {
            FileOutputStream(temp).buffered(DEFAULT_BUFFER).use { it.write(text.toByteArray(charset)) }
            if (file.exists()) {
                require(file.renameTo(backup)) { "Unable to stage existing file" }
                backupCreated = true
            }
            require(temp.renameTo(file)) { "Unable to commit file write" }
            if (backupCreated) backup.delete()
            backupCreated = false
        } finally {
            if (temp.exists()) temp.delete()
            if (backupCreated) {
                if (file.exists()) file.delete()
                backup.renameTo(file)
            }
        }
    }

    fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        openInput(file).buffered(DEFAULT_BUFFER).use { input ->
            val buffer = ByteArray(DEFAULT_BUFFER)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                if (n > 0) digest.update(buffer, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun isDescendant(candidate: File, ancestor: File): Boolean {
        val a = ancestor.canonicalFile.toPath()
        val c = candidate.canonicalFile.toPath()
        return c.startsWith(a)
    }

    private fun validateChildName(name: String) {
        require(name.isNotBlank()) { "Name is required" }
        require(name != "." && name != "..") { "Invalid name" }
        require(!name.contains('/') && !name.contains('\\')) { "Name must not contain path separators" }
        require(name.indexOf('\u0000') < 0) { "Name contains an invalid character" }
    }

    private fun mimeType(file: File): String {
        if (file.isDirectory) return "inode/directory"
        val ext = file.extension.lowercase()
        return MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext)
            ?: "application/octet-stream"
    }

    companion object {
        const val DEFAULT_BUFFER = 64 * 1024
    }
}
