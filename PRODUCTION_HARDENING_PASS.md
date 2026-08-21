# FileForge Pro — Production Hardening Pass

## Scope
This pass replaces the native archive source path with a storage-reference based implementation.

### Implemented
- Archive UI no longer decides native support from `/`-prefixed strings.
- Native archive calls resolve through `resolveStorageRef`, preserving `content://` SAF references.
- Added `StorageArchiveEngine` using `UnifiedStorageService`.
- ZIP/RAR/TAR/TAR.GZ/GZ/BZ2/XZ consume storage streams directly.
- 7z consumes a read-only seekable channel backed by `UnifiedStorageService.readChunk`; SAF providers that cannot seek are rejected explicitly rather than materializing the archive.
- Added Zip4j 2.11.5 for stream-based ZIP decryption, including standard and AES password handling.
- Archive entry reads use native open/read-chunk/close sessions; no whole-entry Base64 bridge operation remains.
- Entry extraction uses the existing atomic chunked-write mechanism and preserves Zip-Slip path sanitization.
- SAF extraction targets are represented by real SAF references rather than string-concatenated `content://` paths.
- Existing create-directory bridge now returns the created reference to callers.

## Verification
- `scripts/production-audit.mjs`: PASS.
- TypeScript parser/typecheck was invoked, but dependency installation was intentionally not performed. Reported errors are dominated by missing `node_modules`; no new syntax error was reported in the modified archive files.
- Android/Kotlin compilation was not possible because the environment has no Gradle executable/dependency cache. No claim of Android build success is made.

## Explicit non-claims
This ZIP is not labeled Production Ready until Android compilation/runtime tests are executed.
The viewer still materializes bounded entries up to 4 MiB for the existing synthetic viewer model; this is a bounded compatibility path, not a claim of end-to-end viewer streaming. A future viewer-native URI/range integration is required to remove that final UI-level materialization.
