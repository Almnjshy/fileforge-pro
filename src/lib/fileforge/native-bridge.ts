// FileForge Pro — Native File Access Bridge
// Provides real file system access on Android via Capacitor plugin
// Falls back to web APIs (File System Access API) when running in browser

"use client";

import { FileNode, FileKind } from "./types";

// ============ Capacitor Plugin Interface ============
// This will be available when running as native Android app
export interface CapacitorFilePlugin {
  listDirectory(options: { path: string; showHidden?: boolean }): Promise<{
    files: Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      size: number;
      lastModified: number;
      mimeType: string;
    }>;
  }>;
  createDirectory(options: { path: string; name: string }): Promise<{ success: boolean; ref?: string }>;
  deleteFile(options: { path: string }): Promise<{ success: boolean }>;
  renameFile(options: { path: string; newName: string }): Promise<{ success: boolean }>;
  copyFile(options: { from: string; to: string; operationId?: string }): Promise<{ success: boolean; operationId?: string }>;
  moveFile(options: { from: string; to: string; operationId?: string }): Promise<{ success: boolean; operationId?: string }>;
  cancelFileOperation?(options: { operationId: string }): Promise<{ accepted: boolean; status: string }>;
  pauseFileOperation?(options: { operationId: string }): Promise<{ accepted: boolean; status: string }>;
  resumeFileOperation?(options: { operationId: string }): Promise<{ accepted: boolean; status: string }>;
  getFileOperationStatus?(options: { operationId: string }): Promise<{ found: boolean; operationId: string; type?: string; status?: string; bytesProcessed?: number; totalBytes?: number; currentPath?: string; fraction?: number; error?: string }>;
  getRecoveredFileOperations?(options?: Record<string, never>): Promise<{ operations: unknown[] }>;
  getRecoveryDecisions?(options?: Record<string, never>): Promise<{ operations: unknown[] }>;
  executeRecoveryDecision?(options: { operationId: string; decision: string }): Promise<{ success: boolean; operationId: string; decision: string }>;
  resumeRecoveredFileOperation?(options: { operationId: string }): Promise<{ success: boolean; operationId: string }>;
  addListener?(eventName: string, listener: (event: any) => void): Promise<{ remove: () => Promise<void> }>;
  readFile(options: { path: string; encoding?: string }): Promise<{ content: string; encoding: string }>;
  writeFile(options: { path: string; content: string; encoding?: string }): Promise<{ success: boolean }>;
  getFileMetadata(options: { path: string }): Promise<{
    name: string;
    size: number;
    lastModified: number;
    mimeType: string;
    isDirectory: boolean;
    path: string;
  }>;
  generateThumbnail(options: { path: string; kind?: string; maxSize?: number }): Promise<{ thumbnail: string; cached?: boolean }>;
  searchFiles(options: { searchId?: string; path: string; query: string; kind?: string; minSize?: number; maxSize?: number; modifiedAfter?: number; modifiedBefore?: number; includeHidden?: boolean; includeDirectories?: boolean; recursive?: boolean; maxResults?: number }): Promise<{ results: Array<{ name: string; path: string; isDirectory: boolean; size: number; lastModified: number; mimeType: string }>; count: number; scanned: number; truncated: boolean }>
  cancelSearch(options: { searchId: string }): Promise<{ cancelled: boolean }>;
  getStorageInfo(): Promise<{
    total: number;
    free: number;
    used: number;
    volumes?: Array<{ path: string; total: number; free: number; used: number }>;
  }>;
  requestStoragePermission(): Promise<{ granted: boolean }>;
  checkStoragePermission(): Promise<{ granted: boolean }>;
  hasManageAllFilesPermission(): Promise<{ granted: boolean }>;
  requestManageAllFilesPermission(): Promise<{ granted: boolean }>;
  requestPermission(options: { permission: string }): Promise<{ granted: boolean }>;
  checkPermission(options: { permission: string }): Promise<{ granted: boolean }>;
  requestAllPermissions(): Promise<{ granted: boolean }>;
  storageList(options: { ref: string; showHidden?: boolean }): Promise<{ files: Array<{ id: string; name: string; path: string; isDirectory: boolean; size: number; lastModified: number; mimeType: string }> }>;
  storageMetadata(options: { ref: string }): Promise<{ id: string; path: string; name: string; size: number; lastModified: number; mimeType: string; isDirectory: boolean }>;
  storageReadText(options: { ref: string; maxBytes?: number }): Promise<{ content: string; encoding: string }>;
  storageReadChunk(options: { ref: string; offset?: number; length?: number }): Promise<{ content: string; encoding: string; size: number; offset: number }>;
  storageReadRange?(options: { ref: string; offset: number; length: number }): Promise<{ content: string; encoding: string; bytesRead: number; offset: number; fileSize: number; eof: boolean }>;
  storageWriteText(options: { ref: string; content: string }): Promise<{ success: boolean }>;
  storageWriteChunk?(options: { ref: string; offset: number; content: string; truncate?: boolean }): Promise<{ success: boolean; bytesWritten: number; offset: number }>;
  storageBeginChunkedWrite?(options: { ref: string }): Promise<{ success: boolean; tempRef: string }>;
  storageCommitChunkedWrite?(options: { ref: string; tempRef: string }): Promise<{ success: boolean }>;
  storageAbortChunkedWrite?(options: { tempRef: string }): Promise<{ success: boolean }>;
  storageCreateDirectory(options: { parent: string; name: string }): Promise<{ success: boolean; ref: string }>;
  storageCreateFile(options: { parent: string; name: string; mimeType?: string }): Promise<{ success: boolean; ref: string }>;
  storageDelete(options: { ref: string }): Promise<{ success: boolean }>;
  storageRename(options: { ref: string; newName: string }): Promise<{ success: boolean; ref: string }>;
  storageFolderSummary?(options: { ref: string }): Promise<{ fileCount: number; folderCount: number; totalSize: number }>;
  getFolderSummary(options: { path: string }): Promise<{ fileCount: number; folderCount: number; totalSize: number }>;
  openNativeMedia?(options: { ref: string; mime?: string; title?: string }): Promise<{ opened: boolean }>;
  openNativeImage?(options: { ref: string; title?: string }): Promise<{ opened: boolean }>;
  getApkInfo?(options: { path: string }): Promise<{ packageName: string; appName: string; versionName?: string; versionCode?: number; icon?: string }>;
  installApk?(options: { path: string }): Promise<{ installed: boolean; permissionRequired?: boolean }>;
  installXapk?(options: { path: string }): Promise<{ installed: boolean; permissionRequired?: boolean; apps?: number; obbFiles?: number; error?: string }>;
  listInstalledApps?(options: { includeSystem?: boolean }): Promise<{ apps: Array<{ packageName: string; label: string; versionName?: string; versionCode?: number; isSystem: boolean; isEnabled: boolean; apkPath: string; icon?: string; size?: number }> }>;
  backupInstalledApp?(options: { packageName: string }): Promise<{ success: boolean; path?: string; name?: string; error?: string }>;
  uninstallApp?(options: { packageName: string }): Promise<{ started: boolean; error?: string }>;
  createNativeMediaSurface?(options: { windowId: string; ref: string; mime?: string; title?: string; left: number; top: number; width: number; height: number; visible?: boolean }): Promise<{ created: boolean }>;
  updateNativeMediaSurface?(options: { windowId: string; left: number; top: number; width: number; height: number; visible?: boolean }): Promise<{ updated: boolean }>;
  setNativeMediaSurfaceVisibility?(options: { windowId: string; visible: boolean }): Promise<{ updated: boolean }>;
  destroyNativeMediaSurface?(options: { windowId: string }): Promise<{ destroyed: boolean }>;
  readFileChunk?(options: { path: string; offset: number; length: number }): Promise<{ content: string; bytesRead: number; offset: number; fileSize: number; eof: boolean }>;
  openFileExternal?(options: { path: string; mimeType?: string }): Promise<{ success: boolean; error?: string; mimeType?: string }>;
  shareFiles?(options: { paths: string[] }): Promise<{ success: boolean; count?: number; error?: string }>;
  requestDocumentUri?(options: { mimeType?: string; allowMultiple?: boolean }): Promise<{ granted: boolean; cancelled?: boolean; uri?: string; uris?: string[] }>;
  releasePersistedUri?(options: { uri: string }): Promise<{ success: boolean; error?: string }>;
  getPersistedUriPermissions?(): Promise<{ uris: Array<{ uri: string; isRead: boolean; isWrite: boolean; persistedTime?: number }> }>;
  consumeIncomingIntent?(): Promise<{ available: boolean; action?: string; mimeType?: string; uris: string[]; text?: string }>;
  listStorageVolumes?(): Promise<{ volumes: Array<{ path: string; label: string; isRemovable: boolean; isPrimary: boolean; total: number; free: number; used: number }> }>;
  decodeHeic?(options: { path: string; maxDim?: number }): Promise<{ supported: boolean; data?: string; error?: string }>;
  getFileHash?(options: { path: string }): Promise<{ hash?: string }>;
  getStreamUri?(options: { path: string }): Promise<{ uri?: string; mimeType?: string; size?: number }>;
  getMediaMetadata?(options: { path: string }): Promise<{ duration: number; width?: number; height?: number; rotation?: number; fps?: number; isVideo: boolean; bitrate: number; title?: string; artist?: string; album?: string; genre?: string; year?: string; track?: string; coverArt?: string; mimeType?: string }>;
  archiveList?(options: { path: string; password?: string }): Promise<{ entries?: Array<{ path: string; isDirectory: boolean; size: number; compressedSize: number; modified: number; isEncrypted: boolean }>; isEncrypted?: boolean; needsPassword?: boolean; format?: string }>;
  archiveExtractEntry?(options: { path: string; entryPath: string; targetPath: string; password?: string }): Promise<{ success: boolean; targetRef?: string }>;
  archiveExtractAll?(options: { path: string; targetDir: string; password?: string; operationId?: string }): Promise<{ extracted?: number; success?: boolean }>;
  archiveOpenEntry?(options: { path: string; entryPath: string; password?: string }): Promise<{ handle?: string; size?: number }>;
  archiveReadEntryChunk?(options: { handle: string; length?: number }): Promise<{ content?: string; encoding?: string; bytesRead?: number; eof?: boolean }>;
  archiveCloseEntry?(options: { handle: string }): Promise<{ success?: boolean }>;
  archiveCloseAllEntrySessions?(options?: Record<string, never>): Promise<{ success?: boolean }>;
  archiveCreate?(options: { sources: string[]; target: string; format?: string; password?: string; operationId?: string }): Promise<{ success: boolean; error?: string }>;
  safListDirectory?(options: { treeUri?: string; uri?: string }): Promise<{ files?: Array<{ name: string; path: string; isDirectory: boolean; size: number; lastModified: number; mimeType: string }>; entries?: Array<{ uri: string; name: string; isDirectory: boolean; size: number; lastModified: number; mimeType: string }> }>;
  safReadText?(options: { uri: string; maxBytes?: number }): Promise<{ content?: string }>;
  safReadBytes?(options: { uri: string; offset?: number; length?: number }): Promise<{ content?: string }>;
  safWriteText?(options: { uri: string; content: string }): Promise<{ success: boolean }>;
  safCreateDirectory?(options: { treeUri?: string; parentUri?: string; name: string }): Promise<{ uri: string; name: string }>;
  safCreateFile?(options: { treeUri?: string; parentUri?: string; name: string; mimeType?: string }): Promise<{ uri: string; name: string }>;
  safDelete?(options: { uri: string }): Promise<{ success: boolean }>;
  safRename?(options: { uri: string; newName: string }): Promise<{ success: boolean }>;
  safGetMetadata?(options: { uri: string }): Promise<{ uri: string; name: string; isDirectory: boolean; size: number; lastModified: number; mimeType: string } | null>;
  safGetTreeUris?(): Promise<{ treeUris: Array<{ pathPrefix: string; uri: string }> }>;
  safSaveTreeUri?(options: { uri: string; pathPrefix: string }): Promise<{ success: boolean }>;
  safRemoveTreeUri?(options: { pathPrefix: string }): Promise<{ success: boolean }>;
  safGetPersistedUris?(): Promise<{ uris: Array<{ uri: string; isRead: boolean; isWrite: boolean }> }>;
  safRequestTreeUri?(): Promise<{ treeUri: string; granted: boolean }>;
  safGetStreamUri?(options: { uri: string }): Promise<{ uri: string; mimeType: string; size: number }>;
}

