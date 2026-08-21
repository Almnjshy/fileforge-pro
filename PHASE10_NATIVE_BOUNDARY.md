# Phase 10 — Native/TypeScript Boundary

## Goal
React/TypeScript owns presentation, navigation, interaction and presentation state.
Android/Kotlin owns storage, media, archive, search, thumbnail, operation and recovery work.

## Boundary rules
1. Only `native-bridge.ts` may touch `window.Capacitor`.
2. Feature modules use typed bridge APIs or `getNativePlugin()`; they do not discover the plugin themselves.
3. Native data crosses the boundary as JSON-safe DTOs with explicit types.
4. The in-memory `filesystem` is a UI/cache representation, never the Android source of truth.
5. Large binary/media content must use native streaming/range/surface APIs; whole-file Base64 is not a normal Android path.
6. Native operation state arrives through the typed event bridge.

## Compatibility
The browser still uses the existing in-memory/Web provider. This release does not delete Web functionality.

## Migration target
The remaining legacy `filesystem` reads are compatibility/UI-cache reads. New native features must not write to it directly; they must return data through the repository/provider boundary.
