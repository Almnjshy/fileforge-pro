# FileForge Pro — Phase 3 Final Hardening

## Scope
Provider-aware native copy/move/delete operations.

## Final implementation decisions
- `NativeOperationEngine` is the authoritative implementation for live copy/move/delete bridge operations.
- Local destinations use the provider-native filesystem staging workspace and an atomic rename-only commit. There is no copy-based fallback that silently weakens commit semantics.
- SAF destinations use the existing `StorageReference`/`UnifiedStorageService` path. No JavaScript file materialization is used.
- SAF `REPLACE` no longer deletes the existing destination before the new copy succeeds. The existing document is renamed to a provider-owned backup name and restored if the operation fails; the backup is deleted only after successful completion.
- A newly-created SAF destination is removed on failed/cancelled copy so partial results are not intentionally left behind.
- Cross-provider move remains copy-then-delete with the explicit contract that the destination is preserved if source deletion fails.
- Conflict policies remain `fail`, `skip`, `replace`, and `rename`.
- Path/name validation rejects separators, dot names and NULs.
- Local source/destination overlap is rejected before mutation.
- Progress and cancellation checks remain inside I/O loops.
- Existing durable recovery APIs are retained only for already-journaled local resumable operations; they are not used as a second live copy/move implementation.
- Dead legacy copy/delete helper methods were removed from the Capacitor plugin.

## Verification performed
- Static source inspection of the operation engine and plugin call sites.
- Confirmed live `copyFile`/`moveFile` dispatch to `NativeOperationEngine`.
- Confirmed no fallback `staging.copyTo(...)` / `copyRecursively(...)` remains in `OperationWorkspace` commit paths.
- Confirmed no old plugin-local recursive copy/delete helpers remain.
- Confirmed archive work from Phase 1/2 remains untouched.

## Not claimed
Android/Gradle runtime execution is not claimed in this environment. This phase is `IMPLEMENTED + STATICALLY VERIFIED`, not device-verified.
