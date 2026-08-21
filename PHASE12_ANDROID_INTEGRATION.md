# FileForge Pro — Phase 12 Android Integration

## Objective

Make Android integration a first-class native boundary instead of relying on Web APIs or path-only assumptions.

## Implemented

### 1. External open (`ACTION_VIEW`)
- Accepts both absolute local paths and `content://` SAF references.
- Local files are exposed only through the app's non-exported `FileProvider`.
- SAF URIs remain URIs; they are never coerced into `java.io.File`.
- MIME resolution uses the explicit MIME hint, native metadata, `ContentResolver`, then extension fallback.
- Android Sharesheet-style chooser is used for the open target.
- FileForge's own `MainActivity` is excluded from the external-app chooser to prevent open-with loops.
- Missing handlers return a structured failure instead of silently launching an unrelated fallback.

### 2. Native sharing
- Added a dedicated `shareFiles` bridge.
- Supports one or many local paths and SAF URIs.
- Uses `ACTION_SEND` / `ACTION_SEND_MULTIPLE`.
- Uses `ClipData` plus URI grants so receiving applications can actually read the content URI.
- MIME type is inferred per item and becomes `*/*` for mixed sets.
- Android UI uses this path instead of constructing large JavaScript `File` objects.

### 3. SAF document picker
- Added `ACTION_OPEN_DOCUMENT` integration.
- Supports MIME filtering and multiple selection.
- Returns all selected URIs.
- Attempts to persist read permission when the provider exposes persistable permission.

### 4. SAF directory access
- Added the missing native `safRequestTreeUri` implementation.
- Uses `ACTION_OPEN_DOCUMENT_TREE` with read/write + persistable grants.
- Persists the selected tree URI through the existing SAF provider.
- Added explicit release and persisted-permission inspection APIs.

### 5. Incoming Android intents
- Removed the old ad-hoc JavaScript global injection path.
- `MainActivity` stores a small native intent envelope for `ACTION_VIEW`, `ACTION_SEND`, and `ACTION_SEND_MULTIPLE`.
- The React app consumes it through the typed native bridge.
- Incoming `content://` resources become ephemeral FileForge nodes; the URI remains the source of truth.
- No whole-file Base64 conversion is performed merely to receive a file.
- Cold-start and `singleTask`/`onNewIntent` are handled by the same path.

### 6. Storage-volume enumeration
- Android 11+ uses `StorageManager.storageVolumes` instead of deriving volume identity only from app-specific external directories.
- Reports volume path, label, removable/primary state, and StatFs capacity.
- Older Android versions retain a conservative external-directory fallback.

### 7. URI-aware UI boundary
- `Open With` now accepts both `/absolute/path` and `content://` references.
- Native sharing is used by the selection toolbar and context menu on Android.
- Browser sharing remains the browser-specific implementation.

## Security properties

- No exported `FileProvider`.
- No conversion of arbitrary `content://` values into filesystem paths.
- Local external sharing always uses `FileProvider`.
- URI grants are attached to outgoing intents.
- Incoming intent data is validated by native metadata before becoming a UI node.
- Incoming URI state is consumed and cleared after the bridge reads it.

## Verification performed

- Modified TypeScript files were syntax-balanced and checked with the system TypeScript compiler.
- Full TypeScript verification could not run because the artifact intentionally does not contain `node_modules`; the resulting diagnostics are dependency-resolution errors plus pre-existing project diagnostics, not a clean production verification.
- Android compilation must be verified by the project's GitHub Actions environment, which provisions the Capacitor Android project and Android SDK.

## Explicit boundary

This phase makes Android/SAF/open/share/intent integration correct and typed. It does not pretend that a local `ArchiveEngine` automatically supports arbitrary SAF archives; archive-provider SAF support remains a separate native archive concern and must not be hidden behind path heuristics.
