package pro.fileforge.app.core.recovery

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import pro.fileforge.app.core.operations.OperationWorkspace

/**
 * Durable operation journal.
 *
 * The journal is metadata-only: file contents never enter the database.  Each
 * operation has a durable lifecycle and periodic checkpoints so process death
 * can be detected without relying on an in-memory map or SharedPreferences.
 */
class NativeOperationJournal(context: Context) {
    private val db = JournalDb(context.applicationContext)
    private val records = ConcurrentHashMap<String, JSONObject>()
    private val lock = Any()

    init { loadFromDb() }

    private fun loadFromDb() {
        synchronized(lock) {
            records.clear()
            db.readAll().forEach { records[it.optString("id")] = it }
        }
    }

    fun begin(
        id: String,
        type: String,
        description: String? = null,
        source: String? = null,
        target: String? = null,
        resumable: Boolean = false,
        sourceSize: Long = 0L,
        sourceModifiedAt: Long = 0L,
    ) {
        require(id.isNotBlank()) { "Operation id is required" }
        val now = System.currentTimeMillis()
        val obj = JSONObject().apply {
            put("id", id)
            put("type", type)
            put("status", "running")
            put("startedAt", now)
            put("createdAt", now)
            put("updatedAt", now)
            put("resumable", resumable)
            put("bytesProcessed", 0L)
            put("totalBytes", 0L)
            put("sourceSize", sourceSize)
            put("sourceModifiedAt", sourceModifiedAt)
            if (description != null) put("description", description)
            if (source != null) put("source", source)
            if (target != null) put("target", target)
        }
        synchronized(lock) {
            records[id] = obj
            db.upsert(obj)
        }
    }

    fun update(
        id: String,
        status: String,
        bytesProcessed: Long = 0L,
        totalBytes: Long = 0L,
        currentPath: String? = null,
        error: String? = null,
    ) {
        synchronized(lock) {
            val obj = records[id] ?: return
            val now = System.currentTimeMillis()
            obj.put("status", status)
                .put("bytesProcessed", bytesProcessed.coerceAtLeast(0L))
                .put("totalBytes", totalBytes.coerceAtLeast(0L))
                .put("updatedAt", now)
            if (currentPath != null) obj.put("currentPath", currentPath)
            if (error != null) obj.put("error", error)
            else if (status != "failed") obj.remove("error")

            // Terminal states are always durable immediately. For hot progress
            // updates SQLite writes are coalesced to avoid turning a 128 KiB copy
            // loop into thousands of database transactions.
            val terminal = status in TERMINAL
            val lastPersisted = obj.optLong("lastPersistedAt", 0L)
            val bytesSince = bytesProcessed - obj.optLong("lastPersistedBytes", 0L)
            if (terminal || now - lastPersisted >= CHECKPOINT_INTERVAL_MS || bytesSince >= CHECKPOINT_BYTES) {
                obj.put("lastPersistedAt", now).put("lastPersistedBytes", bytesProcessed)
                db.upsert(obj)
            }
        }
    }

    fun setTransaction(
        id: String,
        state: String,
        stagingPath: String?,
        backupPath: String?,
        sourceFingerprint: String?,
        targetPath: String?,
        sourceSize: Long,
        sourceModifiedAt: Long,
        resumable: Boolean,
    ) {
        synchronized(lock) {
            val obj = records[id] ?: error("Operation not found: $id")
            obj.put("transactionState", state)
                .put("resumable", resumable)
                .put("sourceSize", sourceSize)
                .put("sourceModifiedAt", sourceModifiedAt)
                .put("transactionUpdatedAt", System.currentTimeMillis())
            if (stagingPath != null) obj.put("stagingPath", stagingPath)
            if (backupPath != null) obj.put("backupPath", backupPath)
            if (sourceFingerprint != null) obj.put("sourceFingerprint", sourceFingerprint)
            if (targetPath != null) obj.put("transactionTargetPath", targetPath)
            db.upsert(obj)
        }
    }

    fun updateTransaction(id: String, state: String, error: String? = null) {
        synchronized(lock) {
            val obj = records[id] ?: return
            obj.put("transactionState", state).put("transactionUpdatedAt", System.currentTimeMillis())
            if (error != null) obj.put("error", error)
            db.upsert(obj)
        }
    }

