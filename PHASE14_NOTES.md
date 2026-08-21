# FileForge Pro — Phase 14

## Operation Center / Scheduler hardening

Implemented:
- Explicit pending/running/paused/completed/failed/cancelled lifecycle.
- Cooperative pause/resume for file-level operation boundaries.
- Cancellation for queued/pending jobs.
- Real byte-based throughput and ETA for copy/move/compress/extract where byte progress is available.
- Current path and file counters surfaced to the UI.
- Operations Panel now shows pause/resume, cancel, speed, ETA, current path, and correct units.
- Queued jobs remain pending until a concurrency slot is actually acquired.
- Finished-operation cleanup helpers.

Important limitation:
- A currently executing native byte-stream transfer is not forcibly suspended mid-write; pause takes effect at the next safe operation boundary. This avoids unsafe partial-file interruption. A future native job protocol can add true chunk-level pause if required.
