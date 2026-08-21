# Phase 9 — Professional Floating Window Manager

Implemented as a single interaction model for mouse/touch/pen using Pointer Events and pointer capture.

### Guarantees
- Only title bars initiate movement; window content never becomes a drag surface.
- Eight-way resize works on touch and mouse.
- Main UI remains pointer-accessible outside window rectangles because the host layer is pointer-transparent.
- Focus raises z-order and restores minimized windows.
- z-order is periodically normalized before integer growth becomes excessive.
- Minimize removes the surface without destroying the serializable window model.
- Maximize/restore preserves previous geometry.
- Geometry is clamped to the viewport on movement, resize, restore, and viewport changes.
- Persistence uses a canonical v3 schema with validation and v1/v2 migration.
- Heavy viewer resources are not persisted in window state.
