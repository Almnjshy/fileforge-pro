package pro.fileforge.app.core.recovery

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Deterministic crash-recovery decision engine. It never resumes a job blindly:
 * source identity and destination bounds are checked before a recommendation is made.
 */
class RecoveryDecisionEngine(private val context: Context) {
    enum class Decision { RESUME, RECOVER, RESTART, ROLLBACK, DISCARD, MANUAL }

    fun evaluate(record: JSONObject): JSONObject {
        val id = record.optString("id")
        val type = record.optString("type")
        val resumable = record.optBoolean("resumable", false)
        val sourcePath = record.optString("source").takeIf { it.isNotBlank() }
        val targetPath = record.optString("target").takeIf { it.isNotBlank() }
        val expectedSize = record.optLong("sourceSize", -1L)
        val expectedModified = record.optLong("sourceModifiedAt", -1L)
        val processed = record.optLong("bytesProcessed", 0L)

        val result = JSONObject().apply {
            put("operationId", id)
            put("type", type)
            put("decision", Decision.MANUAL.name.lowercase())
            put("reason", "Insufficient information for automatic recovery")
            put("safe", false)
        }

        val txState = record.optString("transactionState")
        if (txState.isNotBlank()) {
            return when (txState) {
                "COMMITTED", "SOURCE_CLEANUP", "COMMITTED_PENDING_CLEANUP" -> result
                    .put("decision", if (type == "move") Decision.RECOVER.name.lowercase() else Decision.DISCARD.name.lowercase())
                    .put("reason", "Transaction committed; only verified cleanup remains")
                    .put("safe", type != "move" || record.optString("sourceFingerprint").isNotBlank())
                "STAGING", "STAGED", "BACKING_UP", "BACKED_UP", "COMMITTING", "ROLLED_BACK" -> result
                    .put("decision", Decision.ROLLBACK.name.lowercase())
                    .put("reason", "Transaction did not reach a durable commit")
                    .put("safe", true)
                "COMPLETED" -> result
                    .put("decision", Decision.DISCARD.name.lowercase())
                    .put("reason", "Transaction already completed")
                    .put("safe", true)
                else -> result
            }
        }

        if (sourcePath == null || targetPath == null || sourcePath.startsWith("content://") || targetPath.startsWith("content://")) {
            return result.put("reason", "SAF or missing paths require provider-specific recovery")
        }

        val source = File(sourcePath)
        val target = File(targetPath)
        if (!source.isFile) {
            return result.put("decision", Decision.DISCARD.name.lowercase())
                .put("reason", "Source no longer exists").put("safe", true)
        }

        val sourceSize = source.length()
        val sourceModified = source.lastModified()
        val identityMatches = (expectedSize < 0L || expectedSize == sourceSize) &&
            (expectedModified < 0L || expectedModified == sourceModified)
        if (!identityMatches) {
            return result.put("decision", Decision.RESTART.name.lowercase())
                .put("reason", "Source changed since checkpoint; resume is unsafe")
                .put("safe", true).put("sourceSize", sourceSize).put("sourceModifiedAt", sourceModified)
        }

        val targetSize = if (target.isFile) target.length() else 0L
        result.put("sourceSize", sourceSize).put("sourceModifiedAt", sourceModified).put("targetSize", targetSize)

        if (!resumable || type != "copy" && type != "move") {
            return result.put("decision", Decision.RESTART.name.lowercase())
                .put("reason", "Operation type does not support automatic true resume")
                .put("safe", true)
        }

        if (targetSize > sourceSize) {
            return result.put("decision", Decision.ROLLBACK.name.lowercase())
                .put("reason", "Destination is larger than source; discard partial destination before restart")
                .put("safe", true)
        }

        if (targetSize == sourceSize && sourceSize >= 0L) {
            return result.put("decision", Decision.RECOVER.name.lowercase())
                .put("reason", "Destination length matches verified source; finalize the interrupted job")
                .put("safe", true)
        }

        if (targetSize > 0L && targetSize == processed.coerceAtMost(sourceSize)) {
            return result.put("decision", Decision.RESUME.name.lowercase())
                .put("reason", "Destination matches the durable checkpoint")
                .put("safe", true)
        }

        if (!target.exists() || targetSize == 0L) {
            return result.put("decision", Decision.RESTART.name.lowercase())
                .put("reason", "No usable destination checkpoint exists")
                .put("safe", true)
        }

        return result.put("decision", Decision.MANUAL.name.lowercase())
            .put("reason", "Destination does not match the durable checkpoint")
    }
}
