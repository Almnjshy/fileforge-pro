# FileForge Pro — Native Core Refactor — Phase 12

Phase 12 hardens the large-file/binary viewer and the file-operation scheduler.

## Changes

### Binary / Hex pipeline

- HexViewer no longer calls the whole-file `readFileBase64()` path for native files.
- It requests only the currently visible chunk using `readFileChunk()`.
- SAF `content://` references use the unified chunk path as well.
- This prevents a multi-GB binary from being duplicated in JavaScript memory merely to display a small viewport.

### File operation scheduler

- Every operation now releases its concurrency slot on success, failure, or cancellation.
- Byte-oriented operations expose a measured throughput estimate based on real processed work and elapsed time.
- Existing operation IDs, cancellation flags, conflict handling and terminal states remain compatible.

## Verification

A TypeScript check was attempted with the repository tsconfig. The checkout does not contain installed JS dependencies, so the compiler cannot resolve React/Next/Zustand/Capacitor and related packages. No successful build is claimed.
