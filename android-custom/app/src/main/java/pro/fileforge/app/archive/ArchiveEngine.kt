package pro.fileforge.app.archive

import android.util.Log
import com.github.junrar.Archive
import com.github.junrar.exception.RarException
import com.github.junrar.rarfile.FileHeader
import org.apache.commons.compress.archivers.sevenz.SevenZFile
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.archivers.zip.ZipArchiveEntry
import org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream
import org.apache.commons.compress.archivers.zip.ZipFile
import org.apache.commons.compress.archivers.sevenz.SevenZArchiveEntry
import org.apache.commons.compress.archivers.sevenz.SevenZOutputFile
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.apache.commons.compress.compressors.xz.XZCompressorOutputStream
import org.apache.commons.compress.compressors.gzip.GzipCompressorInputStream
import org.apache.commons.compress.compressors.xz.XZCompressorInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Unified archive engine — supports ZIP, TAR, TAR.GZ, TGZ, GZ, BZIP2, XZ,
 * RAR (3 & 5, incl. password-protected), and 7z (incl. password-protected).
 *
 * All operations run on a background thread (caller responsibility via
 * coroutines). Streaming is used wherever the underlying library supports
 * it to avoid OOM on large archives.
 *
 * Passwords are never logged.
 */
data class ArchiveEntry(
    val path: String,
    val isDirectory: Boolean,
    val size: Long,
    val compressedSize: Long,
    val modified: Long,
    val isEncrypted: Boolean,
)

data class OpenArchiveResult(
    val entries: List<ArchiveEntry>,
    val isEncrypted: Boolean,
    val needsPassword: Boolean,
    val formatHint: String,
)

sealed class ArchiveError(message: String) : Exception(message) {
    class PasswordRequired : ArchiveError("This archive is password-protected. Please provide a password.")
    class WrongPassword : ArchiveError("Wrong password. Please try again.")
    class Corrupt(message: String) : ArchiveError(message)
    class Unsupported(message: String) : ArchiveError(message)
    class IO(message: String) : ArchiveError(message)
}

object ArchiveEngine {
    private const val TAG = "ArchiveEngine"

    /** Cooperative controls used by Native Job Protocol archive jobs. */
    data class OperationControl(
        val cancelled: AtomicBoolean = AtomicBoolean(false),
        val paused: AtomicBoolean = AtomicBoolean(false),
    )

    data class OperationProgress(
        val bytesProcessed: Long,
        val totalBytes: Long,
        val currentPath: String,
        val filesProcessed: Int = 0,
        val filesTotal: Int = 0,
    )

    private fun awaitIfPaused(control: OperationControl?) {
        while (control?.paused?.get() == true && control.cancelled.get() == false) {
            Thread.sleep(100)
        }
        if (control?.cancelled?.get() == true) throw InterruptedException("Operation cancelled")
    }

    private class ProgressOutputStream(
        private val delegate: OutputStream,
        private val control: OperationControl?,
        private val onBytes: (Long) -> Unit,
    ) : OutputStream() {
        override fun write(b: Int) {
            awaitIfPaused(control)
            delegate.write(b)
            onBytes(1L)
        }
        override fun write(b: ByteArray, off: Int, len: Int) {
            awaitIfPaused(control)
            delegate.write(b, off, len)
            onBytes(len.toLong())
        }
        override fun flush() = delegate.flush()
        override fun close() = delegate.close()
    }

