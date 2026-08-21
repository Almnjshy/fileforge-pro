# FileForge Pro — Phase 4: Durable Operation Journal & Recovery Foundation

## Objective
Make file-operation state survive process death without pretending that SAF or arbitrary providers are transactional.

## Implemented
- Replaced the SharedPreferences/JSON journal with a durable SQLite metadata journal.
- Operation lifecycle is persisted as `pending/running/paused/cancelling/interrupted` and terminal states.
- Hot progress checkpoints are coalesced by time/bytes to avoid database I/O on every 128 KiB buffer.
- Terminal transitions are flushed immediately.
- Existing recovery APIs remain compatible.
- Interrupted operations are detected deterministically from the persisted lifecycle.
- Completed/failed/cancelled operations remain available as history instead of disappearing immediately.
- Added `getOperationHistory` as a native diagnostic API.
- Workspace cleanup only removes stale artifacts that are not associated with active journal records.

## Recovery semantics
The system does **not** claim universal resume. A resumable operation must have a provider-specific checkpoint that can be validated. SAF writes remain restart/manual-recovery candidates unless a provider exposes stronger guarantees.

## Why this is production-grade
The journal is now independent from the WebView lifecycle and from the plugin's in-memory operation map. Process death, WebView reloads and Activity recreation cannot erase operation metadata.

## Next phase
Phase 5 should make the native operation engine itself journal-aware: deterministic operation workspaces, persisted staging references, source identity fingerprints, and atomic recovery/rollback for local operations. SAF should receive provider-specific recovery policies rather than a fake universal resume implementation.
