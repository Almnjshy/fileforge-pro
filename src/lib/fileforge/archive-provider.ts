// FileForge Pro — Unified Archive Provider
//
// Single API surface for all archive formats: ZIP, RAR, 7z, TAR, TAR.GZ,
// TGZ, GZ, BZ2, XZ. The ArchiveBrowser component talks only to this
// interface — it doesn't import JSZip or any other library directly.
//
// Routing:
//   - On native Android (Capacitor): routes through the Kotlin ArchiveEngine
//     via the FileForgeFileAccess plugin. Supports ZIP, RAR (3 & 5, password-
//     protected), 7z (password-protected), TAR, TAR.GZ, TGZ, GZ, BZ2, XZ.
//   - On web: ZIP is supported via JSZip (loaded dynamically). Other formats
//     return an honest "requires native Android app" error rather than
//     pretending to work.

"use client";

import { nativeFileSystem, isNative, getNativePlugin } from "./native-bridge";
import { getNode } from "./filesystem";
import { getThumbnail } from "./real-fs";

export interface ArchiveEntry {
  path: string;
  isDirectory: boolean;
  size: number;
  compressedSize: number;
  modified: number;
  isEncrypted: boolean;
}

export interface OpenArchiveResult {
  entries: ArchiveEntry[];
  isEncrypted: boolean;
  needsPassword: boolean;
  formatHint: string;
}

export interface ArchiveProvider {
  listEntries(nodeId: string, password?: string): Promise<OpenArchiveResult>;
  extractEntry(nodeId: string, entryPath: string, targetDir: string, password?: string): Promise<string | null>;
  extractAll(nodeId: string, targetDir: string, password?: string, operationId?: string): Promise<number>;
  readEntryPreview(nodeId: string, entryPath: string, password?: string): Promise<Uint8Array | null>;
}

// ============ Native Android provider ============
class NativeArchiveProvider implements ArchiveProvider {
  async listEntries(nodeId: string, password?: string): Promise<OpenArchiveResult> {
    const plugin = getNativePlugin();
    if (!plugin?.archiveList) throw new Error("Archive plugin not available");
    const result = await plugin.archiveList({ path: nodeId, password: password ?? "" });
    const entries: ArchiveEntry[] = (result.entries ?? []).map((e: any) => ({
      path: e.path,
      isDirectory: !!e.isDirectory,
      size: e.size ?? 0,
      compressedSize: e.compressedSize ?? 0,
      modified: e.modified ?? 0,
      isEncrypted: !!e.isEncrypted,
    }));
    return {
      entries,
      isEncrypted: !!result.isEncrypted,
      needsPassword: !!result.needsPassword,
      formatHint: result.format ?? "unknown",
    };
  }

  async extractEntry(nodeId: string, entryPath: string, targetDir: string, password?: string): Promise<string | null> {
    const plugin = getNativePlugin();
    if (!plugin?.archiveExtractEntry) throw new Error("Archive plugin not available");
    const result = await plugin.archiveExtractEntry({
      path: nodeId, entryPath, targetPath: targetDir, password: password ?? "",
    });
    return result?.success ? (result.targetRef ?? targetDir) : null;
  }

  async extractAll(nodeId: string, targetDir: string, password?: string, operationId?: string): Promise<number> {
    const plugin = getNativePlugin();
    if (!plugin?.archiveExtractAll) throw new Error("Archive plugin not available");
    const result = await plugin.archiveExtractAll({
      path: nodeId, targetDir, password: password ?? "", operationId: operationId ?? "",
    });
    return result?.extracted ?? 0;
  }

  async readEntryPreview(nodeId: string, entryPath: string, password?: string): Promise<Uint8Array | null> {
    const plugin = getNativePlugin();
    if (!plugin?.archiveOpenEntry || !plugin.archiveReadEntryChunk || !plugin.archiveCloseEntry) {
      throw new Error("Archive streaming API not available");
    }
    let handle: string | undefined;
    try {
      const opened = await plugin.archiveOpenEntry({
        path: nodeId, entryPath, password: password ?? "",
      });
      handle = opened?.handle;
      if (!handle) throw new Error("Failed to open archive entry");
      const size = Number(opened.size ?? -1);
      const maxBytes = 4 * 1024 * 1024;
      if (size > maxBytes) throw new Error("Entry is too large for the current viewer");
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const result = await plugin.archiveReadEntryChunk({ handle, length: 256 * 1024 });
        const chunk = result?.content ? base64ToUint8Array(result.content) : new Uint8Array(0);
        if (chunk.length) {
          total += chunk.length;
          if (total > maxBytes) throw new Error("Entry is too large for the current viewer");
          chunks.push(chunk);
        }
        if (result?.eof) break;
      }
      const out = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
      return out;
    } finally {
      if (handle) await plugin.archiveCloseEntry({ handle }).catch(() => undefined);
    }
  }
}

