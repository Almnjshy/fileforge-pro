# FileForge Pro — Phase 8 Native Thumbnail Engine

## Goals
- One native thumbnail pipeline for images, video, audio artwork, PDFs, and ZIP archive previews.
- Bounded memory usage: decode at thumbnail resolution; never return original media to JS.
- Persistent disk cache across process restarts with deterministic invalidation by source metadata, type, and requested size.
- Atomic cache publication so partial JPEGs are never served.
- Native background generation remains behind the Capacitor adapter.
- JS memory cache provides fast reuse and request deduplication; concurrent native generation is capped.
- Failed generation gets a short retry cooldown instead of a permanent poison state.

## Providers
- Local absolute paths are decoded directly.
- SAF `content://` references are decoded through `ContentResolver`.
- Image EXIF orientation is normalized.
- Video frame is sampled near 10% of duration.
- Audio embedded artwork is decoded when available.
- PDF page 1 is rendered with `PdfRenderer`.
- ZIP archive preview probes the first safe image entry within bounded limits. Other archive formats keep their normal archive icon unless a future archive preview adapter provides a streamable entry source.

## Cache
- Native disk cache: bounded to ~75 MiB and evicts least-recently-used files by access timestamp.
- Cache keys include source identity/version, MIME, kind, size, and pipeline version.
- Staging writes are renamed/copy-committed atomically before becoming visible.
- JavaScript memory cache includes kind and size to prevent returning a thumbnail generated at the wrong resolution.

## Reliability
- Native decode failures are isolated per request.
- Out-of-memory during decode returns a controlled failure rather than crashing the app.
- UI-side retries are allowed after a short cooldown.
- SAF thumbnails do not depend on converting a `content://` URI into a filesystem path.


## Phase 8 correction — adaptive cache policy

The earlier fixed `200 entries / 8 MiB` JavaScript memory ceiling was removed. It was an implementation shortcut, not an appropriate production policy for large directories. The memory cache is now a weighted adaptive working-set cache with no fixed item-count ceiling; its budget is derived from the device-memory hint and is only a RAM working-set budget. Persistent thumbnails remain in the native application cache and use a storage-aware soft quota rather than a small fixed byte limit. Large directories therefore scale through virtualization + request scheduling + durable disk cache instead of attempting to keep every thumbnail in RAM.
