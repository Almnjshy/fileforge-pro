package pro.fileforge.app.core.storage

import android.net.Uri
import java.io.File

/**
 * Canonical native reference to a storage object.
 *
 * The core never treats a SAF URI as a filesystem path. Parsing is performed
 * once at the native boundary and the resulting type determines which
 * provider is allowed to handle the reference.
 */
sealed interface StorageReference {
    val value: String

    data class Local(val file: File) : StorageReference {
        override val value: String get() = file.absolutePath
    }

    data class Saf(val uri: Uri) : StorageReference {
        override val value: String get() = uri.toString()
    }

    companion object {
        fun parse(raw: String): StorageReference {
            require(raw.isNotBlank()) { "Storage reference is required" }
            return if (raw.startsWith("content://", ignoreCase = true)) {
                val uri = Uri.parse(raw)
                require(uri.scheme.equals("content", ignoreCase = true)) { "Unsupported content URI" }
                require(!uri.authority.isNullOrBlank()) { "Invalid content URI" }
                Saf(uri)
            } else {
                val file = File(raw)
                require(file.isAbsolute) { "Local storage reference must be an absolute path" }
                Local(file)
            }
        }
    }
}