// ============ Plugin Accessor ============
export function getNativePlugin(): CapacitorFilePlugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as any).Capacitor;
  if (!cap?.Plugins?.FileForgeFileAccess) return null;
  return cap.Plugins.FileForgeFileAccess as CapacitorFilePlugin;
}

export interface NativeOperationEvent {
  operationId: string;
  type: string;
  status?: string;
  bytesProcessed?: number;
  totalBytes?: number;
  fraction?: number;
  currentPath?: string;
  message?: string;
  error?: string;
}

type NativeOperationEventListener = (event: NativeOperationEvent) => void;
const nativeOperationListeners = new Set<NativeOperationEventListener>();
let nativeOperationEventsReady = false;
let nativeOperationEventSetup: Promise<void> | null = null;

async function ensureNativeOperationEvents(): Promise<void> {
  if (nativeOperationEventsReady) return;
  if (nativeOperationEventSetup) return nativeOperationEventSetup;
  nativeOperationEventSetup = (async () => {
    const plugin = getNativePlugin();
    if (!plugin?.addListener) return;
    await plugin.addListener("fileOperationProgress", (event: NativeOperationEvent) => {
      nativeOperationListeners.forEach(listener => listener(event));
    });
    await plugin.addListener("fileOperationState", (event: NativeOperationEvent) => {
      nativeOperationListeners.forEach(listener => listener(event));
    });
    await plugin.addListener("fileOperationError", (event: NativeOperationEvent) => {
      nativeOperationListeners.forEach(listener => listener({ ...event, status: "failed", error: event.message }));
    });
    nativeOperationEventsReady = true;
  })().finally(() => { nativeOperationEventSetup = null; });
  return nativeOperationEventSetup;
}

