# FileForge Pro — Phase 25 Integration Audit

## Scope
Audit of the Phase 24 tree after Phases 1–24. No feature rewrite was performed in this audit.

## Executive verdict
**Architecture: improving, but not production-ready yet.**
The Native Core has real implementation for storage, media, thumbnails, archives, operations, journaling and recovery. However, several legacy Web/JS paths still bypass the Native Core, and the delivered Phase 24 ZIP had an incorrect nested project layout (`src/src`).

## Critical findings

### P0 — Native archive extraction is still path-gated in the long-press context menu
`ContextMenu.tsx` only calls the native archive path when `parentPath.startsWith("/")`. SAF/content URIs therefore fall through to the web/download path. This directly explains why “Extract Here” can still fail for SAF-backed archives.

**Required fix:** make archive operations address resources through the unified storage reference layer rather than checking for `/` in UI code. Native archive APIs must accept Local paths and SAF `content://` references, or the UI must explicitly report unsupported SAF extraction instead of silently falling back.

### P0 — Legacy Base64 data paths remain in hot paths
Direct `readFileBase64()` usage remains in `FilePreview`, `PdfViewer`, `file-operation-engine`, and `file-repository`. The Kotlin plugin also contains multiple Base64 read/write paths.

**Required fix:** classify each Base64 path. Media/image/PDF/archive data should use URI/stream/chunk APIs. Keep Base64 only for small bounded payloads where unavoidable.

### P0 — Phase 24 delivery archive is structurally wrong
The supplied Phase 24 ZIP contains a wrapper `src/` directory and the actual project under `src/src/`. This is not a valid drop-in project root.

**Required fix:** final artifacts must contain `package.json`, `src/`, `android-custom/`, `.github/`, etc. directly at the ZIP root.

## High findings

### P1 — Archive stack is split between Native and Web implementations
Native Android supports ZIP/RAR/7Z/TAR/GZ/BZ2/XZ through `ArchiveEngine`, while the web provider intentionally supports ZIP through JSZip only. This is acceptable for browser limitations, but the boundary must remain explicit and never leak into the Android UX.

### P1 — Archive entry reads still use Base64
`archiveReadEntry` returns entry contents as Base64. Large files opened from an archive can therefore reintroduce large memory spikes.

**Required fix:** add a bounded stream/chunk API for archive entry viewers.

### P1 — Media architecture is partially duplicated
Native Media3 surface support exists, but `FilePreview` still contains HTML `<video>/<audio>` paths and Base64 fallbacks. This is useful as fallback, but the selection policy should be centralized in a Viewer/Media strategy instead of component-level branching.

### P1 — Floating windows have one state authority, but persistence is still localStorage-based
The old `window-store` reference is gone and `useFileForge` is the main state store. Window persistence exists with versioning and validation. However, process-death persistence is still Web storage rather than a native durable state store.

**Required fix:** persist only durable window metadata natively or through a single persistence abstraction; restore only validated windows whose referenced resources still exist.

### P1 — Native plugin remains very large
`FileForgeFileAccessPlugin.kt` is still about 2,524 lines. The new Native Core has reduced responsibilities conceptually, but the plugin remains a large bridge/orchestration layer.

**Required fix:** move archive, operation, media, storage and recovery registration/dispatch into dedicated plugin-facing adapters and leave the Capacitor plugin as a thin bridge.

## Medium findings

- There are 9 phase note files in the project root; they are useful history but should eventually move under `docs/architecture/history/`.
- The project has only one test file and no visible native unit/instrumentation test suite covering ArchiveEngine, RecoveryDecisionEngine, OperationWorkspace, or NativeFileOperationService.
- `OpenAsDialog` is now present and wired from `FileBrowser`/`ContextMenu`, which closes an earlier gap.
- `windowTabs` no longer appears in the current source search, so the earlier dead-state concern appears resolved.
- CI intentionally creates a fresh Capacitor `android/` directory and copies `android-custom` into it. This means `android-custom` is not intended to build standalone; documentation should state that clearly.
- The npm `android:build` script depends on `cap:sync` to create `android/`, so its apparent missing `android/` directory is not itself a CI defect.

## Architecture that should be the target

```text
React / TypeScript UI
        |
        | thin typed bridge
        v
Application Core
  - FileRepository
  - FileOperationEngine
  - ViewerStrategy
  - WindowManager
        |
        v
Native Platform Services
  - UnifiedStorage
  - NativeFileOperations
  - ArchiveEngine
  - Media3
  - ThumbnailEngine
  - Recovery/Journal
        |
        v
Android OS / Filesystem / SAF / Decoders
```

## Recommended next order

1. Fix SAF archive extraction and remove UI path heuristics.
2. Eliminate large Base64 hot paths.
3. Split `FileForgeFileAccessPlugin.kt` into thin adapters.
4. Add native unit tests for storage/operations/archive/recovery.
5. Add integration tests for long-press Extract Here, floating-window navigation, media playback, PDF, and process-death recovery.
6. Run full GitHub CI and inspect APK on Android 15.
7. Profile memory/CPU while opening large folders, thumbnails, archives, media and text files.
8. Only after that, remove remaining legacy implementations.

## Build verification status
A complete production build was **not claimed** during this audit. The supplied artifact does not contain `node_modules`, and `android-custom/gradle/wrapper/gradle-wrapper.jar` is absent by design in the custom source tree; CI creates the Capacitor Android platform and supplies the generated wrapper environment. Full verification therefore belongs in GitHub Actions.
