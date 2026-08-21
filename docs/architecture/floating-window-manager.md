# Floating Window Manager — Phase 11

## Contract

The floating-window layer is an interaction layer, not a full-screen modal overlay.
The root layer uses `pointer-events: none`; only individual window surfaces opt into
`pointer-events: auto`. This prevents a hidden/inactive overlay from blocking the main
file browser.

## State ownership

Zustand owns the serializable window model:

- identity/type/title
- geometry
- z-order
- minimized/maximized state
- file/folder target
- per-window navigation/selection state

Native resources (players, WebViews, bitmaps, streams) must never be stored in this state.

## Focus model

`focusWindow(id)` promotes the target to the highest z-index and restores it from minimized
state. Closing/minimizing the active window promotes the highest remaining visible window.

## Recovery

Only serializable state is persisted. On recreation, windows are restored from the persisted
model and their heavy resources are recreated by their own viewer components.

## Critical invariant

A floating window must never prevent pointer/touch input from reaching the main application
outside its own rectangle.