export async function prepareNativeOperationEvents(): Promise<void> { await ensureNativeOperationEvents(); }

export function subscribeNativeOperationEvents(listener: NativeOperationEventListener): () => void {
  nativeOperationListeners.add(listener);
  void ensureNativeOperationEvents();
  return () => nativeOperationListeners.delete(listener);
}

export async function cancelNativeFileOperation(operationId: string): Promise<boolean> {
  const plugin = getNativePlugin();
  if (!plugin?.cancelFileOperation) return false;
  try { return (await plugin.cancelFileOperation({ operationId })).accepted === true; } catch { return false; }
}

export async function pauseNativeFileOperation(operationId: string): Promise<boolean> {
  const plugin = getNativePlugin();
  if (!plugin?.pauseFileOperation) return false;
  try { return (await plugin.pauseFileOperation({ operationId })).accepted === true; } catch { return false; }
}

export async function resumeNativeFileOperation(operationId: string): Promise<boolean> {
  const plugin = getNativePlugin();
  if (!plugin?.resumeFileOperation) return false;
  try { return (await plugin.resumeFileOperation({ operationId })).accepted === true; } catch { return false; }
}

export async function getRecoveredNativeFileOperations(): Promise<unknown[]> {
  if (!isNative()) return [];
  const plugin = getNativePlugin();
  if (!plugin?.getRecoveredFileOperations) return [];
  try { return (await plugin.getRecoveredFileOperations({})).operations || []; } catch { return []; }
}

export async function resumeRecoveredNativeFileOperation(operationId: string): Promise<boolean> {
  if (!isNative()) return false;
  const plugin = getNativePlugin();
  if (!plugin?.resumeRecoveredFileOperation) return false;
  try { return (await plugin.resumeRecoveredFileOperation({ operationId })).success === true; } catch { return false; }
}

export function isNative(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as any).Capacitor;
  return cap?.isNative ?? false;
}

export function isWeb(): boolean {
  return !isNative();
}

function isContentReference(ref: string): boolean {
  return /^content:\/\//i.test(ref);
}

export async function readNativeFileRange(ref: string, offset: number, length: number): Promise<{
  content: string; bytesRead: number; offset: number; fileSize: number; eof: boolean
} | null> {
  const plugin = getNativePlugin();
  if (!plugin?.storageReadRange) return null;
  try {
    return await plugin.storageReadRange({ ref, offset, length });
  } catch (e) {
    console.warn("Native PDF range read failed:", e);
    return null;
  }
}

