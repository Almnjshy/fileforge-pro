package pro.fileforge.app.core.storage

import pro.fileforge.app.core.model.NativeFileMetadata
import java.io.InputStream
import java.io.OutputStream
import java.nio.charset.Charset

/**
 * Provider contract for the native storage core.
 *
 * Implementations own platform-specific mechanics. The application core only
 * deals in StorageReference values and never reaches into java.io.File or
 * DocumentFile directly.
 */
interface StorageProvider {
    fun supports(reference: StorageReference): Boolean
    fun metadata(reference: StorageReference): NativeFileMetadata
    fun list(reference: StorageReference, showHidden: Boolean = false): List<NativeFileMetadata>
    fun createDirectory(parent: StorageReference, name: String): StorageReference
    fun createFile(parent: StorageReference, name: String, mimeType: String): StorageReference
    fun delete(reference: StorageReference): Boolean
    fun rename(reference: StorageReference, newName: String): StorageReference
    fun openInput(reference: StorageReference): InputStream
    fun openOutput(reference: StorageReference): OutputStream
    fun readText(reference: StorageReference, charset: Charset, maxBytes: Long): String
    fun writeText(reference: StorageReference, text: String, charset: Charset)
    fun readChunk(reference: StorageReference, offset: Long, length: Int): ByteArray
    fun writeChunk(reference: StorageReference, offset: Long, bytes: ByteArray, truncate: Boolean)
}
