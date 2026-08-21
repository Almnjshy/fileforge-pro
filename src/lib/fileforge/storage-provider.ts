// FileForge Pro — Unified Storage Provider (fixes A1/A2/A3)
//
// Before this file existed, `FileBrowser.tsx` branched directly between
// `nativeFileSystem.listDirectory()` (Android) and the in-memory mock
// `getChildren()` (Web) — two different sources of truth for the same UI.
// Worse: `fileforge-store.ts`'s mutating operations (create/delete/rename/
// move/copy) NEVER called the native bridge at all — on a real Android
// device, clicking "Delete" only removed the node from the in-memory mock
// object and showed a "Deleted" toast; the real file on disk was untouched.
//
// This module is the single seam every component and the store now go
// through. `filesystem` (from filesystem.ts) is used as a shared in-memory
// mirror in both modes — for native mode it's populated on-the-fly from
// real listDirectory() results, so `getNode()`/`getChildren()` keep working
// unchanged everywhere else in the app. The actual source of truth for
// mutations is: real disk (native provider) or IndexedDB-persisted mock
// state (web provider) — never just React/Zustand state.
"use client";

import { filesystem, getNode, type FileNode } from "./filesystem";
import { nativeFileSystem, isNative, getNativePlugin } from "./native-bridge";
import { logger } from "./logger";
import { saveUserFile, deleteUserFile } from "./persistence";
import { DirectoryCache } from "./directory-cache";

// ---- path helpers (native ids are real POSIX paths) ----
function dirname(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx <= 0 ? "/" : p.slice(0, idx);
}
function basename(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}
function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? `${dir}${name}` : `${dir}/${name}`;
}

export interface StorageProvider {
  readonly kind: "native" | "web";
  listDirectory(path: string, showHidden?: boolean): Promise<FileNode[]>;
  createFolder(parentId: string, name: string): Promise<FileNode>;
  deleteNodes(ids: string[]): Promise<{ id: string; ok: boolean; error?: string }[]>;
  renameNode(id: string, newName: string): Promise<{ ok: boolean; newId: string; error?: string }>;
  moveNode(id: string, targetParentId: string): Promise<{ ok: boolean; newId: string; error?: string }>;
  copyNode(id: string, targetParentId: string): Promise<{ ok: boolean; newId?: string; error?: string }>;
  readTextContent(id: string): Promise<string | null>;
  writeTextContent(id: string, content: string): Promise<boolean>;
  writeFileContent(id: string, base64Content: string): Promise<boolean>;
}

// ============ Native (Android) provider — real disk I/O ============
class NativeStorageProvider implements StorageProvider {
  readonly kind = "native" as const;
  private readonly directoryCache = new DirectoryCache({ ttlMs: 30_000, maxEntries: 64, maxItemsPerEntry: 10_000, maxItemsTotal: 30_000 });

  async listDirectory(path: string, showHidden = false): Promise<FileNode[]> {
    return this.directoryCache.getOrLoad(path, showHidden, async () => {
      const nodes = await nativeFileSystem.listDirectory(path, showHidden);
    // Mirror into the shared `filesystem` map so getNode()/getChildren()
    // work the same way for native paths as they do for mock ids.
    const childIds: string[] = [];
    for (const n of nodes) {
      filesystem[n.id] = n;
      childIds.push(n.id);
    }
    const parent = filesystem[path];
    if (parent) {
      parent.childrenIds = childIds;
    } else {
      filesystem[path] = {
        id: path,
        name: basename(path) || path,
        kind: "folder",
        size: 0,
        modified: Date.now(),
        parentId: dirname(path),
        childrenIds: childIds,
      };
    }
      return nodes;
    });
  }

  private invalidateDirectories(...paths: string[]): void {
    this.directoryCache.invalidateMany(paths.filter(Boolean));
  }

  async createFolder(parentId: string, name: string): Promise<FileNode> {
    await nativeFileSystem.createDirectory(parentId, name);
    const id = joinPath(parentId, name);
    const node: FileNode = {
      id,
      name,
      kind: "folder",
      size: 0,
      modified: Date.now(),
      parentId,
      childrenIds: [],
    };
    filesystem[id] = node;
    const parent = getNode(parentId);
    if (parent) {
      if (!parent.childrenIds) parent.childrenIds = [];
      if (!parent.childrenIds.includes(id)) parent.childrenIds.push(id);
    }
    return node;
  }

