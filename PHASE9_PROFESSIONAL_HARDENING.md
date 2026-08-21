# Phase 9 — Professional Window Manager Hardening

## Changes

- Window geometry remains centralized in `window-manager.ts`.
- Drag/resize state is pointer-capture based; lost pointer capture now terminates the active interaction cleanly.
- Window persistence is debounced at 250ms instead of writing `localStorage` on every drag/resize store mutation.
- Pending UI state is flushed on `pagehide` and `beforeunload`, preventing the debounce from losing the final geometry.
- No new persistence backend or fallback was introduced; window state is UI metadata and remains in the existing browser/WebView durable storage layer.
- Heavy viewer resources are not serialized into window state.

## Deliberate boundary

The operation journal remains the authoritative durable store for file operations. Window UI state is not an operation journal and must not be coupled to transactional recovery.

## Verification

Static source review performed for the modified window manager and persistence paths. Android runtime/build remains unverified in this environment.
