# FileForge Pro — Phase 0 + Phase 1 Engineering Audit

## Scope
This audit covers the latest delivered native-core snapshot and is intentionally
static: it distinguishes code evidence from device/runtime verification.

## Phase 0 — Baseline

### Build state
- TypeScript and Android build failures reported by CI immediately before this
  snapshot were addressed in the delivered snapshot.
- The Android tree uses a custom Capacitor platform under `android-custom/`.
- Gradle wrapper JAR is intentionally absent; CI supplies Gradle 8.9.
- Local container verification cannot execute the Android build because Android
  SDK/Gradle are not installed in this environment.

### Architecture strengths
- React/TypeScript remains the presentation layer.
- Native filesystem/media/operation services already exist under `android-custom/app/src/main/java/.../core`.
- `NativeFileMetadata` is a single native metadata DTO.
- A unified storage facade already exists for direct paths and SAF URIs.
- Copy/move operations have native progress, cancellation and journaling.
- SAF support is already implemented rather than merely stubbed.

### Important weaknesses still present
- `FileForgeFileAccessPlugin` remains very large and still contains legacy
  filesystem/media algorithms alongside the newer core services.
- `StorageProvider` is still File-centric, so SAF is not yet a first-class
  implementation of the same Kotlin contract.
- Some legacy APIs still use direct `java.io.File` semantics and bounded
  in-memory payloads.
- Search, archive, thumbnail and media code are not yet completely isolated
  behind the core contracts.
- True resume is limited to selected local copy/move cases.
- Runtime/device verification is still required for SAF providers, removable
  storage, process death, very large files, and all media types.

## Phase 1 — Native Storage Core

### Completed in this snapshot
1. Hardened child-name validation against path separators and `.`/`..`.
2. Added stronger source/target identity checks to copy/move.
3. Prevented invalid target type replacement during native copy/move.
4. Made text writes use a completed temporary file before final commit.
5. Routed legacy list/create/delete/rename/metadata plugin methods through the
   unified storage facade.
6. Added a storage-reference resolver that preserves `content://` URIs and never
   coerces them into `java.io.File`.
7. Preserved backward-compatible Capacitor method names and response fields.

### Phase 1 contract
The native boundary is now:

`React/TypeScript -> Capacitor adapter -> UnifiedStorageService -> provider`

The adapter should validate/serialize only. Recursive filesystem mechanics must
stay in the core services.

## What is NOT claimed as complete
- Full SAF parity for every operation.
- Production-grade background execution for arbitrarily long jobs.
- Device-tested removable SD/USB behavior.
- Complete removal of legacy filesystem algorithms from the plugin.
- Full large-file streaming editor.
- SQLite/FTS search.
- Final media/thumbnail architecture.

## Exit criteria for Phase 1
- All CRUD operations use the unified native storage boundary.
- Direct paths and SAF references are never mixed as `File` objects.
- Copy/move/delete/rename behavior has deterministic conflict semantics.
- No path traversal through child names.
- TypeScript does not implement Android filesystem mechanics for native storage.
- CI must pass typecheck, static build, Android compile and tests before Phase 2.
