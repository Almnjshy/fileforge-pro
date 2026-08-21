// FileForge Pro — Real File System Access Layer
// Uses File System Access API where available, falls back to uploaded files in memory
"use client";

import { filesystem, getNode, type FileNode } from "./filesystem";
import { v4 as uuid } from "uuid";
import { logger } from "./logger";
import { saveUserFile, deleteUserFile, getAllUserFiles } from "./persistence";

const THUMB_PREFIX = "ff-thumb-";
const THUMB_ORDER_KEY = "ff-thumb-order";

export interface UserFile {
  id: string;
  name: string;
  parentId: string;
  type: "file" | "folder";
  mime: string;
  size: number;
  modified: number;
  // For files: data URL or blob URL
  dataUrl?: string;
  // For images: actual thumbnail
  thumbnail?: string;
  // Content for text files
  content?: string;
}

// Check if File System Access API is available
export function hasFileSystemAccess(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  if (!hasFileSystemAccess()) return null;
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: "readwrite",
    });
    return handle;
  } catch (e) {
    // User cancelling the picker also throws — that's expected, so this stays quiet at debug level.
    logger.debug("real-fs", "Directory picker cancelled or unavailable", e);
    return null;
  }
}

export async function pickFiles(): Promise<File[] | null> {
  try {
    if (hasFileSystemAccess()) {
      const handles = await (window as any).showOpenFilePicker({
        multiple: true,
      });
      return Promise.all(handles.map((h: any) => h.getFile()));
    }
    // Fallback: use input element
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.onchange = () => {
        resolve(input.files ? Array.from(input.files) : null);
      };
      input.click();
    });
  } catch (e) {
    logger.debug("real-fs", "File picker cancelled or unavailable", e);
    return null;
  }
}

// Generate a real thumbnail from an image File
export async function generateImageThumbnail(file: File, maxSize = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No canvas context"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Generate a thumbnail from a video File
export async function generateVideoThumbnail(file: File, maxSize = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        let { videoWidth: width, videoHeight: height } = video;
        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          return reject(new Error("No canvas context"));
        }
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        cleanup();
        resolve(dataUrl);
      } catch (e) {
        cleanup();
        reject(e);
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video for thumbnail"));
    };
    video.src = objectUrl;
  });
}

// Read text content from File
export async function readTextContent(file: File): Promise<string> {
  return await file.text();
}

