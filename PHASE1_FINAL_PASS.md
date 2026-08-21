# Phase 1 Final Pass — Archive/Storage

This pass removes the legacy archive-entry memory/temp-file path from the native ArchiveEngine and makes single-entry extraction return the actual destination StorageReference.

## Completed in this pass

- Removed the legacy `ArchiveEngine.readEntryBytes(File, ...)` implementation, including its temporary archive-entry file.
- Renamed the UI/provider operation to `readEntryPreview` to make its bounded-memory contract explicit.
- Native inline preview is limited to 4 MiB and is assembled only from bounded native chunks; larger entries are not loaded into the JS heap and are directed to extraction.
- Native single-entry extraction now accepts a destination directory and returns the actual created/existing child StorageReference. This is required for SAF because concatenating a filename onto a `content://` URI is not a valid reference.
- Web ZIP entry enumeration no longer uses an async `forEach` whose returned promises were ignored.
- Web inline entry preview has the same 4 MiB output bound.
- No `ff-archive-*` temporary file path remains in the native archive-entry implementation.

## Verification performed

- Source brace/parenthesis balance checks passed for all modified TypeScript/Kotlin files.
- No source call site for the removed native `readEntryBytes` remains.
- No `ff-archive-*` temporary archive-entry implementation remains.
- No archive-specific `/` path gate remains in ContextMenu/ArchiveBrowser.

## Not claimed here

Android compilation, dependency resolution, instrumentation tests, and physical Android runtime tests were not executed in this environment because the required dependency caches/tooling are unavailable. Those remain NOT VERIFIED rather than PASS.
