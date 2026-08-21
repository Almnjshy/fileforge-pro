# Phase 9 — FileForgeFileAccessPlugin Architectural Decomposition

## Objective

Reduce `FileForgeFileAccessPlugin.kt` from a monolithic implementation into a thin Capacitor adapter while preserving the existing JavaScript/Capacitor API surface.

## Result

`FileForgeFileAccessPlugin.kt` is now an entry-point adapter only. It:

- declares the Capacitor plugin and permissions;
- owns the bridge runtime lifecycle;
- constructs domain-specific bridge adapters;
- exposes the existing annotated Capacitor methods as one-line delegations;
- shuts down native bridge state when the plugin is destroyed.

The implementation has been separated into:

- `FileForgeStorageBridge.kt` — local/unified storage operations;
- `FileForgeSafBridge.kt` — Storage Access Framework operations;
- `FileForgeArchiveBridge.kt` — archive list/extract/session APIs;
- `FileForgeMediaBridge.kt` — native media surfaces, streams, metadata and thumbnails;
- `FileForgeOperationsBridge.kt` — copy/move/delete operation control and recovery;
- `FileForgeSearchBridge.kt` — native search and cancellation;
- `FileForgeIntentBridge.kt` — Android open/share/document/incoming-intent integration;
- `FileForgePermissionsBridge.kt` — permission request/check flows;
- `FileForgePluginBridgeRuntime.kt` — shared adapter runtime, service instances, lifecycle state, path/reference resolution and Capacitor callback plumbing.

## Architectural boundary

```text
Capacitor JS
    |
    v
FileForgeFileAccessPlugin
    |
    +-- StorageBridge ------> UnifiedStorageService / NativeStorageService
    +-- SAFBridge ----------> UnifiedStorageService / SAF provider
    +-- ArchiveBridge ------> StorageArchiveEngine
    +-- MediaBridge --------> NativeMediaService / NativeThumbnailService
    +-- OperationsBridge ---> NativeOperationEngine / Journal / Recovery
    +-- SearchBridge -------> NativeSearchService
    +-- IntentBridge -------> Android intents / FileProvider / SAF
    +-- PermissionsBridge --> Android permission APIs
    |
    v
FileForgePluginBridgeRuntime
    (shared lifecycle + adapter plumbing only)
```

The Capacitor plugin is no longer the location where storage/archive/media/operations/search/recovery/intent business logic is implemented.

## API compatibility check

The original plugin contained **91 annotated Capacitor entry points** (`@PluginMethod`, `@ActivityCallback`, `@PermissionCallback`).

The refactored plugin contains the same **91 annotated entry points** with the same method names. A structural comparison was performed against the original source:

- missing methods: 0
- extra annotated methods: 0
- duplicate annotated methods: 0

## Lifecycle hardening

The shared runtime now cancels active native search jobs, clears operation controls, closes archive entry sessions, and cancels its IO coroutine scope during plugin destruction.

## What was deliberately not changed

- No JavaScript API names were renamed.
- No Capacitor plugin name was changed.
- No core storage provider was rewritten.
- No archive engine was rewritten as part of this decomposition.
- No new product feature was introduced.
- No silent fallback was added to conceal failures.

## Verification status

### Completed in this environment

- Source extraction and structural refactor completed.
- Original vs new annotated Capacitor API surface compared: **91/91 preserved**.
- Duplicate annotated API names checked: **none**.
- Capacitor annotations checked to remain in the plugin entry point rather than the bridge adapters.
- `FileForgeFileAccessPlugin.kt` reduced to a thin adapter/lifecycle class.
- SAF was separated from general storage adapter code.

### Not claimed

An Android/Kotlin compilation was **not** claimed as successful. The supplied project checkout does not contain `gradle/wrapper/gradle-wrapper.jar`, so `./gradlew :app:compileDebugKotlin` cannot execute in this environment. No dependency download was performed to manufacture a build result.

Therefore this phase is **implemented but build-verification pending**, not falsely marked as build-passing.
