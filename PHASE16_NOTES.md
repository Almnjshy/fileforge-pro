# Phase 16 — Native Archive Jobs

## Goal

Bring archive extraction and ZIP creation into the same Native Job Protocol used by copy/move operations.

## Implemented

- `ArchiveEngine.OperationControl` provides cooperative cancel/pause control.
- Archive extraction now emits byte-level progress through `OperationProgress`.
- ZIP creation emits byte-level progress through `OperationProgress`.
- Progress contains processed bytes, total bytes, current path, and file counts for extraction.
- RAR output is wrapped by a progress-aware stream so JunRAR extraction contributes to real progress.
- ZIP/7Z/TAR/TAR.GZ/GZ/BZ2/XZ extraction uses chunked streaming with pause/cancel checkpoints.
- Archive path traversal validation remains enforced before writing entries.
- `archiveExtractAll` accepts `operationId` and publishes `fileOperationState`, `fileOperationProgress`, and `fileOperationError` events.
- `archiveCreate` accepts `operationId` and publishes the same Native Job Protocol events.
- TypeScript `FileOperationEngine` passes its operation ID to native archive jobs.
- Cancel/Pause/Resume now route to native jobs for `copy`, `move`, `extract`, and `compress`.
- Cancellation is reported as `cancelled`, not incorrectly converted into `failed` by the TypeScript layer.
- Existing archive APIs remain backward-compatible when no operation ID is supplied.

## Important behavior

Pause is cooperative and occurs at safe chunk boundaries. Cancel interrupts the stream at the next checkpoint. ZIP creation removes a partial target on failure/cancellation.

## Verification

The Kotlin sources were syntax-parsed with the local Kotlin compiler. Full Android compilation was not possible because the uploaded project still lacks the Android/third-party dependency classpath required for a complete Gradle build.
