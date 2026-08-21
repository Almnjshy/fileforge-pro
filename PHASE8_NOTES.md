# Phase 8 — Native Media Surfaces in Floating Windows

The native Media3 player is no longer limited to a separate Activity. A `NativeMediaSurfaceManager` is attached to the Capacitor WebView host and owns PlayerView instances keyed by FileForge floating-window IDs.

## Runtime flow

React FloatingWindow -> FilePreview -> native bridge -> NativeMediaSurfaceManager -> Media3 ExoPlayer -> PlayerView overlay

The bridge carries only metadata/reference/geometry. Media bytes stay in the native layer.

## Lifecycle

- Create when a native video/audio window mounts.
- Reposition on floating-window geometry changes.
- Hide when the host is not visible.
- Destroy on window close/unmount.
- Persist playback position before native surface release.

## Important limitation

The native surface is an Android overlay synchronized to the WebView DOM rather than a React DOM node. This is intentional: Android media decoding/surfaces remain native while the existing TypeScript window manager remains intact. The next hardening step is to unify z-order/focus arbitration between DOM windows and native surfaces and to add native PDF surfaces using the same host mechanism.
