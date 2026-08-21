# Phase 18 — Recovery, Persistence & Crash Safety

## Implemented
- Added a browser-side operation journal for active/pending/paused jobs.
- On startup, jobs that were active before process death are converted into explicit recovered records; the UI does not claim they resumed.
- Added native `NativeOperationJournal` backed by SharedPreferences.
- Native jobs are journaled before execution and removed only on terminal completion/cancellation/failure.
- Added `getRecoveredFileOperations` to expose interrupted native jobs.
- Window persistence upgraded to v2 with schema/version envelope, timestamp, geometry validation, and legacy v1 migration.
- Persisted windows never restore as minimized and invalid geometry is rejected.

## Recovery contract
A process death cannot safely resume an arbitrary filesystem operation merely from UI state. Phase 18 therefore guarantees:
1. The interrupted job is detectable after restart.
2. It is never falsely reported as completed.
3. The native journal survives process recreation.
4. The UI receives a recoverable/failed record.
5. Window state is restored defensively.

Automatic byte-level resume remains a separate feature because it requires resumable destination manifests and atomic commit semantics per operation type.
