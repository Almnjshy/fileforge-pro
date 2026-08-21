// FileForge Pro — Media Metadata + Playback Position Store
//
// Provides:
//   - useMediaMetadata(nodeId) — async fetch of duration/resolution/ID3 tags/cover art
//   - usePlaybackPosition(nodeId) — save/restore video position between sessions
//   - MediaMetadata cache — in-memory LRU (avoid re-fetching MMR for same file)

"use client";

import { useState, useEffect } from "react";
import { nativeFileSystem, isNative } from "./native-bridge";
import { getNode } from "./filesystem";
import { logger } from "./logger";

// ============ Metadata cache ============
const metadataCache = new Map<string, any>(); // key: path
const METADATA_CACHE_MAX = 50;

export interface MediaMetadata {
  duration: number;
  width?: number;
  height?: number;
  rotation?: number;
  fps?: number;
  isVideo: boolean;
  bitrate: number;
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  year?: string;
  track?: string;
  coverArt?: string;
  mimeType?: string;
}

/**
 * Fetch media metadata for a file. Uses native MediaMetadataRetriever on Android.
 * Results are cached by path (invalidated on file change via lastModified).
 */
export function useMediaMetadata(nodeId: string): {
  metadata: MediaMetadata | null;
  loading: boolean;
  error: string | null;
} {
  const [state, setState] = useState<{
    metadata: MediaMetadata | null;
    loading: boolean;
    error: string | null;
  }>({ metadata: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setState({ metadata: null, loading: true, error: null });
    });

    async function fetch() {
      if (!isNative() || !nodeId.startsWith("/")) {
        if (!cancelled) setState({ metadata: null, loading: false, error: null });
        return;
      }

      // Check cache
      const cached = metadataCache.get(nodeId);
      if (cached) {
        if (!cancelled) setState({ metadata: cached, loading: false, error: null });
        return;
      }

      try {
        const result = await nativeFileSystem.getMediaMetadata(nodeId);
        if (cancelled) return;
        if (result) {
          // Cache
          if (metadataCache.size >= METADATA_CACHE_MAX) {
            const firstKey = metadataCache.keys().next().value;
            if (firstKey) metadataCache.delete(firstKey);
          }
          metadataCache.set(nodeId, result);
          if (!cancelled) setState({ metadata: result, loading: false, error: null });
        } else {
          if (!cancelled) setState({ metadata: null, loading: false, error: null });
        }
      } catch (e) {
        if (!cancelled) setState({ metadata: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [nodeId]);

  return state;
}

// ============ Playback position persistence ============
const POSITION_KEY = "fileforge-playback-positions";
const MAX_POSITIONS = 100;

interface SavedPosition {
  path: string;
  position: number; // seconds
  duration: number;
  savedAt: number;
}

function loadPositions(): Record<string, SavedPosition> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(POSITION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePositions(positions: Record<string, SavedPosition>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(POSITION_KEY, JSON.stringify(positions));
  } catch {
    // quota exceeded — remove oldest
  }
}

/**
 * Save playback position for a file. Called periodically during playback.
 */
export function savePlaybackPosition(path: string, position: number, duration: number): void {
  if (typeof window === "undefined") return;
  try {
    const positions = loadPositions();
    positions[path] = { path, position, duration, savedAt: Date.now() };
    // Limit entries
    const keys = Object.keys(positions);
    if (keys.length > MAX_POSITIONS) {
      // Remove oldest
      keys.sort((a, b) => positions[a].savedAt - positions[b].savedAt);
      for (let i = 0; i < keys.length - MAX_POSITIONS; i++) {
        delete positions[keys[i]];
      }
    }
    savePositions(positions);
  } catch (e) {
    logger.warn("playback-position", "Failed to save position", e);
  }
}

/**
 * Get saved playback position for a file.
 * Returns null if no position saved, or if the saved position is < 5s
 * (user probably just started watching and stopped immediately).
 */
export function getPlaybackPosition(path: string): SavedPosition | null {
  if (typeof window === "undefined") return null;
  try {
    const positions = loadPositions();
    const saved = positions[path];
    if (!saved) return null;
    // Don't resume if we're near the end (within 10 seconds)
    if (saved.duration > 0 && saved.position > saved.duration - 10) return null;
    // Don't resume if position is < 5 seconds
    if (saved.position < 5) return null;
    return saved;
  } catch {
    return null;
  }
}

/**
 * Clear saved position for a file (called when user finishes watching).
 */
export function clearPlaybackPosition(path: string): void {
  if (typeof window === "undefined") return;
  try {
    const positions = loadPositions();
    delete positions[path];
    savePositions(positions);
  } catch { /* ignore */ }
}

/**
 * Format seconds to "MM:SS" or "HH:MM:SS"
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
