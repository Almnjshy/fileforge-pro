package pro.fileforge.app.saf

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream

/**
 * Storage Access Framework provider — handles files/directories accessed via
 * content:// URIs (tree URIs granted by the user through ACTION_OPEN_DOCUMENT_TREE).
 *
 * This is the fallback for files that can't be accessed via direct File API
 * (e.g. external SD card on Android 11+ without MANAGE_EXTERNAL_STORAGE).
 *
 * All operations run on the calling thread (must be background).
 */
object SafFileProvider {
    private const val TAG = "SafFileProvider"

    private const val PREFS_NAME = "fileforge_saf_prefs"
    private const val KEY_TREE_URIS = "tree_uris"

    data class SafEntry(
        val uri: Uri,
        val name: String,
        val isDirectory: Boolean,
        val size: Long,
        val lastModified: Long,
        val mimeType: String,
    )

    fun hasPersistedPermission(context: Context, uri: Uri): Boolean {
        return context.contentResolver.persistedUriPermissions.any {
            it.uri == uri && it.isReadPermission && it.isWritePermission
        }
    }

    fun releaseTreeUri(context: Context, uri: Uri) {
        try {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.releasePersistableUriPermission(uri, flags)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to release URI permission: ${e.message}")
        }
    }

    // ============ Tree URI persistence ============

    fun saveTreeUri(context: Context, treeUri: Uri, pathPrefix: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val existing = getTreeUris(context).toMutableMap()
        existing[pathPrefix] = treeUri.toString()
        prefs.edit().putString(KEY_TREE_URIS, serializeMap(existing)).apply()

        try {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.takePersistableUriPermission(treeUri, flags)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to persist URI permission: ${e.message}")
        }
    }

    fun getTreeUris(context: Context): Map<String, String> {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_TREE_URIS, null) ?: return emptyMap()
        return deserializeMap(raw)
    }

    fun removeTreeUri(context: Context, pathPrefix: String) {
        val existing = getTreeUris(context).toMutableMap()
        existing.remove(pathPrefix)
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(KEY_TREE_URIS, serializeMap(existing)).apply()
    }

    private fun serializeMap(map: Map<String, String>): String {
        return map.entries.joinToString(";") { "${it.key}=${it.value}" }
    }

    private fun deserializeMap(raw: String): Map<String, String> {
        return raw.split(";").filter { it.contains("=") }.associate {
            val (k, v) = it.split("=", limit = 2)
            k to v
        }
    }

    // ============ Directory listing ============

    fun listDirectory(context: Context, treeUri: Uri): List<SafEntry> {
        val docFile = DocumentFile.fromTreeUri(context, treeUri) ?: return emptyList()
        if (!docFile.isDirectory) return emptyList()
        return docFile.listFiles().map { child ->
            SafEntry(
                uri = child.uri,
                name = child.name ?: "unknown",
                isDirectory = child.isDirectory,
                size = if (child.isFile) child.length() else 0L,
                lastModified = child.lastModified(),
                mimeType = child.type ?: "application/octet-stream",
            )
        }
    }

    // ============ File reading ============

    fun readText(context: Context, uri: Uri, maxBytes: Long = 10_000_000): String? {
        return try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                val bytes = input.readBytes()
                if (bytes.size > maxBytes) return null
                String(bytes, Charsets.UTF_8)
            }
        } catch (e: Exception) {
            Log.e(TAG, "readText failed: ${e.message}")
            null
        }
    }

    fun readBytes(context: Context, uri: Uri, offset: Long, length: Int): ByteArray? {
        return try {
            context.contentResolver.openInputStream(uri)?.use { input ->
                if (offset > 0) input.skip(offset)
                val buffer = ByteArray(length)
                var totalRead = 0
                while (totalRead < length) {
                    val read = input.read(buffer, totalRead, length - totalRead)
                    if (read == -1) break
                    totalRead += read
                }
                if (totalRead == 0) null
                else if (totalRead < length) buffer.copyOf(totalRead)
                else buffer
            }
        } catch (e: Exception) {
            Log.e(TAG, "readBytes failed: ${e.message}")
            null
        }
    }

    // ============ File writing ============

    fun writeText(context: Context, uri: Uri, content: String): Boolean {
        return try {
            context.contentResolver.openOutputStream(uri)?.use { output ->
                output.write(content.toByteArray(Charsets.UTF_8))
                true
            } ?: false
        } catch (e: Exception) {
            Log.e(TAG, "writeText failed: ${e.message}")
            false
        }
    }

    // ============ File operations ============

    fun createDirectory(context: Context, parentUri: Uri, name: String): Uri? {
        val parent = DocumentFile.fromTreeUri(context, parentUri) ?: return null
        return parent.createDirectory(name)?.uri
    }

    fun createFile(context: Context, parentUri: Uri, name: String, mimeType: String): Uri? {
        val parent = DocumentFile.fromTreeUri(context, parentUri) ?: return null
        return parent.createFile(mimeType, name)?.uri
    }

    fun delete(context: Context, uri: Uri): Boolean {
        val doc = DocumentFile.fromSingleUri(context, uri) ?: return false
        return doc.delete()
    }

    fun rename(context: Context, uri: Uri, newName: String): Boolean {
        val doc = DocumentFile.fromSingleUri(context, uri) ?: return false
        return doc.renameTo(newName)
    }

    fun exists(context: Context, uri: Uri): Boolean {
        val doc = DocumentFile.fromSingleUri(context, uri) ?: return false
        return doc.exists()
    }

    fun getMetadata(context: Context, uri: Uri): SafEntry? {
        val doc = DocumentFile.fromSingleUri(context, uri) ?: return null
        if (!doc.exists()) return null
        return SafEntry(
            uri = doc.uri,
            name = doc.name ?: "unknown",
            isDirectory = doc.isDirectory,
            size = if (doc.isFile) doc.length() else 0L,
            lastModified = doc.lastModified(),
            mimeType = doc.type ?: "application/octet-stream",
        )
    }
}
