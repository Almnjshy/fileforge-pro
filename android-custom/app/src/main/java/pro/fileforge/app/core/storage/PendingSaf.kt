package pro.fileforge.app.core.storage

/**
 * Internal operation target representing a SAF child that does not exist yet.
 * It remains a StorageReference so the sealed storage-reference model stays
 * type-safe while its synthetic value can never be parsed as a real URI.
 */
internal data class PendingSaf(
    val parent: StorageReference.Saf,
    val name: String,
) : StorageReference by parent {
    override val value: String get() = "fileforge-pending:${parent.value}|$name"
}
