// FileForge Pro — View Preferences Store
// Handles: viewMode, itemSize, sort, group, density, columns, show flags
// Separated from the God Store.

import { create } from "zustand";
import type {
  ViewMode, ItemSize, SortKey, SortDir, GroupBy, Density, ColumnConfig, FileViewState,
} from "@/lib/fileforge/types";

interface ViewPreferencesState {
  viewMode: ViewMode;
  itemSize: ItemSize;
  sortKey: SortKey;
  sortDir: SortDir;
  showHidden: boolean;
  showThumbnails: boolean;
  showExtensions: boolean;
  showFolderItemCount: boolean;
  foldersFirst: boolean;
  groupBy: GroupBy;
  density: Density;
  visibleColumns: ColumnConfig;
  folderViewPrefs: Record<string, Partial<FileViewState>>;
  applyToAll: boolean;

  setViewMode: (v: ViewMode) => void;
  setItemSize: (s: ItemSize) => void;
  setSortKey: (k: SortKey) => void;
  setSortDir: (d: SortDir) => void;
  setApplyToAll: (v: boolean) => void;
  setShowThumbnails: (v: boolean) => void;
  setShowExtensions: (v: boolean) => void;
  setShowFolderItemCount: (v: boolean) => void;
  setFoldersFirst: (v: boolean) => void;
  setGroupBy: (g: GroupBy) => void;
  setDensity: (d: Density) => void;
  toggleColumn: (col: keyof ColumnConfig) => void;
  resetViewSettings: () => void;
  saveAsDefaultView: () => void;
  applyToThisFolder: (currentPath: string) => void;
  rememberFolderView: (path: string, viewMode: ViewMode, itemSize: ItemSize) => void;
}

const DEFAULT_COLUMNS: ColumnConfig = {
  name: true, type: true, size: true, modified: true,
  created: false, extension: false, dimensions: false,
  duration: false, itemCount: false, path: false,
};

export const useViewPreferences = create<ViewPreferencesState>((set, get) => ({
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
  visibleColumns: { ...DEFAULT_COLUMNS },
  folderViewPrefs: {},
  applyToAll: false,

  setViewMode: (v) => {
    const s = get();
    if (s.applyToAll) {
      set({ viewMode: v });
    } else {
      set({
        viewMode: v,
        folderViewPrefs: { ...s.folderViewPrefs, ["currentPath_placeholder"]: { viewMode: v } },
      });
    }
  },

  setItemSize: (sz) => {
    const s = get();
    if (s.applyToAll) {
      set({ itemSize: sz });
    } else {
      set({ itemSize: sz });
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
    visibleColumns: { ...DEFAULT_COLUMNS },
  }),

  saveAsDefaultView: () => {
    set({ folderViewPrefs: {}, applyToAll: true });
  },

  applyToThisFolder: (currentPath) => {
    const s = get();
    const prefs = { ...s.folderViewPrefs };
    prefs[currentPath] = {
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
  },

  rememberFolderView: (path, viewMode, itemSize) =>
    set((s) => ({ folderViewPrefs: { ...s.folderViewPrefs, [path]: { viewMode, itemSize } } })),
}));