// Add uploaded files to the virtual filesystem
export async function addUploadedFiles(
  files: File[],
  parentId: string
): Promise<string[]> {
  const ids: string[] = [];
  for (const file of files) {
    const id = `u-${uuid()}`;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic"].includes(ext);
    const isVideo = ["mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "3gp"].includes(ext);
    const isAudio = ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"].includes(ext);
    const isText = ["txt", "md", "json", "xml", "yaml", "yml", "csv", "log", "ini", "conf", "js", "ts", "py", "html", "css"].includes(ext);

    let thumbnail: string | undefined;
    let content: string | undefined;
    let kind: FileNode["kind"] = "unknown";

    if (isImage) {
      kind = "image";
      thumbnail = await generateImageThumbnail(file);
      // Store full image content as data URL so FilePreview can render it
      content = await fileToDataUrl(file);
    } else if (isVideo) {
      kind = "video";
      thumbnail = await generateVideoThumbnail(file);
      // Store full video content as data URL so FilePreview can play it
      content = await fileToDataUrl(file);
    } else if (isAudio) {
      kind = "audio";
      // Store full audio content as data URL so FilePreview can play it
      content = await fileToDataUrl(file);
    } else if (isText) {
      kind = ext.match(/^(js|ts|py|json|xml|yaml|yml|css|html)$/) ? "code" : "text";
      content = await readTextContent(file);
    } else if (ext === "pdf") {
      kind = "pdf";
      // Store full PDF as data URL so iframe can render it
      content = await fileToDataUrl(file);
    } else if (["zip", "rar", "7z", "tar", "gz", "bz2", "xz"].includes(ext)) {
      kind = "archive";
      // Store full archive as data URL so ArchiveBrowser can decompress it
      content = await fileToDataUrl(file);
    } else if (ext === "apk") kind = "apk";
    else if (["doc", "docx"].includes(ext)) kind = "word";
    else if (["xls", "xlsx"].includes(ext)) kind = "excel";
    else if (["ppt", "pptx"].includes(ext)) kind = "presentation";

    const node: FileNode = {
      id,
      name: file.name,
      kind,
      size: file.size,
      modified: Date.now(),
      parentId,
      content,
      thumbColor: thumbnail ? undefined : (isImage || isVideo ? "#f97316" : undefined),
    };

    // Store thumbnail separately to avoid bloating the filesystem object
    if (thumbnail) {
      setThumbnail(id, thumbnail);
    }

    filesystem[id] = node;
    const parent = getNode(parentId);
    if (parent) {
      if (!parent.childrenIds) parent.childrenIds = [];
      parent.childrenIds.push(id);
    }
    ids.push(id);

    // Actually persist the upload (metadata + content) so it survives a
    // reload — the previous implementation only wrote metadata to
    // localStorage and never read it back.
    saveUserFile(id, node).catch(e => logger.error("real-fs", `Failed to persist uploaded file ${id}`, e));
  }
  return ids;
}

// Convert a File to a data URL — used to store full media bytes for playback
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Rehydrate previously-uploaded files (and their content) from IndexedDB back
// into the in-memory mock filesystem. Call this once on app startup, before
// the user navigates anywhere.
export async function hydrateUserFiles(): Promise<void> {
  try {
    const persisted = await getAllUserFiles();
    for (const { node } of persisted) {
      const n = node as FileNode;
      if (!n?.id) continue;
      filesystem[n.id] = n;
      const parent = n.parentId ? getNode(n.parentId) : null;
      if (parent) {
        if (!parent.childrenIds) parent.childrenIds = [];
        if (!parent.childrenIds.includes(n.id)) parent.childrenIds.push(n.id);
      }
    }
  } catch (e) {
    logger.error("real-fs", "Failed to hydrate persisted user files", e);
  }
}

// Persist an in-place edit (e.g. from the text editor) to an already-uploaded file.
export async function persistUserFileUpdate(id: string): Promise<void> {
  const node = getNode(id);
  if (!node || !id.startsWith("u-")) return;
  try {
    await saveUserFile(id, node);
  } catch (e) {
    logger.error("real-fs", `Failed to persist edit for ${id}`, e);
  }
}

// Remove a previously-uploaded file's persisted copy (called on delete).
export async function removePersistedUserFile(id: string): Promise<void> {
  if (!id.startsWith("u-")) return;
  try {
    await deleteUserFile(id);
  } catch (e) {
    logger.error("real-fs", `Failed to remove persisted file ${id}`, e);
  }
}

function getThumbOrder(): string[] {
  try {
    const raw = sessionStorage.getItem(THUMB_ORDER_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch (e) {
    logger.warn("real-fs", "Failed to read thumbnail order; resetting", e);
    return [];
  }
}

function setThumbOrder(order: string[]) {
  try {
    sessionStorage.setItem(THUMB_ORDER_KEY, JSON.stringify(order));
  } catch (e) {
    logger.warn("real-fs", "Failed to persist thumbnail order", e);
  }
}

// Store a thumbnail, evicting the oldest ones on quota errors instead of
// silently dropping the newest thumbnail (the previous behavior — an empty
// catch{} — made images disappear with no indication of why).
export function setThumbnail(id: string, dataUrl: string): void {
  let order = getThumbOrder().filter(existingId => existingId !== id);
  order.push(id);

  const tryStore = (): boolean => {
    try {
      sessionStorage.setItem(`${THUMB_PREFIX}${id}`, dataUrl);
      setThumbOrder(order);
      return true;
    } catch (e) {
      return false;
    }
  };

  if (tryStore()) return;

  // Quota exceeded — evict the oldest thumbnails and retry a bounded number
  // of times rather than losing the newest one silently.
  logger.warn("real-fs", `Thumbnail storage full, evicting oldest entries to store "${id}"`);
  for (let attempt = 0; attempt < 20 && order.length > 1; attempt++) {
    const oldest = order.shift();
    if (oldest && oldest !== id) {
      try { sessionStorage.removeItem(`${THUMB_PREFIX}${oldest}`); } catch (e) {
        logger.warn("real-fs", `Failed to evict thumbnail for ${oldest}`, e);
      }
    }
    if (tryStore()) return;
  }
  logger.error("real-fs", `Unable to store thumbnail for "${id}" even after eviction`);
}

export function getThumbnail(id: string): string | null {
  try {
    return sessionStorage.getItem(`${THUMB_PREFIX}${id}`);
  } catch (e) {
    logger.warn("real-fs", `Failed to read thumbnail for ${id}`, e);
    return null;
  }
}


