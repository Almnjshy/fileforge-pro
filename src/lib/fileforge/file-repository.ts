// FileForge Pro — Unified File Repository
//
// Single source of truth for all file operations across the app.
// Used by: FileBrowser, FloatingWindow (folder windows), ContextMenu,
// TextEditor, FilePreview, ArchiveService, FileOperationEngine, Sidebar.
//
// All methods are async and run on background threads via the storage
// provider. No synchronous disk I/O on the JS main thread.

"use client";

import { getStorageProvider } from "./storage-provider";
import { nativeFileSystem, isNative, getNativePlugin } from "./native-bridge";
import { filesystem, getNode, type FileNode, type FileKind } from "./filesystem";
import { logger } from "./logger";

// ============ Types ============

export interface FileEntry {
  id: string;          // path on native, mock id on web
  name: string;
  kind: FileKind;
  size: number;
  modified: number;
  parentId: string | null;
  isDirectory: boolean;
  mimeType?: string;
  childrenIds?: string[];
}

export interface FolderSummary {
  path: string;
  fileCount: number;
  folderCount: number;
  totalSize: number;
  // True if the summary is cached (might be stale)
  cached: boolean;
}

// ============ Repository ============

class FileRepository {
  private folderSummaryCache = new Map<string, { summary: FolderSummary; ts: number }>();
  private static CACHE_TTL_MS = 30_000; // 30s

