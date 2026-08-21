// FileForge Pro — File Open Manager
//
// Abstraction that decouples "which viewer to open" from "what type is the file".
// Used by:
//   - FileBrowser (default open)
//   - ContextMenu ("Open With" / "Open As...")
//   - SearchPanel (result click)
//   - Sidebar (recent files)
//
// The ViewerType union is the complete set of viewers the app supports.
// FileOpenManager.openFile() takes a node + optional forced viewer type
// (for "Open As..." when the user overrides the auto-detected type).

"use client";

import type { FileNode, FloatingWindowType } from "./types";

export type ViewerType =
  | "auto"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "archive"
  | "html"
  | "json"
  | "xml"
  | "markdown"
  | "hex"
  | "properties"
  | "external";

// Map a FileKind to a default FloatingWindowType
const KIND_TO_WINDOW_TYPE: Record<string, FloatingWindowType> = {
  text: "text-editor",
  code: "text-editor",
  html: "text-editor",
  image: "image-preview",
  video: "video-preview",
  audio: "audio-preview",
  pdf: "pdf-preview",
  archive: "archive-preview",
  apk: "properties",
  word: "properties",
  excel: "properties",
  presentation: "properties",
  font: "properties",
  unknown: "properties",
  folder: "folder",
};

// Map a ViewerType to a FloatingWindowType
const VIEWER_TO_WINDOW_TYPE: Record<Exclude<ViewerType, "auto">, FloatingWindowType> = {
  text: "text-editor",
  image: "image-preview",
  video: "video-preview",
  audio: "audio-preview",
  pdf: "pdf-preview",
  archive: "archive-preview",
  html: "web-preview",
  json: "text-editor",
  xml: "text-editor",
  markdown: "text-editor",
  hex: "hex-preview",
  properties: "properties",
  external: "properties", // handled separately
};

// Extension → ViewerType mapping for "Open As..." suggestions
const EXT_VIEWER_HINT: Record<string, ViewerType> = {
  txt: "text", md: "markdown", log: "text", conf: "text", ini: "text",
  json: "json", xml: "xml", yaml: "text", yml: "text", csv: "text",
  js: "text", ts: "text", py: "text", java: "text", kt: "text",
  go: "text", rs: "text", c: "text", cpp: "text", h: "text",
  sh: "text", sql: "text", css: "text", scss: "text",
  html: "html", htm: "html",
  jpg: "image", jpeg: "image", png: "image", gif: "image",
  webp: "image", bmp: "image", svg: "image", heic: "image", heif: "image",
  mp4: "video", mkv: "video", avi: "video", mov: "video",
  webm: "video", flv: "video", wmv: "video", "3gp": "video",
  mp3: "audio", wav: "audio", ogg: "audio", flac: "audio",
  m4a: "audio", aac: "audio", opus: "audio",
  pdf: "pdf",
  zip: "archive", xapk: "archive", rar: "archive", "7z": "archive",
  tar: "archive", gz: "archive", bz2: "archive", xz: "archive", tgz: "archive", tbz: "archive", tbz2: "archive", txz: "archive",
};

class FileOpenManager {
  /**
   * Detect the default ViewerType for a file based on its extension.
   */
  detectViewer(fileName: string): ViewerType {
    const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
    return EXT_VIEWER_HINT[ext] ?? "external";
  }

  /**
   * Get the list of all available "Open As..." options.
   * Used by OpenAsDialog to render the menu.
   */
  getOpenAsOptions(): Array<{ type: ViewerType; label: string; labelAr: string; icon: string }> {
    return [
      { type: "text", label: "Text", labelAr: "نص", icon: "file-text" },
      { type: "image", label: "Image", labelAr: "صورة", icon: "image" },
      { type: "video", label: "Video", labelAr: "فيديو", icon: "video" },
      { type: "audio", label: "Audio", labelAr: "صوت", icon: "music" },
      { type: "pdf", label: "PDF", labelAr: "PDF", icon: "file" },
      { type: "archive", label: "Archive", labelAr: "أرشيف", icon: "archive" },
      { type: "html", label: "Web / HTML", labelAr: "ويب / HTML", icon: "globe" },
      { type: "json", label: "JSON", labelAr: "JSON", icon: "code" },
      { type: "xml", label: "XML", labelAr: "XML", icon: "code" },
      { type: "markdown", label: "Markdown", labelAr: "ماركداون", icon: "file-text" },
      { type: "hex", label: "Hex / Binary", labelAr: "Hex / Binary", icon: "binary" },
      { type: "external", label: "External App", labelAr: "تطبيق خارجي", icon: "external-link" },
    ];
  }

  /**
   * Open a file in the specified viewer. If viewerType is "auto",
   * detect from extension. Returns the windowId of the opened window.
   */
  openFile(
    node: FileNode,
    store: any,
    viewerType: ViewerType = "auto",
  ): string | null {
    // Resolve the actual viewer
    const actualViewer: ViewerType =
      viewerType === "auto" ? this.detectViewer(node.name) : viewerType;

    // External app — special case
    if (actualViewer === "external") {
      this.openExternal(node);
      return null;
    }

    // Map to FloatingWindowType
    const windowType = VIEWER_TO_WINDOW_TYPE[actualViewer] ?? "properties";

    // Compute window size based on type
    const width = windowType === "text-editor" ? 820 :
                  windowType === "video-preview" ? 800 :
                  windowType === "pdf-preview" ? 720 :
                  windowType === "archive-preview" ? 720 :
                  windowType === "audio-preview" ? 480 : 720;
    const height = windowType === "text-editor" ? 580 :
                   windowType === "pdf-preview" ? 600 :
                   windowType === "archive-preview" ? 560 :
                   windowType === "audio-preview" ? 320 : 560;

    return store.openWindow({
      type: windowType,
      title: node.name,
      nodeId: node.id,
      path: windowType === "archive-preview" || windowType === "folder" ? node.id : undefined,
      width,
      height,
      maximized: windowType === "pdf-preview",
    });
  }

  /**
   * Open a file in an external app (ACTION_VIEW on Android).
   */
  async openExternal(node: FileNode): Promise<void> {
    const { nativeFileSystem, isNative } = await import("./native-bridge");
    if (isNative() && (node.id.startsWith("/") || node.id.startsWith("content://"))) {
      const ext = node.name.split(".").pop()?.toLowerCase() ?? "";
      const mime = this.guessMime(ext);
      await nativeFileSystem.openFileExternal(node.id, mime);
    }
  }

  /**
   * Guess MIME type from extension (used for external open).
   */
  guessMime(ext: string): string {
    const map: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
      webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", heic: "image/heic",
      mp4: "video/mp4", mkv: "video/x-matroska", webm: "video/webm", mov: "video/quicktime",
      mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac",
      pdf: "application/pdf", txt: "text/plain", html: "text/html",
      json: "application/json", xml: "application/xml",
      zip: "application/zip", rar: "application/x-rar-compressed",
      "7z": "application/x-7z-compressed",
    };
    return map[ext.toLowerCase()] ?? "*/*";
  }
}

// Singleton
export const fileOpenManager = new FileOpenManager();