// ============ Public API ============
function detectKindFromMime(mimeType: string, name: string): FileKind {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf" || ext === "pdf") return "pdf";
  if (mimeType.startsWith("text/")) return "text";
  if (
    mimeType.includes("javascript") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("yaml") ||
    ["js", "ts", "tsx", "jsx", "py", "java", "kt", "go", "rs", "c", "cpp", "h", "sh", "sql", "json", "xml", "yaml", "yml", "css", "scss", "csv"].includes(ext)
  ) {
    return "code";
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) return "archive";
  if (ext === "apk") return "apk";
  if (["doc", "docx", "rtf", "odt"].includes(ext)) return "word";
  if (["xls", "xlsx", "ods"].includes(ext)) return "excel";
  if (["ppt", "pptx", "odp"].includes(ext)) return "presentation";
  if (["html", "htm"].includes(ext)) return "html";
  if (["ttf", "otf", "woff", "woff2"].includes(ext)) return "font";
  return "unknown";
}

export async function createNativeMediaSurface(options: { windowId: string; ref: string; mime?: string; title?: string; left: number; top: number; width: number; height: number; visible?: boolean }): Promise<boolean> {
  const plugin = getNativePlugin();
  if (!plugin?.createNativeMediaSurface) return false;
  try {
    const result = await plugin.createNativeMediaSurface(options);
    return result?.created === true;
  } catch (error) {
    console.error("Native media surface creation failed", error);
    return false;
  }
}

export async function updateNativeMediaSurface(options: { windowId: string; left: number; top: number; width: number; height: number; visible?: boolean }): Promise<boolean> {
  const plugin = getNativePlugin();
  if (!plugin?.updateNativeMediaSurface) return false;
  try {
    const result = await plugin.updateNativeMediaSurface(options);
    return result?.updated === true;
  } catch (error) {
    console.error("Native media surface update failed", error);
    return false;
  }
}

export async function setNativeMediaSurfaceVisibility(windowId: string, visible: boolean): Promise<boolean> {
  const plugin = getNativePlugin();
  if (!plugin?.setNativeMediaSurfaceVisibility) return false;
  try {
    const result = await plugin.setNativeMediaSurfaceVisibility({ windowId, visible });
    return result?.updated === true;
  } catch (error) {
    console.error("Native media surface visibility failed", error);
    return false;
  }
}

export async function destroyNativeMediaSurface(windowId: string): Promise<boolean> {
  const plugin = getNativePlugin();
  if (!plugin?.destroyNativeMediaSurface) return false;
  try {
    const result = await plugin.destroyNativeMediaSurface({ windowId });
    return result?.destroyed === true;
  } catch (error) {
    console.error("Native media surface destroy failed", error);
    return false;
  }
}

export async function openNativeMedia(ref: string, mime?: string, title?: string): Promise<boolean> {
  const plugin = getNativePlugin();
  if (!plugin?.openNativeMedia) return false;
  try {
    const result = await plugin.openNativeMedia({ ref, mime, title });
    return result?.opened === true;
  } catch (error) {
    console.error("Native media viewer failed", error);
    return false;
  }
}

export async function getApkInfo(path: string): Promise<{ packageName: string; appName: string; versionName?: string; versionCode?: number; icon?: string } | null> {
  const plugin = getNativePlugin();
  if (!plugin?.getApkInfo) return null;
  try { return await plugin.getApkInfo({ path }); } catch { return null; }
}

export async function installApk(path: string): Promise<{ installed: boolean; permissionRequired?: boolean }> {
  const plugin = getNativePlugin();
  if (!plugin?.installApk) return { installed: false };
  try { return await plugin.installApk({ path }); } catch (error) {
    console.error("APK installation failed", error);
    return { installed: false };
  }
}

export async function installXapk(path: string): Promise<{ installed: boolean; permissionRequired?: boolean; apps?: number; obbFiles?: number; error?: string }> {
  const plugin = getNativePlugin();
  if (!plugin?.installXapk) return { installed: false, error: "XAPK installation is unavailable" };
  try { return await plugin.installXapk({ path }); } catch (error) {
    console.error("XAPK installation failed", error);
    return { installed: false, error: error instanceof Error ? error.message : "XAPK installation failed" };
  }
}

export async function openNativeImage(ref: string, title?: string): Promise<boolean> {
  const plugin = getNativePlugin();
  if (!plugin?.openNativeImage) return false;
  try {
    const result = await plugin.openNativeImage({ ref, title });
    return result?.opened === true;
  } catch (error) {
    console.error("Native image viewer failed", error);
    return false;
  }
}

