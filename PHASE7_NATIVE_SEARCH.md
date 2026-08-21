# FileForge Pro — Phase 7: Native Search Engine

## Scope

Phase 7 replaces the previous JavaScript-side filtering/search orchestration with a bounded, recursive native Android search engine.

## Native responsibilities

- Recursive traversal of real local storage.
- Recursive traversal of SAF `content://` trees.
- Filename substring matching.
- Type/kind filtering: image, video, audio, PDF, text, code, archive, APK, Word, Excel, presentation and folders.
- Size range filtering.
- Modification-time filtering.
- Hidden-file policy.
- Directory inclusion policy.
- Cancellation through coroutine cancellation.
- Result limiting (1–5000).
- Symlink/canonical-directory loop protection for local storage.
- Native metadata extraction.

## Bridge contract

JavaScript receives only a bounded result array plus `scanned` and `truncated` metadata. It never receives the complete directory tree for a recursive search.

## UI changes

`SearchPanel` sends its type, size and date filters directly to native. The JS layer now maps only the bounded native result set to `FileNode` presentation models. A `+` indicator is shown when the native result limit was reached.

## Deliberate non-goals

- No JavaScript scan of thousands of Android files.
- No arbitrary 100MB/200MB tree materialization.
- No fake indexing database before measuring real workload.
- No silent max-scan cutoff that would make a search incomplete.

## Next phase

Phase 8 should build the production thumbnail pipeline on top of the existing native decoder/cache, including disk-cache lifecycle, PDF/audio/archive thumbnails where appropriate, request cancellation, memory pressure handling, and UI virtualization integration.
