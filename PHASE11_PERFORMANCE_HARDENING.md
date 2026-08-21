# Phase 11 — Performance & Concurrency Hardening

## Scope

This phase hardens the existing Phase 10 Native/TypeScript boundary without changing the source-of-truth architecture.

## Implemented

### 1. Bounded directory-result cache
`src/lib/fileforge/directory-cache.ts` provides:

- bounded LRU-style eviction;
- short TTL to protect against changes made outside FileForge;
- separate cache entries for `showHidden=false/true`;
- concurrent request deduplication;
- immutable array snapshots so consumers cannot mutate the cache;
- generation-based invalidation so an in-flight stale listing cannot repopulate the cache after a mutation;
- explicit clear/invalidate operations.

Native storage uses 48 cached directories with a 3-second TTL. Web preview deliberately remains uncached because the legacy mock tree can be mutated directly by existing UI/store code; caching it would risk stale UI state.

### 2. Mutation-aware invalidation
Native create/delete/rename/move/copy invalidate the affected directory listings immediately. This prevents the normal navigation path from waiting for the TTL after an operation.

### 3. Hidden-file correctness
`FileBrowser` now passes its `showHidden` setting to the storage provider. Hidden and visible listings therefore never share a cache entry.

### 4. Recursive folder-summary invalidation
`FileRepository.invalidateFolderSummary()` now invalidates every affected ancestor instead of only one parent. Recursive folder statistics therefore cannot remain stale after a nested mutation.

### 5. Thumbnail concurrency queue
`ThumbnailManager` no longer uses an 8ms polling loop while four generations are active. Additional thumbnail requests wait in a FIFO queue and are released directly when a generation finishes. Explicit cache reset also releases queued waiters.

## Correctness constraints

The directory cache is an optimization, never the source of truth. Android Native storage remains authoritative. TTL is intentionally short because files can be changed by other applications. File mutations performed by FileForge invalidate cache entries immediately.

## Verification

- `DirectoryCache` standalone TypeScript compilation: PASS.
- Unit test for concurrent deduplication: PASS.
- Unit test for hidden/visible invalidation: PASS.
- Unit test for stale in-flight result suppression: PASS.
- Full repository typecheck could not be executed in this working environment because the supplied archive intentionally contains no `node_modules`; global `tsc` therefore reports pre-existing missing dependency/type-environment errors. No new compiler error was reported for the Phase 11 cache module.

## Phase 11 Deep Hardening Review

The original Phase 11 cache was primarily a TypeScript/UI cache. The hardening pass adds a shared native directory cache inside `UnifiedStorageService` so native callers also benefit from bounded caching and in-flight request coalescing.

### Native invariants
- Cache key includes the canonical storage reference and `showHidden` state.
- Native cache is bounded (64 directory entries) and TTL-limited (1.5s) to remain responsive to external filesystem changes.
- Concurrent native misses for the same key are coalesced through a shared future.
- Every native mutation invalidates the affected directory and its parent where applicable.
- Copy/move/delete operations invalidate after the operation reaches its successful commit point.
- Rename invalidates both the old and new reference paths.
- SAF and local references share the same cache semantics without converting SAF URIs into filesystem paths.

### JS cache lifecycle hardening
- In-flight generation tombstones are released when no entry/request remains, preventing unbounded growth across large numbers of unique directories.
- Cached arrays remain defensively copied to prevent caller mutation.

## Deep review hardening

The performance layer was reviewed as a correctness subsystem, not just an optimization. Additional safeguards now cover:

- native in-flight request coalescing and generation checks;
- stale-result rejection when a mutation races a directory load;
- bounded item counts in addition to bounded directory-count limits;
- cache lifecycle cleanup for per-key generation tombstones;
- direct invalidation from native create/delete/rename/copy/move paths;
- mutation invalidation of both source and destination parents where required;
- oversized directory lists are served correctly but are not retained indefinitely in memory.