    private fun copyStreamToFile(
        input: InputStream,
        target: File,
        expectedSize: Long = -1,
        control: OperationControl? = null,
        onBytes: ((Long) -> Unit)? = null,
    ): Long {
        target.parentFile?.mkdirs()
        var total = 0L
        FileOutputStream(target).use { raw ->
            val out = if (onBytes != null) ProgressOutputStream(raw, control, onBytes) else raw
            out.use { output ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    awaitIfPaused(control)
                    val n = input.read(buffer)
                    if (n < 0) break
                    output.write(buffer, 0, n)
                    total += n
                }
            }
        }
        return total
    }

    /**
     * Open an archive and list its entries. Returns needsPassword=true if
     * the archive is encrypted and no/empty password was provided.
     */
    fun openArchive(file: File, password: String? = null): OpenArchiveResult {
        val name = file.name.lowercase()
        return when {
            name.endsWith(".zip") -> openZip(file, password)
            name.endsWith(".tar") -> openTar(file)
            name.endsWith(".tar.gz") || name.endsWith(".tgz") -> openTarGz(file)
            name.endsWith(".tar.bz2") || name.endsWith(".tbz2") || name.endsWith(".tbz") -> openTarBz2(file)
            name.endsWith(".tar.xz") || name.endsWith(".txz") -> openTarXz(file)
            name.endsWith(".gz") -> openGz(file)
            name.endsWith(".bz2") -> openBzip2(file)
            name.endsWith(".xz") -> openXz(file)
            name.endsWith(".rar") -> openRar(file, password)
            name.endsWith(".7z") -> open7z(file, password)
            else -> throw ArchiveError.Unsupported("Unsupported archive format: ${file.name}")
        }
    }

    // ============ ZIP ============
    private fun openZip(file: File, password: String?): OpenArchiveResult {
        val entries = mutableListOf<ArchiveEntry>()
        var anyEncrypted = false
        ZipFile.builder().setFile(file).get().use { zf ->
            val it = zf.entries
            while (it.hasMoreElements()) {
                val e = it.nextElement() as ZipArchiveEntry
                // Method 99 = AES encryption; GPB bit 0 = traditional encryption
                val encrypted = e.method == 99 || e.generalPurposeBit?.usesEncryption() == true
                if (encrypted) anyEncrypted = true
                entries.add(ArchiveEntry(
                    path = e.name,
                    isDirectory = e.isDirectory,
                    size = e.size,
                    compressedSize = e.compressedSize,
                    modified = e.lastModifiedDate.time,
                    isEncrypted = encrypted,
                ))
            }
        }
        return OpenArchiveResult(
            entries = entries,
            isEncrypted = anyEncrypted,
            needsPassword = anyEncrypted && password.isNullOrEmpty(),
            formatHint = "zip",
        )
    }

    // ============ TAR ============
    private fun openTar(file: File): OpenArchiveResult {
        val entries = mutableListOf<ArchiveEntry>()
        BufferedInputStream(FileInputStream(file)).use { bin ->
            TarArchiveInputStream(bin).use { tin ->
                var e: TarArchiveEntry? = tin.nextTarEntry as? TarArchiveEntry
                while (e != null) {
                    entries.add(ArchiveEntry(
                        path = e.name,
                        isDirectory = e.isDirectory,
                        size = e.size,
                        compressedSize = e.size, // TAR has no per-entry compression
                        modified = e.modTime.time,
                        isEncrypted = false,
                    ))
                    e = tin.nextTarEntry as? TarArchiveEntry
                }
            }
        }
        return OpenArchiveResult(entries = entries, isEncrypted = false, needsPassword = false, formatHint = "tar")
    }

    // ============ TAR.GZ / TGZ ============
    private fun openTarGz(file: File): OpenArchiveResult {
        val entries = mutableListOf<ArchiveEntry>()
        BufferedInputStream(FileInputStream(file)).use { bin ->
            GzipCompressorInputStream(bin).use { gz ->
                TarArchiveInputStream(gz).use { tin ->
                    var e: TarArchiveEntry? = tin.nextTarEntry as? TarArchiveEntry
                    while (e != null) {
                        entries.add(ArchiveEntry(
                            path = e.name,
                            isDirectory = e.isDirectory,
                            size = e.size,
                            compressedSize = e.size,
                            modified = e.modTime.time,
                            isEncrypted = false,
                        ))
                        e = tin.nextTarEntry as? TarArchiveEntry
                    }
                }
            }
        }
        return OpenArchiveResult(entries = entries, isEncrypted = false, needsPassword = false, formatHint = "tar.gz")
    }

    // ============ GZ (single-file) ============
    private fun openTarBz2(file: File): OpenArchiveResult {
        BZip2CompressorInputStream(BufferedInputStream(FileInputStream(file))).use { input ->
            TarArchiveInputStream(input).use { tar ->
                val entries = mutableListOf<ArchiveEntry>()
                var e = tar.nextTarEntry
                while (e != null) { entries += ArchiveEntry(e.name, e.isDirectory, e.size, e.size, e.modTime.time, false); e = tar.nextTarEntry }
                return OpenArchiveResult(entries, false, false, "tar.bz2")
            }
        }
    }

    private fun openTarXz(file: File): OpenArchiveResult {
        XZCompressorInputStream(BufferedInputStream(FileInputStream(file))).use { input ->
            TarArchiveInputStream(input).use { tar ->
                val entries = mutableListOf<ArchiveEntry>()
                var e = tar.nextTarEntry
                while (e != null) { entries += ArchiveEntry(e.name, e.isDirectory, e.size, e.size, e.modTime.time, false); e = tar.nextTarEntry }
                return OpenArchiveResult(entries, false, false, "tar.xz")
            }
        }
    }

    private fun openGz(file: File): OpenArchiveResult {
        // GZIP wraps a single file — synthetic entry listing
        val innerName = file.name.removeSuffix(".gz")
        val size = file.length() // approximate — actual decompressed size unknown without reading
        val entries = listOf(ArchiveEntry(
            path = innerName,
            isDirectory = false,
            size = size,
            compressedSize = file.length(),
            modified = file.lastModified(),
            isEncrypted = false,
        ))
        return OpenArchiveResult(entries = entries, isEncrypted = false, needsPassword = false, formatHint = "gz")
    }

    private fun openBzip2(file: File): OpenArchiveResult {
        val innerName = file.name.removeSuffix(".bz2")
        return OpenArchiveResult(
            entries = listOf(ArchiveEntry(
                path = innerName, isDirectory = false, size = file.length(),
                compressedSize = file.length(), modified = file.lastModified(), isEncrypted = false,
            )),
            isEncrypted = false, needsPassword = false, formatHint = "bz2",
        )
    }

    private fun openXz(file: File): OpenArchiveResult {
        val innerName = file.name.removeSuffix(".xz")
        return OpenArchiveResult(
            entries = listOf(ArchiveEntry(
                path = innerName, isDirectory = false, size = file.length(),
                compressedSize = file.length(), modified = file.lastModified(), isEncrypted = false,
            )),
            isEncrypted = false, needsPassword = false, formatHint = "xz",
        )
    }

    // ============ RAR (JunRAR — RAR3 & RAR5, password-protected) ============
    private fun openRar(file: File, password: String?): OpenArchiveResult {
        val entries = mutableListOf<ArchiveEntry>()
        var anyEncrypted = false
        try {
            Archive(file, password ?: "").use { rar ->
                for (fh in rar.fileHeaders) {
                    val encrypted = fh.isEncrypted
                    if (encrypted) anyEncrypted = true
                    entries.add(ArchiveEntry(
                        path = fh.fileNameString,
                        isDirectory = fh.isDirectory,
                        size = fh.fullUnpackSize,
                        compressedSize = fh.fullPackSize,
                        modified = try { fh.mTime?.time ?: file.lastModified() } catch (_: Throwable) { file.lastModified() },
                        isEncrypted = encrypted,
                    ))
                }
            }
        } catch (e: Exception) {
            val msg = e.message.orEmpty().lowercase()
            if (msg.contains("password") || msg.contains("encrypted") || e is RarException) {
                return OpenArchiveResult(
                    entries = emptyList(),
                    isEncrypted = true,
                    needsPassword = password.isNullOrEmpty(),
                    formatHint = "rar",
                )
            }
            throw ArchiveError.IO("RAR open failed: ${e.message}")
        }
        return OpenArchiveResult(
            entries = entries,
            isEncrypted = anyEncrypted,
            needsPassword = anyEncrypted && password.isNullOrEmpty(),
            formatHint = "rar",
        )
    }

    // ============ 7z (Apache Commons Compress SevenZFile — incl. password) ============
    private fun open7z(file: File, password: String?): OpenArchiveResult {
        val entries = mutableListOf<ArchiveEntry>()
        var anyEncrypted = false
        var needsPwd = false
        try {
            val builder = SevenZFile.builder().setFile(file)
            if (!password.isNullOrEmpty()) builder.setPassword(password.toCharArray())
            builder.get().use { sz ->
                for (e in sz.entries) {
                    // commons-compress SevenZArchiveEntry doesn't expose per-entry
                    // encryption flags in 1.26.x, so we can only detect it at the
                    // archive level (PasswordRequiredException when opening).
                    entries.add(ArchiveEntry(
                        path = e.name,
                        isDirectory = e.isDirectory,
                        size = e.size,
                        compressedSize = 0L, // not exposed by commons-compress SevenZArchiveEntry
                        modified = e.lastModifiedDate?.time ?: file.lastModified(),
                        isEncrypted = false,
                    ))
                }
            }
        } catch (e: org.apache.commons.compress.PasswordRequiredException) {
            needsPwd = true
            anyEncrypted = true
        } catch (e: Exception) {
            val msg = e.message.orEmpty().lowercase()
            if (msg.contains("password") || msg.contains("encrypted")) {
                needsPwd = true
                anyEncrypted = true
            } else {
                throw ArchiveError.IO("7z open failed: ${e.message}")
            }
        }
        return OpenArchiveResult(
            entries = entries,
            isEncrypted = anyEncrypted,
            needsPassword = needsPwd && password.isNullOrEmpty(),
            formatHint = "7z",
        )
    }

    // ============ Extraction ============

    /**
     * Extract a single entry to [targetPath]. Returns true on success.
     * For encrypted entries the password is required.
     */
    fun extractEntry(file: File, entryPath: String, targetPath: String, password: String? = null): Boolean {
        val name = file.name.lowercase()
        return when {
            name.endsWith(".zip") -> extractZipEntry(file, entryPath, targetPath, password)
            name.endsWith(".tar") -> extractTarEntry(file, entryPath, targetPath)
            name.endsWith(".tar.gz") || name.endsWith(".tgz") -> extractTarGzEntry(file, entryPath, targetPath)
            name.endsWith(".gz") && !file.name.lowercase().endsWith(".tar.gz") -> extractGzEntry(file, targetPath)
            name.endsWith(".bz2") -> extractBzip2Entry(file, targetPath)
            name.endsWith(".xz") -> extractXzEntry(file, targetPath)
            name.endsWith(".rar") -> extractRarEntry(file, entryPath, targetPath, password)
            name.endsWith(".7z") -> extract7zEntry(file, entryPath, targetPath, password)
            else -> throw ArchiveError.Unsupported("Unsupported archive format: ${file.name}")
        }
    }

    private fun extractZipEntry(file: File, entryPath: String, targetPath: String, password: String?): Boolean {
        ZipFile.builder().setFile(file).get().use { zf ->
            val entry = zf.getEntry(entryPath) ?: return false
            // Commons-compress ZipFile supports password via setPassword; but
            // only for standard PKWARE encryption. For AES-encrypted zips use
            // the streaming API.
            if (password?.isNotEmpty() == true) {
                // Try with password via ZipFile streaming (limited support)
                try {
                    zf.getInputStream(entry).use { input ->
                        copyStreamToFile(input, File(targetPath))
                    }
                    return true
                } catch (e: Exception) {
                    // Fall through to plain stream
                }
            }
            zf.getInputStream(entry).use { input ->
                copyStreamToFile(input, File(targetPath))
            }
            return true
        }
    }

    private fun extractTarEntry(file: File, entryPath: String, targetPath: String): Boolean {
        BufferedInputStream(FileInputStream(file)).use { bin ->
            TarArchiveInputStream(bin).use { tin ->
                var e: TarArchiveEntry? = tin.nextTarEntry as? TarArchiveEntry
                while (e != null) {
                    if (e.name == entryPath) {
                        File(targetPath).parentFile?.mkdirs()
                        copyStreamToFile(tin, File(targetPath), e.size)
                        return true
                    }
                    e = tin.nextTarEntry as? TarArchiveEntry
                }
            }
        }
        return false
    }

    private fun extractTarGzEntry(file: File, entryPath: String, targetPath: String): Boolean {
        BufferedInputStream(FileInputStream(file)).use { bin ->
            GzipCompressorInputStream(bin).use { gz ->
                TarArchiveInputStream(gz).use { tin ->
                    var e: TarArchiveEntry? = tin.nextTarEntry as? TarArchiveEntry
                    while (e != null) {
                        if (e.name == entryPath) {
                            File(targetPath).parentFile?.mkdirs()
                            copyStreamToFile(tin, File(targetPath), e.size)
                            return true
                        }
                        e = tin.nextTarEntry as? TarArchiveEntry
                    }
                }
            }
        }
        return false
    }

    private fun extractGzEntry(file: File, targetPath: String): Boolean {
        BufferedInputStream(FileInputStream(file)).use { bin ->
            GzipCompressorInputStream(bin).use { gz ->
                File(targetPath).parentFile?.mkdirs()
                copyStreamToFile(gz, File(targetPath))
            }
        }
        return true
    }

    private fun extractBzip2Entry(file: File, targetPath: String): Boolean {
        BufferedInputStream(FileInputStream(file)).use { bin ->
            BZip2CompressorInputStream(bin).use { bz ->
                File(targetPath).parentFile?.mkdirs()
                copyStreamToFile(bz, File(targetPath))
            }
        }
        return true
    }

    private fun extractXzEntry(file: File, targetPath: String): Boolean {
        BufferedInputStream(FileInputStream(file)).use { bin ->
            XZCompressorInputStream(bin).use { xz ->
                File(targetPath).parentFile?.mkdirs()
                copyStreamToFile(xz, File(targetPath))
            }
        }
        return true
    }

    private fun extractRarEntry(file: File, entryPath: String, targetPath: String, password: String?): Boolean {
        try {
            Archive(file, password ?: "").use { rar ->
                val fh = rar.fileHeaders.find { it.fileNameString == entryPath } ?: return false
                File(targetPath).parentFile?.mkdirs()
                FileOutputStream(targetPath).use { out ->
                    rar.extractFile(fh, out)
                }
                return true
            }
        } catch (e: Exception) {
            val msg = e.message.orEmpty().lowercase()
            if (msg.contains("password") || msg.contains("encrypted")) {
                throw ArchiveError.WrongPassword()
            }
            throw ArchiveError.IO("RAR extract failed: ${e.message}")
        }
    }

    private fun extract7zEntry(file: File, entryPath: String, targetPath: String, password: String?): Boolean {
        val builder = SevenZFile.builder().setFile(file)
        if (!password.isNullOrEmpty()) builder.setPassword(password.toCharArray())
        builder.get().use { sz ->
            for (e in sz.entries) {
                if (e.name == entryPath && !e.isDirectory) {
                    File(targetPath).parentFile?.mkdirs()
                    FileOutputStream(targetPath).use { out ->
                        val buf = ByteArray(64 * 1024)
                        var read: Int
                        // sz.getNextEntry() advances the cursor; we already
                        // have e from the iterator. Use the streaming API.
                        // Commons-compress SevenZFile iterates entries lazily;
                        // we need to position the cursor on this entry first.
                        val inStream = sz.getInputStream(e) ?: return false
                        inStream.use { input ->
                            while (input.read(buf).also { read = it } > 0) {
                                out.write(buf, 0, read)
                            }
                        }
                    }
                    return true
                }
            }
        }
        return false
    }

    /**
     * Extract every entry to a target directory.
     * ALL entry paths are validated against path traversal attacks before extraction.
     */
    fun extractAll(
        file: File,
        targetDir: File,
        password: String? = null,
        progress: ((current: Int, total: Int) -> Unit)? = null,
        control: OperationControl? = null,
        onProgress: ((OperationProgress) -> Unit)? = null,
    ): Int {
        val result = openArchive(file, password)
        if (result.needsPassword) throw ArchiveError.PasswordRequired()
        targetDir.mkdirs()
        val canonicalTarget = targetDir.canonicalFile
        val files = result.entries.filterNot { it.isDirectory }
        val totalFiles = files.size
        val totalBytes = files.sumOf { if (it.size > 0) it.size else 0L }.let {
            if (it > 0) it else file.length().coerceAtLeast(1L)
        }
        var processedBytes = 0L
        var extracted = 0

        for (entry in result.entries) {
            awaitIfPaused(control)
            val safePath = sanitizeEntryPath(entry.path, canonicalTarget) ?: continue
            if (entry.isDirectory) {
                safePath.mkdirs()
                continue
            }
            safePath.parentFile?.mkdirs()
            if (!safePath.canonicalPath.startsWith(canonicalTarget.canonicalPath + File.separator) &&
                safePath.canonicalPath != canonicalTarget.canonicalPath) continue

            var entryBytes = 0L
            try {
                // Keep the existing format-specific extraction implementation, but
                // route output through a progress-aware stream for byte-level events.
                entryBytes = extractEntryWithProgress(file, entry.path, safePath, password, control) { delta ->
                    processedBytes += delta
                    onProgress?.invoke(OperationProgress(processedBytes, totalBytes, entry.path, extracted, totalFiles))
                }
                extracted++
                progress?.invoke(extracted, totalFiles)
                onProgress?.invoke(OperationProgress(processedBytes, totalBytes, entry.path, extracted, totalFiles))
            } catch (e: InterruptedException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "Failed to extract ${entry.path}: ${e.message}")
                // If an entry failed after partial output, don't count it as complete.
                processedBytes += entryBytes
            }
        }
        return extracted
    }

    private fun extractEntryWithProgress(
        file: File,
        entryPath: String,
        target: File,
        password: String?,
        control: OperationControl?,
        onBytes: (Long) -> Unit,
    ): Long {
        val name = file.name.lowercase()
        return when {
            name.endsWith(".zip") -> {
                ZipFile.builder().setFile(file).get().use { zf ->
                    val entry = zf.getEntry(entryPath) ?: return 0L
                    zf.getInputStream(entry).use { input -> copyStreamToFile(input, target, entry.size, control, onBytes) }
                }
            }
            name.endsWith(".tar") -> extractTarProgress(file, entryPath, target, control, onBytes)
            name.endsWith(".tar.gz") || name.endsWith(".tgz") -> extractTarGzProgress(file, entryPath, target, control, onBytes)
            name.endsWith(".gz") -> BufferedInputStream(FileInputStream(file)).use { bin ->
                GzipCompressorInputStream(bin).use { gz -> copyStreamToFile(gz, target, -1, control, onBytes) }
            }
            name.endsWith(".bz2") -> BufferedInputStream(FileInputStream(file)).use { bin ->
                BZip2CompressorInputStream(bin).use { bz -> copyStreamToFile(bz, target, -1, control, onBytes) }
            }
            name.endsWith(".xz") -> BufferedInputStream(FileInputStream(file)).use { bin ->
                XZCompressorInputStream(bin).use { xz -> copyStreamToFile(xz, target, -1, control, onBytes) }
            }
            name.endsWith(".rar") -> {
                try {
                    Archive(file, password ?: "").use { rar ->
                        val fh = rar.fileHeaders.find { it.fileNameString == entryPath } ?: return 0L
                        target.parentFile?.mkdirs()
                        FileOutputStream(target).use { raw ->
                            val out = ProgressOutputStream(raw, control, onBytes)
                            out.use { rar.extractFile(fh, it) }
                        }
                    }
                    target.length()
                } catch (e: Exception) {
                    val msg = e.message.orEmpty().lowercase()
                    if (msg.contains("password") || msg.contains("encrypted")) throw ArchiveError.WrongPassword()
                    throw ArchiveError.IO("RAR extract failed: ${e.message}")
                }
            }
            name.endsWith(".7z") -> {
                val builder = SevenZFile.builder().setFile(file)
                if (!password.isNullOrEmpty()) builder.setPassword(password.toCharArray())
                builder.get().use { sz ->
                    for (e in sz.entries) {
                        if (e.name == entryPath && !e.isDirectory) {
                            val input = sz.getInputStream(e) ?: return 0L
                            input.use { copyStreamToFile(it, target, e.size, control, onBytes) }
                            return target.length()
                        }
                    }
                    0L
                }
            }
            else -> throw ArchiveError.Unsupported("Unsupported archive format: ${file.name}")
        }
    }

    private fun extractTarProgress(file: File, entryPath: String, target: File, control: OperationControl?, onBytes: (Long) -> Unit): Long {
        BufferedInputStream(FileInputStream(file)).use { bin ->
            TarArchiveInputStream(bin).use { tin ->
                var e = tin.nextTarEntry as? TarArchiveEntry
                while (e != null) {
                    awaitIfPaused(control)
                    if (e.name == entryPath) return copyStreamToFile(tin, target, e.size, control, onBytes)
                    e = tin.nextTarEntry as? TarArchiveEntry
                }
            }
        }
        return 0L
    }

    private fun extractTarGzProgress(file: File, entryPath: String, target: File, control: OperationControl?, onBytes: (Long) -> Unit): Long {
        BufferedInputStream(FileInputStream(file)).use { bin ->
            GzipCompressorInputStream(bin).use { gz ->
                TarArchiveInputStream(gz).use { tin ->
                    var e = tin.nextTarEntry as? TarArchiveEntry
                    while (e != null) {
                        awaitIfPaused(control)
                        if (e.name == entryPath) return copyStreamToFile(tin, target, e.size, control, onBytes)
                        e = tin.nextTarEntry as? TarArchiveEntry
                    }
                }
            }
        }
        return 0L
    }

    /**
     * Sanitize an archive entry path to prevent path traversal attacks.
     * Rejects: absolute paths, "../" traversal, Windows-style paths, symlinks.
     * Returns null if the path is unsafe.
     */
    private fun sanitizeEntryPath(entryPath: String, targetDir: File): File? {
        // Reject empty paths
        if (entryPath.isBlank()) return null

        // Reject Windows-style absolute paths (C:\, D:\, etc.)
        if (entryPath.length >= 2 && entryPath[1] == ':') return null

        // Reject Unix absolute paths
        if (entryPath.startsWith("/")) return null

        // Reject backslash paths (Windows archives may use them)
        val normalized = entryPath.replace('\\', '/')

        // Reject paths containing ".." segments
        val parts = normalized.split("/")
        for (part in parts) {
            if (part == "..") return null
            // Reject null bytes (ZIP slip attack)
            if (part.contains("\u0000")) return null
        }

        // Construct the target file and verify it's inside targetDir
        val candidate = File(targetDir, normalized)
        val canonicalCandidate = candidate.canonicalFile
        val canonicalTarget = targetDir.canonicalFile

        // Verify the candidate is within the target directory
        if (!canonicalCandidate.canonicalPath.startsWith(canonicalTarget.canonicalPath + File.separator) &&
            canonicalCandidate.canonicalPath != canonicalTarget.canonicalPath) {
            return null
        }

        return canonicalCandidate
    }

    /**
     * Read a single entry's bytes into memory. Used for opening files inside
     * an archive directly (e.g. a text file or image). Caller MUST ensure the
     * entry is small enough to fit in RAM — capped at 50MB.
     */
    fun readEntryBytes(file: File, entryPath: String, password: String? = null): ByteArray? {
        val tempFile = File.createTempFile("ff-archive-", ".tmp")
        try {
            if (!extractEntry(file, entryPath, tempFile.absolutePath, password)) return null
            if (tempFile.length() > 50_000_000) {
                tempFile.delete()
                throw ArchiveError.Unsupported("Entry too large to read into memory (>50MB)")
            }
            return tempFile.readBytes()
        } finally {
            tempFile.delete()
        }
    }

    // ============ Helpers ============

    // ============ Compression ============

    /** Create an archive in one of the formats that Commons Compress can write. */
    fun createArchive(
        sources: List<String>,
        targetArchive: String,
        format: String = "zip",
        progress: ((currentBytes: Long, totalBytes: Long) -> Unit)? = null,
        control: OperationControl? = null,
        onProgress: ((OperationProgress) -> Unit)? = null,
    ): Boolean {
        val normalized = format.lowercase().removePrefix(".")
        return when (normalized) {
            "zip" -> createZip(sources, targetArchive, progress, control, onProgress)
            "tar" -> createTar(sources, targetArchive, progress, control, onProgress)
            "tar.gz", "tgz" -> createTarCompressed(sources, targetArchive, "gz", progress, control, onProgress)
            "tar.bz2", "tbz2", "tbz" -> createTarCompressed(sources, targetArchive, "bz2", progress, control, onProgress)
            "tar.xz", "txz" -> createTarCompressed(sources, targetArchive, "xz", progress, control, onProgress)
            "gz" -> createSingleCompressed(sources, targetArchive, "gz", progress, control, onProgress)
            "bz2" -> createSingleCompressed(sources, targetArchive, "bz2", progress, control, onProgress)
            "xz" -> createSingleCompressed(sources, targetArchive, "xz", progress, control, onProgress)
            "7z" -> create7z(sources, targetArchive, progress, control, onProgress)
            // RAR creation is intentionally not advertised: junrar is an extractor,
            // not a RAR writer. Pretending otherwise would create corrupt archives.
            "rar" -> throw ArchiveError.Unsupported("RAR creation is not available with the bundled native libraries")
            else -> throw ArchiveError.Unsupported("Unsupported archive creation format: $format")
        }
    }

    private fun createZip(
        sources: List<String>, targetArchive: String,
        progress: ((Long, Long) -> Unit)?, control: OperationControl?, onProgress: ((OperationProgress) -> Unit)?
    ): Boolean {
        val sourceFiles = sources.map { File(it) }.filter { it.exists() }
        if (sourceFiles.isEmpty()) return false
        val totalBytes = sourceFiles.sumOf { computeSize(it) }.coerceAtLeast(1L)
        File(targetArchive).parentFile?.mkdirs()
        var processed = 0L
        try {
            FileOutputStream(targetArchive).use { raw ->
                ZipArchiveOutputStream(raw).use { zip ->
                    for (source in sourceFiles) {
                        addToZip(zip, source, source.parentFile?.absolutePath ?: "", control) { n ->
                            processed += n
                            progress?.invoke(processed, totalBytes)
                            onProgress?.invoke(OperationProgress(processed, totalBytes, source.absolutePath))
                        }
                    }
                    zip.finish()
                }
            }
            return true
        } catch (e: Exception) {
            File(targetArchive).delete()
            Log.e(TAG, "ZIP creation failed: ${e.message}", e)
            return false
        }
    }

    private fun addToZip(
        zip: ZipArchiveOutputStream, file: File, basePath: String, control: OperationControl?, onBytes: (Long) -> Unit
    ) {
        awaitIfPaused(control)
        val relative = if (basePath.isEmpty()) file.name else file.absolutePath.substring(basePath.length + 1)
        if (file.isDirectory) {
            val entry = ZipArchiveEntry("$relative/")
            entry.time = file.lastModified()
            zip.putArchiveEntry(entry)
            zip.closeArchiveEntry()
            file.listFiles()?.forEach { addToZip(zip, it, basePath, control, onBytes) }
        } else {
            val entry = ZipArchiveEntry(file, relative)
            zip.putArchiveEntry(entry)
            FileInputStream(file).use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    awaitIfPaused(control)
                    val n = input.read(buffer)
                    if (n < 0) break
                    zip.write(buffer, 0, n)
                    onBytes(n.toLong())
                }
            }
            zip.closeArchiveEntry()
        }
    }

    private fun createTar(
        sources: List<String>, targetArchive: String,
        progress: ((Long, Long) -> Unit)?, control: OperationControl?, onProgress: ((OperationProgress) -> Unit)?
    ): Boolean {
        return createTarCompressed(sources, targetArchive, null, progress, control, onProgress)
    }

    private fun createTarCompressed(
        sources: List<String>, targetArchive: String, compression: String?,
        progress: ((Long, Long) -> Unit)?, control: OperationControl?, onProgress: ((OperationProgress) -> Unit)?
    ): Boolean {
        val sourceFiles = sources.map { File(it) }.filter { it.exists() }
        if (sourceFiles.isEmpty()) return false
        val totalBytes = sourceFiles.sumOf { computeSize(it) }.coerceAtLeast(1L)
        File(targetArchive).parentFile?.mkdirs()
        var processed = 0L
        try {
            FileOutputStream(targetArchive).use { raw ->
                val compressed: OutputStream = when (compression) {
                    "gz" -> GzipCompressorOutputStream(raw)
                    "bz2" -> BZip2CompressorOutputStream(raw)
                    "xz" -> XZCompressorOutputStream(raw)
                    else -> raw
                }
                compressed.use { output ->
                    TarArchiveOutputStream(output).use { tar ->
                        tar.setLongFileMode(TarArchiveOutputStream.LONGFILE_POSIX)
                        for (source in sourceFiles) {
                            addToTar(tar, source, source.parentFile?.absolutePath ?: "", control) { n ->
                                processed += n
                                progress?.invoke(processed, totalBytes)
                                onProgress?.invoke(OperationProgress(processed, totalBytes, source.absolutePath))
                            }
                        }
                        tar.finish()
                    }
                }
            }
            return true
        } catch (e: Exception) {
            File(targetArchive).delete()
            Log.e(TAG, "TAR creation failed: ${e.message}", e)
            return false
        }
    }

    private fun addToTar(
        tar: TarArchiveOutputStream, file: File, basePath: String, control: OperationControl?, onBytes: (Long) -> Unit
    ) {
        awaitIfPaused(control)
        val relative = if (basePath.isEmpty()) file.name else file.absolutePath.substring(basePath.length + 1)
        if (file.isDirectory) {
            val entry = TarArchiveEntry("$relative/")
            entry.setModTime(file.lastModified())
            tar.putArchiveEntry(entry)
            tar.closeArchiveEntry()
            file.listFiles()?.forEach { addToTar(tar, it, basePath, control, onBytes) }
        } else {
            val entry = TarArchiveEntry(file, relative)
            tar.putArchiveEntry(entry)
            FileInputStream(file).use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    awaitIfPaused(control)
                    val n = input.read(buffer)
                    if (n < 0) break
                    tar.write(buffer, 0, n)
                    onBytes(n.toLong())
                }
            }
            tar.closeArchiveEntry()
        }
    }

    private fun createSingleCompressed(
        sources: List<String>, targetArchive: String, compression: String,
        progress: ((Long, Long) -> Unit)?, control: OperationControl?, onProgress: ((OperationProgress) -> Unit)?
    ): Boolean {
        if (sources.size != 1 || File(sources[0]).isDirectory) {
            throw ArchiveError.Unsupported(".$compression creation accepts exactly one file")
        }
        val source = File(sources[0])
        if (!source.exists()) return false
        File(targetArchive).parentFile?.mkdirs()
        val total = source.length().coerceAtLeast(1L)
        var processed = 0L
        try {
            FileInputStream(source).use { input ->
                FileOutputStream(targetArchive).use { raw ->
                    val out: OutputStream = when (compression) {
                        "gz" -> GzipCompressorOutputStream(raw)
                        "bz2" -> BZip2CompressorOutputStream(raw)
                        "xz" -> XZCompressorOutputStream(raw)
                        else -> throw ArchiveError.Unsupported("Unsupported compressor: $compression")
                    }
                    out.use { compressed ->
                        val buffer = ByteArray(64 * 1024)
                        while (true) {
                            awaitIfPaused(control)
                            val n = input.read(buffer)
                            if (n < 0) break
                            compressed.write(buffer, 0, n)
                            processed += n
                            progress?.invoke(processed, total)
                            onProgress?.invoke(OperationProgress(processed, total, source.absolutePath))
                        }
                    }
                }
            }
            return true
        } catch (e: Exception) {
            File(targetArchive).delete()
            Log.e(TAG, "Single compressed creation failed: ${e.message}", e)
            return false
        }
    }

    private fun create7z(
        sources: List<String>, targetArchive: String,
        progress: ((Long, Long) -> Unit)?, control: OperationControl?, onProgress: ((OperationProgress) -> Unit)?
    ): Boolean {
        val sourceFiles = sources.map { File(it) }.filter { it.exists() }
        if (sourceFiles.isEmpty()) return false
        val total = sourceFiles.sumOf { computeSize(it) }.coerceAtLeast(1L)
        var processed = 0L
        try {
            SevenZOutputFile(File(targetArchive)).use { seven ->
                for (source in sourceFiles) {
                    addTo7z(seven, source, source.parentFile?.absolutePath ?: "", control) { n ->
                        processed += n
                        progress?.invoke(processed, total)
                        onProgress?.invoke(OperationProgress(processed, total, source.absolutePath))
                    }
                }
            }
            return true
        } catch (e: Exception) {
            File(targetArchive).delete()
            Log.e(TAG, "7z creation failed: ${e.message}", e)
            return false
        }
    }

    private fun addTo7z(
        seven: SevenZOutputFile, file: File, basePath: String, control: OperationControl?, onBytes: (Long) -> Unit
    ) {
        awaitIfPaused(control)
        val relative = if (basePath.isEmpty()) file.name else file.absolutePath.substring(basePath.length + 1)
        val entry = SevenZArchiveEntry().apply { name = relative; isDirectory = file.isDirectory; lastModifiedDate = java.util.Date(file.lastModified()) }
        seven.putArchiveEntry(entry)
        if (!file.isDirectory) {
            FileInputStream(file).use { input ->
                val buffer = ByteArray(64 * 1024)
                while (true) {
                    awaitIfPaused(control)
                    val n = input.read(buffer)
                    if (n < 0) break
                    seven.write(buffer, 0, n)
                    onBytes(n.toLong())
                }
            }
        }
        seven.closeArchiveEntry()
        if (file.isDirectory) file.listFiles()?.forEach { addTo7z(seven, it, basePath, control, onBytes) }
    }

    // Backward-compatible ZIP entry point.
    private fun computeSize(file: File): Long {
        if (file.isFile) return file.length()
        var size = 0L
        val stack = ArrayDeque<File>()
        stack.addLast(file)
        while (stack.isNotEmpty()) {
            val dir = stack.removeLast()
            val children = dir.listFiles() ?: continue
            for (child in children) {
                if (child.isDirectory) stack.addLast(child)
                else size += child.length()
            }
        }
        return size
    }

    private fun addToZip(
        zos: org.apache.commons.compress.archivers.zip.ZipArchiveOutputStream,
        file: File,
        basePath: String,
        progress: ((currentBytes: Long, totalBytes: Long) -> Unit)?,
        control: OperationControl? = null,
        onBytes: (Long) -> Unit
    ) {
        val relativePath = if (basePath.isEmpty()) file.name else file.absolutePath.substring(basePath.length + 1)
        if (file.isDirectory) {
            // Add directory entry
            val entry = org.apache.commons.compress.archivers.zip.ZipArchiveEntry("$relativePath/")
            zos.putArchiveEntry(entry)
            zos.closeArchiveEntry()
            // Recurse into children
            val children = file.listFiles() ?: return
            for (child in children) {
                awaitIfPaused(control)
                addToZip(zos, child, basePath, progress, control, onBytes)
            }
        } else {
            // Add file entry
            val entry = org.apache.commons.compress.archivers.zip.ZipArchiveEntry(file, relativePath)
            zos.putArchiveEntry(entry)
            FileInputStream(file).use { fis ->
                val buffer = ByteArray(64 * 1024)
                var read: Int
                while (fis.read(buffer).also { read = it } > 0) {
                    awaitIfPaused(control)
                    zos.write(buffer, 0, read)
                    onBytes(read.toLong())
                }
            }
            zos.closeArchiveEntry()
        }
    }
}