    fun get(id: String): JSONObject? = synchronized(lock) { records[id]?.let { JSONObject(it.toString()) } }

    /** Keep terminal history for diagnostics/recovery auditing instead of deleting it. */
    fun complete(id: String) = updateTerminal(id, "completed")

    fun remove(id: String) {
        synchronized(lock) {
            records.remove(id)
            db.delete(id)
        }
    }

    fun cleanupOrphanWorkspaces(parentDirectories: Collection<File>): Int {
        val liveTargets = synchronized(lock) {
            records.values
                .filter { it.optString("status") in ACTIVE }
                .mapNotNull { it.optString("target").takeIf(String::isNotBlank) }
                .toSet()
        }
        var removed = 0
        parentDirectories.forEach { parent ->
            if (parent.absolutePath !in liveTargets) removed += OperationWorkspace.cleanupOrphans(parent)
        }
        return removed
    }

    /**
     * Marks only genuinely active operations as interrupted. Terminal records
     * remain untouched, which makes recovery deterministic after a cold start.
     */
    @Synchronized fun recoverInterrupted(): JSONArray {
        synchronized(lock) {
            val now = System.currentTimeMillis()
            records.values.forEach { obj ->
                if (obj.optString("status") in ACTIVE) {
                    obj.put("status", "interrupted")
                        .put("updatedAt", now)
                        .put("error", "Application stopped before this operation completed.")
                    db.upsert(obj)
                }
            }
            val result = JSONArray()
            records.values
                .filter { it.optString("status") == "interrupted" }
                .sortedByDescending { it.optLong("updatedAt") }
                .forEach { result.put(JSONObject(it.toString())) }
            return result
        }
    }

    fun listHistory(limit: Int = 100): JSONArray {
        synchronized(lock) {
            val result = JSONArray()
            records.values.sortedByDescending { it.optLong("updatedAt") }.take(limit.coerceIn(1, 500))
                .forEach { result.put(JSONObject(it.toString())) }
            return result
        }
    }

    private fun updateTerminal(id: String, status: String) {
        synchronized(lock) {
            val obj = records[id] ?: return
            val now = System.currentTimeMillis()
            obj.put("status", status).put("updatedAt", now)
            db.upsert(obj)
        }
    }

    private class JournalDb(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL("""
                CREATE TABLE operations (
                    id TEXT PRIMARY KEY NOT NULL,
                    type TEXT NOT NULL,
                    status TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                )
            """.trimIndent())
            db.execSQL("CREATE INDEX idx_operations_status_updated ON operations(status, updated_at)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            if (oldVersion < 2) {
                db.execSQL("CREATE INDEX IF NOT EXISTS idx_operations_status_updated ON operations(status, updated_at)")
            }
        }

        fun upsert(obj: JSONObject) {
            val values = android.content.ContentValues().apply {
                put("id", obj.optString("id"))
                put("type", obj.optString("type"))
                put("status", obj.optString("status"))
                put("payload", obj.toString())
                put("updated_at", obj.optLong("updatedAt"))
            }
            writableDatabase.insertWithOnConflict("operations", null, values, SQLiteDatabase.CONFLICT_REPLACE)
        }

        fun delete(id: String) { writableDatabase.delete("operations", "id = ?", arrayOf(id)) }

        fun readAll(): List<JSONObject> {
            val result = ArrayList<JSONObject>()
            readableDatabase.query("operations", arrayOf("payload"), null, null, null, null, "updated_at ASC").use { c ->
                while (c.moveToNext()) {
                    runCatching { JSONObject(c.getString(0)) }.getOrNull()?.let(result::add)
                }
            }
            return result
        }

        companion object {
            private const val DB_NAME = "fileforge_operations.db"
            private const val DB_VERSION = 2
        }
    }

    companion object {
        private const val CHECKPOINT_INTERVAL_MS = 750L
        private const val CHECKPOINT_BYTES = 1L * 1024L * 1024L
        private val ACTIVE = setOf("pending", "running", "paused", "cancelling")
        private val TERMINAL = setOf("completed", "failed", "cancelled", "skipped", "discarded", "rolled_back", "interrupted")
    }
}
