package pro.fileforge.app.core.storage

import android.content.Context
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import pro.fileforge.app.core.model.NativeFileMetadata
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset

/**
 * Application-facing storage facade.
 *
 * A raw string is parsed exactly once into StorageReference and then routed to
 * the provider that owns that reference type. No SAF URI is ever converted to
 * java.io.File and provider-specific mechanics do not leak into callers.
 */
class UnifiedStorageService(
    private val context: Context,
    private val directStorage: NativeStorageService = NativeStorageService(),
) {
    private val directProvider = DirectStorageProvider(directStorage)
    private val safProvider = SafStorageProvider(context)
    private val providers: List<StorageProvider> = listOf(directProvider, safProvider)

    fun parse(ref: String): StorageReference = try {
        StorageReference.parse(ref)
    } catch (e: IllegalArgumentException) {
        throw StorageError.InvalidReference(e.message ?: "Invalid storage reference")
    }

    fun isSaf(ref: String): Boolean = parse(ref) is StorageReference.Saf

    private fun provider(reference: StorageReference): StorageProvider =
        providers.firstOrNull { it.supports(reference) }
            ?: throw StorageError.UnsupportedOperation("No storage provider supports ${reference.value}")

    fun list(ref: String, showHidden: Boolean = false): List<NativeFileMetadata> {
        val reference = parse(ref)
        return provider(reference).list(reference, showHidden)
    }

    fun metadata(ref: String): NativeFileMetadata {
        val reference = parse(ref)
        return provider(reference).metadata(reference)
    }

    fun createDirectory(parent: String, name: String): String {
        val reference = parse(parent)
        return provider(reference).createDirectory(reference, name).value
    }

    fun createFile(parent: String, name: String, mimeType: String = "application/octet-stream"): String {
        val reference = parse(parent)
        return provider(reference).createFile(reference, name, mimeType).value
    }

    fun delete(ref: String): Boolean {
        val reference = parse(ref)
        return provider(reference).delete(reference)
    }

    fun rename(ref: String, newName: String): String {
        val reference = parse(ref)
        return provider(reference).rename(reference, newName).value
    }

    fun openInput(ref: String): InputStream {
        val reference = parse(ref)
        return provider(reference).openInput(reference)
    }

    fun openOutput(ref: String): OutputStream {
        val reference = parse(ref)
        return provider(reference).openOutput(reference)
    }

    fun readText(ref: String, charset: Charset = Charsets.UTF_8, maxBytes: Long = 10_000_000L): String {
        val reference = parse(ref)
        return provider(reference).readText(reference, charset, maxBytes)
    }

    fun writeText(ref: String, text: String, charset: Charset = Charsets.UTF_8) {
        val reference = parse(ref)
        provider(reference).writeText(reference, text, charset)
    }

    fun readChunk(ref: String, offset: Long, length: Int): ByteArray {
        val reference = parse(ref)
        return provider(reference).readChunk(reference, offset, length)
    }

    fun writeChunk(ref: String, offset: Long, bytes: ByteArray, truncate: Boolean = false) {
        val reference = parse(ref)
        provider(reference).writeChunk(reference, offset, bytes, truncate)
    }

    /**
     * Starts an atomic local/SAF text or binary write. The returned reference
     * is an internal staging object and must only be passed to the matching
     * commit/abort operation.
     */
    fun beginChunkedWrite(ref: String): String {
        val reference = parse(ref)
        return when (reference) {
            is StorageReference.Local -> {
                val target = reference.file
                val parent = target.parentFile ?: throw StorageError.InvalidOperation("Target has no parent")
                val tmp = File(parent, ".${target.name}.fileforge-${System.nanoTime()}.tmp")
                if (tmp.exists() && !tmp.delete()) throw StorageError.Io("Unable to clear staging file")
                tmp.absolutePath
            }
            is StorageReference.Saf -> {
                val source = DocumentFile.fromSingleUri(context, reference.uri)
                    ?: throw StorageError.NotFound(reference.value)
                val parentUri = source.parentFile?.uri
                    ?: throw StorageError.UnsupportedOperation("SAF provider does not expose a parent")
                val parent = DocumentFile.fromTreeUri(context, parentUri)
                    ?: throw StorageError.AccessDenied(parentUri.toString())
                val tmp = parent.createFile(
                    "application/octet-stream",
                    ".${source.name ?: "document"}.fileforge-${System.nanoTime()}.tmp",
                ) ?: throw StorageError.Io("Unable to create SAF staging file")
                tmp.uri.toString()
            }
            is PendingSaf -> throw StorageError.InvalidOperation("Cannot begin a chunked write on a pending SAF destination")
        }
    }

    fun commitChunkedWrite(ref: String, tempRef: String) {
        val target = parse(ref)
        val temp = parse(tempRef)
        when {
            target is StorageReference.Local && temp is StorageReference.Local -> commitLocal(target.file, temp.file)
            target is StorageReference.Saf && temp is StorageReference.Saf -> commitSaf(target.uri, temp.uri)
            else -> throw StorageError.InvalidOperation("Target and staging references must use the same provider")
        }
    }

    fun abortChunkedWrite(tempRef: String) {
        val temp = parse(tempRef)
        when (temp) {
            is StorageReference.Local -> if (temp.file.exists() && !temp.file.delete()) {
                throw StorageError.Io("Unable to remove staging file")
            }
            is StorageReference.Saf -> {
                val doc = DocumentFile.fromSingleUri(context, temp.uri)
                    ?: return
                if (doc.exists() && !doc.delete()) throw StorageError.Io("Unable to remove SAF staging file")
            }
            is PendingSaf -> throw StorageError.InvalidOperation("Cannot abort a chunked write on a pending SAF destination")
        }
    }

    private fun commitLocal(target: File, temp: File) {
        require(temp.isFile) { "Temporary file missing" }
        try {
            java.nio.file.Files.move(
                temp.toPath(), target.toPath(),
                java.nio.file.StandardCopyOption.REPLACE_EXISTING,
            )
        } catch (e: Exception) {
            throw StorageError.Io("Unable to commit local write", e)
        }
    }

    private fun commitSaf(target: Uri, temp: Uri) {
        try {
            context.contentResolver.openInputStream(temp).use { input ->
                requireNotNull(input) { "Unable to open SAF staging file" }
                context.contentResolver.openOutputStream(target, "wt").use { output ->
                    requireNotNull(output) { "Unable to open SAF target" }
                    input.copyTo(output, 64 * 1024)
                }
            }
            val tempDoc = DocumentFile.fromSingleUri(context, temp)
            if (tempDoc != null && tempDoc.exists() && !tempDoc.delete()) {
                throw StorageError.Io("Unable to remove SAF staging file")
            }
        } catch (e: StorageError) {
            throw e
        } catch (e: Exception) {
            throw StorageError.Io("Unable to commit SAF write", e)
        }
    }

    /** Explicit SAF-to-SAF copy primitive; it never materializes the source in JS memory. */
    fun copySafFile(source: String, targetParent: String, targetName: String): String {
        val sourceRef = parse(source)
        val parentRef = parse(targetParent)
        require(sourceRef is StorageReference.Saf && parentRef is StorageReference.Saf) {
            "copySafFile requires SAF references"
        }
        val sourceDoc = DocumentFile.fromSingleUri(context, sourceRef.uri)
            ?: throw StorageError.NotFound(sourceRef.value)
        val targetParentDoc = DocumentFile.fromTreeUri(context, parentRef.uri)
            ?: throw StorageError.AccessDenied(parentRef.value)
        val target = targetParentDoc.createFile(sourceDoc.type ?: "application/octet-stream", targetName)
            ?: throw StorageError.Io("Unable to create SAF target")
        try {
            openInput(source).use { input ->
                context.contentResolver.openOutputStream(target.uri).use { output ->
                    requireNotNull(output) { "Unable to open SAF target" }
                    input.copyTo(output, 64 * 1024)
                }
            }
            return target.uri.toString()
        } catch (e: Exception) {
            target.delete()
            if (e is StorageError) throw e
            throw StorageError.Io("Unable to copy SAF file", e)
        }
    }
}
