package pro.fileforge.app.media

import android.app.Activity
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.media3.session.MediaSession
import android.webkit.WebView
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import androidx.core.content.FileProvider

/**
 * Hosts Media3 PlayerViews directly above the Capacitor WebView.
 * The Web/React layer owns window geometry; this manager owns decoder/surface
 * lifetime. Coordinates arrive in WebView CSS pixels and are converted to
 * Android view pixels using the WebView density and location.
 */
class NativeMediaSurfaceManager(
    private val activity: Activity,
    private val webView: WebView?
) {
    private data class Surface(
        val id: String,
        val player: ExoPlayer,
        val view: PlayerView,
        val session: MediaSession,
        val ref: String,
        val prefsKey: String
    )

    private val main = Handler(Looper.getMainLooper())
    private val surfaces = ConcurrentHashMap<String, Surface>()
    private var overlay: FrameLayout? = null
    private var hostParent: ViewGroup? = null

    fun attach() {
        main.post {
            val wv = webView ?: return@post
            val parent = wv.parent as? ViewGroup ?: return@post
            hostParent = parent
            val layer = FrameLayout(activity).apply {
                layoutParams = ViewGroup.LayoutParams(-1, -1)
                clipChildren = false
                clipToPadding = false
                isClickable = false
                isFocusable = false
                elevation = 1000f
            }
            parent.addView(layer)
            overlay = layer
        }
    }

    fun createOrUpdate(
        id: String,
        ref: String,
        mime: String?,
        title: String?,
        leftCss: Float,
        topCss: Float,
        widthCss: Float,
        heightCss: Float,
        visible: Boolean
    ) {
        main.post {
            val layer = overlay ?: return@post
            var surface = surfaces[id]
            if (surface == null || surface.ref != ref) {
                surface?.let { releaseSurface(it) }
                surface = createSurface(id, ref, mime, title) ?: return@post
                surfaces[id] = surface
                layer.addView(surface.view)
            }
            layoutSurface(surface.view, leftCss, topCss, widthCss, heightCss, visible)
        }
    }

    fun update(
        id: String,
        leftCss: Float,
        topCss: Float,
        widthCss: Float,
        heightCss: Float,
        visible: Boolean
    ) {
        main.post {
            val s = surfaces[id] ?: return@post
            layoutSurface(s.view, leftCss, topCss, widthCss, heightCss, visible)
        }
    }

    fun setVisibility(id: String, visible: Boolean) {
        main.post { surfaces[id]?.view?.visibility = if (visible) View.VISIBLE else View.GONE }
    }

    fun destroy(id: String) {
        main.post {
            val s = surfaces.remove(id) ?: return@post
            releaseSurface(s)
        }
    }

    fun release() {
        main.post {
            surfaces.values.toList().forEach(::releaseSurface)
            surfaces.clear()
            overlay?.let { layer ->
                (layer.parent as? ViewGroup)?.removeView(layer)
            }
            overlay = null
            hostParent = null
        }
    }

    private fun createSurface(id: String, ref: String, mime: String?, title: String?): Surface? {
        return try {
            val uri = resolveUri(ref)
            val prefsKey = "position::${stableKey(ref)}"
            val restored = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getLong(prefsKey, 0L)
            val player = ExoPlayer.Builder(activity).build()
            val metadata = MediaMetadata.Builder().setTitle(title ?: "").build()
            player.setMediaItem(MediaItem.Builder().setUri(uri).setMediaMetadata(metadata).build())
            player.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY && restored > 0L) {
                        val duration = player.duration
                        val safe = if (duration > 0) restored.coerceAtMost(duration) else restored
                        player.seekTo(safe)
                    }
                }
            })
            player.prepare()
            player.playWhenReady = true
            val view = PlayerView(activity).apply {
                this.player = player
                useController = true
                controllerShowTimeoutMs = 2500
                keepScreenOn = true
                setBackgroundColor(android.graphics.Color.BLACK)
            }
            val session = MediaSession.Builder(activity, player).build()
            Surface(id, player, view, session, ref, prefsKey)
        } catch (_: Exception) {
            null
        }
    }

    private fun layoutSurface(view: View, leftCss: Float, topCss: Float, widthCss: Float, heightCss: Float, visible: Boolean) {
        val wv = webView ?: return
        val layer = overlay ?: return
        val density = wv.resources.displayMetrics.density
        val webLoc = IntArray(2)
        wv.getLocationInWindow(webLoc)
        val layerLoc = IntArray(2)
        layer.getLocationInWindow(layerLoc)
        val x = ((leftCss * density) + webLoc[0] - layerLoc[0]).toInt()
        val y = ((topCss * density) + webLoc[1] - layerLoc[1]).toInt()
        val w = (widthCss * density).toInt().coerceAtLeast(1)
        val h = (heightCss * density).toInt().coerceAtLeast(1)
        view.layoutParams = FrameLayout.LayoutParams(w, h).apply {
            leftMargin = x
            topMargin = y
        }
        view.visibility = if (visible) View.VISIBLE else View.GONE
        view.bringToFront()
    }

    private fun releaseSurface(surface: Surface) {
        val position = surface.player.currentPosition.coerceAtLeast(0L)
        activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putLong(surface.prefsKey, position).apply()
        surface.session.release()
        surface.view.player = null
        surface.player.release()
        (surface.view.parent as? ViewGroup)?.removeView(surface.view)
    }

    private fun resolveUri(value: String): Uri {
        if (value.startsWith("content://", true) || value.startsWith("http://", true) || value.startsWith("https://", true)) return Uri.parse(value)
        val file = File(value)
        return FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
    }

    private fun stableKey(value: String): String = value.hashCode().toString(16)

    companion object {
        private const val PREFS = "native_media_surface"
    }
}
