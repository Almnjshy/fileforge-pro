# FileForge Pro — Phase 5: Native Transactional Operations

## Scope
Phase 5 builds on the Phase 4 durable journal and introduces a real local-filesystem transaction boundary for native copy/move operations.

## Implemented
- Added `NativeTransactionalOperationService`.
- Local `copy` and `move` operations are staged in `.fileforge-transactions` before the final destination is exposed.
- Existing destinations are moved into durable backup artifacts before commit.
- Staging files are flushed with `FileDescriptor.sync()` before commit.
- Transaction lifecycle is persisted in `NativeOperationJournal`:
  - STAGING
  - STAGED
  - BACKING_UP
  - BACKED_UP
  - COMMITTING
  - COMMITTED
  - SOURCE_CLEANUP
  - SOURCE_CLEANED
  - FINALIZING
  - COMPLETED
  - ROLLED_BACK
  - COMMITTED_PENDING_CLEANUP
- Move cleanup re-verifies the source fingerprint before destructive deletion.
- Recovery decisions now understand transaction states instead of treating every interrupted operation as a generic byte-copy resume.
- Recovery rollback restores a durable destination backup when present.
- Recovery discard removes transaction staging/backup artifacts.
- Post-commit failures never delete a committed destination merely to make the operation look clean; they remain recoverable as pending cleanup.
- SAF/content:// operations intentionally continue through the provider-aware engine because SAF cannot honestly be given local filesystem atomicity guarantees.

## Design rule
No fake resume was introduced. Local transactional operations are recoverable through durable transaction state. Byte-level resume remains a separate capability and is only safe where the provider and checkpoint semantics can prove it.

## Verification limitation
The supplied Phase 4 archive does not contain `gradle-wrapper.jar`, and the execution environment does not provide a system `gradle` command. Therefore an Android Gradle build could not be executed in this environment. `npm run typecheck` also cannot run against the archive without its installed npm dependencies. These are environment limitations, not claims of a successful build.
