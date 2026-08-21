// FileForge Pro — Real file-open history + favorites tracking
//
// Previous implementation read favorites/recents from the in-memory `filesystem`
// mock, which only ever contained mock nodes. On native Android, real files
// live on disk with path-based ids and are never added to the `filesystem`
// map unless explicitly listed by the storage provider — so the Sidebar's
// "Favorites" and "Recent" sections always showed mock files (or empty).
//
// This module provides a real persisted history of opened files and a real
// favorites list keyed by file path, surviving app restarts via localStorage.

"use client";

import { logger } from "./logger";

export interface OpenedFile {
  path: string;       // unique key — file path on native, "u-xxx" on web
  name: string;
  kind: string;        // FileKind string
  size: number;
  modified: number;
  openedAt: number;    // when the user opened it (epoch ms)
}

const HISTORY_KEY = "fileforge-opened-history";
const FAVORITES_KEY = "fileforge-favorites";
const MAX_HISTORY = 20;

// ============ Recent / History ============

export function getOpenedHistory(): OpenedFile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.sort((a: OpenedFile, b: OpenedFile) => b.openedAt - a.openedAt);
  } catch {
    return [];
  }
}

export function recordOpenedFile(file: Omit<OpenedFile, "openedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const history = getOpenedHistory().filter(f => f.path !== file.path);
    history.unshift({ ...file, openedAt: Date.now() });
    const trimmed = history.slice(0, MAX_HISTORY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    logger.warn("file-history", "Failed to record opened file", e);
  }
}

export function clearOpenedHistory(): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(HISTORY_KEY); } catch { /* ignore */ }
}

// ============ Favorites ============

export function getFavoritePaths(): OpenedFile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch {
    return [];
  }
}

export function isFavorite(path: string): boolean {
  return getFavoritePaths().some(f => f.path === path);
}

export function addFavorite(file: Omit<OpenedFile, "openedAt">): void {
  if (typeof window === "undefined") return;
  try {
    const favs = getFavoritePaths();
    if (favs.some(f => f.path === file.path)) return;
    favs.push({ ...file, openedAt: Date.now() });
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch (e) {
    logger.warn("file-history", "Failed to add favorite", e);
  }
}

export function removeFavorite(path: string): void {
  if (typeof window === "undefined") return;
  try {
    const favs = getFavoritePaths().filter(f => f.path !== path);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch (e) {
    logger.warn("file-history", "Failed to remove favorite", e);
  }
}

export function toggleFavorite(file: Omit<OpenedFile, "openedAt">): boolean {
  const wasFav = isFavorite(file.path);
  if (wasFav) removeFavorite(file.path);
  else addFavorite(file);
  return !wasFav;
}

// ============ Standard Android category paths ============
// Used by the Sidebar's Categories section. On Android these are real
// directories under the primary external storage root.

import { isNative } from "./native-bridge";

export interface CategoryPath {
  id: string;
  // On native: a subdirectory name relative to the external storage root.
  // On web: falls back to the mock id in `filesystem`.
  relativePath: string;
  // The kind filter used to count files of this category anywhere in the FS
  kinds: string[];
}

export const CATEGORY_PATHS: CategoryPath[] = [
  { id: "downloads", relativePath: "Download", kinds: [] }, // folder-based
  { id: "pictures",  relativePath: "DCIM",     kinds: ["image"] },
  { id: "pictures2", relativePath: "Pictures", kinds: ["image"] },
  { id: "videos",   relativePath: "Movies",    kinds: ["video"] },
  { id: "music",    relativePath: "Music",     kinds: ["audio"] },
  { id: "documents",relativePath: "Documents", kinds: ["text", "code", "pdf", "word", "excel", "presentation"] },
];

/** Resolve a category id to a real absolute path on Android native. */
export function resolveCategoryPath(categoryId: string): string {
  if (isNative()) {
    const cat = CATEGORY_PATHS.find(c => c.id === categoryId);
    if (cat) {
      // On Android: /storage/emulated/0/<relativePath>
      return `/storage/emulated/0/${cat.relativePath}`;
    }
  }
  // Fallback: return the mock id used in `filesystem.ts`
  const map: Record<string, string> = {
    downloads: "downloads",
    pictures: "pictures",
    videos: "videos",
    music: "music",
    documents: "documents",
  };
  return map[categoryId] ?? categoryId;
}

/** Resolve the internal storage root path. */
export function resolveInternalStoragePath(): string {
  if (isNative()) return "/storage/emulated/0";
  return "root";
}
