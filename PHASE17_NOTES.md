# FileForge Pro — Phase 17

## Operation Center + Native progress integration

- Unified native operation events are now coalesced at ~100ms per operation to prevent React re-render storms from 64 KiB stream progress events.
- Terminal native events flush immediately and set `finishedAt`.
- Native byte totals switch the operation progress basis to `bytes`, including archive extraction, so extraction no longer compares bytes processed against an entry-count placeholder.
- Operation UI now displays a real operation center header, active/finished counts, speed, ETA and current path.
- Pending cancellation is safe: queued cancelled jobs no longer consume concurrency slots, and the scheduler skips multiple cancelled jobs without stalling the queue.
- Native operation update timers are cleaned when an operation is removed.

## Verification

- Source-level checks performed on modified TypeScript/Kotlin integration points.
- Full Android/Next build is not claimed because the supplied project snapshot does not include the full dependency/build environment.
