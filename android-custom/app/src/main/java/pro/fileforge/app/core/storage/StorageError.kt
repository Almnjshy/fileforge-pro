package pro.fileforge.app.core.storage

/** Stable error taxonomy for the native storage boundary. */
sealed class StorageError(message: String, cause: Throwable? = null) : RuntimeException(message, cause) {
    class InvalidReference(message: String) : StorageError(message)
    class NotFound(ref: String) : StorageError("Storage object does not exist: $ref")
    class AccessDenied(ref: String, cause: Throwable? = null) : StorageError("Access denied: $ref", cause)
    class InvalidOperation(message: String) : StorageError(message)
    class UnsupportedOperation(message: String) : StorageError(message)
    class Io(message: String, cause: Throwable? = null) : StorageError(message, cause)
}
