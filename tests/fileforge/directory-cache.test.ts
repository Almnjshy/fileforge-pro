import { describe, expect, test } from "bun:test";
import { DirectoryCache } from "../../src/lib/fileforge/directory-cache";

describe("DirectoryCache", () => {
  test("deduplicates concurrent directory loads", async () => {
    const cache = new DirectoryCache({ ttlMs: 1000, maxEntries: 4 });
    let calls = 0;
    const load = async () => {
      calls++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return [{ id: String(calls), name: "file.txt" } as any];
    };

    const [a, b] = await Promise.all([
      cache.getOrLoad("/storage/emulated/0", false, load),
      cache.getOrLoad("/storage/emulated/0", false, load),
    ]);

    expect(calls).toBe(1);
    expect(a).toEqual(b);
  });

  test("invalidates both hidden and visible variants", async () => {
    const cache = new DirectoryCache({ ttlMs: 1000, maxEntries: 4 });
    let calls = 0;
    const load = async () => [{ id: String(++calls), name: "x" } as any];

    await cache.getOrLoad("/folder", false, load);
    await cache.getOrLoad("/folder", true, load);
    expect(calls).toBe(2);

    cache.invalidate("/folder");
    await cache.getOrLoad("/folder", false, load);
    await cache.getOrLoad("/folder", true, load);
    expect(calls).toBe(4);
  });

  test("does not publish a stale in-flight result after invalidation", async () => {
    const cache = new DirectoryCache({ ttlMs: 1000, maxEntries: 4 });
    let resolveFirst!: (value: any[]) => void;
    const first = new Promise<any[]>((resolve) => { resolveFirst = resolve; });

    const pending = cache.getOrLoad("/folder", false, () => first);
    cache.invalidate("/folder");
    resolveFirst([{ id: "stale", name: "stale" }]);
    await pending;

    const fresh = await cache.getOrLoad("/folder", false, async () => [
      { id: "fresh", name: "fresh" } as any,
    ]);
    expect(fresh[0]?.id).toBe("fresh");
  });
});

describe("DirectoryCache lifecycle hardening", () => {
  test("does not allow callers to mutate cached arrays", async () => {
    const cache = new DirectoryCache({ ttlMs: 1000, maxEntries: 4 });
    const value = await cache.getOrLoad("/folder", false, async () => [
      { id: "1", name: "one" } as any,
    ]);
    value.pop();
    const second = cache.get("/folder", false);
    expect(second).toHaveLength(1);
  });

  test("releases generation tombstones after a stale request settles", async () => {
    const cache = new DirectoryCache({ ttlMs: 1000, maxEntries: 4 });
    let resolveFirst!: (value: any[]) => void;
    const pending = cache.getOrLoad("/folder", false, () => new Promise<any[]>(r => {
      resolveFirst = r;
    }));
    cache.invalidate("/folder");
    resolveFirst([{ id: "stale", name: "stale" }]);
    await pending;
    expect(cache.size()).toBe(0);
  });
});

describe("DirectoryCache memory budget", () => {
  test("does not retain an oversized directory", async () => {
    const cache = new DirectoryCache({ ttlMs: 1000, maxEntries: 4, maxItemsPerEntry: 2, maxItemsTotal: 4 });
    let calls = 0;
    const load = async () => {
      calls++;
      return [1, 2, 3] as any[];
    };
    await cache.getOrLoad("/large", false, load);
    await cache.getOrLoad("/large", false, load);
    expect(calls).toBe(2);
    expect(cache.get("/large", false)).toBeNull();
  });

  test("evicts by item budget as well as directory count", async () => {
    const cache = new DirectoryCache({ ttlMs: 1000, maxEntries: 10, maxItemsPerEntry: 10, maxItemsTotal: 3 });
    const one = async () => [1, 2] as any[];
    const two = async () => [3, 4] as any[];
    await cache.getOrLoad("/a", false, one);
    await cache.getOrLoad("/b", false, two);
    expect(cache.get("/a", false)).toBeNull();
    expect(cache.get("/b", false)).not.toBeNull();
  });
});
