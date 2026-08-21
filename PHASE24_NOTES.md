# FileForge Pro — Phase 24

## Recovery Decision Execution

Phase 23 introduced deterministic recovery decisions. Phase 24 makes those decisions executable and re-validates them immediately before execution.

### Decisions
- `resume`: resumes verified local single-file copy/move from the durable destination checkpoint.
- `restart`: removes the partial local destination and starts the operation from zero.
- `recover`: finalizes a destination already proven complete; for move, removes the source only after validation.
- `rollback`: removes a partial local destination and clears the interrupted journal record.
- `discard`: removes the interrupted journal record without touching user files.
- `manual`: rejected; the provider or state is not safe for automatic action.

### Safety
The requested decision must exactly match a fresh `RecoveryDecisionEngine.evaluate()` result. A stale UI decision is rejected. SAF/content URIs remain manual unless a provider-specific recovery path exists.
