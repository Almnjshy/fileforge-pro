// FileForge Pro — Navigation Store
// Handles: currentPath, history, historyIndex, navigate, goBack, goForward, goUp
// Separated from the God Store for cleaner architecture.

import { create } from "zustand";
import { getNode, ROOT_IDS } from "@/lib/fileforge/filesystem";
import type { ViewMode, ItemSize } from "@/lib/fileforge/types";

interface NavigationState {
  currentPath: string;
  history: string[];
  historyIndex: number;

  // Per-window navigation
  windowHistory: Record<string, { paths: string[]; index: number }>;
  windowSelection: Record<string, Set<string>>;

  // Per-window view state
  windowViewState: Record<string, Partial<import("@/lib/fileforge/types").FileViewState>>;

  navigate: (path: string, folderViewPrefs?: Record<string, { viewMode: ViewMode; itemSize: ItemSize }>, applyToAll?: boolean, viewMode?: ViewMode, itemSize?: ItemSize) => void;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;

  navigateInWindow: (windowId: string, path: string) => void;
  goBackInWindow: (windowId: string) => void;
  goForwardInWindow: (windowId: string) => void;
  canGoBackInWindow: (windowId: string) => boolean;
  canGoForwardInWindow: (windowId: string) => boolean;

  toggleSelectInWindow: (windowId: string, id: string, additive?: boolean) => void;
  clearWindowSelection: (windowId: string) => void;
  selectAllInWindow: (windowId: string, ids: string[]) => void;
  getWindowSelection: (windowId: string) => Set<string>;

  setWindowViewSetting: (windowId: string, key: string, value: any) => void;
  getWindowViewState: (windowId: string) => Partial<import("@/lib/fileforge/types").FileViewState>;
}

export const useNavigationStore = create<NavigationState>((set, get) => ({
  currentPath: ROOT_IDS.internal,
  history: [ROOT_IDS.internal],
  historyIndex: 0,
  windowHistory: {},
  windowSelection: {},
  windowViewState: {},

  navigate: (path, folderViewPrefs, applyToAll, viewMode, itemSize) =>
    set((s) => {
      const newHistory = s.history.slice(0, s.historyIndex + 1);
      newHistory.push(path);
      return {
        currentPath: path,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        selectedIds: new Set() as any, // will be handled by main store
        ...(folderViewPrefs && !applyToAll && folderViewPrefs[path]
          ? { viewMode: folderViewPrefs[path].viewMode, itemSize: folderViewPrefs[path].itemSize }
          : {}),
      } as any;
    }),

  goBack: () => set((s) => {
    if (s.historyIndex <= 0) return {} as any;
    const idx = s.historyIndex - 1;
    return { historyIndex: idx, currentPath: s.history[idx], selectedIds: new Set() } as any;
  }),

  goForward: () => set((s) => {
    if (s.historyIndex >= s.history.length - 1) return {} as any;
    const idx = s.historyIndex + 1;
    return { historyIndex: idx, currentPath: s.history[idx], selectedIds: new Set() } as any;
  }),

  goUp: () => {
    const s = get();
    const node = getNode(s.currentPath);
    if (node?.parentId) get().navigate(node.parentId);
  },

  navigateInWindow: (windowId, path) => {
    const s = get();
    const hist = s.windowHistory[windowId] ?? { paths: [], index: -1 };
    const newPaths = hist.paths.slice(0, hist.index + 1);
    newPaths.push(path);
    set({
      windowHistory: {
        ...s.windowHistory,
        [windowId]: { paths: newPaths, index: newPaths.length - 1 },
      },
      windowSelection: { ...s.windowSelection, [windowId]: new Set() },
    } as any);
  },

  goBackInWindow: (windowId) => {
    const s = get();
    const hist = s.windowHistory[windowId];
    if (!hist || hist.index <= 0) return;
    const newIndex = hist.index - 1;
    set({
      windowHistory: { ...s.windowHistory, [windowId]: { paths: hist.paths, index: newIndex } },
    } as any);
  },

  goForwardInWindow: (windowId) => {
    const s = get();
    const hist = s.windowHistory[windowId];
    if (!hist || hist.index >= hist.paths.length - 1) return;
    const newIndex = hist.index + 1;
    set({
      windowHistory: { ...s.windowHistory, [windowId]: { paths: hist.paths, index: newIndex } },
    } as any);
  },

  canGoBackInWindow: (windowId) => {
    const hist = get().windowHistory[windowId];
    return !!hist && hist.index > 0;
  },

  canGoForwardInWindow: (windowId) => {
    const hist = get().windowHistory[windowId];
    return !!hist && hist.index < hist.paths.length - 1;
  },

  toggleSelectInWindow: (windowId, id, additive) => set((s) => {
    const current = s.windowSelection[windowId] ?? new Set<string>();
    const next = new Set(additive ? current : []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { windowSelection: { ...s.windowSelection, [windowId]: next } } as any;
  }),

  clearWindowSelection: (windowId) => set((s) => ({
    windowSelection: { ...s.windowSelection, [windowId]: new Set<string>() },
  }) as any),

  selectAllInWindow: (windowId, ids) => set((s) => ({
    windowSelection: { ...s.windowSelection, [windowId]: new Set(ids) },
  }) as any),

  getWindowSelection: (windowId) => {
    return get().windowSelection[windowId] ?? new Set<string>();
  },

  setWindowViewSetting: (windowId, key, value) => set((s) => {
    const current = s.windowViewState[windowId] ?? {};
    return {
      windowViewState: { ...s.windowViewState, [windowId]: { ...current, [key]: value } },
    } as any;
  }),

  getWindowViewState: (windowId) => get().windowViewState[windowId] ?? {},
}));
