// FileForge Pro — Thumbnail Manager
//
// Central thumbnail system used by ALL components:
//   FileBrowser (Grid/List/Details), SearchPanel, Sidebar recents,
//   FloatingWindow folder contents, ArchiveBrowser.
//
// Architecture:
//   UI → useThumbnail hook → ThumbnailManager → Native plugin (Kotlin)
//                                      ↓
//                              ThumbnailCache (memory LRU + IndexedDB)
//
// Cache key: `${path}:${lastModified}:${fileSize}`
//   — if the file changes, the key changes, a new thumbnail is generated.
//   — if the file hasn't changed, the cached thumbnail is returned instantly.
//
// Request deduplication: if two components ask for the same thumbnail at the
// same time, only one native call is made. Both get the same promise.
//
// All native calls run on background threads (Kotlin ioScope). The JS side
// is fully async — no synchronous disk I/O on the main thread.

"use client";

import { nativeFileSystem, isNative } from "./native-bridge";
import { getThumbnail as getWebThumbnail, setThumbnail as setWebThumbnail } from "./real-fs";
import { logger } from "./logger";

// ============ Types ============

export interface ThumbnailRequest {
  path: string;
  kind: string;      // "image" | "video" | other
  size?: number;     // max dimension in px, default 200
  lastModified?: number;
  fileSize?: number;
  /** Higher values are requested by visible UI; lower values are prefetch work. */
  priority?: number;
}

export interface ThumbnailResult {
  dataUrl: string | null;  // data:image/jpeg;base64,...  or null on failure
  loading: boolean;
  error: string | null;
}

// ============ Thumbnail Cache ============
// Adaptive RAM working-set cache; durable thumbnails remain in the native disk cache.

class MemoryCache {
  private map = new Map<string, { value: string; bytes: number }>();
  private totalBytes = 0;

  /**
   * This is a weighted, adaptive working-set cache rather than a fixed
   * "N thumbnails / M MiB" cache. The cache is deliberately a RAM working
   * set: the durable thumbnail cache lives in the native cache directory.
   *
   * navigator.deviceMemory is only a coarse hint, so the budget is recalculated
   * when the cache is written. There is no fixed item-count ceiling.
   */
  private memoryBudgetBytes(): number {
    const deviceMemory = typeof navigator !== "undefined"
      ? Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4)
      : 4;

    // Target a modest fraction of the browser/WebView's estimated physical
    // memory. The OS remains authoritative; this is only a cache budget.
    const estimatedPhysical = Math.max(512, deviceMemory * 1024) * 1024 * 1024;
    const budget = Math.floor(estimatedPhysical * 0.06);
    return Math.max(16 * 1024 * 1024, Math.min(384 * 1024 * 1024, budget));
  }

  get(key: string): string | null {
    const entry = this.map.get(key);
    if (!entry) return null;
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    const bytes = this.estimateBytes(value);
    const previous = this.map.get(key);
    if (previous) this.totalBytes -= previous.bytes;
    this.map.delete(key);
    this.map.set(key, { value, bytes });
    this.totalBytes += bytes;

    const budget = this.memoryBudgetBytes();
    while (this.totalBytes > budget && this.map.size > 1) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const old = this.map.get(oldest);
      if (old) this.totalBytes -= old.bytes;
      this.map.delete(oldest);
    }
  }

  invalidate(key: string): void {
    const entry = this.map.get(key);
    if (entry) this.totalBytes -= entry.bytes;
    this.map.delete(key);
  }

  keys(): string[] {
    return Array.from(this.map.keys());
  }

  clear(): void {
    this.map.clear();
    this.totalBytes = 0;
  }

  private estimateBytes(value: string): number {
    return value.length * 2;
  }
}

// ============ Thumbnail Manager ============

class ThumbnailManager {
  private memCache = new MemoryCache();
  private pendingRequests = new Map<string, Promise<string | null>>();
  private failedRequests = new Map<string, number>();
  private readonly failureCooldownMs = 15_000;
  private activeGenerations = 0;
  private readonly maxConcurrentGenerations = 4;
  private generationQueue: Array<{ resolve: () => void; priority: number; sequence: number }> = [];
  private queueSequence = 0;

  /**
   * Build a cache key from path + lastModified + fileSize.
   * If the file changes, the key changes → new thumbnail is generated.
   */
  private cacheKey(req: ThumbnailRequest): string {
    return `${req.path}:${req.lastModified ?? 0}:${req.fileSize ?? 0}:${req.kind}:${req.size ?? 200}`;
  }

