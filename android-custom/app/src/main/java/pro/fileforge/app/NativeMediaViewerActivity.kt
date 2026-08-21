package pro.fileforge.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.core.content.FileProvider
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.PlayerView
import androidx.media3.session.MediaSession
import java.io.File

/**
 * Native media surface used for files that should not depend on HTML media in
 * the WebView. The Web layer remains responsible for window/UI orchestration;
 * this Activity owns the decoder, surface, lifecycle and playback state.
 */
class NativeMediaViewerActivity : ComponentActivity() {
    companion object {
        const val EXTRA_REF = "ref"
        const val EXTRA_MIME = "mime"
        const val EXTRA_TITLE = "title"
        private const val PREFS = "native_media_viewer"
        private const val KEY_PREFIX = "position::"
    }

    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var playerView: PlayerView? = null
    private var ref: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ref = intent.getStringExtra(EXTRA_REF).orEmpty()
        if (ref.isBlank()) { finish(); return }

        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty()
        if (title.isNotBlank()) title.let { setTitle(it) }

        val root = FrameLayout(this)
        val view = PlayerView(this).apply {
            layoutParams = ViewGroup.LayoutParams(-1, -1)
            useController = true
            controllerShowTimeoutMs = 2500
            keepScreenOn = true
        }
        root.addView(view)
        setContentView(root)
        playerView = view

        val uri = resolveUri(ref)
        val restored = getSharedPreferences(PREFS, MODE_PRIVATE)
            .getLong(KEY_PREFIX + stableKey(ref), 0L)

        val exo = ExoPlayer.Builder(this).build().also { p ->
            p.setMediaItem(
                MediaItem.Builder()
                    .setUri(uri)
                    .setMediaMetadata(MediaMetadata.Builder().setTitle(title).build())
                    .build()
            )
            p.addListener(object : Player.Listener {
                override fun onPlaybackStateChanged(state: Int) {
                    if (state == Player.STATE_READY && restored > 0L) {
                        p.seekTo(restored.coerceAtMost(p.duration.takeIf { it > 0 } ?: restored))
                    }
                }
            })
            p.prepare()
            p.playWhenReady = true
        }
        player = exo
        view.player = exo
        mediaSession = MediaSession.Builder(this, exo).build()
    }

    override fun onPause() {
        super.onPause()
        savePosition()
    }

    override fun onDestroy() {
        savePosition()
        mediaSession?.release()
        mediaSession = null
        playerView?.player = null
        player?.release()
        player = null
        super.onDestroy()
    }

    private fun savePosition() {
        val p = player ?: return
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putLong(KEY_PREFIX + stableKey(ref), p.currentPosition.coerceAtLeast(0L))
            .apply()
    }

    private fun stableKey(value: String): String = value.hashCode().toString(16)

    private fun resolveUri(value: String): Uri {
        if (value.startsWith("content://", true) || value.startsWith("http://", true) || value.startsWith("https://", true)) {
            return Uri.parse(value)
        }
        val file = File(value)
        return FileProvider.getUriForFile(this, "${packageName}.fileprovider", file)
    }
}
