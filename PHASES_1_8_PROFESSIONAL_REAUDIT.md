# FileForge Pro — Phases 1–8 Professional Re-audit

## Scope

This audit deliberately rejects the earlier assumption that an implementation is production-grade merely because it closes the original bug. The standard is now architectural correctness, scalability, explicit failure semantics, resource ownership, and removal of competing legacy paths.

## Current verdict

- Phase 1 Storage/Archive: **Yellow** — core SAF/Local unification is sound; archive-entry viewer transport still needs a fully range/stream-backed viewer path for large archive entries.
- Phase 2 Unified Storage: **Green/Yellow** — abstraction and capability model are sound; Android provider/runtime verification remains required.
- Phase 3 Native Operations: **Green/Yellow** — operation semantics are strong and silent weakening fallbacks were removed; runtime interruption/SAF verification remains required.
- Phase 4 Journal: **Green/Yellow** — durable native journal architecture is appropriate; process-death behavior is not proven without Android execution tests.
- Phase 5 Transactions/Recovery: **Green/Yellow** — deterministic fingerprints and guarded rollback are appropriate; runtime crash/recovery tests remain required.
- Phase 6 Large Documents: **Yellow** — bounded paging is correct, but a full document service still needs complete cross-page search/replace and viewer/editor integration.
- Phase 7 Search: **Yellow** — native streaming search/cancellation is real; a fixed result cap is a product pagination policy, not a scalability architecture. Large-result streaming/pagination remains future work.
- Phase 8 Thumbnails: **Yellow** — the earlier fixed 200-item/8 MiB design was rejected and replaced with adaptive weighted memory caching plus persistent disk caching. This pass additionally adds priority-aware scheduling and adaptive decode concurrency. A file-backed/native thumbnail resource transport would be the next architectural improvement over Base64 thumbnail transport.

## Explicitly rejected earlier decisions

### 1. Fixed thumbnail cache: 200 entries / 8 MiB
Rejected. It is not appropriate for a general-purpose file manager. The cache is now a weighted adaptive working set, while durable thumbnails remain in native disk cache.

### 2. Increasing the fixed thumbnail limit
Rejected. Replacing 8 MiB with 32/64/128 MiB would only move the arbitrary boundary.

### 3. Treating a 5,000 search-result cap as scalability
Rejected as an architectural claim. It is only a bounded UI/result policy.

### 4. Treating bounded archive preview as full streaming viewer support
Rejected. It prevents a single bridge response from becoming unbounded, but it does not make every viewer range-aware.

## Phase 8 changes in this pass

- Removed the fixed item-count thumbnail cache ceiling.
- Kept a weighted memory budget derived from device-memory hints rather than a universal 8 MiB ceiling.
- Kept persistent native disk thumbnails so RAM eviction does not cause regeneration.
- Added priority-aware thumbnail generation scheduling; visible thumbnails can outrank prefetch work.
- Replaced a universal four-decoder concurrency assumption with an adaptive CPU-based concurrency signal capped conservatively for memory-heavy decoders.
- Kept request deduplication and native disk-cache invalidation.
- Did not introduce a larger arbitrary fixed cache limit as a workaround.

## Remaining architecture debt

1. Native thumbnail generation still returns small thumbnails through Base64. This is not equivalent to the old whole-file media Base64 problem because the payload is a derived thumbnail, but a file-backed/resource URI transport would be cleaner and scale better.
2. The file grid must remain virtualized and should request thumbnails only for the visible/prefetch window. Cache policy cannot compensate for a UI that creates thousands of thumbnail requests simultaneously.
3. Android/Gradle and real-device verification are still required before any phase receives a production-verified status.
4. The large Native Capacitor plugin remains a structural refactoring target; the long-term architecture should make the plugin an adapter/orchestrator rather than the owner of storage, archive, search, thumbnails, operations, and recovery logic.

## Standard for future phases

No fixed resource ceiling will be introduced merely to hide scalability problems. Resource limits that are intrinsic to an operation must be explicit, adaptive where appropriate, observable, and paired with correct scheduling/backpressure. No fallback may silently weaken the operation's semantics.
