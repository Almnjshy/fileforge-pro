package pro.fileforge.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import pro.fileforge.app.media.NativeMediaSurfaceManager
import com.getcapacitor.BridgeActivity
import pro.fileforge.app.plugins.FileForgeFileAccessPlugin

class MainActivity : BridgeActivity() {

    private lateinit var mediaSurfaceManager: NativeMediaSurfaceManager

    @Volatile
    private var pendingShareIntent: Intent? = null

    fun nativeMediaSurfaces(): NativeMediaSurfaceManager = mediaSurfaceManager

    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugins(listOf(FileForgeFileAccessPlugin::class.java))
        super.onCreate(savedInstanceState)

        mediaSurfaceManager = NativeMediaSurfaceManager(this, bridge?.webView)
        mediaSurfaceManager.attach()

        // === Normal (non-fullscreen) window behavior ===
        // Respect system bars (Status Bar + Navigation Bar) — DO NOT hide them.
        // Enable edge-to-edge so the WebView content draws behind the bars
        // but is not covered by them — we apply insets as padding below.
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // Apply window insets to the WebView's parent view (the root
        // container Capacitor creates) so content isn't hidden behind the
        // status/nav bars. Capacitor 6's Bridge doesn't expose rootLayout
        // directly, so we go through the WebView's parent.
        bridge?.webView?.let { webview ->
            (webview.parent as? android.view.View)?.let { parent ->
                ViewCompat.setOnApplyWindowInsetsListener(parent) { v, insets ->
                    val sysBars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
                    v.setPadding(sysBars.left, sysBars.top, sysBars.right, sysBars.bottom)
                    WindowInsetsCompat.CONSUMED
                }
            }
        }

        handleIncomingIntent(intent)

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView = this@MainActivity.bridge?.webView
                if (webView != null) {
                    webView.post {
                        webView.evaluateJavascript(
                            "if (window.__fileforgeBackButton) { window.__fileforgeBackButton(); }",
                            null
                        )
                    }
                }
            }
        })
    }

    override fun onDestroy() {
        if (::mediaSurfaceManager.isInitialized) mediaSurfaceManager.release()
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIncomingIntent(intent)
    }

    private fun handleIncomingIntent(intent: Intent?) {
        if (intent == null) return
        when (intent.action) {
            Intent.ACTION_VIEW, Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE -> {
                pendingShareIntent = intent
                val webView = this.bridge?.webView ?: return
                val js = buildShareJs(intent)
                webView.post {
                    webView.evaluateJavascript(js, null)
                }
            }
            else -> { /* ignore */ }
        }
    }

    private fun buildShareJs(intent: Intent): String {
        val sb = StringBuilder("window.__fileforgeSharedFiles = ")
        val files = mutableListOf<String>()
        intent.data?.let { files.add(it.toString()) }
        intent.clipData?.let { clip ->
            for (i in 0 until clip.itemCount) {
                clip.getItemAt(i).uri?.let { files.add(it.toString()) }
            }
        }
        if (files.isEmpty()) {
            sb.append("[];")
        } else {
            sb.append("[")
            files.forEachIndexed { idx, uri ->
                if (idx > 0) sb.append(",")
                sb.append("\"").append(uri.toString().replace("\"", "\\\"")).append("\"")
            }
            sb.append("];")
        }
        sb.append(" if (window.__fileforgeOnSharedFiles) { window.__fileforgeOnSharedFiles(); }")
        return sb.toString()
    }
}