export const nativeFileSystem = {
  async isAvailable(): Promise<boolean> {
    if (isNative()) return getNativePlugin() !== null;
    return typeof window !== "undefined" && "showDirectoryPicker" in window;
  },

  async requestPermission(): Promise<boolean> {
    const plugin = getNativePlugin();
    if (plugin) {
      const hasManageAll = await plugin.hasManageAllFilesPermission();
      if (!hasManageAll.granted) {
        const result = await plugin.requestManageAllFilesPermission();
        return result.granted;
      }
      return true;
    }
    return this.isAvailable();
  },

  async listDirectory(path: string, showHidden = false): Promise<FileNode[]> {
    const plugin = getNativePlugin();
    if (plugin) {
      // SAF content:// references use the unified native storage boundary.
      const result = isContentReference(path)
        ? await plugin.storageList({ ref: path, showHidden })
        : await plugin.listDirectory({ path, showHidden });
      const files = result.files ?? [];
      return files.map(f => ({
        id: f.path,
        name: f.name,
        kind: f.isDirectory ? "folder" : detectKindFromMime(f.mimeType, f.name),
        size: f.size,
        modified: f.lastModified,
        parentId: path,
        childrenIds: f.isDirectory ? [] : undefined,
      }));
    }
    throw new Error("Native file access not available in browser");
  },

  async getFileMetadata(path: string): Promise<{ name: string; size: number; lastModified: number; mimeType: string; isDirectory: boolean; path: string } | null> {
    const plugin = getNativePlugin();
    if (!plugin?.getFileMetadata) return null;
    try {
      return await plugin.getFileMetadata({ path });
    } catch (error) {
      console.warn("getFileMetadata failed:", error);
      return null;
    }
  },

  async createDirectory(parentPath: string, name: string): Promise<string> {
    const plugin = getNativePlugin();
    if (!plugin) throw new Error("Native file access not available");
    const result = isContentReference(parentPath)
      ? await plugin.storageCreateDirectory({ parent: parentPath, name })
      : await plugin.createDirectory({ path: parentPath, name });
    if (!result.success) throw new Error(`Failed to create directory: ${name}`);
    return result.ref ?? (isContentReference(parentPath)
      ? `${parentPath}/${encodeURIComponent(name)}`
      : `${parentPath.endsWith("/") ? parentPath : parentPath + "/"}${name}`);
  },

  async delete(path: string): Promise<boolean> {
    const plugin = getNativePlugin();
    if (!plugin) throw new Error("Native file access not available");
    const result = isContentReference(path)
      ? await plugin.storageDelete({ ref: path })
      : await plugin.deleteFile({ path });
    if (!result.success) throw new Error(`Failed to delete: ${path}`);
    return true;
  },

  async rename(path: string, newName: string): Promise<boolean> {
    const plugin = getNativePlugin();
    if (!plugin) throw new Error("Native file access not available");
    const result = isContentReference(path)
      ? await plugin.storageRename({ ref: path, newName })
      : await plugin.renameFile({ path, newName });
    if (!result.success) throw new Error(`Failed to rename: ${path}`);
    return true;
  },

  async copy(from: string, to: string, operationId?: string): Promise<boolean> {
    const plugin = getNativePlugin();
    if (!plugin) throw new Error("Native file access not available");
    const result = await plugin.copyFile({ from, to, operationId });
    if (!result.success) throw new Error(`Failed to copy: ${from}`);
    return true;
  },

  async move(from: string, to: string, operationId?: string): Promise<boolean> {
    const plugin = getNativePlugin();
    if (!plugin) throw new Error("Native file access not available");
    const result = await plugin.moveFile({ from, to, operationId });
    if (!result.success) throw new Error(`Failed to move: ${from}`);
    return true;
  },

  async readText(path: string): Promise<string | null> {
    const plugin = getNativePlugin();
    if (!plugin) throw new Error("Native file access not available");
    const result = isContentReference(path)
      ? await plugin.storageReadText({ ref: path })
      : await plugin.readFile({ path, encoding: "utf8" });
    return result.content;
  },

  async writeText(path: string, content: string): Promise<boolean> {
    const plugin = getNativePlugin();
    if (!plugin) throw new Error("Native file access not available");
    const result = isContentReference(path)
      ? await plugin.storageWriteText({ ref: path, content })
      : await plugin.writeFile({ path, content, encoding: "utf8" });
    if (!result.success) throw new Error(`Failed to write: ${path}`);
    return true;
  },

  async generateThumbnail(path: string, kind?: string, maxSize = 200): Promise<string | null> {
    const plugin = getNativePlugin();
    if (!plugin) return null;
    try {
      const result = await plugin.generateThumbnail({ path, kind, maxSize });
      return result.thumbnail;
    } catch (e) {
      return null;
    }
  },

  /** Provider-aware recursive folder summary. SAF references use the same native boundary. */
  async getStorageFolderSummary(path: string): Promise<{ fileCount: number; folderCount: number; totalSize: number } | null> {
    const plugin = getNativePlugin();
    if (!plugin) return null;
    try {
      if (isContentReference(path) && typeof plugin.storageFolderSummary === "function") {
        return await plugin.storageFolderSummary({ ref: path });
      }
      const result = await plugin.getFolderSummary({ path });
      return { fileCount: Number(result.fileCount ?? 0), folderCount: Number(result.folderCount ?? 0), totalSize: Number(result.totalSize ?? 0) };
    } catch (e) {
      console.warn("getStorageFolderSummary failed:", e);
      return null;
    }
  },

  async getStorageInfo(): Promise<{ total: number; free: number; used: number; volumes?: Array<{ path: string; total: number; free: number; used: number }> } | null> {
    const plugin = getNativePlugin();
    if (!plugin) return null;
    return await plugin.getStorageInfo();
  },

  /**
   * Read a file as base64 — used for media playback (audio/video/PDF/images)
   * on Android where the file lives on disk and needs to be loaded into a
   * Blob URL for <video>, <audio>, <iframe>, <img> sources.
   * Returns null on web (no native bridge) or on read failure.
   */
  async writeBase64(path: string, base64: string, mimeType = "application/octet-stream"): Promise<boolean> {
    const plugin = getNativePlugin();
    if (!plugin) return false;
    try {
      if (isContentReference(path)) {
        // SAF files are created first, then populated with bounded base64 chunks.
        const slash = path.lastIndexOf("/");
        const parent = slash > 0 ? path.slice(0, slash) : path;
        const encodedName = slash > 0 ? path.slice(slash + 1) : "restored.bin";
        const name = decodeURIComponent(encodedName);
        const created = await plugin.storageCreateFile({ parent, name, mimeType });
        if (!created.success || !created.ref) return false;
        if (!plugin.storageWriteChunk) return false;
        const chunkChars = 256 * 1024;
        let offset = 0;
        let byteOffset = 0;
        while (offset < base64.length) {
          const end = Math.min(base64.length, offset + chunkChars);
          let chunk = base64.slice(offset, end);
          // Keep each chunk aligned to a complete 3-byte base64 group.
          if (end < base64.length) chunk = chunk.slice(0, chunk.length - (chunk.length % 4));
          if (!chunk) break;
          const decodedBytes = Math.floor(chunk.length * 3 / 4) - (chunk.endsWith("==") ? 2 : chunk.endsWith("=") ? 1 : 0);
          const result = await plugin.storageWriteChunk({ ref: created.ref, offset: byteOffset, content: chunk, truncate: byteOffset === 0 });
          if (!result.success) return false;
          byteOffset += decodedBytes;
          offset += chunk.length;
        }
        return true;
      }
      const result = await plugin.writeFile({ path, content: base64, encoding: "base64" });
      return result.success === true;
    } catch (e) {
      console.warn("writeBase64 failed:", e);
      return false;
    }
  },

  async readFileBase64(path: string): Promise<string | null> {
    const plugin = getNativePlugin();
    if (!plugin) return null;
    try {
      const result = await plugin.readFile({ path, encoding: "base64" });
      return result.content;
    } catch (e) {
      console.warn("readFileBase64 failed:", e);
      return null;
    }
  },

  /**
   * Open a file using the system's default app (ACTION_VIEW with mime type).
   * Falls back to the file picker if no app can handle the mime type.
   * Returns true if the intent was successfully launched.
   */
  async openFileExternal(path: string, mimeType?: string): Promise<boolean> {
    const plugin = getNativePlugin();
    if (!plugin) return false;
    try {
      if (plugin.openFileExternal) {
        const result = await plugin.openFileExternal({ path, mimeType: mimeType ?? "" });
        return !!result?.success;
      }
      return false;
    } catch (e) {
      console.warn("openFileExternal failed:", e);
      return false;
    }
  },

  async installXapk(path: string) {
    return await installXapk(path);
  },

  async shareFiles(paths: string[]): Promise<{ success: boolean; count?: number; error?: string }> {
    const plugin = getNativePlugin();
    if (!plugin?.shareFiles) return { success: false, error: "Native sharing is unavailable" };
    try {
      return await plugin.shareFiles({ paths });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : "Unable to share files" };
    }
  },

  async listInstalledApps(includeSystem = false) {
    const plugin = getNativePlugin();
    if (!plugin?.listInstalledApps) return { apps: [] };
    try { return await plugin.listInstalledApps({ includeSystem }); } catch (e) { console.warn("listInstalledApps failed:", e); return { apps: [] }; }
  },

  async backupInstalledApp(packageName: string) {
    const plugin = getNativePlugin();
    if (!plugin?.backupInstalledApp) return { success: false, error: "App backup is unavailable" };
    try { return await plugin.backupInstalledApp({ packageName }); } catch (e) { return { success: false, error: e instanceof Error ? e.message : "Backup failed" }; }
  },

  async uninstallApp(packageName: string) {
    const plugin = getNativePlugin();
    if (!plugin?.uninstallApp) return { started: false, error: "App uninstall is unavailable" };
    try { return await plugin.uninstallApp({ packageName }); } catch (e) { return { started: false, error: e instanceof Error ? e.message : "Uninstall failed" }; }
  },

  async requestDocumentUri(mimeType = "*/*", allowMultiple = false): Promise<{ granted: boolean; cancelled?: boolean; uri?: string; uris?: string[] } | null> {
    const plugin = getNativePlugin();
    if (!plugin?.requestDocumentUri) return null;
    try { return await plugin.requestDocumentUri({ mimeType, allowMultiple }); }
    catch (e) { console.warn("requestDocumentUri failed:", e); return null; }
  },

  async releasePersistedUri(uri: string): Promise<boolean> {
    const plugin = getNativePlugin();
    if (!plugin?.releasePersistedUri) return false;
    try { return !!(await plugin.releasePersistedUri({ uri }))?.success; }
    catch (e) { console.warn("releasePersistedUri failed:", e); return false; }
  },

  async consumeIncomingIntent(): Promise<{ available: boolean; action?: string; mimeType?: string; uris: string[]; text?: string } | null> {
    const plugin = getNativePlugin();
    if (!plugin?.consumeIncomingIntent) return null;
    try { return await plugin.consumeIncomingIntent(); }
    catch (e) { console.warn("consumeIncomingIntent failed:", e); return null; }
  },

  /**
   * Enumerate all available storage volumes: primary external + removable
   * (SD cards, USB OTG). Returns null on web (no native bridge).
   */
  async listStorageVolumes(): Promise<Array<{
    path: string;
    label: string;
    isRemovable: boolean;
    isPrimary: boolean;
    total: number;
    free: number;
    used: number;
  }> | null> {
    const plugin = getNativePlugin();
    if (!plugin) return null;
    try {
      if (plugin.listStorageVolumes) {
        const result = await plugin.listStorageVolumes();
        return result?.volumes ?? [];
      }
      return null;
    } catch (e) {
      console.warn("listStorageVolumes failed:", e);
      return null;
    }
  },

  /**
   * Decode a HEIC/HEIF image file to a base64 JPEG data URL using the native
   * Android decoder (ImageDecoder on API 28+, BitmapFactory fallback).
   * Returns {supported: false} if the device can't decode HEIC.
   */
  async decodeHeic(path: string, maxDim = 1920): Promise<{ supported: boolean; data?: string; error?: string }> {
    const plugin = getNativePlugin();
    if (!plugin) return { supported: false, error: "Native plugin not available" };
    try {
      if (plugin.decodeHeic) {
        const result = await plugin.decodeHeic({ path, maxDim });
        if (result?.supported) {
          return { supported: true, data: result.data };
        }
        return { supported: false, error: result?.error ?? "HEIC not supported" };
      }
      return { supported: false, error: "decodeHeic not implemented in native plugin" };
    } catch (e) {
      return { supported: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  /**
   * Search for files by name pattern in a directory tree.
   * On native: walks the real filesystem on a background thread.
   * On web: falls back to in-memory mock search.
   */
  async searchFiles(path: string, query: string, options: {
    searchId?: string;
    kind?: string;
    minSize?: number;
    maxSize?: number;
    modifiedAfter?: number;
    modifiedBefore?: number;
    includeHidden?: boolean;
    includeDirectories?: boolean;
    recursive?: boolean;
    maxResults?: number;
  } | number = {}): Promise<{
    results: Array<{
      name: string;
      path: string;
      isDirectory: boolean;
      size: number;
      lastModified: number;
      mimeType: string;
    }>;
    truncated: boolean;
    scanned: number;
  }> {
    const normalized = typeof options === "number" ? { maxResults: options } : options;
    const maxResults = normalized.maxResults ?? 500;
    const plugin = getNativePlugin();
    if (!plugin) {
      const { getAllFiles } = await import("./filesystem");
      const q = query.toLowerCase();
      const all = getAllFiles().filter(n => n.name.toLowerCase().includes(q));
      return {
        results: all.slice(0, maxResults).map(n => ({
          name: n.name, path: n.id, isDirectory: n.kind === "folder",
          size: n.size, lastModified: n.modified, mimeType: "",
        })),
        truncated: all.length > maxResults,
        scanned: all.length,
      };
    }
    try {
      if (plugin.searchFiles) {
        const result = await plugin.searchFiles({
          searchId: normalized.searchId,
          path,
          query,
          kind: normalized.kind ?? "all",
          minSize: normalized.minSize ?? 0,
          maxSize: normalized.maxSize ?? Number.MAX_SAFE_INTEGER,
          modifiedAfter: normalized.modifiedAfter ?? 0,
          modifiedBefore: normalized.modifiedBefore ?? Number.MAX_SAFE_INTEGER,
          includeHidden: normalized.includeHidden ?? false,
          includeDirectories: normalized.includeDirectories ?? true,
          recursive: normalized.recursive ?? true,
          maxResults,
        });
        return {
          results: result?.results ?? [],
          truncated: result?.truncated === true,
          scanned: result?.scanned ?? 0,
        };
      }
      return { results: [], truncated: false, scanned: 0 };
    } catch (e) {
      console.warn("searchFiles failed:", e);
      throw e;
    }
  },

  async cancelSearch(searchId: string): Promise<{ cancelled: boolean }> {
    const plugin = getNativePlugin();
    if (!plugin?.cancelSearch || !searchId) return { cancelled: false };
    try {
      return await plugin.cancelSearch({ searchId });
    } catch (e) {
      console.warn("cancelSearch failed:", e);
      return { cancelled: false };
    }
  },

  /**
   * Compute SHA-256 hash of a file for real duplicate detection.
   */
  async getFileHash(path: string): Promise<string | null> {
    const plugin = getNativePlugin();
    if (!plugin) return null;
    try {
      if (plugin.getFileHash) {
        const result = await plugin.getFileHash({ path });
        return result?.hash ?? null;
      }
      return null;
    } catch (e) {
      console.warn("getFileHash failed:", e);
      return null;
    }
  },

  /**
   * Get a content:// URI for streaming media playback in the WebView.
   * This eliminates the base64 round-trip — <video src={uri}> works directly.
   * For large files (1GB+), this is the difference between working and OOM.
   */
  async getStreamUri(path: string): Promise<{ uri: string; mimeType: string; size: number } | null> {
    const plugin = getNativePlugin();
    if (!plugin) return null;
    try {
      if (plugin.getStreamUri) {
        const result = await plugin.getStreamUri({ path });
        if (result?.uri) {
          return {
            uri: result.uri,
            mimeType: result.mimeType ?? "",
            size: result.size ?? 0,
          };
        }
      }
      return null;
    } catch (e) {
      console.warn("getStreamUri failed:", e);
      return null;
    }
  },

  /**
   * Extract metadata from a media file (video/audio) using MediaMetadataRetriever.
   * Returns duration, resolution, codec info, ID3 tags, and cover art.
   */
  async getMediaMetadata(path: string): Promise<{
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
  } | null> {
    const plugin = getNativePlugin();
    if (!plugin) return null;
    try {
      if (plugin.getMediaMetadata) {
        const result = await plugin.getMediaMetadata({ path });
        return result ?? null;
      }
      return null;
    } catch (e) {
      console.warn("getMediaMetadata failed:", e);
      return null;
    }
  },

  // ============ SAF methods ============

  async safRequestTreeUri(): Promise<{ treeUri: string; granted: boolean } | null> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safRequestTreeUri) return null;
    try {
      const result = await nativePlugin.safRequestTreeUri();
      return result ?? null;
    } catch (e) {
      console.warn("safRequestTreeUri failed:", e);
      return null;
    }
  },

  async safGetPersistedUris(): Promise<Array<{ uri: string; isRead: boolean; isWrite: boolean }>> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safGetPersistedUris) return [];
    try {
      const result = await nativePlugin.safGetPersistedUris();
      return result?.uris ?? [];
    } catch (e) {
      console.warn("safGetPersistedUris failed:", e);
      return [];
    }
  },

  async safListDirectory(treeUri: string): Promise<Array<{ name: string; path: string; isDirectory: boolean; size: number; lastModified: number; mimeType: string }>> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safListDirectory) return [];
    try {
      const result = await nativePlugin.safListDirectory({ treeUri });
      return result?.files ?? [];
    } catch (e) {
      console.warn("safListDirectory failed:", e);
      return [];
    }
  },

  async safReadText(uri: string): Promise<string | null> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safReadText) return null;
    try {
      const result = await nativePlugin.safReadText({ uri });
      return result?.content ?? null;
    } catch (e) {
      console.warn("safReadText failed:", e);
      return null;
    }
  },

  async safWriteText(uri: string, content: string): Promise<boolean> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safWriteText) return false;
    try {
      const result = await nativePlugin.safWriteText({ uri, content });
      return !!result?.success;
    } catch (e) {
      console.warn("safWriteText failed:", e);
      return false;
    }
  },

  async safCreateFile(treeUri: string, name: string, mimeType = "application/octet-stream"): Promise<{ uri: string; name: string } | null> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safCreateFile) return null;
    try {
      const result = await nativePlugin.safCreateFile({ treeUri, name, mimeType });
      return result ?? null;
    } catch (e) {
      console.warn("safCreateFile failed:", e);
      return null;
    }
  },

  async safCreateDirectory(treeUri: string, name: string): Promise<{ uri: string; name: string } | null> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safCreateDirectory) return null;
    try {
      const result = await nativePlugin.safCreateDirectory({ treeUri, name });
      return result ?? null;
    } catch (e) {
      console.warn("safCreateDirectory failed:", e);
      return null;
    }
  },

  async safDelete(uri: string): Promise<boolean> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safDelete) return false;
    try {
      const result = await nativePlugin.safDelete({ uri });
      return !!result?.success;
    } catch (e) {
      console.warn("safDelete failed:", e);
      return false;
    }
  },

  async safRename(uri: string, newName: string): Promise<boolean> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safRename) return false;
    try {
      const result = await nativePlugin.safRename({ uri, newName });
      return !!result?.success;
    } catch (e) {
      console.warn("safRename failed:", e);
      return false;
    }
  },

  async safGetStreamUri(uri: string): Promise<{ uri: string; mimeType: string; size: number } | null> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin || !nativePlugin.safGetStreamUri) return null;
    try {
      const result = await nativePlugin.safGetStreamUri({ uri });
      return result ?? null;
    } catch (e) {
      console.warn("safGetStreamUri failed:", e);
      return null;
    }
  },

  async beginLargeWrite(path: string): Promise<string | null> {
    const plugin = getNativePlugin();
    if (!plugin || typeof plugin.storageBeginChunkedWrite !== "function") return null;
    try { const r=await plugin.storageBeginChunkedWrite({ref:path}); return r?.success ? r.tempRef : null; }
    catch(e){ console.warn("beginLargeWrite failed:",e); return null; }
  },

  async commitLargeWrite(path: string, tempRef: string): Promise<boolean> {
    const plugin=getNativePlugin();
    if(!plugin || typeof plugin.storageCommitChunkedWrite!=="function") return false;
    try { const r=await plugin.storageCommitChunkedWrite({ref:path,tempRef}); return !!r?.success; }
    catch(e){ console.warn("commitLargeWrite failed:",e); return false; }
  },

  async abortLargeWrite(tempRef: string): Promise<void> {
    const plugin=getNativePlugin(); if(!plugin || typeof plugin.storageAbortChunkedWrite!=="function") return;
    try { await plugin.storageAbortChunkedWrite({tempRef}); } catch(e){ console.warn("abortLargeWrite failed:",e); }
  },

  async writeFileChunk(path: string, offset: number, base64: string, truncate = false): Promise<boolean> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin) return false;
    try {
      if (isContentReference(path)) {
        if (typeof nativePlugin.storageWriteChunk !== "function") return false;
        const result = await nativePlugin.storageWriteChunk({ ref: path, offset, content: base64, truncate });
        return !!result?.success;
      }
      // Native direct-path chunk writes are exposed through the same storage boundary.
      if (typeof nativePlugin.storageWriteChunk !== "function") return false;
      const result = await nativePlugin.storageWriteChunk({ ref: path, offset, content: base64, truncate });
      return !!result?.success;
    } catch (e) {
      console.warn("writeFileChunk failed:", e);
      return false;
    }
  },

  // ============ Chunked file reading ============

  async readFileChunk(path: string, offset: number, length: number): Promise<{
    content: string;
    bytesRead: number;
    offset: number;
    fileSize: number;
    eof: boolean;
  } | null> {
    const nativePlugin = getNativePlugin();
    if (!nativePlugin) return null;
    try {
      if (isContentReference(path)) {
        const result = await nativePlugin.storageReadChunk({ ref: path, offset, length });
        return {
          content: result.content,
          bytesRead: result.size,
          offset: result.offset,
          fileSize: 0,
          eof: result.size < length,
        };
      }
      if (typeof nativePlugin.readFileChunk !== "function") return null;
      const result = await nativePlugin.readFileChunk({ path, offset, length });
      return result ?? null;
    } catch (e) {
      console.warn("readFileChunk failed:", e);
      return null;
    }
  },
};
