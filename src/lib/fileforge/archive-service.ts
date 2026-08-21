// FileForge Pro — Unified Archive Service
//
// Single entry point for ALL archive operations across the app.
// Used by: ArchiveBrowser, ContextMenu (Extract Here / Compress),
// FileOperationEngine, any other caller that needs archive access.
//
// Delegates to getArchiveProvider() (which routes native→Kotlin ArchiveEngine,
// web→JSZip). This file is the only place that should be imported for archive ops.

"use client";

import { getArchiveProvider, type ArchiveEntry, type OpenArchiveResult } from "./archive-provider";
import { fileOperationEngine } from "./file-operation-engine";
import { logger } from "./logger";
import { getNode } from "./filesystem";
import { nativeFileSystem, isNative } from "./native-bridge";

export interface ExtractOptions {
  password?: string;
  targetDir?: string;        // if not provided, defaults to parent dir + "_extracted"
  showProgress?: boolean;    // default true
}

class ArchiveService {
  /**
   * List archive entries. Returns entries + encryption status.
   */
  async listEntries(archivePath: string, password?: string): Promise<OpenArchiveResult> {
    return await getArchiveProvider().listEntries(archivePath, password);
  }

  /**
   * Extract a single entry from an archive to a target path.
   */
  async extractEntry(
    archivePath: string,
    entryPath: string,
    targetPath: string,
    password?: string,
  ): Promise<string | null> {
    return await getArchiveProvider().extractEntry(archivePath, entryPath, targetPath, password);
  }

  /**
   * Extract all entries from an archive. Uses the FileOperationEngine
   * for progress reporting so the UI shows a real progress bar.
   *
   * This is the ONE method that both ArchiveBrowser and ContextMenu should
   * call — no duplicate implementations.
   */
  async extractAll(archivePath: string, options: ExtractOptions = {}): Promise<number> {
    const { password, targetDir, showProgress = true } = options;

    // Determine target directory
    const node = getNode(archivePath);
    const lastSlash = archivePath.lastIndexOf("/");
    const parentDir = node?.parentId || (lastSlash > 0 ? archivePath.substring(0, lastSlash) : "/");
    const baseName = node?.name
      ? node.name.replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|tbz|tbz2|txz)$/i, "")
      : archivePath.substring(lastSlash + 1).replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz|tbz|tbz2|txz)$/i, "");
    let finalTarget = targetDir;
    if (!finalTarget) {
      if (isNative() && parentDir.startsWith("content://")) {
        finalTarget = await nativeFileSystem.createDirectory(parentDir, `${baseName}_extracted`);
      } else {
        finalTarget = `${parentDir}/${baseName}_extracted`;
      }
    }

    if (showProgress) {
      // Use the operation engine — it reports real progress
      const op = await fileOperationEngine.extractArchive(archivePath, finalTarget, password);
      return op.current; // extracted count
    }
    return await getArchiveProvider().extractAll(archivePath, finalTarget, password);
  }

  /**
   * Read a single entry's bytes (for opening a file inside an archive).
   */
  async readEntryPreview(archivePath: string, entryPath: string, password?: string): Promise<Uint8Array | null> {
    return await getArchiveProvider().readEntryPreview(archivePath, entryPath, password);
  }

  /**
   * Compress files/folders into an archive. Uses the FileOperationEngine
   * for progress reporting.
   */
  async compress(sources: string[], targetArchive: string, format?: string): Promise<number> {
    const op = await fileOperationEngine.compressPaths(sources, targetArchive, format ?? this.getFormat(targetArchive));
    return op.current;
  }

  /**
   * Check if a file is an archive based on its extension.
   */
  isArchive(fileName: string): boolean {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    const lower = fileName.toLowerCase();
    return [".zip", ".rar", ".7z", ".tar", ".gz", ".tgz", ".tar.gz", ".bz2", ".tbz", ".tbz2", ".tar.bz2", ".xz", ".txz", ".tar.xz"].some(e => lower.endsWith(e));
  }

  /**
   * Get the archive format hint from the file name.
   */
  getFormat(fileName: string): string {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
    if (lower.endsWith(".tar.bz2") || lower.endsWith(".tbz2") || lower.endsWith(".tbz")) return "tar.bz2";
    if (lower.endsWith(".tar.xz") || lower.endsWith(".txz")) return "tar.xz";
    if (lower.endsWith(".zip")) return "zip";
    if (lower.endsWith(".rar")) return "rar";
    if (lower.endsWith(".7z")) return "7z";
    if (lower.endsWith(".tar")) return "tar";
    if (lower.endsWith(".gz")) return "gz";
    if (lower.endsWith(".bz2")) return "bz2";
    if (lower.endsWith(".xz")) return "xz";
    return "unknown";
  }
}

// Singleton
export const archiveService = new ArchiveService();
