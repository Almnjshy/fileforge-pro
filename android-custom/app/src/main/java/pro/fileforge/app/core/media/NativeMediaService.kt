package pro.fileforge.app.core.media

import android.content.Context
import android.media.MediaMetadataRetriever
import android.net.Uri

/** Native media metadata/source boundary. No media payload is copied through JS. */
class NativeMediaService(private val context: Context) {
    data class Metadata(
        val duration: Long, val width: Int?, val height: Int?, val rotation: Int?,
        val fps: Float?, val isVideo: Boolean, val bitrate: Long,
        val title: String?, val artist: String?, val album: String?, val genre: String?,
        val year: String?, val track: String?, val author: String?, val composer: String?,
        val mimeType: String?, val hasEmbeddedArtwork: Boolean
    )

    fun metadata(ref: String): Metadata {
        val r = MediaMetadataRetriever()
        return try {
            if (ref.startsWith("content://", true)) r.setDataSource(context, Uri.parse(ref))
            else r.setDataSource(ref)
            val width = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toIntOrNull()
            val height = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toIntOrNull()
            Metadata(
                duration = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L,
                width = width, height = height,
                rotation = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull(),
                fps = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CAPTURE_FRAMERATE)?.toFloatOrNull(),
                isVideo = width != null && height != null && width > 0 && height > 0,
                bitrate = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_BITRATE)?.toLongOrNull() ?: 0L,
                title = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE),
                artist = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST),
                album = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM),
                genre = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_GENRE),
                year = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_YEAR),
                track = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_CD_TRACK_NUMBER),
                author = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_AUTHOR),
                composer = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_COMPOSER),
                mimeType = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE),
                hasEmbeddedArtwork = r.embeddedPicture?.isNotEmpty() == true
            )
        } finally { r.release() }
    }
}
