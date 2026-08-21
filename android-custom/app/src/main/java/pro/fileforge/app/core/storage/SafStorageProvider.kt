package pro.fileforge.app.core.storage

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import pro.fileforge.app.core.model.NativeFileMetadata
import pro.fileforge.app.saf.SafFileProvider
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset

/** SAF implementation of the same storage contract used by local storage. */
class SafStorageProvider(private val context: Context) : StorageProvider {
    override fun supports(reference: StorageReference): Boolean = reference is StorageReference.Saf

    private fun uri(reference: StorageReference): Uri =
        (reference as? StorageReference.Saf)?.uri ?: throw StorageError.InvalidReference("Expected SAF reference")

    private fun metadataOf(entry: SafFileProvider.SafEntry): NativeFileMetadata =
        NativeFileMetadata(entry.name, entry.uri.toString(), entry.size, entry.lastModified, entry.mimeType, entry.isDirectory)

    override fun metadata(reference: StorageReference): NativeFileMetadata {
        val ref = uri(reference)
        val entry = SafFileProvider.getMetadata(context, ref) ?: throw StorageError.NotFound(ref.toString())
        return metadataOf(entry)
    }

    override fun list(reference: StorageReference, showHidden: Boolean): List<NativeFileMetadata> {
        val directory = documentDirectory(uri(reference))
        return directory.listFiles().asSequence()
            .map { child ->
                NativeFileMetadata(
                    name = child.name ?: "unknown",
                    path = child.uri.toString(),
                    size = if (child.isFile) child.length() else 0L,
                    lastModified = child.lastModified(),
                    mimeType = child.type ?: "application/octet-stream",
                    isDirectory = child.isDirectory,
                )
            }
            .filter { showHidden || !it.name.startsWith(".") }
            .toList()
    }

    override fun createDirectory(parent: StorageReference, name: String): StorageReference {
        validateChildName(name)
        val created = documentDirectory(uri(parent)).createDirectory(name)?.uri
            ?: throw StorageError.Io("Unable to create SAF directory")
        return StorageReference.Saf(created)
    }

    override fun createFile(parent: StorageReference, name: String, mimeType: String): StorageReference {
        validateChildName(name)
        val created = documentDirectory(uri(parent)).createFile(mimeType, name)?.uri
            ?: throw StorageError.Io("Unable to create SAF file")
        return StorageReference.Saf(created)
    }

    override fun delete(reference: StorageReference): Boolean = SafFileProvider.delete(context, uri(reference))

    override fun rename(reference: StorageReference, newName: String): StorageReference {
        validateChildName(newName)
        val old = uri(reference)
        if (!SafFileProvider.rename(context, old, newName)) throw StorageError.Io("Unable to rename SAF document")
        val renamed = SafFileProvider.getMetadata(context, old)?.uri ?: old
        return StorageReference.Saf(renamed)
    }

    override fun openInput(reference: StorageReference): InputStream =
        context.contentResolver.openInputStream(uri(reference)) ?: throw StorageError.AccessDenied(uri(reference).toString())

    override fun openOutput(reference: StorageReference): OutputStream =
        context.contentResolver.openOutputStream(uri(reference)) ?: throw StorageError.AccessDenied(uri(reference).toString())

    override fun readText(reference: StorageReference, charset: Charset, maxBytes: Long): String {
        require(maxBytes > 0L) { "maxBytes must be positive" }
        openInput(reference).buffered(64 * 1024).use { input ->
            val out = java.io.ByteArrayOutputStream(minOf(maxBytes, 1024L * 1024L).toInt())
            val buffer = ByteArray(64 * 1024)
            var total = 0L
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                total += n
                if (total > maxBytes) throw StorageError.InvalidOperation("File exceeds text read limit")
                out.write(buffer, 0, n)
            }
            return out.toByteArray().toString(charset)
        }
    }

    override fun writeText(reference: StorageReference, text: String, charset: Charset) {
        openOutput(reference).buffered(64 * 1024).use { it.write(text.toByteArray(charset)) }
    }

    override fun readChunk(reference: StorageReference, offset: Long, length: Int): ByteArray {
        require(offset >= 0L && length in 1..1024 * 1024) { "Invalid chunk range" }
        val ref = uri(reference)
        try {
            context.contentResolver.openFileDescriptor(ref, "r")?.use { pfd ->
                java.io.FileInputStream(pfd.fileDescriptor).use { input ->
                    input.channel.position(offset)
                    return readAtMost(input, length)
                }
            }
        } catch (_: Exception) {
            // Some third-party SAF providers expose a non-seekable descriptor.
        }
        openInput(reference).buffered(64 * 1024).use { input ->
            var remaining = offset
            while (remaining > 0L) {
                val skipped = input.skip(remaining)
                if (skipped <= 0L) {
                    if (input.read() < 0) return ByteArray(0)
                    remaining--
                } else remaining -= skipped
            }
            return readAtMost(input, length)
        }
    }

    override fun writeChunk(reference: StorageReference, offset: Long, bytes: ByteArray, truncate: Boolean) {
        require(offset >= 0L) { "Invalid write offset" }
        val mode = if (truncate || offset == 0L) "wt" else "wa"
        context.contentResolver.openOutputStream(uri(reference), mode).use { out ->
            requireNotNull(out) { "Unable to open SAF output" }
            out.write(bytes)
        }
    }

    private fun readAtMost(input: InputStream, length: Int): ByteArray {
        val buffer = ByteArray(length)
        var total = 0
        while (total < length) {
            val n = input.read(buffer, total, length - total)
            if (n < 0) break
            total += n
        }
        return if (total == length) buffer else buffer.copyOf(total)
    }


    private fun documentDirectory(uri: Uri): DocumentFile {
        val tree = DocumentFile.fromTreeUri(context, uri)
        if (tree != null && tree.exists() && tree.isDirectory) return tree

        val single = DocumentFile.fromSingleUri(context, uri)
        if (single != null && single.exists() && single.isDirectory) return single

        throw StorageError.NotFound(uri.toString())
    }

    private fun validateChildName(name: String) {
        require(name.isNotBlank() && name != "." && name != "..") { "Invalid name" }
        require(!name.contains('/') && !name.contains('\\') && name.indexOf('\u0000') < 0) { "Invalid name" }
    }
}
