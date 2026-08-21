package pro.fileforge.app.core.storage

import pro.fileforge.app.core.model.NativeFileMetadata
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset

/** Local filesystem implementation of the storage provider contract. */
class DirectStorageProvider(
    private val storage: NativeStorageService = NativeStorageService(),
) : StorageProvider {
    override fun supports(reference: StorageReference): Boolean = reference is StorageReference.Local

    private fun local(reference: StorageReference): java.io.File =
        (reference as? StorageReference.Local)?.file ?: throw StorageError.InvalidReference("Expected local path")

    override fun metadata(reference: StorageReference): NativeFileMetadata = storage.metadata(local(reference))

    override fun list(reference: StorageReference, showHidden: Boolean): List<NativeFileMetadata> =
        storage.list(local(reference), showHidden)

    override fun createDirectory(parent: StorageReference, name: String): StorageReference =
        StorageReference.Local(storage.createDirectory(local(parent), name))

    override fun createFile(parent: StorageReference, name: String, mimeType: String): StorageReference {
        validateChildName(name)
        val parentFile = local(parent).canonicalFile
        require(parentFile.isDirectory) { "Parent is not a directory" }
        val target = java.io.File(parentFile, name).canonicalFile
        require(target.parentFile?.canonicalFile == parentFile) { "Invalid file name" }
        if (!target.createNewFile()) throw StorageError.InvalidOperation("File already exists or could not be created")
        return StorageReference.Local(target)
    }

    override fun delete(reference: StorageReference): Boolean = storage.delete(local(reference))

    override fun rename(reference: StorageReference, newName: String): StorageReference =
        StorageReference.Local(storage.rename(local(reference), newName))

    override fun openInput(reference: StorageReference): InputStream = storage.openInput(local(reference))

    override fun openOutput(reference: StorageReference): OutputStream = storage.openOutput(local(reference))

    override fun readText(reference: StorageReference, charset: Charset, maxBytes: Long): String {
        if (maxBytes <= 0L) throw StorageError.InvalidOperation("maxBytes must be positive")
        return try {
            storage.openInput(local(reference)).buffered(NativeStorageService.DEFAULT_BUFFER).use { input ->
                val out = java.io.ByteArrayOutputStream(minOf(maxBytes, 1024L * 1024L).toInt())
                val buffer = ByteArray(NativeStorageService.DEFAULT_BUFFER)
                var total = 0L
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    total += n
                    if (total > maxBytes) throw StorageError.InvalidOperation("File exceeds text read limit")
                    out.write(buffer, 0, n)
                }
                out.toByteArray().toString(charset)
            }
        } catch (e: StorageError) {
            throw e
        } catch (e: Exception) {
            throw StorageError.Io("Unable to read text", e)
        }
    }

    override fun writeText(reference: StorageReference, text: String, charset: Charset) =
        storage.writeText(local(reference), text, charset)

    override fun readChunk(reference: StorageReference, offset: Long, length: Int): ByteArray {
        require(offset >= 0L && length in 1..1024 * 1024) { "Invalid chunk range" }
        val file = local(reference)
        java.io.RandomAccessFile(file, "r").use { raf ->
            if (offset >= raf.length()) return ByteArray(0)
            raf.seek(offset)
            val target = minOf(length.toLong(), raf.length() - offset).toInt()
            val buffer = ByteArray(target)
            var total = 0
            while (total < target) {
                val n = raf.read(buffer, total, target - total)
                if (n < 0) break
                total += n
            }
            return if (total == target) buffer else buffer.copyOf(total)
        }
    }

    override fun writeChunk(reference: StorageReference, offset: Long, bytes: ByteArray, truncate: Boolean) {
        require(offset >= 0L) { "Invalid write offset" }
        java.io.RandomAccessFile(local(reference), "rw").use { raf ->
            if (truncate) raf.setLength(0L)
            raf.seek(offset)
            raf.write(bytes)
        }
    }

    private fun validateChildName(name: String) {
        require(name.isNotBlank() && name != "." && name != "..") { "Invalid name" }
        require(!name.contains('/') && !name.contains('\\') && name.indexOf('\u0000') < 0) { "Invalid name" }
    }
}
