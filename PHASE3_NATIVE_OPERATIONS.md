# FileForge Pro — Phase 3 Native Operations

## Goal
Move the authoritative copy/move/delete implementation out of the Capacitor/TypeScript-facing layer and into a provider-aware Android operation engine.

## Implemented
- One native `NativeOperationEngine` for copy, move and recursive delete.
- Local filesystem and SAF are handled through `UnifiedStorageService`.
- Local -> local, local -> SAF, SAF -> local and SAF -> SAF are supported by the same operation model.
- Recursive directory copy/delete is native and does not materialize file contents in JavaScript.
- Pause/cancel checks are performed inside the I/O loops.
- Progress is byte-based and includes the active path/item.
- Local copy uses a staging workspace and commit semantics so an interrupted copy does not expose a partially-written destination.
- Local file moves can use an atomic rename when the filesystem permits it.
- Cross-provider move is implemented as copy-then-delete; the destination is preserved if source deletion fails.
- Conflict policies: `fail`, `replace`, `skip`, `rename`.
- SAF destination directories are created natively and recursive children are created using their metadata/MIME type.
- Path traversal through child names is rejected.
- Source/destination overlap is rejected for local directory operations.
- The Capacitor plugin is now an adapter for the new native engine rather than owning copy/move/delete branching logic.
- Existing recovery APIs remain intact for previously journaled local resumable copies; they are deliberately not faked as SAF resume.

## Important semantics

`copyFile` / `moveFile` continue to accept the existing bridge contract:
- Local `to`: exact destination path.
- SAF `to`: destination directory, with optional `targetName`.
- Existing SAF file target without `targetName`: exact target.

## Deliberately not claimed

SAF does not expose a universal atomic rename/replace contract across all document providers. The engine therefore does not pretend that SAF writes are transactional. It stages locally where the platform provides atomic filesystem primitives and uses provider-safe streaming/cleanup for SAF.
