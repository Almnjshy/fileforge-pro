package pro.fileforge.app.core.model

/**
 * Platform-neutral metadata returned by the Android storage layer.
 * The UI/Capacitor bridge should not depend on java.io.File directly.
 */
data class NativeFileMetadata(
    val name: String,
    val path: String,
    val size: Long,
    val lastModified: Long,
    val mimeType: String,
    val isDirectory: Boolean,
)