// ============ Web provider (ZIP only via JSZip) ============
class WebArchiveProvider implements ArchiveProvider {
  private async loadArchiveBytes(nodeId: string): Promise<Uint8Array | null> {
    const node = getNode(nodeId);
    if (!node) return null;
    if (node.content) {
      if (node.content.startsWith("data:")) {
        try {
          const res = await fetch(node.content);
          return new Uint8Array(await res.arrayBuffer());
        } catch { return null; }
      }
    }
    const thumb = getThumbnail(nodeId);
    if (thumb && thumb.startsWith("data:")) {
      try {
        const res = await fetch(thumb);
        return new Uint8Array(await res.arrayBuffer());
      } catch { return null; }
    }
    return null;
  }

  async listEntries(nodeId: string, _password?: string): Promise<OpenArchiveResult> {
    const ext = nodeId.split(".").pop()?.toLowerCase() ?? "";
    if (ext !== "zip") {
      throw new Error(
        `On the web, only ZIP archives are supported. For ${ext.toUpperCase()} support, ` +
        `install the native Android APK.`
      );
    }
    const bytes = await this.loadArchiveBytes(nodeId);
    if (!bytes) throw new Error("Could not load archive bytes from in-memory storage.");
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const entries: ArchiveEntry[] = [];
    for (const [path, file] of Object.entries(zip.files) as Array<[string, any]>) {
      entries.push({
        path,
        isDirectory: !!file.dir,
        size: Number(file?._data?.uncompressedSize ?? 0),
        compressedSize: Number(file?._data?.compressedSize ?? 0),
        modified: file.date instanceof Date ? file.date.getTime() : 0,
        isEncrypted: !!file.encrypted,
      });
    }
    return {
      entries,
      isEncrypted: entries.some(e => e.isEncrypted),
      needsPassword: false,
      formatHint: "zip",
    };
  }

  async extractEntry(nodeId: string, entryPath: string, _targetDir: string, _password?: string): Promise<string | null> {
    // On web we can't write to disk; trigger a browser download instead.
    const bytes = await this.loadArchiveBytes(nodeId);
    if (!bytes) return null;
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const safePath = normalizeArchiveEntryPath(entryPath);
    if (!safePath) throw new Error("Unsafe archive entry path");
    const file = zip.file(safePath);
    if (!file) return null;
    const content = await file.async("uint8array");
    const blob = new Blob([content.buffer as ArrayBuffer]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = entryPath.split("/").pop() ?? "extracted";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return null;
  }

  async extractAll(nodeId: string, _targetDir: string, _password?: string, _operationId?: string): Promise<number> {
    // Web: trigger downloads for each entry.
    const bytes = await this.loadArchiveBytes(nodeId);
    if (!bytes) return 0;
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    let count = 0;
    const all = Object.values(zip.files) as any[];
    for (const file of all) {
      if (file.dir) continue;
      const safePath = normalizeArchiveEntryPath(file.name);
      if (!safePath) throw new Error(`Unsafe archive entry path: ${file.name}`);
      const content = await file.async("uint8array");
      const blob = new Blob([content.buffer as ArrayBuffer]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = safePath.split("/").pop() ?? "extracted";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      count++;
      // Small delay to avoid overwhelming the browser
      await new Promise(r => setTimeout(r, 100));
    }
    return count;
  }

  async readEntryPreview(nodeId: string, entryPath: string, _password?: string): Promise<Uint8Array | null> {
    const bytes = await this.loadArchiveBytes(nodeId);
    if (!bytes) return null;
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const safePath = normalizeArchiveEntryPath(entryPath);
    if (!safePath) throw new Error("Unsafe archive entry path");
    const file = zip.file(safePath);
    if (!file) return null;
    const MAX_PREVIEW = 4 * 1024 * 1024;
    // JSZip keeps the uncompressed size in an internal field. Keep the
    // runtime optimization while isolating the non-public shape from the
    // TypeScript type definition. The actual payload size is still checked
    // after decompression below.
    const zipInternal = file as unknown as {
      _data?: { uncompressedSize?: number };
    };
    const declaredSize = Number(zipInternal._data?.uncompressedSize ?? 0);
    if (declaredSize > MAX_PREVIEW) throw new Error("Entry is too large for inline preview; extract it instead");
    const content = await file.async("uint8array");
    if (content.byteLength > MAX_PREVIEW) throw new Error("Entry is too large for inline preview; extract it instead");
    return content;
  }
}

// Singleton accessors
const nativeProvider = new NativeArchiveProvider();
const webProvider = new WebArchiveProvider();

export function getArchiveProvider(): ArchiveProvider {
  return isNative() ? nativeProvider : webProvider;
}

// ============ Helpers ============
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}


function normalizeArchiveEntryPath(value: string): string | null {
  const normalized = value.replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return null;
  const parts = normalized.split("/");
  const safe: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === ".." || part.includes("\u0000")) return null;
    safe.push(part);
  }
  return safe.join("/");
}
