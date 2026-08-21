# Phase 1 — Native Storage Core Completion

This snapshot is the output of Phase 0 + Phase 1 work on top of the latest
`fileforge-pro-native-core-phase31-kotlin-fixes-v2` baseline.

## Changed

- Unified legacy CRUD/list/metadata bridge calls with `UnifiedStorageService`.
- Added safe handling of `content://` references at the bridge boundary.
- SAF directory listing no longer requires broad external-storage permission
  when the URI itself carries the required persisted/user grant.
- Hardened native child-name validation.
- Added source/target identity checks for native copy/move.
- Added deterministic target-type checks for copy/move.
- Hardened native text writes with temp-file staging and rollback of the
  previous file if final commit fails.
- Preserved existing Capacitor method names and response compatibility.
- Added `PHASE0_1_AUDIT.md` documenting the baseline, verified architecture,
  limitations and Phase 1 exit criteria.

## Verification limits

The working environment does not contain the Android SDK, Gradle executable,
or installed npm dependencies, so a real Android/Next build was not claimed.
The final ZIP should therefore be passed through the existing GitHub Actions
pipeline before merging into the repository.

## Next gate

Do not start Phase 2 until CI passes:

1. `npm run typecheck`
2. `npm run build:static`
3. Android `assembleDebug`
4. project tests
5. device smoke test for direct storage and SAF CRUD
