# FileForge Pro — Phase 19: True Local Copy/Move Resume

## Goal
Turn the Phase 18 recovery journal into a real resumable checkpoint for a narrow, safe class of operations: **single-file local copy/move**.

## Implemented

- NativeOperationJournal now persists source, target, resumable flag, status, byte checkpoint and timestamps.
- NativeFileOperationService adds `resumeSingleFileCopy()` using RandomAccessFile.
- Resume validates that the source is a single file and that the existing destination length is between 0 and the source length.
- The destination length is treated as the durable checkpoint; the source is seeked to that offset and the destination is appended from that exact byte.
- Destination length is verified after completion and the file descriptor is synced before success is reported.
- Move resume performs the same copy checkpoint and deletes the source only after the resumed copy reaches the full source length.
- Capacitor exposes `getRecoveredFileOperations` and `resumeRecoveredFileOperation`.
- TypeScript bridge exposes `resumeRecoveredNativeFileOperation()`.
- Normal local copy/move operations now journal their source/target and update byte checkpoints during execution.

## Deliberate scope

This phase does **not** claim resumable directories, SAF copies, archives, or compressed streams. Those require provider-specific checkpoints and, for archives, entry-level manifests. They remain recovery/retry based rather than falsely claiming byte-perfect resume.

## Safety

A resume is rejected if:
- the operation is not marked resumable;
- the journal status is not `interrupted`;
- the operation is not a local single-file copy/move;
- the source no longer exists as a regular file;
- the destination is larger than the source.

No source deletion occurs until a resumed move has fully completed.

## Verification

- ZIP integrity checked after packaging.
- TypeScript syntax/type invocation reached existing project errors (`getFileForgePlugin` is unresolved in the supplied bridge source); no new parser error was produced by the Phase 19 additions.
- Full Android build was not claimed because the supplied project still lacks `gradle-wrapper.jar` and the Android dependency cache.
