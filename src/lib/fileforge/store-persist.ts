// FileForge Pro — Persisted state slice (localStorage-backed)
"use client";

import type { ViewMode, ItemSize, SortKey, SortDir, ThemeMode, GroupBy, Density, ColumnConfig, FileViewState } from "./types";

const STORAGE_KEY = "fileforge-state-v2";

export interface PersistedState {
  theme?: ThemeMode;
  sidebarPinned?: boolean;
  dualPane?: boolean;
  dualPanePath?: string | null;
  viewMode?: ViewMode;
  itemSize?: ItemSize;
  sortKey?: SortKey;
  sortDir?: SortDir;
  showHidden?: boolean;
  showThumbnails?: boolean;
  showExtensions?: boolean;
  showFolderItemCount?: boolean;
  foldersFirst?: boolean;
  groupBy?: GroupBy;
  density?: Density;
  visibleColumns?: ColumnConfig;
  folderViewPrefs?: Record<string, Partial<FileViewState>>;
  applyToAll?: boolean;
}

export function loadPersistedState(): PersistedState {
  if (typeof window === "undefined") return {};
  try {
    // Try v2 first, fall back to v1 for migration
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) raw = localStorage.getItem("fileforge-state-v1");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as PersistedState;
  } catch {
    return {};
  }
}

export function persistState(state: PersistedState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage disabled — fail silently
  }
}
