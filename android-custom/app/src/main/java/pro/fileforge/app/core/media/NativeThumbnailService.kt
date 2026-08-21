package pro.fileforge.app.core.media

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import androidx.exifinterface.media.ExifInterface
import android.media.MediaMetadataRetriever
import android.content.Context
import android.net.Uri
import android.util.Base64
import java.io.File
import java.io.FileOutputStream
import java.io.FileInputStream
import android.database.Cursor
import java.security.MessageDigest

/**
 * Dedicated thumbnail pipeline. Decoding and disk caching stay native; the
 * Capacitor adapter only serializes the compact result to JavaScript.
 */
class NativeThumbnailService(private val cacheRoot: File, private val context: Context) {
    fun generate(ref: String, maxSize: Int = 200): Result {
        val isSaf = ref.startsWith("content://", true)
        val file = if (!isSaf) File(ref) else null
        if (!isSaf) require(file!!.isFile) { "Not a file" }
        val size = maxSize.coerceIn(64, 1024)
        val key = cacheKey(ref, file, size)
        val cacheDir = File(cacheRoot, "thumbnails").apply { mkdirs() }
        val cached = File(cacheDir, "$key.jpg")
        if (cached.isFile && cached.length() > 0) {
            return Result(readBase64(cached), true)
        }

        val mime = if (isSaf) {
            context.contentResolver.getType(Uri.parse(ref)) ?: ""
        } else mimeType(file!!)
        val bitmap = try {
            when {
                mime.startsWith("image/") -> if (isSaf) decodeImageSaf(Uri.parse(ref), size) else decodeImage(file!!, size)
                mime.startsWith("video/") -> if (isSaf) decodeVideoSaf(Uri.parse(ref), size) else decodeVideo(file!!, size)
                else -> null
            }
        } catch (_: OutOfMemoryError) {
            null
        } ?: return Result(null, false)

        return try {
            FileOutputStream(cached).use { out ->
                if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 84, out)) {
                    return Result(null, false)
                }
            }
            Result(readBase64(cached), false)
        } finally {
            if (!bitmap.isRecycled) bitmap.recycle()
            cleanup(cacheDir, 50L * 1024L * 1024L)
        }
    }

    data class Result(val base64: String?, val cached: Boolean)

    private fun decodeImageSaf(uri: Uri, maxSize: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val sample = calculateSample(bounds.outWidth, bounds.outHeight, maxSize)
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.RGB_565
            inDither = true
        }
        val bitmap = context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, options) }
        return bitmap?.let { applyExifOrientationSaf(it, uri) }
    }

    private fun decodeImage(file: File, maxSize: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(file.absolutePath, bounds)
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
        val sample = calculateSample(bounds.outWidth, bounds.outHeight, maxSize)
        val options = BitmapFactory.Options().apply {
            inSampleSize = sample
            inPreferredConfig = Bitmap.Config.RGB_565
            inDither = true
        }
        val bitmap = BitmapFactory.decodeFile(file.absolutePath, options)
        return bitmap?.let { applyExifOrientation(it, file) }
    }

    private fun decodeVideoSaf(uri: Uri, maxSize: Int): Bitmap? {
        val retriever = MediaMetadataRetriever()
        return try { retriever.setDataSource(context, uri); retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.let { scale(it, maxSize) } }
        finally { retriever.release() }
    }

    private fun decodeVideo(file: File, maxSize: Int): Bitmap? {
        val retriever = MediaMetadataRetriever()
        return try {
            retriever.setDataSource(file.absolutePath)
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            val atUs = if (duration > 0) (duration * 1000L / 10L).coerceAtLeast(1_000L) else 0L
            val frame = retriever.getFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST_SYNC) ?: return null
            scale(frame, maxSize)
        } finally {
            retriever.release()
        }
    }

    private fun scale(bitmap: Bitmap, maxSize: Int): Bitmap {
        val largest = maxOf(bitmap.width, bitmap.height)
        if (largest <= maxSize) return bitmap
        val factor = maxSize.toFloat() / largest
        return Bitmap.createScaledBitmap(
            bitmap,
            (bitmap.width * factor).toInt().coerceAtLeast(1),
            (bitmap.height * factor).toInt().coerceAtLeast(1),
            true
        ).also { if (it !== bitmap) bitmap.recycle() }
    }

    private fun calculateSample(width: Int, height: Int, maxSize: Int): Int {
        var sample = 1
        while (width / (sample * 2) >= maxSize && height / (sample * 2) >= maxSize) sample *= 2
        return sample
    }

    private fun readBase64(file: File): String = Base64.encodeToString(file.readBytes(), Base64.NO_WRAP)

    private fun applyExifOrientation(fileBitmap: Bitmap, file: File): Bitmap {
        return try {
            FileInputStream(file).use { applyExifOrientation(fileBitmap, ExifInterface(it)) }
        } catch (_: Exception) { fileBitmap }
    }

    private fun applyExifOrientationSaf(bitmap: Bitmap, uri: Uri): Bitmap {
        return try {
            context.contentResolver.openInputStream(uri)?.use { applyExifOrientation(bitmap, ExifInterface(it)) } ?: bitmap
        } catch (_: Exception) { bitmap }
    }

    private fun applyExifOrientation(bitmap: Bitmap, exif: ExifInterface): Bitmap {
        val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
        val matrix = Matrix()
        when (orientation) {
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.setScale(-1f, 1f)
            ExifInterface.ORIENTATION_ROTATE_180 -> matrix.setRotate(180f)
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.setScale(1f, -1f)
            ExifInterface.ORIENTATION_TRANSPOSE -> { matrix.setRotate(90f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_90 -> matrix.setRotate(90f)
            ExifInterface.ORIENTATION_TRANSVERSE -> { matrix.setRotate(-90f); matrix.postScale(-1f, 1f) }
            ExifInterface.ORIENTATION_ROTATE_270 -> matrix.setRotate(270f)
            else -> return bitmap
        }
        return try {
            Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true).also { if (it !== bitmap) bitmap.recycle() }
        } catch (_: Exception) { bitmap }
    }

    private fun cacheKey(ref: String, file: File?, size: Int): String {
        val raw = if (file != null) "${file.absolutePath}|${file.lastModified()}|${file.length()}|$size"
        else {
            val uri = Uri.parse(ref)
            val name = context.contentResolver.query(uri, arrayOf("_display_name", "_size", "document_id"), null, null, null)?.use { c ->
                if (c.moveToFirst()) "${c.getStringOrNull(0)}|${c.getLongOrNull(1)}|${c.getStringOrNull(2)}" else ""
            } ?: ""
            "$ref|$name|${context.contentResolver.getType(uri)}|$size"
        }
        return MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
            .joinToString("") { "%02x".format(it) }
    }

    private fun cleanup(dir: File, limit: Long) {
        val files = dir.listFiles()?.sortedByDescending { it.lastModified() } ?: return
        var total = 0L
        files.forEach { f ->
            total += f.length()
            if (total > limit) f.delete()
        }
    }

    private fun Cursor.getStringOrNull(index: Int): String? = try { if (isNull(index)) null else getString(index) } catch (_: Exception) { null }
    private fun Cursor.getLongOrNull(index: Int): Long? = try { if (isNull(index)) null else getLong(index) } catch (_: Exception) { null }

    private fun mimeType(file: File): String {
        val ext = file.extension.lowercase()
        return android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: ""
    }
}
