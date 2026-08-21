import type { FloatingWindow } from "./types";

export const WINDOW_Z_BASE = 100;
export const WINDOW_Z_MAX = 100000;
export const WINDOW_MIN_WIDTH = 280;
export const WINDOW_MIN_HEIGHT = 200;
export const WINDOW_TITLEBAR_HEIGHT = 36;
export const VIEWPORT_MARGIN = 12;

export function clampWindowGeometry(
  geom: Pick<FloatingWindow, "x" | "y" | "width" | "height">,
  viewportWidth: number,
  viewportHeight: number,
): Pick<FloatingWindow, "x" | "y" | "width" | "height"> {
  const maxWidth = Math.max(WINDOW_MIN_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);
  const maxHeight = Math.max(WINDOW_MIN_HEIGHT, viewportHeight - VIEWPORT_MARGIN * 2);
  const width = Math.min(Math.max(WINDOW_MIN_WIDTH, geom.width), maxWidth);
  const height = Math.min(Math.max(WINDOW_MIN_HEIGHT, geom.height), maxHeight);
  // Keep the entire window inside the viewport.  The previous implementation
  // intentionally allowed most of a window to sit outside the screen, which
  // made cascaded windows progressively disappear on mobile.
  const maxX = Math.max(VIEWPORT_MARGIN, viewportWidth - width - VIEWPORT_MARGIN);
  const maxY = Math.max(VIEWPORT_MARGIN, viewportHeight - height - VIEWPORT_MARGIN);
  const x = Math.min(Math.max(VIEWPORT_MARGIN, geom.x), maxX);
  const y = Math.min(Math.max(VIEWPORT_MARGIN, geom.y), maxY);
  return { x, y, width, height };
}

export function normalizeZOrder(windows: FloatingWindow[]): FloatingWindow[] {
  return [...windows].sort((a,b)=>a.zIndex-b.zIndex).map((w,i)=>({...w,zIndex:WINDOW_Z_BASE+i}));
}

export function bringToFront(windows: FloatingWindow[], id: string): FloatingWindow[] {
  const maxZ=Math.max(WINDOW_Z_BASE,...windows.map(w=>w.zIndex));
  const next=windows.map(w=>w.id===id?{...w,zIndex:maxZ+1}:w);
  return maxZ+1>=WINDOW_Z_MAX ? normalizeZOrder(next) : next;
}