  /**
   * List a directory. Returns real entries on native, mock entries on web.
   * The result is also mirrored into the in-memory `filesystem` map so
   * getNode/getChildren keep working for components that read from it.
   */
  async listDirectory(path: string): Promise<FileEntry[]> {
    const provider = getStorageProvider();
    const nodes = await provider.listDirectory(path);
    // Convert FileNode[] → FileEntry[]
    const entries: FileEntry[] = nodes.map(n => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      size: n.size,
      modified: n.modified,
      parentId: n.parentId,
      isDirectory: n.kind === "folder",
      childrenIds: n.childrenIds,
    }));
    // Mirror into filesystem map
    for (const e of entries) {
      filesystem[e.id] = {
        id: e.id,
        name: e.name,
        kind: e.isDirectory ? "folder" : e.kind,
        size: e.size,
        modified: e.modified,
        parentId: path,
        childrenIds: e.isDirectory ? [] : undefined,
      };
    }
    return entries;
  }

  /**
   * Get a single file's metadata.
   */
  async getMetadata(path: string): Promise<FileEntry | null> {
    if (isNative() && path.startsWith("/")) {
      try {
        const result = await nativeFileSystem.getFileMetadata(path);
        if (!result) return null;
        return {
          id: result.path,
          name: result.name,
          kind: detectKindFromMime(result.mimeType, result.name),
          size: result.size,
          modified: result.lastModified,
          parentId: null,
          isDirectory: result.isDirectory,
          mimeType: result.mimeType,
        };
      } catch (e) {
        logger.warn("file-repository", `getMetadata failed for ${path}`, e);
        return null;
      }
    }
    // Web: in-memory lookup
    const node = getNode(path);
    if (!node) return null;
    return {
      id: node.id, name: node.name, kind: node.kind, size: node.size,
      modified: node.modified, parentId: node.parentId,
      isDirectory: node.kind === "folder",
    };
  }

  /**
   * Read text content from a file. Async, off-main-thread on native.
   */
  async readText(path: string): Promise<string | null> {
    const provider = getStorageProvider();
    return await provider.readTextContent(path);
  }

  /**
   * Write text content to a file. Async.
   */
  async writeText(path: string, content: string): Promise<boolean> {
    const provider = getStorageProvider();
    return await provider.writeTextContent(path, content);
  }

  /**
   * Read a file as base64 (for media playback, archive bytes, etc).
   */
  async readFileBase64(path: string): Promise<string | null> {
    return await nativeFileSystem.readFileBase64(path);
  }

  /**
   * Create a directory.
   */
  async createFolder(parentPath: string, name: string): Promise<boolean> {
    if (isNative() && parentPath.startsWith("/")) {
      try {
        await nativeFileSystem.createDirectory(parentPath, name);
        return true;
      } catch { return false; }
    }
    // Web: mock
    return true;
  }

  /**
   * Create a file with text content.
   */
  async createFile(parentPath: string, name: string, content = ""): Promise<string | null> {
    if (isNative() && parentPath.startsWith("/")) {
      const id = `${parentPath.endsWith("/") ? parentPath : parentPath + "/"}${name}`;
      const ok = await this.writeText(id, content);
      return ok ? id : null;
    }
    // Web: mock
    return `mock-${Date.now()}`;
  }

  /**
   * Delete files/directories.
   */
  async delete(paths: string[]): Promise<{ ok: boolean; error?: string }[]> {
    if (isNative() && paths.some(p => p.startsWith("/"))) {
      const provider = getStorageProvider();
      const results = await provider.deleteNodes(paths);
      return results.map(r => ({ ok: r.ok, error: r.error }));
    }
    // Web: just remove from mock
    for (const p of paths) {
      delete filesystem[p];
    }
    return paths.map(() => ({ ok: true }));
  }

  /**
   * Rename a file/directory.
   */
  async rename(path: string, newName: string): Promise<{ ok: boolean; newPath?: string; error?: string }> {
    if (isNative() && path.startsWith("/")) {
      try {
        await nativeFileSystem.rename(path, newName);
        const parentPath = path.substring(0, path.lastIndexOf("/"));
        const newPath = `${parentPath}/${newName}`;
        return { ok: true, newPath };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
    return { ok: true, newPath: path };
  }

  /**
   * Copy a file/directory.
   */
  async copy(from: string, to: string, operationId?: string): Promise<boolean> {
    if (isNative() && from.startsWith("/")) {
      try {
        await nativeFileSystem.copy(from, to, operationId);
        return true;
      } catch { return false; }
    }
    return true;
  }

  /**
   * Move a file/directory.
   */
  async move(from: string, to: string, operationId?: string): Promise<boolean> {
    if (isNative() && from.startsWith("/")) {
      try {
        await nativeFileSystem.move(from, to, operationId);
        return true;
      } catch { return false; }
    }
    return true;
  }

  /**
   * Get a real folder summary (file count + folder count + total size).
   * On native, this calls a new Kotlin method that walks the tree on a
   * background thread. On web, falls back to in-memory walk.
   * Results are cached for 30s to avoid re-scanning on every render.
   */
  async getFolderSummary(path: string): Promise<FolderSummary> {
    const cached = this.folderSummaryCache.get(path);
    if (cached && Date.now() - cached.ts < FileRepository.CACHE_TTL_MS) {
      return { ...cached.summary, cached: true };
    }

    if (isNative() && path.startsWith("/")) {
      try {
        const plugin = getNativePlugin();
        if (plugin?.getFolderSummary) {
          const result = await plugin.getFolderSummary({ path });
          const summary: FolderSummary = {
            path,
            fileCount: result.fileCount ?? 0,
            folderCount: result.folderCount ?? 0,
            totalSize: result.totalSize ?? 0,
            cached: false,
          };
          this.folderSummaryCache.set(path, { summary, ts: Date.now() });
          return summary;
        }
      } catch (e) {
        logger.warn("file-repository", `getFolderSummary failed for ${path}`, e);
      }
      // Fallback: list the directory and count immediate children
      try {
        const entries = await this.listDirectory(path);
        const fileCount = entries.filter(e => !e.isDirectory).length;
        const folderCount = entries.filter(e => e.isDirectory).length;
        const summary: FolderSummary = {
          path, fileCount, folderCount, totalSize: 0, cached: false,
        };
        this.folderSummaryCache.set(path, { summary, ts: Date.now() });
        return summary;
      } catch {
        return { path, fileCount: 0, folderCount: 0, totalSize: 0, cached: false };
      }
    }

    // Web: walk in-memory tree
    const node = getNode(path);
    if (!node) return { path, fileCount: 0, folderCount: 0, totalSize: 0, cached: false };
    const { fileCount, folderCount, totalSize } = this.walkTree(path);
    const summary: FolderSummary = {
      path, fileCount, folderCount, totalSize, cached: false,
    };
    this.folderSummaryCache.set(path, { summary, ts: Date.now() });
    return summary;
  }

  /**
   * Invalidate cached summary for a path (call after mutations).
   */
  invalidateFolderSummary(path: string): void {
    // A mutation can change the recursive summary of every ancestor.
    // Walk upward instead of invalidating only the immediate parent.
    let current = path;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      this.folderSummaryCache.delete(current);
      const idx = current.lastIndexOf("/");
      if (idx <= 0) {
        if (current.startsWith("/")) this.folderSummaryCache.delete("/");
        break;
      }
      current = current.slice(0, idx);
    }
  }

  private walkTree(rootId: string): { fileCount: number; folderCount: number; totalSize: number } {
    let fileCount = 0;
    let folderCount = 0;
    let totalSize = 0;
    const visited = new Set<string>();
    const stack = [rootId];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const node = getNode(id);
      if (!node) continue;
      if (id !== rootId) {
        if (node.kind === "folder") folderCount++;
        else { fileCount++; totalSize += node.size; }
      }
      if (node.childrenIds) {
        for (const cid of node.childrenIds) stack.push(cid);
      }
    }
    return { fileCount, folderCount, totalSize };
  }

  /**
   * Open a file in an external app (ACTION_VIEW).
   */
  async openExternal(path: string, mimeType?: string): Promise<boolean> {
    return await nativeFileSystem.openFileExternal(path, mimeType);
  }
}

// ============ Helpers ============

function detectKindFromMime(mimeType: string, name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) return "archive";
  if (ext === "apk") return "apk";
  if (["doc", "docx"].includes(ext)) return "word";
  if (["xls", "xlsx"].includes(ext)) return "excel";
  if (["ppt", "pptx"].includes(ext)) return "presentation";
  if (["html", "htm"].includes(ext)) return "html";
  return "unknown";
}

// Singleton
export const fileRepository = new FileRepository();
