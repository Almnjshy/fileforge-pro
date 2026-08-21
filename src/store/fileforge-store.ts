// FileForge Pro — Global state store (Zustand)
"use client";

import { create } from "zustand";
import type {
  ViewMode,
  ItemSize,
  SortKey,
  SortDir,
  FloatingWindow,
  FloatingWindowType,
  ThemeMode,
  FileNode,
} from "@/lib/fileforge/types";
import { getStorageProvider } from "@/lib/fileforge/storage-provider";
import { isNative } from "@/lib/fileforge/native-bridge";
import {
  filesystem,
  getNode,
  getChildren,
  getDescendants,
  ROOT_IDS,
  getAllFiles,
} from "@/lib/fileforge/filesystem";
import { type BatchProgress } from "@/lib/fileforge/batch-ops";
import { persistState, loadPersistedState } from "@/lib/fileforge/store-persist";
import { loadWindowState, saveWindowState, clearWindowState } from "@/lib/fileforge/window-state-persistence";
import { bringToFront, clampWindowGeometry, WINDOW_MIN_HEIGHT, WINDOW_MIN_WIDTH } from "@/lib/fileforge/window-manager";

export interface ClipboardEntry {
  id: string;
  operation: "copy" | "cut";
  nodeIds: string[]; // multi-select clipboard
}

export interface ToastEntry {
  id: string;
  message: string;
  type: "info" | "success" | "error";
}


interface FileForgeState {
  // Internal: bumped to force components to re-fetch after direct mutations
  // to the `filesystem` mock object (which lives outside Zustand's own
  // state tracking, so it doesn't trigger re-renders on its own).
  _fsVersion: number;

  // Theme
  theme: ThemeMode;

  // Layout
  sidebarOpen: boolean;
  sidebarPinned: boolean; // For tablet/desktop where sidebar is fixed
  dualPane: boolean;
  dualPanePath: string | null;

  // Navigation (for main pane)
  currentPath: string;
  history: string[];
  historyIndex: number;

  // View settings — full FileViewState model
  viewMode: ViewMode;
  itemSize: ItemSize;
  sortKey: SortKey;
  sortDir: SortDir;
  showHidden: boolean;
  showThumbnails: boolean;
  showExtensions: boolean;
  showFolderItemCount: boolean;
  foldersFirst: boolean;
  groupBy: import("@/lib/fileforge/types").GroupBy;
  density: import("@/lib/fileforge/types").Density;
  visibleColumns: import("@/lib/fileforge/types").ColumnConfig;
  folderViewPrefs: Record<string, Partial<import("@/lib/fileforge/types").FileViewState>>;
  applyToAll: boolean;

  // Per-window view state (keyed by windowId) — independent of main view
  windowViewState: Record<string, Partial<import("@/lib/fileforge/types").FileViewState>>;

  // Selection
  selectedIds: Set<string>;

  // Per-window navigation history (keyed by windowId)
  windowHistory: Record<string, { paths: string[]; index: number }>;
  // Per-window selection (keyed by windowId) — independent of main selection
  windowSelection: Record<string, Set<string>>;

  // Floating windows
  windows: FloatingWindow[];
  windowCounter: number;
  activeWindowId: string | null;

  // Search
  searchQuery: string;
  searchFilters: {
    type: string | null;
    minSize: number | null;
    maxSize: number | null;
    dateFrom: number | null;
    dateTo: number | null;
  };
  searchResults: FileNode[];

  // Toast notifications
  toasts: { id: string; message: string; type: "info" | "success" | "error" }[];

  // ============ ACTIONS ============
  setTheme: (t: ThemeMode) => void;
  toggleSidebar: () => void;
  setSidebarPinned: (v: boolean) => void;
  toggleDualPane: () => void;
  setDualPanePath: (p: string | null) => void;

  navigate: (path: string) => void;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;

  setViewMode: (v: ViewMode) => void;
  setItemSize: (s: ItemSize) => void;
  setSortKey: (k: SortKey) => void;
  setSortDir: (d: SortDir) => void;
  setApplyToAll: (v: boolean) => void;
  setShowThumbnails: (v: boolean) => void;
  setShowExtensions: (v: boolean) => void;
  setShowFolderItemCount: (v: boolean) => void;
  setFoldersFirst: (v: boolean) => void;
  setGroupBy: (g: import("@/lib/fileforge/types").GroupBy) => void;
  setDensity: (d: import("@/lib/fileforge/types").Density) => void;
  toggleColumn: (col: keyof import("@/lib/fileforge/types").ColumnConfig) => void;
  setWindowViewSetting: (windowId: string, key: string, value: any) => void;
  getWindowViewState: (windowId: string) => Partial<import("@/lib/fileforge/types").FileViewState>;
  resetViewSettings: () => void;
  saveAsDefaultView: () => void;
  applyToThisFolder: () => void;
  rememberFolderView: (path: string, viewMode: ViewMode, itemSize: ItemSize) => void;

  toggleSelect: (id: string, additive?: boolean) => void;
  selectAll: () => void;
  clearSelection: () => void;
  selectRange: (id: string) => void;

