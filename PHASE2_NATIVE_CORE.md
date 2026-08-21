# FileForge Pro — Phase 2 Native Core — Implementation Pass

## Objective
Make Local filesystem paths and Android SAF `content://` references first-class storage resources behind one native provider contract, with no provider-specific fallback hidden inside the application core.

## Implemented in this pass

### 1. Strong reference routing
- `StorageReference` distinguishes `Local(File)`, `Saf(Uri)`, and internal `PendingSaf` operation targets.
- `UnifiedStorageService` parses the raw reference once and routes it to the owning provider.
- Archive/storage callers no longer need to decide whether a reference is a filesystem path or SAF URI.

### 2. Provider capabilities are explicit
`StorageProvider` now exposes: metadata/list, CRUD, streaming input/output, bounded text access, bounded chunk access, random-access capability detection, and seekable read channels.

A provider that cannot offer random access does **not** silently fall back to scanning from byte zero. It reports an unsupported capability. This is deliberate: callers that require random access (7z, PDF range reads, etc.) must know that the provider cannot satisfy the contract.

### 3. Local provider
`DirectStorageProvider` owns local filesystem mechanics, including bounded `RandomAccessFile` chunk reads/writes and read-only seekable channels.

### 4. SAF provider
`SafStorageProvider` owns `ContentResolver`/`DocumentFile` mechanics. Random-access reads/writes use provider-owned file descriptors when the SAF provider exposes a seekable descriptor. Non-seekable providers fail explicitly instead of materializing the file or repeatedly skipping from byte zero.

### 5. Capacitor boundary cleanup
The legacy `saf*` plugin methods keep their existing public method names/response shapes but route storage operations through `UnifiedStorageService`. The plugin remains an adapter rather than a second SAF storage implementation. Tree-URI persistence remains in `SafFileProvider` because it is permission/state management rather than file I/O.

`readFileChunk` now also routes through the unified storage contract and accepts SAF references.

### 6. Transaction boundaries
Local and SAF chunked writes remain provider-scoped. A Local staging reference cannot be committed to a SAF target or vice versa.

## Important semantic decision
There is intentionally **no hidden SAF fallback** from random access to `InputStream.skip(offset)`. That pattern is bounded in memory but can become O(offset) and produces unpredictable performance on large documents. Random-access consumers must use a provider that explicitly supports random access.

## Explicitly not claimed
- Full Android compilation in this environment: NOT VERIFIED because the uploaded checkout does not contain `gradle-wrapper.jar` and the environment cannot resolve dependencies without network access.
- Physical-device SAF compatibility across every OEM/document provider.
- Process-death recovery for arbitrary SAF providers.
- Remote/cloud providers.

## Phase 2 acceptance gate
The implementation is structurally complete. Before declaring the phase production-verified, CI/device testing must confirm:
1. TypeScript typecheck.
2. Static Next build.
3. Android Kotlin compile.
4. Local CRUD.
5. SAF root CRUD.
6. Nested SAF CRUD.
7. Cross-provider transaction rejection.
8. Bounded local/SAF chunk reads and writes.
9. Seekable SAF provider success and non-seekable provider explicit rejection.
10. Existing Capacitor method names and response fields remain compatible.