  /**
   * Get a thumbnail for a file. Returns a data URL or null.
   * Checks memory cache → web sessionStorage → generates via native plugin.
   * Deduplicates concurrent requests for the same key.
   */
  async getThumbnail(req: ThumbnailRequest): Promise<string | null> {
    // Native thumbnails are useful for rich media and documents; generic file kinds keep their icon.
    const nativeKinds = new Set(["image", "video", "audio", "pdf", "archive"]);
    if (!nativeKinds.has(req.kind)) return null;

    const key = this.cacheKey(req);

    // 1. Check memory cache
    const cached = this.memCache.get(key);
    if (cached !== null) return cached;

    // 2. Check if this request is already in-flight (dedup)
    const pending = this.pendingRequests.get(key);
    if (pending) return pending;

    // 3. Check web thumbnail cache (sessionStorage, for uploaded files)
    if (!isNative()) {
      const webThumb = getWebThumbnail(req.path);
      if (webThumb && webThumb.startsWith("data:")) {
        this.memCache.set(key, webThumb);
        return webThumb;
      }
    }

    // 4. Avoid hammering a failing source, but allow retry after a short cooldown.
    const failedAt = this.failedRequests.get(key);
    if (failedAt !== undefined) {
      if (Date.now() - failedAt < this.failureCooldownMs) return null;
      this.failedRequests.delete(key);
    }

    // 5. Start generation
    const promise = this.generateWithCapacity(req);
    this.pendingRequests.set(key, promise);

    try {
      const result = await promise;
      if (result) {
        this.memCache.set(key, result);
        // Also persist to web cache for uploaded files
        if (!isNative() && req.path.startsWith("u-")) {
          setWebThumbnail(req.path, result);
        }
      } else {
        this.failedRequests.set(key, Date.now());
      }
      return result;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  /**
   * Generate a thumbnail via the native plugin or web fallback.
   */
  private async generateWithCapacity(req: ThumbnailRequest): Promise<string | null> {
    if (this.activeGenerations >= this.effectiveConcurrency()) {
      await new Promise<void>(resolve => {
        this.generationQueue.push({
          resolve,
          priority: req.priority ?? 0,
          sequence: this.queueSequence++,
        });
        this.generationQueue.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
      });
    }

    this.activeGenerations++;
    try {
      return await this.generateThumbnail(req);
    } finally {
      this.activeGenerations--;
      const next = this.generationQueue.shift();
      next?.resolve();
    }
  }


  /**
   * Decode concurrency is deliberately adaptive. Four concurrent decoders was
   * too arbitrary for both low-end phones and high-end tablets. Use available
   * processor parallelism as the primary signal, while keeping a conservative
   * ceiling because image/video/PDF decoding is memory-heavy.
   */
  private effectiveConcurrency(): number {
    const cores = typeof navigator !== "undefined"
      ? Math.max(1, Number(navigator.hardwareConcurrency ?? 2))
      : 2;
    return Math.max(1, Math.min(8, Math.floor(cores / 2) || 1));
  }

  private async generateThumbnail(req: ThumbnailRequest): Promise<string | null> {
    try {
      if (isNative() && (req.path.startsWith("/") || req.path.startsWith("content://"))) {
        // Native: call Kotlin generateThumbnail
        const maxSize = req.size ?? 200;
        const result = await nativeFileSystem.generateThumbnail(req.path, req.kind, maxSize);
        if (result) {
          // The native plugin returns a raw base64 string (no data: prefix)
          return result.startsWith("data:") ? result : `data:image/jpeg;base64,${result}`;
        }
        return null;
      } else {
        // Web: generate from node content if available
        const { getNode } = await import("./filesystem");
        const node = getNode(req.path);
        if (node?.content?.startsWith("data:")) {
          // It's already a data URL — use as-is (could be the full image)
          // For uploaded files, a thumbnail was already generated in addUploadedFiles
          const webThumb = getWebThumbnail(req.path);
          return webThumb ?? null;
        }
        return null;
      }
    } catch (e) {
      logger.warn("thumbnail-manager", `Failed to generate thumbnail for ${req.path}`, e);
      return null;
    }
  }

  /**
   * Invalidate cache for a specific file (called after mutations).
   */
  invalidate(path: string): void {
    // Invalidate all keys that start with this path
    // (We don't know the exact lastModified/fileSize, so we clear all variants)
    // This is safe because the memory cache is small.
    for (const key of this.memCache.keys()) {
      if (key.startsWith(path + ":")) {
        this.memCache.invalidate(key);
        this.failedRequests.delete(key);
      }
    }
    for (const key of Array.from(this.failedRequests.keys())) {
      if (key.startsWith(path + ":")) this.failedRequests.delete(key);
    }
  }

  /**
   * Clear all cached thumbnails.
   */
  clearAll(): void {
    this.memCache.clear();
    this.failedRequests.clear();
    this.pendingRequests.clear();
    // Do not leave queued callers blocked when the cache is explicitly reset.
    const queued = this.generationQueue.splice(0);
    for (const waiter of queued) waiter.resolve();
  }
}

// Singleton
export const thumbnailManager = new ThumbnailManager();
