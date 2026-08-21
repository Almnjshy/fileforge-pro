# FileForge Pro Refactor Status

Phases 1-16 remain preserved from the previous snapshot.

## Phase 17 — Operation Center

Implemented:
- Native progress event throttling/coalescing.
- Terminal event flushing and finished timestamps.
- Byte-based progress for native archive extraction/compression/copy/move.
- Operation Center UI with active/finished summary, speed, ETA and current path.
- Queue cancellation correctness and slot recovery.
- Cleanup of native event timers when operations are removed.

Next:
- Full build/CI verification with the project's complete Android and Node dependency environment.
- End-to-end device testing of archive, SAF, large-file and multi-window operations.


## Phase 19 — True Local Copy/Move Resume
- Added durable native checkpoints for single-file local copy/move.
- Added safe RandomAccessFile resume from verified destination length.
- Added recovery/resume Capacitor bridge APIs.
- SAF, directories, and archives remain retry/recovery based until provider-specific manifests are implemented.

## Phase 20 — Archive Job Persistence
- Archive extraction and compression now participate in NativeOperationJournal.
- Interrupted archive jobs are recoverable as interrupted jobs rather than disappearing.
- Successful/cancelled/failed archive jobs update or clear journal state correctly.
- Archive true-resume remains intentionally unsupported until format-specific checkpoints and atomic manifests are implemented.

## Phase 22
- Atomic local destination replacement hardened with backup/restore semantics.
- Orphan `.fileforge-work` cleanup added with conservative retention.
- Operation journal records source size/mtime for stronger future resume validation.

## Phase 28
- Native PDF viewer uses PDFDataRangeTransport and bounded native range reads.
- Native PDF no longer calls readFileBase64() from PdfViewer.
- SAF range reads prefer seekable ParcelFileDescriptor and fall back safely.