  openWindow: (opts: {
    type: FloatingWindowType;
    title: string;
    path?: string;
    nodeId?: string;
    width?: number;
    height?: number;
    maximized?: boolean;
  }) => string;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  toggleMaximizeWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, w: number, h: number, x?: number, y?: number) => void;
  setWindowPath: (id: string, path: string) => void;
  navigateInWindow: (windowId: string, path: string) => void;
  goBackInWindow: (windowId: string) => void;
  goForwardInWindow: (windowId: string) => void;
  canGoBackInWindow: (windowId: string) => boolean;
  canGoForwardInWindow: (windowId: string) => boolean;
  toggleSelectInWindow: (windowId: string, id: string, additive?: boolean) => void;
  clearWindowSelection: (windowId: string) => void;
  selectAllInWindow: (windowId: string, ids: string[]) => void;
  getWindowSelection: (windowId: string) => Set<string>;
  closeAllWindows: () => void;

  setSearchQuery: (q: string) => void;
  setSearchFilter: <K extends keyof FileForgeState["searchFilters"]>(
    key: K,
    value: FileForgeState["searchFilters"][K]
  ) => void;
  runSearch: () => void;

  // File ops (mocked)
  deleteNodes: (ids: string[]) => void;
  renameNode: (id: string, newName: string) => void;
  toggleStar: (id: string) => void;
  createFolder: (parentId: string, name: string) => void;
  createFile: (parentId: string, name: string, content?: string) => void;
  saveFileContent: (id: string, content: string) => void;
  copyNode: (id: string, targetParentId: string) => void;
  moveNode: (id: string, targetParentId: string) => void;

  addToast: (message: string, type?: "info" | "success" | "error") => void;
  dismissToast: (id: string) => void;

  // ============ NEW FEATURES ============
  // Clipboard
  clipboard: ClipboardEntry | null;
  copyToClipboard: (nodeIds: string[], operation: "copy" | "cut") => void;
  pasteFromClipboard: (targetParentId: string) => void;
  clearClipboard: () => void;

  // Batch operations progress
  batchProgress: BatchProgress | null;
  setBatchProgress: (p: BatchProgress | null) => void;
  cancelBatch: () => void;

  // Undo/Redo
  undoStack: { description: string; undo: () => Promise<void>; redo: () => Promise<void> }[];
  redoStack: { description: string; undo: () => Promise<void>; redo: () => Promise<void> }[];
  canUndo: () => boolean;
  canRedo: () => boolean;
  recordOperation: (description: string, undo: () => Promise<void>, redo: () => Promise<void>) => void;
  performUndo: () => Promise<void>;
  performRedo: () => Promise<void>;

  // File watcher
  fileWatchEnabled: boolean;
  toggleFileWatch: () => void;
  bumpFsVersion: () => void;

  // Upload files
  uploadFiles: (files: File[], parentId: string) => Promise<string[]>;
}

let _toastId = 0;
let _nodeId = 100000;

// No initial windows — user starts with clean main view
const initialWindows: FloatingWindow[] = [];

