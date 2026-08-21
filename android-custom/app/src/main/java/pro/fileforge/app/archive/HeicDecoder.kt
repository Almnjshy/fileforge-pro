package pro.fileforge.app.archive

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.os.Build
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import android.util.Base64

/**
 * Native HEIC/HEIF decoder.
 *
 * Strategy:
 *  - On Android 9+ (API 28+): use ImageDecoder which natively supports HEIF.
 *  - On older devices: fall back to BitmapFactory with HEIF decoding hint
 *    (some vendors ship HEIF support pre-P via the platform's BitmapFactory).
 *
 * The result is a JPEG-encoded byte array (base64) that the WebView can
 * render via <img>. This keeps the WebView simple while still using the
 * platform's HEIC decoder rather than a JS/WASM fallback.
 */
object HeicDecoder {
    private const val TAG = "HeicDecoder"

    /**
     * Decode a HEIC/HEIF file to a base64-encoded JPEG string suitable for
     * use as an <img src="data:image/jpeg;base64,..."> URL.
     *
     * @param file the source HEIC/HEIF file
     * @param maxDim max width/height in pixels; the decoded bitmap is
     * downsampled to fit. Use a reasonable max (e.g. 1920) to avoid OOM.
     * @return base64 string (without data: prefix), or null on failure
     */
    fun decodeToBase64Jpeg(file: File, maxDim: Int = 1920): String? {
        try {
            val bitmap = decode(file, maxDim) ?: return null
            val baos = ByteArrayOutputStream()
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos)
            bitmap.recycle()
            return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e(TAG, "HEIC decode failed for ${file.name}: ${e.message}")
            return null
        }
    }

    /**
     * Decode HEIC/HEIF to a Bitmap. Uses ImageDecoder on API 28+,
     * falls back to BitmapFactory on older devices.
     */
    fun decode(file: File, maxDim: Int = 1920): Bitmap? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // Android 9+ — ImageDecoder natively supports HEIF/HEIC.
            return try {
                val source = ImageDecoder.createSource(file)
                ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                    val w = info.size.width
                    val h = info.size.height
                    if (w > maxDim || h > maxDim) {
                        val ratio = minOf(maxDim.toFloat() / w, maxDim.toFloat() / h)
                        decoder.setTargetSize(
                            Math.max(1, Math.round(w * ratio)),
                            Math.max(1, Math.round(h * ratio))
                        )
                    }
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    decoder.onPartialImageListener = ImageDecoder.OnPartialImageListener { e ->
                        Log.w(TAG, "Partial image: ${e.error}")
                        false
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "ImageDecoder failed, falling back to BitmapFactory: ${e.message}")
                decodeLegacy(file, maxDim)
            }
        }
        return decodeLegacy(file, maxDim)
    }

    /**
     * Pre-API 28 fallback. BitmapFactory on some vendors can decode HEIC,
     * but it's not guaranteed. We try with inSampleSize to keep memory low.
     */
    private fun decodeLegacy(file: File, maxDim: Int): Bitmap? {
        // First, get bounds
        val opts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeStream(FileInputStream(file), null, opts)
        val w = opts.outWidth
        val h = opts.outHeight
        if (w <= 0 || h <= 0) return null

        var sample = 1
        while (w / (sample * 2) > maxDim || h / (sample * 2) > maxDim) {
            sample *= 2
        }
        val decodeOpts = BitmapFactory.Options().apply { inSampleSize = sample }
        return BitmapFactory.decodeStream(FileInputStream(file), null, decodeOpts)
    }

    /**
     * Check whether HEIC/HEIF decoding is supported on this device.
     */
    fun isSupported(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return true
        // Pre-P: vendor-dependent; can't reliably detect, so try a tiny decode
        return false
    }
}
