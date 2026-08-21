# FileForge Pro — Native Core Architecture

## Goal

Keep the existing React/TypeScript experience while moving filesystem, media and
heavy processing out of the JavaScript runtime. TypeScript is a presentation
layer; Kotlin owns Android platform work and application infrastructure.

## Boundaries

```text
React / TypeScript UI
        |
        | thin Capacitor adapter
        v
Application / Domain
        |
        +--> StorageProvider
        |      +--> NativeStorageService
        |      +--> SAF provider (existing)
        |      +--> Remote providers (existing)
        |
        +--> NativeFileOperationService
        |
        +--> ArchiveEngine
        |
        +--> NativeMediaService
        |
        +--> future ThumbnailEngine / PDF engine
```

### Rules

1. UI code must not perform filesystem I/O directly.
2. Capacitor plugins adapt requests/results; they do not contain business
   logic or recursive filesystem algorithms.
3. Large files must use streams/chunks. Base64 is only a compatibility path
   for bounded payloads.
4. Every long-running operation must be cancellable and report real progress.
5. Storage implementations are interchangeable behind `StorageProvider`.
6. Domain state must not retain Android `File`, `Bitmap`, `MediaPlayer`, or
   WebView instances.
7. New native functionality belongs in `core/` first and is exposed through
   the bridge only after its contract is stable.

## Current migration

The first extraction introduces:

- `core/model/NativeFileMetadata`
- `core/storage/StorageProvider`
- `core/storage/NativeStorageService`
- `core/operations/NativeFileOperationService`
- `core/media/NativeMediaService`

`FileForgeFileAccessPlugin` now delegates core CRUD/list/copy/move operations to
these services instead of implementing their filesystem mechanics itself.

## Next migrations

1. Move thumbnail decoding to a dedicated native thumbnail engine.
2. Move Media3 player/session lifecycle behind a native media facade.
3. Move archive progress/cancellation behind the operation engine.
4. Add a true chunked document API for the large text editor.
5. Make SAF a `StorageProvider` implementation rather than a parallel API.
6. Split the remaining legacy plugin methods until the Capacitor class is only
   validation, permission callbacks, event forwarding and serialization.
