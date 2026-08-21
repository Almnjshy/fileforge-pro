// FileForge Pro — Native Boundary Contract (Phase 10)
// The Web/React layer must access Android capabilities through native-bridge.ts.
// This module contains policy helpers only; it never reaches into window.Capacitor.

import { getNativePlugin, isNative, type CapacitorFilePlugin } from "./native-bridge";

export type NativeBoundaryState =
  | { kind: "web"; plugin: null }
  | { kind: "native"; plugin: CapacitorFilePlugin }
  | { kind: "native-unavailable"; plugin: null };

export function getNativeBoundaryState(): NativeBoundaryState {
  if (!isNative()) return { kind: "web", plugin: null };
  const plugin = getNativePlugin();
  return plugin ? { kind: "native", plugin } : { kind: "native-unavailable", plugin: null };
}

export function requireNativeCapability<K extends keyof CapacitorFilePlugin>(
  capability: K,
): NonNullable<CapacitorFilePlugin[K]> {
  const state = getNativeBoundaryState();
  if (state.kind !== "native") {
    throw new Error(`Native capability unavailable: ${String(capability)}`);
  }
  const implementation = state.plugin[capability];
  if (!implementation) {
    throw new Error(`Native capability not implemented: ${String(capability)}`);
  }
  return implementation as NonNullable<CapacitorFilePlugin[K]>;
}
