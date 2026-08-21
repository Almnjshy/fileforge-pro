# Phase 8 — Professional Rework Audit

## Correction
The previous Phase 8 implementation used fixed JavaScript cache ceilings of 200 entries and 8 MiB. Those limits were removed. They were defensive constraints, not a production-grade cache policy for a file manager that may display thousands of files.

## Current model
- JavaScript memory cache is a weighted LRU working set with an adaptive budget derived from the device-memory hint; there is no fixed item-count ceiling.
- Native thumbnails remain durable in the OS-managed application cache directory.
- Native disk cleanup uses a storage-aware soft quota derived from currently usable cache storage, with a bounded policy so the cache cannot consume the entire volume.
- Cache eviction removes only derived thumbnails, never user data; thumbnails are regenerated from the source when needed.
- Request deduplication and bounded generation concurrency remain in place.

## Important limitation
This does not make it correct to retain thousands of decoded Bitmaps in RAM. A professional file manager should virtualize the grid and schedule only visible/prefetch thumbnail requests. The thumbnail cache is therefore intentionally a working-set cache, not an index of all visible files.

## Verification
Static source-level review was performed on the reworked thumbnail cache and native quota policy. Android runtime/build verification remains pending in the current environment.
