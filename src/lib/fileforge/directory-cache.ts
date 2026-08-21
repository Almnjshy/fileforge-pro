// FileForge Pro — Directory result cache
//
// A bounded, versioned, in-flight-deduplicating cache for directory listings.
// The cache is deliberately short-lived: mutations invalidate affected
// directories immediately, while the TTL protects us from external changes
// made outside FileForge (another app, file picker, adb, etc.).

import type { FileNode } from "./filesystem";

interface Entry {
  value: FileNode[];
  expiresAt: number;
  lastUsedAt: number;
}

interface Pending {
  promise: Promise<FileNode[]>;
}

export interface DirectoryCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  maxItemsPerEntry?: number;
  maxItemsTotal?: number;
}

export class DirectoryCache {
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxItemsPerEntry: number;
  private readonly maxItemsTotal: number;
  private totalItems = 0;
  private globalGeneration = 0;
  private entries = new Map<string, Entry>();
  private pending = new Map<string, Pending>();
  private generations = new Map<string, number>();

  constructor(options: DirectoryCacheOptions = {}) {
    this.ttlMs = Math.max(250, options.ttlMs ?? 3000);
    this.maxEntries = Math.max(4, options.maxEntries ?? 32);
    this.maxItemsPerEntry = Math.max(100, options.maxItemsPerEntry ?? 5000);
    this.maxItemsTotal = Math.max(this.maxItemsPerEntry, options.maxItemsTotal ?? 15000);
  }

  get(path: string, showHidden: boolean): FileNode[] | null {
    const key = this.key(path, showHidden);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.totalItems -= entry.value.length;
      this.entries.delete(key);
      return null;
    }
    entry.lastUsedAt = Date.now();
    // Never expose the cache's mutable array to callers.
    return entry.value.slice();
  }

  async getOrLoad(
    path: string,
    showHidden: boolean,
    loader: () => Promise<FileNode[]>,
  ): Promise<FileNode[]> {
    const cached = this.get(path, showHidden);
    if (cached) return cached;

    const key = this.key(path, showHidden);
    const existing = this.pending.get(key);
    if (existing) return existing.promise;

    const generation = this.generations.get(key) ?? 0;
    const globalGeneration = this.globalGeneration;
    const promise = loader().then(async (value) => {
      const snapshot = value.slice();
      if ((this.generations.get(key) ?? 0) !== generation || this.globalGeneration !== globalGeneration) {
        // A mutation occurred while the list was loading. Do not return the
        // stale snapshot to the UI; perform one fresh read under the new
        // generation. The caller remains on a single logical request.
        const fresh = (await loader()).slice();
        const freshStillCurrent =
          (this.generations.get(key) ?? 0) === generation + 1 &&
          this.globalGeneration === globalGeneration;
        if (freshStillCurrent && fresh.length <= this.maxItemsPerEntry) {
          const previous = this.entries.get(key);
          if (previous) this.totalItems -= previous.value.length;
          this.entries.set(key, {
            value: fresh,
            expiresAt: Date.now() + this.ttlMs,
            lastUsedAt: Date.now(),
          });
          this.totalItems += fresh.length;
          this.evictIfNeeded();
        }
        return fresh;
      }
      if (snapshot.length <= this.maxItemsPerEntry) {
        const previous = this.entries.get(key);
        if (previous) this.totalItems -= previous.value.length;
        this.entries.set(key, {
          value: snapshot,
          expiresAt: Date.now() + this.ttlMs,
          lastUsedAt: Date.now(),
        });
        this.totalItems += snapshot.length;
        this.evictIfNeeded();
      }
      return snapshot.slice();
    }).finally(() => {
      this.pending.delete(key);
      // A generation is only a tombstone while a request/entry exists. Once
      // the request settles and nothing is cached, release it so an app that
      // visits thousands of unique folders does not grow the generation map
      // without bound.
      if (!this.entries.has(key) && !this.pending.has(key)) {
        this.generations.delete(key);
      }
    });

    this.pending.set(key, { promise });
    return promise;
  }

  invalidate(path: string): void {
    // A changed directory invalidates both visibility variants. A changed
    // child also invalidates its parent via the provider's mutation hooks.
    for (const showHidden of [false, true]) {
      const key = this.key(path, showHidden);
      this.generations.set(key, (this.generations.get(key) ?? 0) + 1);
      const removed = this.entries.get(key);
      if (removed) this.totalItems -= removed.value.length;
      this.entries.delete(key);
    }
  }

  invalidateMany(paths: Iterable<string>): void {
    for (const path of paths) this.invalidate(path);
  }

  clear(): void {
    this.entries.clear();
    this.pending.clear();
    this.generations.clear();
    this.totalItems = 0;
    this.globalGeneration += 1;
  }

  size(): number {
    return this.entries.size;
  }

  private key(path: string, showHidden: boolean): string {
    return `${showHidden ? "1" : "0"}|${path}`;
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries || this.totalItems > this.maxItemsTotal) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [key, entry] of this.entries) {
        if (entry.lastUsedAt < oldestTime) {
          oldestTime = entry.lastUsedAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      const removed = this.entries.get(oldestKey);
      if (removed) this.totalItems -= removed.value.length;
      this.entries.delete(oldestKey);
    }
  }
}
