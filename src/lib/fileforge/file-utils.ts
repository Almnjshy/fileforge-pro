// FileForge Pro — Pure File Utilities
//
// These functions have ZERO dependency on the mock filesystem tree.
// They operate on FileNode objects passed as arguments.
// All components should import from here, NOT from filesystem.ts.

import type { FileKind } from "./types";

// ============ Extension / Kind detection ============

const EXT_MAP: Record<string, FileKind> = {
  txt: "text", md: "text", log: "text", conf: "text", ini: "text",
  json: "code", xml: "code", yaml: "code", yml: "code", toml: "code",
  js: "code", ts: "code", tsx: "code", jsx: "code", py: "code", java: "code",
  kt: "code", kts: "code", go: "code", rs: "code", c: "code", cpp: "code",
  h: "code", sh: "code", bash: "code", sql: "code", css: "code", scss: "code",
  csv: "code",
  html: "html", htm: "html",
  pdf: "pdf",
  doc: "word", docx: "word", rtf: "word", odt: "word",
  xls: "excel", xlsx: "excel", ods: "excel",
  ppt: "presentation", pptx: "presentation", odp: "presentation",
  jpg: "image", jpeg: "image", png: "image", gif: "image", webp: "image",
  bmp: "image", svg: "image", heic: "image",
  mp4: "video", mkv: "video", avi: "video", mov: "video", webm: "video",
  flv: "video", wmv: "video", "3gp": "video",
  mp3: "audio", flac: "audio", wav: "audio", ogg: "audio", m4a: "audio",
  aac: "audio", opus: "audio",
  zip: "archive", rar: "archive", "7z": "archive", tar: "archive",
  gz: "archive", bz2: "archive", xz: "archive",
  apk: "apk", xapk: "apk",
  ttf: "font", otf: "font", woff: "font", woff2: "font",
};

export function getExt(name: string): string {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

export function detectKind(name: string): FileKind {
  const ext = getExt(name);
  return EXT_MAP[ext] ?? "unknown";
}

// ============ Formatting ============

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const val = bytes / Math.pow(k, i);
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${sizes[i]}`;
}

export function formatDate(ms: number): string {
  if (!ms || ms === 0) return "—";
  const now = Date.now();
  const diff = now - ms;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "Just now";
  if (diff < hour) return `${Math.floor(diff / min)} min ago`;
  if (diff < day) return `${Math.floor(diff / hour)} hours ago`;
  if (diff < 2 * day) return "Yesterday";
  if (diff < 7 * day) return `${Math.floor(diff / day)} days ago`;
  return new Date(ms).toLocaleDateString();
}

export function formatDateShort(ms: number): string {
  if (!ms || ms === 0) return "—";
  const now = Date.now();
  const diff = now - ms;
  const day = 86400000;
  if (diff < day && new Date(ms).getDate() === new Date(now).getDate()) return "Today";
  if (diff < 2 * day) return "Yesterday";
  return new Date(ms).toLocaleDateString();
}

// ============ Path helpers ============

export interface PathSegment {
  name: string;
  path: string;
}

export function getPathSegments(path: string): PathSegment[] {
  if (!path || path === "/") return [{ name: "Root", path: "/" }];
  const parts = path.split("/").filter(Boolean);
  const segments: PathSegment[] = [];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : `/${part}`;
    segments.push({ name: part, path: acc });
  }
  // Ensure first segment has leading slash for display
  if (segments.length > 0 && !segments[0].path.startsWith("/")) {
    segments[0].path = "/" + segments[0].path;
  }
  return segments;
}

// ============ File type labels ============

export function getFileTypeLabel(kind: FileKind, name: string): string {
  const labels: Record<FileKind, string> = {
    folder: "Folder",
    image: "Image",
    video: "Video",
    audio: "Audio",
    pdf: "PDF Document",
    text: "Text File",
    code: "Code File",
    archive: "Archive",
    apk: "Android Package",
    word: "Document",
    excel: "Spreadsheet",
    presentation: "Presentation",
    html: "Web Page",
    font: "Font",
    unknown: "File",
  };
  return labels[kind] ?? "File";
}
