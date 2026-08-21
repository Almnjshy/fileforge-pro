package pro.fileforge.app

import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Bundle
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.View
import android.widget.ImageView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.core.content.FileProvider
import java.io.File

/** Dedicated native image viewer. Keeps image decoding out of the WebView. */
class NativeImageViewerActivity : ComponentActivity() {
    companion object {
        const val EXTRA_REF = "ref"
        const val EXTRA_TITLE = "title"
    }

    private lateinit var imageView: ImageView
    private var scale = 1f
    private var rotation = 0f
    private var lastX = 0f
    private var lastY = 0f
    private var dragging = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val ref = intent.getStringExtra(EXTRA_REF).orEmpty()
        if (ref.isBlank()) { finish(); return }
        intent.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() }?.let(::setTitle)

        imageView = ImageView(this).apply {
            setBackgroundColor(android.graphics.Color.BLACK)
            scaleType = ImageView.ScaleType.MATRIX
            adjustViewBounds = true
            setOnTouchListener(touchListener)
        }
        setContentView(imageView)

        try {
            val uri = resolveUri(ref)
            contentResolver.openInputStream(uri).use { input ->
                val bitmap = BitmapFactory.decodeStream(input)
                if (bitmap == null) throw IllegalStateException("Unable to decode image")
                imageView.setImageBitmap(bitmap)
                imageView.post { resetTransform() }
            }
        } catch (e: Exception) {
            Toast.makeText(this, "Unable to open image", Toast.LENGTH_LONG).show()
            finish()
        }
    }

    private val scaleDetector by lazy {
        ScaleGestureDetector(this, object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
            override fun onScale(detector: ScaleGestureDetector): Boolean {
                val factor = detector.scaleFactor.coerceIn(0.5f, 2f)
                scale = (scale * factor).coerceIn(0.5f, 8f)
                imageView.imageMatrix = Matrix(imageView.imageMatrix).apply {
                    postScale(factor, factor, detector.focusX, detector.focusY)
                }
                return true
            }
        })
    }

    private val gestureDetector by lazy {
        GestureDetector(this, object : GestureDetector.SimpleOnGestureListener() {
            override fun onDoubleTap(e: MotionEvent): Boolean {
                if (scale < 1.8f) {
                    val factor = 2f / scale
                    scale = 2f
                    imageView.imageMatrix = Matrix(imageView.imageMatrix).apply {
                        postScale(factor, factor, e.x, e.y)
                    }
                } else {
                    resetTransform()
                }
                return true
            }
        })
    }

    private val touchListener = View.OnTouchListener { _, event ->
        scaleDetector.onTouchEvent(event)
        gestureDetector.onTouchEvent(event)
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastX = event.x; lastY = event.y; dragging = true
            }
            MotionEvent.ACTION_MOVE -> if (dragging && event.pointerCount == 1) {
                val dx = event.x - lastX; val dy = event.y - lastY
                lastX = event.x; lastY = event.y
                val matrix = imageView.imageMatrix
                matrix.postTranslate(dx, dy)
                imageView.imageMatrix = matrix
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> dragging = false
        }
        true
    }

    private fun resetTransform() {
        scale = 1f
        val drawable = imageView.drawable ?: return
        val vw = imageView.width.toFloat().coerceAtLeast(1f)
        val vh = imageView.height.toFloat().coerceAtLeast(1f)
        val dw = drawable.intrinsicWidth.toFloat().coerceAtLeast(1f)
        val dh = drawable.intrinsicHeight.toFloat().coerceAtLeast(1f)
        val fit = minOf(vw / dw, vh / dh)
        val matrix = Matrix()
        matrix.setScale(fit, fit)
        matrix.postTranslate((vw - dw * fit) / 2f, (vh - dh * fit) / 2f)
        imageView.imageMatrix = matrix
    }

    private fun resolveUri(value: String): Uri {
        if (value.startsWith("content://", true) || value.startsWith("file://", true)) return Uri.parse(value)
        val file = File(value)
        return FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
    }
}