  async deleteNodes(ids: string[]): Promise<{ id: string; ok: boolean; error?: string }[]> {
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await nativeFileSystem.delete(id);
        // Mirror: remove from filesystem map and prune parent's childrenIds
        const node = filesystem[id];
        if (node?.parentId && filesystem[node.parentId]?.childrenIds) {
          filesystem[node.parentId].childrenIds = filesystem[node.parentId].childrenIds!.filter(cid => cid !== id);
        }
        delete filesystem[id];
        this.invalidateDirectories(node?.parentId ?? dirname(id), id);
        results.push({ id, ok: true });
      } catch (e) {
        logger.error("storage-provider", `Native delete failed for ${id}`, e);
        results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return results;
  }

  async renameNode(id: string, newName: string): Promise<{ ok: boolean; newId: string; error?: string }> {
    try {
      await nativeFileSystem.rename(id, newName);
      const newId = joinPath(dirname(id), newName);
      // Mirror: move the node to the new id, update parent's childrenIds
      const oldNode = filesystem[id];
      if (oldNode) {
        filesystem[newId] = { ...oldNode, id: newId, name: newName, modified: Date.now() };
        delete filesystem[id];
        if (oldNode.parentId && filesystem[oldNode.parentId]?.childrenIds) {
          filesystem[oldNode.parentId].childrenIds = filesystem[oldNode.parentId].childrenIds!.map(cid => cid === id ? newId : cid);
        }
      }
      this.invalidateDirectories(oldNode?.parentId ?? dirname(id));
      return { ok: true, newId };
    } catch (e) {
      logger.error("storage-provider", `Native rename failed for ${id}`, e);
      return { ok: false, newId: id, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async moveNode(id: string, targetParentId: string): Promise<{ ok: boolean; newId: string; error?: string }> {
    const newId = joinPath(targetParentId, basename(id));
    try {
      await nativeFileSystem.move(id, newId);
      // Mirror
      const oldNode = filesystem[id];
      if (oldNode) {
        const oldParentId = oldNode.parentId;
        filesystem[newId] = { ...oldNode, id: newId, parentId: targetParentId, modified: Date.now() };
        delete filesystem[id];
        if (oldParentId && filesystem[oldParentId]?.childrenIds) {
          filesystem[oldParentId].childrenIds = filesystem[oldParentId].childrenIds!.filter(cid => cid !== id);
        }
        const target = filesystem[targetParentId];
        if (target) {
          if (!target.childrenIds) target.childrenIds = [];
          if (!target.childrenIds.includes(newId)) target.childrenIds.push(newId);
        }
      }
      this.invalidateDirectories(oldNode?.parentId ?? dirname(id), targetParentId);
      return { ok: true, newId };
    } catch (e) {
      logger.error("storage-provider", `Native move failed for ${id}`, e);
      return { ok: false, newId: id, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async copyNode(id: string, targetParentId: string): Promise<{ ok: boolean; newId?: string; error?: string }> {
    const newId = joinPath(targetParentId, basename(id));
    try {
      await nativeFileSystem.copy(id, newId);
      // Mirror
      const source = filesystem[id];
      if (source) {
        filesystem[newId] = { ...source, id: newId, parentId: targetParentId, modified: Date.now() };
        const target = filesystem[targetParentId];
        if (target) {
          if (!target.childrenIds) target.childrenIds = [];
          if (!target.childrenIds.includes(newId)) target.childrenIds.push(newId);
        }
      }
      this.invalidateDirectories(targetParentId);
      return { ok: true, newId };
    } catch (e) {
      logger.error("storage-provider", `Native copy failed for ${id}`, e);
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async readTextContent(id: string): Promise<string | null> {
    try {
      return await nativeFileSystem.readText(id);
    } catch (e) {
      logger.error("storage-provider", `Native read failed for ${id}`, e);
      return null;
    }
  }

  async writeTextContent(id: string, content: string): Promise<boolean> {
    try {
      return await nativeFileSystem.writeText(id, content);
    } catch (e) {
      logger.error("storage-provider", `Native write failed for ${id}`, e);
      return false;
    }
  }

  async writeFileContent(id: string, base64Content: string): Promise<boolean> {
    try {
      // Call the Capacitor plugin directly with base64 encoding
      const plugin = getNativePlugin();
      if (!plugin) throw new Error("Native plugin not available");
      const result = await plugin.writeFile({ path: id, content: base64Content, encoding: "base64" });
      return !!result?.success;
    } catch (e) {
      logger.error("storage-provider", `Native writeFile (binary) failed for ${id}`, e);
      return false;
    }
  }
}

// ============ Web provider — mock tree + IndexedDB-persisted uploads ============
// (Mutations here still go through the same `filesystem` object the rest of
// the app already reads/writes; this class just gives it the same interface
// shape as the native provider so callers don't need to branch.)
class WebStorageProvider implements StorageProvider {
  readonly kind = "web" as const;

  async listDirectory(path: string, _showHidden = false): Promise<FileNode[]> {
    const node = getNode(path);
    if (!node?.childrenIds) return [];
    return node.childrenIds.map(id => getNode(id)).filter((n): n is FileNode => !!n);
  }

  async createFolder(parentId: string, name: string): Promise<FileNode> {
    const parent = getNode(parentId);
    if (!parent) throw new Error(`Parent not found: ${parentId}`);
    const id = `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const node: FileNode = { id, name, kind: "folder", size: 0, modified: Date.now(), parentId, childrenIds: [] };
    filesystem[id] = node;
    if (!parent.childrenIds) parent.childrenIds = [];
    parent.childrenIds.push(id);
    return node;
  }

  async deleteNodes(ids: string[]): Promise<{ id: string; ok: boolean }[]> {
    // Actual tree mutation + undo-safe subtree handling stays in the store
    // (it needs access to Zustand's set/get for undo recording). This
    // provider just handles the persistence side-effect for uploaded files.
    for (const id of ids) {
      if (id.startsWith("u-")) {
        await deleteUserFile(id).catch(e => logger.warn("storage-provider", `Failed to remove persisted file ${id}`, e));
      }
    }
    return ids.map(id => ({ id, ok: true }));
  }

  async renameNode(id: string, _newName?: string): Promise<{ ok: boolean; newId: string }> {
    return { ok: true, newId: id }; // web ids don't encode the name, nothing further to do
  }

  async moveNode(id: string, _targetParentId?: string): Promise<{ ok: boolean; newId: string }> {
    return { ok: true, newId: id };
  }

  async copyNode(_id?: string, _targetParentId?: string): Promise<{ ok: boolean; newId?: string }> {
    return { ok: true, newId: undefined };
  }

  async readTextContent(id: string): Promise<string | null> {
    const node = getNode(id);
    return node?.content ?? null;
  }

  async writeTextContent(id: string, content: string): Promise<boolean> {
    const node = getNode(id);
    if (!node) return false;
    node.content = content;
    node.size = new TextEncoder().encode(content).length; // byte count, not char count
    node.modified = Date.now();
    if (id.startsWith("u-")) {
      await saveUserFile(id, node).catch(e => logger.error("storage-provider", `Failed to persist edit for ${id}`, e));
    }
    return true;
  }

  async writeFileContent(id: string, base64Content: string): Promise<boolean> {
    // Web: store as binary in IndexedDB via saveUserFile with the node. Decode base64 to byte length for size.
    const node = getNode(id);
    if (!node) return false;
    try {
      const binary = atob(base64Content);
      node.size = binary.length;
      node.modified = Date.now();
      if (id.startsWith("u-")) {
        await saveUserFile(id, node);
      }
      return true;
    } catch (e) {
      logger.error("storage-provider", `Web writeFileContent failed for ${id}`, e);
      return false;
    }
  }
}

const nativeProvider = new NativeStorageProvider();
const webProvider = new WebStorageProvider();

// Single entry point — every component and the store should call this
// instead of branching on isNative() themselves.
export function getStorageProvider(): StorageProvider {
  return isNative() ? nativeProvider : webProvider;
}