export const useFileForge = create<FileForgeState>((set, get) => {
  // Hydrate persisted fields on store creation
  const persisted = loadPersistedState();
  return {
  theme: persisted.theme ?? "dark",

  sidebarOpen: false,
  sidebarPinned: persisted.sidebarPinned ?? false,
  dualPane: persisted.dualPane ?? false,
  dualPanePath: persisted.dualPanePath ?? null,

  currentPath: ROOT_IDS.internal,
  history: [ROOT_IDS.internal],
  historyIndex: 0,

  viewMode: persisted.viewMode ?? "medium-grid",
  itemSize: persisted.itemSize ?? "md",
  sortKey: persisted.sortKey ?? "name",
  sortDir: persisted.sortDir ?? "asc",
  showHidden: persisted.showHidden ?? false,
  showThumbnails: persisted.showThumbnails ?? true,
  showExtensions: persisted.showExtensions ?? true,
  showFolderItemCount: persisted.showFolderItemCount ?? true,
  foldersFirst: persisted.foldersFirst ?? true,
  groupBy: persisted.groupBy ?? "none",
  density: persisted.density ?? "standard",
  visibleColumns: persisted.visibleColumns ?? {
    name: true, type: true, size: true, modified: true,
    created: false, extension: false, dimensions: false,
    duration: false, itemCount: false, path: false,
  },
  folderViewPrefs: persisted.folderViewPrefs ?? {},
  applyToAll: persisted.applyToAll ?? false,
  windowViewState: {},

  selectedIds: new Set(),

  // Restore through the canonical validated persistence layer.
  windows: (() => {
    if (typeof window === "undefined") return [];
    const saved = loadWindowState();
    return saved.map(w => ({ ...w, minimized: false }));
  })(),
  windowCounter: 0,
  activeWindowId: (() => {
    if (typeof window === "undefined") return null;
    return loadWindowState().sort((a,b)=>b.zIndex-a.zIndex)[0]?.id ?? null;
  })(),

  searchQuery: "",
  searchFilters: {
    type: null,
    minSize: null,
    maxSize: null,
    dateFrom: null,
    dateTo: null,
  },
  searchResults: [],

  toasts: [],

  // ============ NEW FEATURES INIT ============
  _fsVersion: 0, // Bump this to force re-render after filesystem mutations
  clipboard: null,
  windowHistory: {},
  windowSelection: {},
  batchProgress: null,
  undoStack: [],
  redoStack: [],
  fileWatchEnabled: false,

  setTheme: (t) => set({ theme: t }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarPinned: (v) => set({ sidebarPinned: v, sidebarOpen: v ? false : get().sidebarOpen }),
  toggleDualPane: () => set((s) => {
    const next = !s.dualPane;
    return {
      dualPane: next,
      dualPanePath: next ? (s.dualPanePath ?? ROOT_IDS.sdCard) : null,
    };
  }),
  setDualPanePath: (p) => set({ dualPanePath: p }),

  navigate: (path) => set((s) => {
    const newHistory = s.history.slice(0, s.historyIndex + 1);
    newHistory.push(path);
    return {
      currentPath: path,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      selectedIds: new Set(),
      // Apply folder-specific view if remembered
      ...(s.folderViewPrefs[path] && !s.applyToAll
        ? { viewMode: s.folderViewPrefs[path].viewMode, itemSize: s.folderViewPrefs[path].itemSize }
        : {}),
    };
  }),
  goBack: () => set((s) => {
    if (s.historyIndex <= 0) return {};
    const idx = s.historyIndex - 1;
    return { historyIndex: idx, currentPath: s.history[idx], selectedIds: new Set() };
  }),
  goForward: () => set((s) => {
    if (s.historyIndex >= s.history.length - 1) return {};
    const idx = s.historyIndex + 1;
    return { historyIndex: idx, currentPath: s.history[idx], selectedIds: new Set() };
  }),
  goUp: () => {
    const s = get();
    const node = getNode(s.currentPath);
    if (node?.parentId) get().navigate(node.parentId);
  },

  setViewMode: (v) => {
    const s = get();
    if (s.applyToAll) {
      set({ viewMode: v });
    } else {
      set({
        viewMode: v,
        folderViewPrefs: { ...s.folderViewPrefs, [s.currentPath]: { viewMode: v, itemSize: s.itemSize } },
      });
    }
  },
  setItemSize: (sz) => {
    const s = get();
    if (s.applyToAll) {
      set({ itemSize: sz });
    } else {
      set({
        itemSize: sz,
        folderViewPrefs: { ...s.folderViewPrefs, [s.currentPath]: { viewMode: s.viewMode, itemSize: sz } },
      });
    }
  },
  setSortKey: (k) => set({ sortKey: k }),
  setSortDir: (d) => set({ sortDir: d }),
  setApplyToAll: (v) => set({ applyToAll: v }),
  setShowThumbnails: (v) => set({ showThumbnails: v }),
  setShowExtensions: (v) => set({ showExtensions: v }),
  setShowFolderItemCount: (v) => set({ showFolderItemCount: v }),
  setFoldersFirst: (v) => set({ foldersFirst: v }),
  setGroupBy: (g) => set({ groupBy: g }),
  setDensity: (d) => set({ density: d }),
  toggleColumn: (col) => set((s) => ({
    visibleColumns: { ...s.visibleColumns, [col]: !s.visibleColumns[col] },
  })),
  setWindowViewSetting: (windowId, key, value) => set((s) => {
    const current = s.windowViewState[windowId] ?? {};
    return {
      windowViewState: {
        ...s.windowViewState,
        [windowId]: { ...current, [key]: value },
      },
    };
  }),
  getWindowViewState: (windowId) => get().windowViewState[windowId] ?? {},
  resetViewSettings: () => set({
    viewMode: "medium-grid",
    itemSize: "md",
    sortKey: "name",
    sortDir: "asc",
    showHidden: false,
    showThumbnails: true,
    showExtensions: true,
    showFolderItemCount: true,
    foldersFirst: true,
    groupBy: "none",
    density: "standard",
    visibleColumns: {
      name: true, type: true, size: true, modified: true,
      created: false, extension: false, dimensions: false,
      duration: false, itemCount: false, path: false,
    },
  }),
  saveAsDefaultView: () => {
    // The current state IS the default — persist subscription will save it.
    // Clear per-folder overrides so the default takes effect everywhere.
    set({ folderViewPrefs: {}, applyToAll: true });
    get().addToast("Saved as default view", "success");
  },
  applyToThisFolder: () => {
    const s = get();
    const prefs = { ...s.folderViewPrefs };
    prefs[s.currentPath] = {
      viewMode: s.viewMode,
      itemSize: s.itemSize,
      showThumbnails: s.showThumbnails,
      showExtensions: s.showExtensions,
      showHiddenFiles: s.showHidden,
      showFolderItemCount: s.showFolderItemCount,
      foldersFirst: s.foldersFirst,
      groupBy: s.groupBy,
      density: s.density,
      visibleColumns: s.visibleColumns,
      sortBy: s.sortKey,
      sortDir: s.sortDir,
    } as any;
    set({ folderViewPrefs: prefs, applyToAll: false });
    get().addToast("View saved for this folder", "success");
  },
  rememberFolderView: (path, viewMode, itemSize) =>
    set((s) => ({ folderViewPrefs: { ...s.folderViewPrefs, [path]: { viewMode, itemSize } } })),

  toggleSelect: (id, additive) => set((s) => {
    const next = new Set(additive ? s.selectedIds : []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return { selectedIds: next };
  }),
  selectAll: () => set((s) => {
    const children = getChildren(s.currentPath);
    return { selectedIds: new Set(children.map(c => c.id)) };
  }),
  clearSelection: () => set({ selectedIds: new Set() }),
  selectRange: (id) => set((s) => {
    const children = getChildren(s.currentPath);
    const ids = children.map(c => c.id);
    const last = Array.from(s.selectedIds).pop();
    if (!last) return { selectedIds: new Set([id]) };
    const i1 = ids.indexOf(last);
    const i2 = ids.indexOf(id);
    if (i1 < 0 || i2 < 0) return { selectedIds: new Set([id]) };
    const [start, end] = i1 < i2 ? [i1, i2] : [i2, i1];
    const next = new Set(s.selectedIds);
    for (let i = start; i <= end; i++) next.add(ids[i]);
    return { selectedIds: next };
  }),

  openWindow: (opts) => {
    const persistedMax=get().windows.reduce((m,w)=>{const n=Number.parseInt(w.id.replace(/^w/,""),10);return Number.isFinite(n)?Math.max(m,n):m},0);
    const counter=Math.max(get().windowCounter,persistedMax)+1;
    const id=`w${counter}`;
    const maxZ=Math.max(100,...get().windows.map(w=>w.zIndex));
    const width=opts.width ?? (opts.type==="folder"?560:720);
    const height=opts.height ?? (opts.type==="folder"?420:520);
    const existingWindowCount = get().windows.length;
    const cascadeStep = 28;
    const cascadeIndex = existingWindowCount % 6;
    const vw=typeof window!=="undefined"?window.innerWidth:1280;const vh=typeof window!=="undefined"?window.innerHeight:720;
    const centeredX = (vw - width) / 2 + cascadeIndex * cascadeStep;
    const centeredY = (vh - height) / 2 + cascadeIndex * cascadeStep;
    const g=clampWindowGeometry({x:centeredX,y:centeredY,width,height},vw,vh);
    const win:FloatingWindow={id,type:opts.type,title:opts.title,path:opts.path,nodeId:opts.nodeId,...g,zIndex:maxZ+1,minimized:false,maximized:opts.maximized??false};
    const windowHistory={...get().windowHistory};const windowSelection={...get().windowSelection};
    if(opts.type==="folder"&&opts.path){windowHistory[id]={paths:[opts.path],index:0};windowSelection[id]=new Set<string>();}
    set(s=>({windows:[...s.windows,win],windowCounter:counter,activeWindowId:id,windowHistory,windowSelection}));return id;
  },
  closeWindow: (id) => set((s)=>{
    const {[id]:_h,...restHistory}=s.windowHistory;const {[id]:_s,...restSelection}=s.windowSelection;
    const remaining=s.windows.filter(w=>w.id!==id);
    const nextActive=s.activeWindowId===id?(remaining.filter(w=>!w.minimized).sort((a,b)=>b.zIndex-a.zIndex)[0]?.id??null):s.activeWindowId;
    if(remaining.length===0) clearWindowState();
    return {windows:remaining,activeWindowId:nextActive,windowHistory:restHistory,windowSelection:restSelection};
  }),
  focusWindow: (id) => set(s=>{if(!s.windows.some(w=>w.id===id))return s;return {activeWindowId:id,windows:bringToFront(s.windows,id).map(w=>w.id===id?{...w,minimized:false}:w)}}),
  minimizeWindow: (id) => set(s=>{const windows=s.windows.map(w=>w.id===id?{...w,minimized:true}:w);const activeWindowId=s.activeWindowId===id?(windows.filter(w=>!w.minimized).sort((a,b)=>b.zIndex-a.zIndex)[0]?.id??null):s.activeWindowId;return {windows,activeWindowId};}),
  toggleMaximizeWindow: (id) => set(s=>{
    const vw=typeof window!=="undefined"?window.innerWidth:1280;const vh=typeof window!=="undefined"?window.innerHeight:720;
    return {activeWindowId:id,windows:bringToFront(s.windows,id).map(w=>{
      if(w.id!==id)return w;
      if(w.maximized){const g=clampWindowGeometry(w.prevGeom??{x:64,y:64,width:560,height:420},vw,vh);return {...w,...g,maximized:false,minimized:false,prevGeom:undefined};}
      return {...w,maximized:true,minimized:false,prevGeom:{x:w.x,y:w.y,width:w.width,height:w.height}};
    })};
  }),
  moveWindow: (id,x,y) => set(s=>{const w=s.windows.find(w=>w.id===id);if(!w||w.maximized||w.minimized)return s;const vw=typeof window!=="undefined"?window.innerWidth:1280;const vh=typeof window!=="undefined"?window.innerHeight:720;const g=clampWindowGeometry({...w,x,y},vw,vh);return {windows:s.windows.map(q=>q.id===id?{...q,x:g.x,y:g.y}:q)};}),
  resizeWindow: (id,width,height,x,y) => set(s=>{const w=s.windows.find(w=>w.id===id);if(!w||w.maximized||w.minimized)return s;const vw=typeof window!=="undefined"?window.innerWidth:1280;const vh=typeof window!=="undefined"?window.innerHeight:720;const g=clampWindowGeometry({...w,width:Math.max(WINDOW_MIN_WIDTH,width),height:Math.max(WINDOW_MIN_HEIGHT,height),x:x??w.x,y:y??w.y},vw,vh);return {windows:s.windows.map(q=>q.id===id?{...q,...g}:q)};}),
  setWindowPath: (id, path) => set((s) => ({
    windows: s.windows.map(w => w.id === id ? { ...w, path } : w),
    _fsVersion: (s._fsVersion ?? 0) + 1,
  })),
  // ============ Per-window navigation history ============
  navigateInWindow: (windowId, path) => {
    const s = get();
    const hist = s.windowHistory[windowId] ?? { paths: [], index: -1 };
    const newPaths = hist.paths.slice(0, hist.index + 1);
    newPaths.push(path);
    set({
      windows: s.windows.map(w => w.id === windowId ? { ...w, path } : w),
      windowHistory: {
        ...s.windowHistory,
        [windowId]: { paths: newPaths, index: newPaths.length - 1 },
      },
      // Clear selection for the new folder
      windowSelection: { ...s.windowSelection, [windowId]: new Set() },
      _fsVersion: (s._fsVersion ?? 0) + 1,
    });
  },
  goBackInWindow: (windowId) => {
    const s = get();
    const hist = s.windowHistory[windowId];
    if (!hist || hist.index <= 0) return;
    const newIndex = hist.index - 1;
    const path = hist.paths[newIndex];
    set({
      windows: s.windows.map(w => w.id === windowId ? { ...w, path } : w),
      windowHistory: {
        ...s.windowHistory,
        [windowId]: { paths: hist.paths, index: newIndex },
      },
      windowSelection: { ...s.windowSelection, [windowId]: new Set() },
      _fsVersion: (s._fsVersion ?? 0) + 1,
    });
  },
  goForwardInWindow: (windowId) => {
    const s = get();
    const hist = s.windowHistory[windowId];
    if (!hist || hist.index >= hist.paths.length - 1) return;
    const newIndex = hist.index + 1;
    const path = hist.paths[newIndex];
    set({
      windows: s.windows.map(w => w.id === windowId ? { ...w, path } : w),
      windowHistory: {
        ...s.windowHistory,
        [windowId]: { paths: hist.paths, index: newIndex },
      },
      windowSelection: { ...s.windowSelection, [windowId]: new Set() },
      _fsVersion: (s._fsVersion ?? 0) + 1,
    });
  },
  canGoBackInWindow: (windowId) => {
    const hist = get().windowHistory[windowId];
    return !!hist && hist.index > 0;
  },
  canGoForwardInWindow: (windowId) => {
    const hist = get().windowHistory[windowId];
    return !!hist && hist.index < hist.paths.length - 1;
  },
  // ============ Per-window selection ============
  toggleSelectInWindow: (windowId, id, additive) => set((s) => {
    const current = s.windowSelection[windowId] ?? new Set<string>();
    const next = new Set(additive ? current : []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return {
      windowSelection: { ...s.windowSelection, [windowId]: next },
    };
  }),
  clearWindowSelection: (windowId) => set((s) => ({
    windowSelection: { ...s.windowSelection, [windowId]: new Set<string>() },
  })),
  selectAllInWindow: (windowId, ids) => set((s) => ({
    windowSelection: { ...s.windowSelection, [windowId]: new Set(ids) },
  })),
  getWindowSelection: (windowId) => {
    return get().windowSelection[windowId] ?? new Set<string>();
  },
  closeAllWindows: () => { set({ windows: [], activeWindowId: null, windowHistory: {}, windowSelection: {} }); clearWindowState(); },

  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchFilter: (key, value) => set((s) => ({
    searchFilters: { ...s.searchFilters, [key]: value },
  })),
  runSearch: () => {
    const s = get();
    const q = s.searchQuery.trim().toLowerCase();
    const filters = s.searchFilters;
    const results = getAllFiles().filter(n => {
      if (q && !n.name.toLowerCase().includes(q)) return false;
      if (filters.type && n.kind !== filters.type) return false;
      if (filters.minSize !== null && n.size < filters.minSize) return false;
      if (filters.maxSize !== null && n.size > filters.maxSize) return false;
      if (filters.dateFrom !== null && n.modified < filters.dateFrom) return false;
      if (filters.dateTo !== null && n.modified > filters.dateTo) return false;
      return true;
    });
    set({ searchResults: results });
  },

  deleteNodes: (ids) => {
    if (isNative()) {
      (async () => {
        const results = await getStorageProvider().deleteNodes(ids);
        const succeeded = results.filter(r => r.ok).map(r => r.id);
        const failed = results.filter(r => !r.ok);
        succeeded.forEach(id => {
          const node = getNode(id);
          if (node?.parentId && filesystem[node.parentId]?.childrenIds) {
            const parent = filesystem[node.parentId];
            parent.childrenIds = parent.childrenIds!.filter(cid => cid !== id);
          }
          delete filesystem[id];
        });
        set((s) => ({ selectedIds: new Set(), _fsVersion: (s._fsVersion ?? 0) + 1 }));
        if (succeeded.length > 0) {
          get().addToast(`Deleted ${succeeded.length} item${succeeded.length > 1 ? "s" : ""}`, "success");
          // Real on-disk deletion can't be safely undone here (no byte-level
          // backup of arbitrary/binary files), so — unlike the mock/web path
          // below — no undo entry is recorded for native deletes. Silently
          // pretending this is undoable would be worse than not offering it.
        }
        if (failed.length > 0) {
          get().addToast(`Failed to delete ${failed.length} item${failed.length > 1 ? "s" : ""}`, "error");
        }
      })();
      return;
    }

    // Snapshot each node (and, for folders, its full subtree) plus where it
    // lived, so the deletion can be fully undone — including nested content,
    // which the previous implementation silently orphaned instead of
    // removing (children stayed in memory with no parent pointing at them).
    const snapshots = ids
      .map(id => getNode(id))
      .filter((n): n is FileNode => !!n)
      .map(node => ({
        parentId: node.parentId,
        subtree: getDescendants(node.id).map(n => ({ ...n, childrenIds: n.childrenIds ? [...n.childrenIds] : undefined })),
      }));

    const removeIds = new Set(snapshots.flatMap(s => s.subtree.map(n => n.id)));
    ids.forEach(id => {
      const node = getNode(id);
      if (node?.parentId && filesystem[node.parentId]?.childrenIds) {
        const parent = filesystem[node.parentId];
        parent.childrenIds = parent.childrenIds!.filter(cid => cid !== id);
      }
    });
    removeIds.forEach(id => { delete filesystem[id]; });
    if (typeof window !== "undefined") {
      import("@/lib/fileforge/real-fs").then(({ removePersistedUserFile }) => {
        removeIds.forEach(id => { if (id.startsWith("u-")) removePersistedUserFile(id); });
      });
    }

    set((s) => ({ selectedIds: new Set(), _fsVersion: (s._fsVersion ?? 0) + 1 }));
    get().addToast(`Deleted ${ids.length} item${ids.length > 1 ? "s" : ""}`, "success");

    get().recordOperation(
      `Delete ${ids.length} item${ids.length > 1 ? "s" : ""}`,
      async () => {
        // Undo: restore every node in every subtree, then re-link roots to their old parent
        snapshots.forEach(({ subtree }) => {
          subtree.forEach(n => { filesystem[n.id] = { ...n }; });
        });
        snapshots.forEach(({ parentId, subtree }) => {
          const root = subtree[0];
          if (parentId && filesystem[parentId]) {
            const parent = filesystem[parentId];
            if (!parent.childrenIds) parent.childrenIds = [];
            if (!parent.childrenIds.includes(root.id)) parent.childrenIds.push(root.id);
          }
        });
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      },
      async () => {
        // Redo: delete again
        snapshots.forEach(({ parentId, subtree }) => {
          const root = subtree[0];
          if (parentId && filesystem[parentId]?.childrenIds) {
            filesystem[parentId].childrenIds = filesystem[parentId].childrenIds!.filter(cid => cid !== root.id);
          }
        });
        removeIds.forEach(id => { delete filesystem[id]; });
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      }
    );
  },
  renameNode: (id, newName) => {
    if (isNative()) {
      (async () => {
        const node = getNode(id);
        if (!node) return;
        const oldName = node.name;
        const result = await getStorageProvider().renameNode(id, newName);
        if (!result.ok) {
          get().addToast(`Failed to rename "${oldName}"`, "error");
          return;
        }
        const newId = result.newId;
        const parent = node.parentId ? getNode(node.parentId) : null;
        delete filesystem[id];
        filesystem[newId] = { ...node, id: newId, name: newName, modified: Date.now() };
        if (parent?.childrenIds) {
          parent.childrenIds = parent.childrenIds.map(cid => (cid === id ? newId : cid));
        }
        set((s) => ({ selectedIds: new Set(), _fsVersion: (s._fsVersion ?? 0) + 1 }));
        get().addToast("Renamed successfully", "success");
        // Note: no undo entry here. A real file's id (path) changes on
        // rename, and chaining that through multiple undo/redo cycles safely
        // needs more end-to-end testing on a real device than is possible in
        // this pass — better to not offer undo than to offer one that could
        // silently point at the wrong file.
      })();
      return;
    }
    const node = getNode(id);
    if (!node) return;
    const oldName = node.name;
    node.name = newName;
    node.modified = Date.now();
    set((s) => ({ selectedIds: new Set(), _fsVersion: (s._fsVersion ?? 0) + 1 }));
    get().addToast("Renamed successfully", "success");

    get().recordOperation(
      `Rename "${oldName}" to "${newName}"`,
      async () => {
        const n = getNode(id);
        if (n) { n.name = oldName; n.modified = Date.now(); }
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      },
      async () => {
        const n = getNode(id);
        if (n) { n.name = newName; n.modified = Date.now(); }
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      }
    );
  },
  toggleStar: (id) => {
    const node = getNode(id);
    if (node) {
      node.starred = !node.starred;
      set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      // Persist to the real favorites list (survives reloads, shown in Sidebar)
      try {
        import("@/lib/fileforge/file-history").then(({ toggleFavorite, isFavorite }) => {
          // If file-history says it's still a favorite after toggling, add;
          // otherwise remove. toggleFavorite returns the new state.
          const nowFav = !isFavorite(id);
          if (nowFav) {
            toggleFavorite({
              path: id, name: node.name, kind: node.kind,
              size: node.size, modified: node.modified,
            });
          } else {
            toggleFavorite({
              path: id, name: node.name, kind: node.kind,
              size: node.size, modified: node.modified,
            });
          }
        });
      } catch { /* best-effort */ }
    }
  },
  createFolder: (parentId, name) => {
    if (isNative()) {
      (async () => {
        try {
          const node = await getStorageProvider().createFolder(parentId, name);
          set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
          get().addToast(`Folder "${name}" created`, "success");
          get().recordOperation(
            `Create folder "${name}"`,
            async () => {
              await getStorageProvider().deleteNodes([node.id]);
              const parent = getNode(parentId);
              if (parent?.childrenIds) parent.childrenIds = parent.childrenIds.filter(cid => cid !== node.id);
              delete filesystem[node.id];
              set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
            },
            async () => {
              await getStorageProvider().createFolder(parentId, name);
              set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
            }
          );
        } catch (e) {
          get().addToast(`Failed to create folder "${name}"`, "error");
        }
      })();
      return;
    }
    const parent = getNode(parentId);
    if (!parent) return;
    const id = `n${++_nodeId}`;
    const newFolder: FileNode = {
      id,
      name,
      kind: "folder",
      size: 0,
      modified: Date.now(),
      parentId,
      childrenIds: [],
    };
    filesystem[id] = newFolder;
    if (!parent.childrenIds) parent.childrenIds = [];
    parent.childrenIds.push(id);
    set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
    get().addToast(`Folder "${name}" created`, "success");

    get().recordOperation(
      `Create folder "${name}"`,
      async () => {
        if (parent.childrenIds) parent.childrenIds = parent.childrenIds.filter(cid => cid !== id);
        delete filesystem[id];
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      },
      async () => {
        filesystem[id] = { ...newFolder };
        if (!parent.childrenIds) parent.childrenIds = [];
        if (!parent.childrenIds.includes(id)) parent.childrenIds.push(id);
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      }
    );
  },
  createFile: (parentId, name, content) => {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    let kind: FileNode['kind'] = 'text';
    if (['jpg','jpeg','png','gif','webp','bmp','svg','heic'].includes(ext)) kind = 'image';
    else if (['mp4','mkv','avi','mov','webm','flv','wmv'].includes(ext)) kind = 'video';
    else if (['mp3','flac','wav','ogg','m4a','aac'].includes(ext)) kind = 'audio';
    else if (ext === 'pdf') kind = 'pdf';
    else if (['js','ts','tsx','jsx','py','java','kt','go','rs','c','cpp','h','sh','sql','json','xml','yaml','yml','css','scss','csv'].includes(ext)) kind = 'code';
    else if (['zip','rar','7z','tar','gz','bz2'].includes(ext)) kind = 'archive';
    else if (ext === 'apk') kind = 'apk';
    else if (['doc','docx','rtf','odt'].includes(ext)) kind = 'word';
    else if (['xls','xlsx','ods'].includes(ext)) kind = 'excel';
    else if (['ppt','pptx','odp'].includes(ext)) kind = 'presentation';
    else if (['html','htm'].includes(ext)) kind = 'html';

    if (isNative()) {
      (async () => {
        const id = `${parentId.endsWith("/") ? parentId : parentId + "/"}${name}`;
        try {
          const ok = await getStorageProvider().writeTextContent(id, content ?? "");
          if (!ok) throw new Error("write failed");
          const node: FileNode = { id, name, kind, size: content?.length ?? 0, modified: Date.now(), parentId, content };
          filesystem[id] = node;
          const parent = getNode(parentId);
          if (parent) {
            if (!parent.childrenIds) parent.childrenIds = [];
            if (!parent.childrenIds.includes(id)) parent.childrenIds.push(id);
          }
          set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
          get().addToast(`File "${name}" created`, "success");
        } catch (e) {
          get().addToast(`Failed to create file "${name}"`, "error");
        }
      })();
      return;
    }

    const parent = getNode(parentId);
    if (!parent) return;
    const id = `n${++_nodeId}`;
    const newFile: FileNode = {
      id,
      name,
      kind,
      size: content?.length ?? 0,
      modified: Date.now(),
      parentId,
      content,
    };
    filesystem[id] = newFile;
    if (!parent.childrenIds) parent.childrenIds = [];
    parent.childrenIds.push(id);
    set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
    get().addToast(`File "${name}" created`, "success");
  },
  saveFileContent: (id, content) => {
    const node = getNode(id);
    if (!node) return;
    const byteSize = new TextEncoder().encode(content).length;
    if (isNative()) {
      (async () => {
        const ok = await getStorageProvider().writeTextContent(id, content);
        if (ok) {
          node.content = content;
          node.size = byteSize;
          node.modified = Date.now();
          set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
        } else {
          get().addToast(`Failed to save "${node.name}"`, "error");
        }
      })();
      return;
    }
    node.content = content;
    node.size = byteSize;
    node.modified = Date.now();
    set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 })); // trigger re-render
    if (id.startsWith("u-")) {
      import("@/lib/fileforge/real-fs").then(({ persistUserFileUpdate }) => persistUserFileUpdate(id));
    }
  },
  copyNode: (id, targetParentId) => {
    if (isNative()) {
      (async () => {
        const node = getNode(id);
        if (!node) return;
        const result = await getStorageProvider().copyNode(id, targetParentId);
        if (!result.ok || !result.newId) {
          get().addToast(`Failed to copy "${node.name}"`, "error");
          return;
        }
        const newId = result.newId;
        const copy: FileNode = { ...node, id: newId, parentId: targetParentId, modified: Date.now() };
        filesystem[newId] = copy;
        const target = getNode(targetParentId);
        if (target) {
          if (!target.childrenIds) target.childrenIds = [];
          if (!target.childrenIds.includes(newId)) target.childrenIds.push(newId);
        }
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
        get().addToast(`Copied "${node.name}"`, "success");
        // The copy itself can be undone (it's a fresh file we just created —
        // deleting it is safe and unambiguous, unlike undoing a delete).
        get().recordOperation(
          `Copy "${node.name}"`,
          async () => {
            await getStorageProvider().deleteNodes([newId]);
            const t = getNode(targetParentId);
            if (t?.childrenIds) t.childrenIds = t.childrenIds.filter(cid => cid !== newId);
            delete filesystem[newId];
            set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
          },
          async () => {
            await getStorageProvider().copyNode(id, targetParentId);
            set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
          }
        );
      })();
      return;
    }
    const node = getNode(id);
    const target = getNode(targetParentId);
    if (!node || !target) return;
    const newId = `n${++_nodeId}`;
    const copy: FileNode = {
      ...node,
      id: newId,
      name: `${node.name} (copy)`,
      parentId: targetParentId,
      modified: Date.now(),
    };
    filesystem[newId] = copy;
    if (!target.childrenIds) target.childrenIds = [];
    target.childrenIds.push(newId);
    set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
    get().addToast(`Copied "${node.name}"`, "success");

    get().recordOperation(
      `Copy "${node.name}"`,
      async () => {
        // Undo: remove the copy (and any of its own children, if it was a folder)
        const toRemove = getDescendants(newId).map(n => n.id);
        if (filesystem[targetParentId]?.childrenIds) {
          filesystem[targetParentId].childrenIds = filesystem[targetParentId].childrenIds!.filter(cid => cid !== newId);
        }
        toRemove.forEach(rid => { delete filesystem[rid]; });
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      },
      async () => {
        filesystem[newId] = { ...copy };
        const t = getNode(targetParentId);
        if (t) {
          if (!t.childrenIds) t.childrenIds = [];
          if (!t.childrenIds.includes(newId)) t.childrenIds.push(newId);
        }
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      }
    );
  },
  moveNode: (id, targetParentId) => {
    if (id === targetParentId) return;
    if (isNative()) {
      (async () => {
        const node = getNode(id);
        if (!node || !node.parentId) return;
        const descendantIds = new Set(getDescendants(id).map(n => n.id));
        if (descendantIds.has(targetParentId)) {
          get().addToast("Can't move a folder into itself", "error");
          return;
        }
        const oldParentId = node.parentId;
        const result = await getStorageProvider().moveNode(id, targetParentId);
        if (!result.ok) {
          get().addToast(`Failed to move "${node.name}"`, "error");
          return;
        }
        const newId = result.newId;
        const oldParent = getNode(oldParentId);
        if (oldParent?.childrenIds) oldParent.childrenIds = oldParent.childrenIds.filter(cid => cid !== id);
        delete filesystem[id];
        filesystem[newId] = { ...node, id: newId, parentId: targetParentId, modified: Date.now() };
        const target = getNode(targetParentId);
        if (target) {
          if (!target.childrenIds) target.childrenIds = [];
          if (!target.childrenIds.includes(newId)) target.childrenIds.push(newId);
        }
        set((s) => ({ selectedIds: new Set(), _fsVersion: (s._fsVersion ?? 0) + 1 }));
        get().addToast(`Moved "${node.name}"`, "success");
        // Same reasoning as renameNode: the id changes on a real move, and
        // chaining that safely through undo/redo needs real-device testing
        // I can't do here — no undo entry for native moves in this pass.
      })();
      return;
    }
    const node = getNode(id);
    const target = getNode(targetParentId);
    if (!node || !target || !node.parentId) return;
    // F3: prevent moving a folder into itself or into one of its own descendants
    const descendantIds = new Set(getDescendants(id).map(n => n.id));
    if (descendantIds.has(targetParentId)) {
      get().addToast("Can't move a folder into itself", "error");
      return;
    }
    const oldParentId = node.parentId;
    const oldParent = getNode(oldParentId);
    if (oldParent?.childrenIds) {
      oldParent.childrenIds = oldParent.childrenIds.filter(cid => cid !== id);
    }
    if (!target.childrenIds) target.childrenIds = [];
    target.childrenIds.push(id);
    node.parentId = targetParentId;
    set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
    get().addToast(`Moved "${node.name}"`, "success");

    get().recordOperation(
      `Move "${node.name}"`,
      async () => {
        const n = getNode(id);
        const from = getNode(targetParentId);
        const to = getNode(oldParentId);
        if (!n || !to) return;
        if (from?.childrenIds) from.childrenIds = from.childrenIds.filter(cid => cid !== id);
        if (!to.childrenIds) to.childrenIds = [];
        if (!to.childrenIds.includes(id)) to.childrenIds.push(id);
        n.parentId = oldParentId;
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      },
      async () => {
        const n = getNode(id);
        const from = getNode(oldParentId);
        const to = getNode(targetParentId);
        if (!n || !to) return;
        if (from?.childrenIds) from.childrenIds = from.childrenIds.filter(cid => cid !== id);
        if (!to.childrenIds) to.childrenIds = [];
        if (!to.childrenIds.includes(id)) to.childrenIds.push(id);
        n.parentId = targetParentId;
        set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      }
    );
  },

  addToast: (message, type = "info") => {
    const id = `t${++_toastId}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }));
    }, 3000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),

  // ============ NEW FEATURES IMPLEMENTATIONS ============

  // Clipboard
  copyToClipboard: (nodeIds, operation) => {
    if (nodeIds.length === 0) return;
    const names = nodeIds.map(id => getNode(id)?.name).filter(Boolean);
    set({ clipboard: { id: `clip-${Date.now()}`, operation, nodeIds: [...nodeIds] } });
    const label = names.length === 1 ? `"${names[0]}"` : `${names.length} items`;
    get().addToast(`${operation === "copy" ? "Copied" : "Cut"} ${label}`, "info");
  },
  pasteFromClipboard: (targetParentId) => {
    const clip = get().clipboard;
    if (!clip) return;
    // For each node, perform copy/move. Use sequential awaits to avoid concurrent FS mutations.
    (async () => {
      for (const nodeId of clip.nodeIds) {
        const node = getNode(nodeId);
        if (!node) continue;
        if (clip.operation === "copy") {
          await new Promise<void>(resolve => {
            get().copyNode(nodeId, targetParentId);
            // copyNode is async internally; wait a microtask
            setTimeout(resolve, 0);
          });
        } else {
          await new Promise<void>(resolve => {
            get().moveNode(nodeId, targetParentId);
            setTimeout(resolve, 0);
          });
        }
      }
      set({ clipboard: null });
    })();
  },
  clearClipboard: () => set({ clipboard: null }),

  // Batch progress
  setBatchProgress: (p) => set({ batchProgress: p }),
  cancelBatch: () => set((s) => ({
    batchProgress: s.batchProgress ? { ...s.batchProgress, cancelled: true } : null,
  })),

  // Undo/Redo
  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,
  recordOperation: (description, undo, redo) => set((s) => ({
    undoStack: [...s.undoStack.slice(-49), { description, undo, redo }],
    redoStack: [],
  })),
  performUndo: async () => {
    const s = get();
    if (s.undoStack.length === 0) return;
    const op = s.undoStack[s.undoStack.length - 1];
    await op.undo();
    set({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, op],
    });
    get().addToast(`Undone: ${op.description}`, "info");
  },
  performRedo: async () => {
    const s = get();
    if (s.redoStack.length === 0) return;
    const op = s.redoStack[s.redoStack.length - 1];
    await op.redo();
    set({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, op],
    });
    get().addToast(`Redone: ${op.description}`, "info");
  },

  // File watcher
  toggleFileWatch: () => set((s) => ({ fileWatchEnabled: !s.fileWatchEnabled })),
  bumpFsVersion: () => set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 })),

  // Upload files
  uploadFiles: async (files, parentId) => {
    if (isNative()) {
      // On native: write each File to disk via the storage provider.
      const provider = getStorageProvider();
      const ids: string[] = [];
      for (const file of files) {
        const id = `${parentId.endsWith("/") ? parentId : parentId + "/"}${file.name}`;
        try {
          const buf = await file.arrayBuffer();
          const content = bufferToBase64(buf);
          const ok = await provider.writeFileContent(id, content);
          if (!ok) throw new Error("write failed");
          // Mirror into in-memory filesystem
          const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
          let kind: FileNode['kind'] = 'unknown';
          if (['jpg','jpeg','png','gif','webp','bmp','svg','heic'].includes(ext)) kind = 'image';
          else if (['mp4','mkv','avi','mov','webm','flv','wmv'].includes(ext)) kind = 'video';
          else if (['mp3','flac','wav','ogg','m4a','aac'].includes(ext)) kind = 'audio';
          else if (ext === 'pdf') kind = 'pdf';
          else if (['js','ts','tsx','jsx','py','java','kt','go','rs','c','cpp','h','sh','sql','json','xml','yaml','yml','css','scss','csv'].includes(ext)) kind = 'code';
          else if (['zip','rar','7z','tar','gz','bz2'].includes(ext)) kind = 'archive';
          else if (ext === 'apk') kind = 'apk';
          const node: FileNode = { id, name: file.name, kind, size: file.size, modified: Date.now(), parentId };
          filesystem[id] = node;
          const parent = getNode(parentId);
          if (parent) {
            if (!parent.childrenIds) parent.childrenIds = [];
            if (!parent.childrenIds.includes(id)) parent.childrenIds.push(id);
          }
          ids.push(id);
        } catch (e) {
          get().addToast(`Failed to upload "${file.name}"`, "error");
        }
      }
      set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
      get().addToast(`Uploaded ${ids.length} file${ids.length > 1 ? "s" : ""}`, "success");
      return ids;
    }
    // Web fallback: store in IndexedDB via real-fs
    const { addUploadedFiles } = await import("@/lib/fileforge/real-fs");
    const ids = await addUploadedFiles(files, parentId);
    get().addToast(`Uploaded ${files.length} file${files.length > 1 ? "s" : ""}`, "success");
    set((s) => ({ _fsVersion: (s._fsVersion ?? 0) + 1 }));
    return ids;
  },
  };
});

// Expose store globally for debugging/testing
if (typeof window !== "undefined") {
  (window as any).__fileforgeStore = useFileForge;
}

// Persist key state fields whenever they change (debounced via microtask)
if (typeof window !== "undefined") {
  let persistTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingState: ReturnType<typeof useFileForge.getState> | null = null;

  const persistSnapshot = (state: ReturnType<typeof useFileForge.getState>) => {
    persistState({
      theme: state.theme,
      sidebarPinned: state.sidebarPinned,
      dualPane: state.dualPane,
      dualPanePath: state.dualPanePath,
      viewMode: state.viewMode,
      itemSize: state.itemSize,
      sortKey: state.sortKey,
      sortDir: state.sortDir,
      showHidden: state.showHidden,
      showThumbnails: state.showThumbnails,
      showExtensions: state.showExtensions,
      showFolderItemCount: state.showFolderItemCount,
      foldersFirst: state.foldersFirst,
      groupBy: state.groupBy,
      density: state.density,
      visibleColumns: state.visibleColumns,
      folderViewPrefs: state.folderViewPrefs,
      applyToAll: state.applyToAll,
    });
    saveWindowState(state.windows);
  };

  const schedulePersist = (state: ReturnType<typeof useFileForge.getState>) => {
    pendingState = state;
    if (persistTimer !== null) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      const snapshot = pendingState;
      pendingState = null;
      if (snapshot) persistSnapshot(snapshot);
    }, 250);
  };

  useFileForge.subscribe(schedulePersist);

  const flushPersist = () => {
    if (persistTimer !== null) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    const snapshot = pendingState;
    pendingState = null;
    if (snapshot) persistSnapshot(snapshot);
  };

  window.addEventListener("pagehide", flushPersist);
  window.addEventListener("beforeunload", flushPersist);
}

// Helper: ArrayBuffer to base64 (for native write)
function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]);
  }
  return btoa(binary);
}
