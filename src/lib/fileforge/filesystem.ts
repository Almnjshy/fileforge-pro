// FileForge Pro — Mock filesystem with realistic content
import type { FileNode, FileKind } from "./types";
export type { FileNode, FileKind };

const DAY = 86400000;
const now = Date.now();
const ago = (days: number) => now - days * DAY;

// Helper: detect kind from extension
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

const COLORS = ["#f97316", "#ef4444", "#eab308", "#22c55e", "#06b6d4", "#8b5cf6", "#ec4899", "#14b8a6"];
function pickColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length];
}

// ============ TEXT/CODE SAMPLE CONTENT ============
const SAMPLE_PY = `import os
import sys
from pathlib import Path
from typing import List, Optional


def list_files(directory: str, recursive: bool = False) -> List[Path]:
    """List all files in the given directory.
    
    Args:
        directory: Path to scan
        recursive: Whether to traverse subdirectories
    
    Returns:
        List of file paths
    """
    base = Path(directory)
    if not base.exists():
        raise FileNotFoundError(f"Directory not found: {directory}")
    
    if recursive:
        return [p for p in base.rglob("*") if p.is_file()]
    return [p for p in base.iterdir() if p.is_file()]


def get_size(path: str) -> int:
    """Get size of file or directory in bytes."""
    p = Path(path)
    if p.is_file():
        return p.stat().st_size
    return sum(f.stat().st_size for f in p.rglob("*") if f.is_file())


if __name__ == "__main__":
    files = list_files(".", recursive=True)
    total = sum(get_size(str(f)) for f in files)
    print(f"Found {len(files)} files, total {total:,} bytes")
`;

const SAMPLE_JS = `// FileForge Pro — utility helpers
"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Format bytes into human-readable string.
 * @param {number} bytes
 * @param {number} [decimals=2]
 * @returns {string}
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i];
}

/**
 * Walk a directory tree.
 * @param {string} dir
 * @param {(filePath: string) => void} cb
 */
function walk(dir, cb) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, cb);
    else cb(full);
  }
}

module.exports = { formatBytes, walk };
`;

const SAMPLE_JSON = `{
  "name": "fileforge-pro",
  "version": "2.4.1",
  "description": "Professional file manager for Android with desktop power",
  "author": "FileForge Team",
  "license": "MIT",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "zustand": "^5.0.0",
    "framer-motion": "^12.0.0"
  },
  "features": [
    "dual-pane",
    "floating-windows",
    "drag-and-drop",
    "context-menu",
    "syntax-highlighting",
    "storage-analyzer"
  ]
}
`;

const SAMPLE_MD = `# FileForge Pro — Release Notes

## v2.4.1 (2026-08-10)

### ✨ New Features
- **Floating Windows**: Open multiple folders and files in draggable windows
- **Dual Pane**: Browse two locations side-by-side
- **Drag & Drop**: Move files between panes and windows
- **Storage Analyzer**: Visual breakdown of storage usage

### 🐛 Bug Fixes
- Fixed breadcrumb overflow on small screens
- Resolved thumbnail loading for HEIC images
- Improved dark mode contrast for selected items

### ⚡ Performance
- Faster directory listing for folders with 10,000+ files
- Reduced memory usage by 30%

## v2.4.0 (2026-07-22)
- Added Quick Preview panel
- Added Large Files finder
- Added Duplicate Files detector

## v2.3.5 (2026-06-15)
- Initial release
`;

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FileForge Pro — Documentation</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { color: #f97316; }
    code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>FileForge Pro Documentation</h1>
  <p>Welcome to the official documentation for FileForge Pro.</p>
  <h2>Getting Started</h2>
  <p>Install via npm: <code>npm install fileforge-pro</code></p>
</body>
</html>
`;

const SAMPLE_CSS = `:root {
  --bg: #0a0a0a;
  --fg: #fafafa;
  --accent: #f97316;
  --border: rgba(255, 255, 255, 0.1);
}

body {
  background: var(--bg);
  color: var(--fg);
  font-family: "Inter", system-ui, sans-serif;
  margin: 0;
}

.btn {
  background: var(--accent);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn:hover { opacity: 0.9; }
`;

const SAMPLE_SQL = `-- FileForge Pro database schema
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT UNIQUE NOT NULL,
  size INTEGER DEFAULT 0,
  mime_type TEXT,
  modified_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
  is_directory INTEGER DEFAULT 0,
  parent_id INTEGER REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX idx_files_parent ON files(parent_id);
CREATE INDEX idx_files_name ON files(name);
CREATE INDEX idx_files_modified ON files(modified_at);

CREATE TABLE favorites (
  file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  added_at INTEGER NOT NULL
);
`;

const SAMPLE_SH = `#!/bin/bash
# FileForge Pro — backup script
set -euo pipefail

BACKUP_DIR="$HOME/backups"
DATE=$(date +%Y%m%d_%H%M%S)
ARCHIVE="fileforge_backup_\${DATE}.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "Creating backup..."
tar -czf "$BACKUP_DIR/$ARCHIVE" \\
  --exclude='node_modules' \\
  --exclude='.git' \\
  --exclude='*.log' \\
  "$HOME/Documents" "$HOME/Projects"

echo "Backup created: $BACKUP_DIR/$ARCHIVE"
echo "Size: $(du -h "$BACKUP_DIR/$ARCHIVE" | cut -f1)"
`;

const SAMPLE_TXT = `Welcome to FileForge Pro!

FileForge Pro is a professional file manager designed to bring desktop-grade
file management to your Android device. With support for floating windows,
dual pane mode, drag & drop, and a comprehensive set of tools, it's the
perfect companion for power users.

Key Features:
- Multiple floating windows
- Dual pane file browsing
- Drag & drop file operations
- Six different view modes
- Adjustable item sizes
- Built-in text editor with syntax highlighting
- Quick preview for images, videos, and PDFs
- Storage analyzer with visual breakdowns
- Large files and duplicate files finder
- Full dark mode support

For support, visit https://fileforge.pro/support
`;

const SAMPLE_CSV = `name,size,type,modified
project.zip,891289600,archive,2026-08-09
video.mp4,1932735283,video,2026-08-08
report.pdf,2516582,pdf,2026-08-10
photo.jpg,3145728,image,2026-08-07
music.mp3,5242880,audio,2026-08-05
script.py,8192,code,2026-08-10
data.json,16384,code,2026-08-06
readme.md,4096,text,2026-08-04
`;

const SAMPLE_LOG = `[2026-08-10 21:42:06] [INFO] FileForge Pro v2.4.1 starting
[2026-08-10 21:42:06] [INFO] Loading user preferences
[2026-08-10 21:42:07] [INFO] Initializing filesystem indexer
[2026-08-10 21:42:08] [INFO] Indexed 14,287 files in 1.2s
[2026-08-10 21:42:08] [INFO] Storage: 93.4 GB used / 34.6 GB free
[2026-08-10 21:42:09] [WARN] Low storage: only 34.6 GB remaining
[2026-08-10 21:42:10] [INFO] Network scanner started
[2026-08-10 21:42:11] [INFO] Found 2 SMB shares on local network
[2026-08-10 21:42:15] [INFO] Cloud sync: 142 files pending upload
[2026-08-10 21:42:16] [ERROR] Failed to sync photo_2026.jpg: network timeout
[2026-08-10 21:42:18] [INFO] Retry scheduled in 60s
[2026-08-10 21:42:20] [INFO] User opened: /Download/Projects/
`;

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<project name="FileForge Pro">
  <description>Professional file manager for Android</description>
  <version>2.4.1</version>
  
  <build>
    <source-dir>src</source-dir>
    <output-dir>build</output-dir>
    <target>android-34</target>
  </build>
  
  <dependencies>
    <dependency name="react" version="19.0.0" />
    <dependency name="zustand" version="5.0.0" />
    <dependency name="framer-motion" version="12.0.0" />
  </dependencies>
  
  <permissions>
    <permission name="READ_EXTERNAL_STORAGE" />
    <permission name="WRITE_EXTERNAL_STORAGE" />
    <permission name="MANAGE_EXTERNAL_STORAGE" />
  </permissions>
</project>
`;

const SAMPLE_YAML = `app:
  name: FileForge Pro
  version: 2.4.1
  build: 2410
  
ui:
  theme: system
  density: comfortable
  sidebar_width: 280
  default_view: medium-grid
  
features:
  dual_pane: true
  floating_windows: true
  drag_and_drop: true
  storage_analyzer: true
  
network:
  ftp:
    enabled: true
    port: 21
  smb:
    enabled: true
    workgroup: WORKGROUP
  cloud:
    providers:
      - google_drive
      - dropbox
      - onedrive
`;

const SAMPLE_INI = `[General]
app_name=FileForge Pro
version=2.4.1
check_updates=true
telemetry=false

[UI]
theme=system
language=en
sidebar_visible=true
dual_pane_default=false

[Storage]
default_location=/storage/emulated/0
show_hidden_files=false
max_thumbnail_size=512

[Network]
timeout=30
retry_attempts=3
`;

const SAMPLE_TS = `// FileForge Pro — TypeScript types
export type FileKind =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "code"
  | "archive"
  | "apk"
  | "unknown";

export interface FileNode {
  id: string;
  name: string;
  kind: FileKind;
  size: number;
  modified: number;
  parentId: string | null;
  childrenIds?: string[];
  starred?: boolean;
  content?: string;
}

export class FileForge {
  private nodes: Map<string, FileNode> = new Map();
  
  constructor(root: FileNode) {
    this.nodes.set(root.id, root);
  }
  
  getNode(id: string): FileNode | undefined {
    return this.nodes.get(id);
  }
  
  getChildren(id: string): FileNode[] {
    const node = this.getNode(id);
    if (!node?.childrenIds) return [];
    return node.childrenIds
      .map(cid => this.getNode(cid))
      .filter((n): n is FileNode => n !== undefined);
  }
}
`;

// ============ FILESYSTEM TREE ============
let _id = 0;
const nextId = () => `n${++_id}`;

const nodes: Record<string, FileNode> = {};
const ROOT_ID = "root";

function addNode(n: Omit<FileNode, "id"> & { id?: string }): FileNode {
  const id = n.id ?? nextId();
  const node: FileNode = { ...n, id };
  nodes[id] = node;
  return node;
}

/** Register an Android content:// resource as an ephemeral FileForge node.
 * It is intentionally not persisted into the mock tree; the native URI remains
 * the source of truth and the node exists only for the current UI session.
 */
export function registerExternalNode(input: Omit<FileNode, "id"> & { id: string }): FileNode {
  const existing = nodes[input.id];
  if (existing) return existing;
  const node: FileNode = { ...input };
  nodes[node.id] = node;
  return node;
}

function linkChildren(parentId: string, children: (FileNode | string)[]) {
  const ids = children.map(c => typeof c === "string" ? c : c.id);
  nodes[parentId].childrenIds = ids;
  ids.forEach(cid => {
    const n = nodes[cid];
    if (n) n.parentId = parentId;
  });
}

function file(name: string, opts: Partial<FileNode> = {}): FileNode {
  const kind = opts.kind ?? detectKind(name);
  return addNode({
    name,
    kind,
    size: opts.size ?? Math.floor(Math.random() * 5000000) + 1024,
    modified: opts.modified ?? ago(Math.floor(Math.random() * 30)),
    parentId: null,
    ...opts,
    thumbColor: kind === "image" || kind === "video" ? pickColor(name) : undefined,
  });
}

function folder(name: string, opts: Partial<FileNode> = {}): FileNode {
  return addNode({
    name,
    kind: "folder",
    size: 0,
    modified: opts.modified ?? ago(Math.floor(Math.random() * 30)),
    parentId: null,
    childrenIds: [],
    ...opts,
  });
}

// ============ BUILD TREE ============

// Root = Internal Storage
const root = folder("Internal Storage", { id: ROOT_ID, modified: ago(0) });

// Top-level folders
const download = folder("Download", { modified: ago(2) });
const documents = folder("Documents", { modified: ago(5) });
const pictures = folder("Pictures", { modified: ago(1) });
const videos = folder("Videos", { modified: ago(3) });
const music = folder("Music", { modified: ago(7) });
const projects = folder("Projects", { modified: ago(1) });
const backups = folder("Backups", { modified: ago(10) });
const dcim = folder("DCIM", { modified: ago(1) });
const audiobooks = folder("Audiobooks", { modified: ago(20) });
const downloads = folder("Downloads", { modified: ago(2) });
const notifications = folder("Notifications", { modified: ago(30) });
const ringtones = folder("Ringtones", { modified: ago(45) });
const android = folder("Android", { modified: ago(60) });

linkChildren(ROOT_ID, [
  download.id, documents.id, pictures.id, videos.id, music.id,
  projects.id, backups.id, dcim.id, audiobooks.id, downloads.id,
  notifications.id, ringtones.id, android.id,
]);

// ===== Download =====
const dlFiles = [
  file("project.zip", { size: 850 * 1024 * 1024, modified: ago(2), kind: "archive", containedFiles: 142, containedFolders: 18 }),
  file("setup.apk", { size: 78 * 1024 * 1024, modified: ago(3), kind: "apk", package: "com.example.app" }),
  file("ebook.pdf", { size: 4.2 * 1024 * 1024, modified: ago(4), kind: "pdf" }),
  file("movie_4k.mp4", { size: 1.8 * 1024 * 1024 * 1024, modified: ago(5), kind: "video", width: 3840, height: 2160 }),
  file("song.mp3", { size: 8.5 * 1024 * 1024, modified: ago(6), kind: "audio" }),
  file("data.json", { size: 16 * 1024, modified: ago(7), kind: "code", content: SAMPLE_JSON }),
  file("manual.pdf", { size: 2.4 * 1024 * 1024, modified: ago(8), kind: "pdf" }),
  file("archive.tar.gz", { size: 234 * 1024 * 1024, modified: ago(9), kind: "archive", containedFiles: 89, containedFolders: 12 }),
  file("screenshot.png", { size: 1.8 * 1024 * 1024, modified: ago(1), kind: "image", width: 1920, height: 1080 }),
  file("notes.txt", { size: 4096, modified: ago(1), kind: "text", content: SAMPLE_TXT }),
];
linkChildren(download.id, dlFiles.map(f => f.id));

// ===== Documents =====
const docsSub1 = folder("Work", { modified: ago(3) });
const docsSub2 = folder("Personal", { modified: ago(7) });
const docsSub3 = folder("Invoices", { modified: ago(14) });
linkChildren(documents.id, [docsSub1.id, docsSub2.id, docsSub3.id,
  file("resume.pdf", { size: 1.2 * 1024 * 1024, modified: ago(5), kind: "pdf" }),
  file("contract.docx", { size: 540 * 1024, modified: ago(8), kind: "word" }),
  file("budget.xlsx", { size: 320 * 1024, modified: ago(4), kind: "excel" }),
  file("presentation.pptx", { size: 8.4 * 1024 * 1024, modified: ago(6), kind: "presentation" }),
  file("readme.md", { size: 4 * 1024, modified: ago(2), kind: "text", content: SAMPLE_MD }),
]);

const workFiles = [
  file("report_q2.pdf", { size: 2.4 * 1024 * 1024, modified: ago(3), kind: "pdf" }),
  file("meeting_notes.docx", { size: 220 * 1024, modified: ago(2), kind: "word" }),
  file("roadmap.xlsx", { size: 410 * 1024, modified: ago(1), kind: "excel" }),
  file("demo.pptx", { size: 12.4 * 1024 * 1024, modified: ago(4), kind: "presentation" }),
  file("config.yaml", { size: 2 * 1024, modified: ago(1), kind: "code", content: SAMPLE_YAML }),
  file("app.properties", { size: 1 * 1024, modified: ago(2), kind: "text", content: SAMPLE_INI }),
];
linkChildren(docsSub1.id, workFiles.map(f => f.id));

const personalFiles = [
  file("diary.txt", { size: 18 * 1024, modified: ago(1), kind: "text", content: "# Personal Diary\n\nToday was a great day..." }),
  file("recipes.md", { size: 12 * 1024, modified: ago(5), kind: "text", content: "# Favorite Recipes\n\n## Chocolate Cake\n\nIngredients:\n- 2 cups flour\n- 1 cup sugar\n" }),
  file("travel_plans.pdf", { size: 1.8 * 1024 * 1024, modified: ago(10), kind: "pdf" }),
  file("contacts.csv", { size: 8 * 1024, modified: ago(20), kind: "code", content: SAMPLE_CSV }),
];
linkChildren(docsSub2.id, personalFiles.map(f => f.id));

const invoiceFiles = [
  file("invoice_001.pdf", { size: 220 * 1024, modified: ago(30), kind: "pdf" }),
  file("invoice_002.pdf", { size: 240 * 1024, modified: ago(25), kind: "pdf" }),
  file("invoice_003.pdf", { size: 260 * 1024, modified: ago(20), kind: "pdf" }),
  file("receipts.zip", { size: 4.2 * 1024 * 1024, modified: ago(15), kind: "archive", containedFiles: 24, containedFolders: 0 }),
];
linkChildren(docsSub3.id, invoiceFiles.map(f => f.id));

// ===== Pictures =====
const picsSub1 = folder("Camera", { modified: ago(1) });
const picsSub2 = folder("Screenshots", { modified: ago(2) });
const picsSub3 = folder("Wallpapers", { modified: ago(10) });
const picsSub4 = folder("Instagram", { modified: ago(5) });
linkChildren(pictures.id, [picsSub1.id, picsSub2.id, picsSub3.id, picsSub4.id,
  file("vacation_2026.jpg", { size: 3.2 * 1024 * 1024, modified: ago(2), kind: "image", width: 4032, height: 3024 }),
  file("family_portrait.png", { size: 5.4 * 1024 * 1024, modified: ago(5), kind: "image", width: 3000, height: 4000 }),
  file("sunset.heic", { size: 2.8 * 1024 * 1024, modified: ago(7), kind: "image", width: 4032, height: 3024 }),
]);

const cameraFiles = Array.from({ length: 12 }, (_, i) =>
  file(`IMG_${String(20260801 + i).padStart(8, "0")}.jpg`, {
    size: Math.floor(2 + Math.random() * 4) * 1024 * 1024,
    modified: ago(i + 1),
    kind: "image",
    width: 4032,
    height: 3024,
  })
);
linkChildren(picsSub1.id, cameraFiles.map(f => f.id));

const screenshotFiles = Array.from({ length: 8 }, (_, i) =>
  file(`Screenshot_${String(20260803 - i).padStart(8, "0")}-${String(10 + i).padStart(2, "0")}${String(30 + i).padStart(2, "0")}.png`, {
    size: Math.floor(800 + Math.random() * 2000) * 1024,
    modified: ago(i),
    kind: "image",
    width: 1080,
    height: 2400,
  })
);
linkChildren(picsSub2.id, screenshotFiles.map(f => f.id));

const wallpaperFiles = Array.from({ length: 6 }, (_, i) =>
  file(`wallpaper_${i + 1}.jpg`, {
    size: Math.floor(3 + Math.random() * 5) * 1024 * 1024,
    modified: ago(10 + i),
    kind: "image",
    width: 2160,
    height: 3840,
  })
);
linkChildren(picsSub3.id, wallpaperFiles.map(f => f.id));

// ===== Videos =====
const vidSub1 = folder("Movies", { modified: ago(5) });
const vidSub2 = folder("Recordings", { modified: ago(2) });
linkChildren(videos.id, [vidSub1.id, vidSub2.id,
  file("tutorial.mp4", { size: 580 * 1024 * 1024, modified: ago(3), kind: "video", width: 1920, height: 1080 }),
  file("demo.mkv", { size: 1.4 * 1024 * 1024 * 1024, modified: ago(7), kind: "video", width: 1920, height: 1080 }),
]);

const movieFiles = [
  file("documentary_2026.mp4", { size: 2.1 * 1024 * 1024 * 1024, modified: ago(15), kind: "video", width: 3840, height: 2160 }),
  file("concert.mkv", { size: 4.8 * 1024 * 1024 * 1024, modified: ago(20), kind: "video", width: 1920, height: 1080 }),
  file("interview.mov", { size: 850 * 1024 * 1024, modified: ago(10), kind: "video", width: 1920, height: 1080 }),
];
linkChildren(vidSub1.id, movieFiles.map(f => f.id));

const recFiles = Array.from({ length: 4 }, (_, i) =>
  file(`VID_${String(20260805 - i).padStart(8, "0")}.mp4`, {
    size: Math.floor(200 + Math.random() * 800) * 1024 * 1024,
    modified: ago(i),
    kind: "video",
    width: 1920,
    height: 1080,
  })
);
linkChildren(vidSub2.id, recFiles.map(f => f.id));

// ===== Music =====
const musSub1 = folder("Playlists", { modified: ago(15) });
const musSub2 = folder("Albums", { modified: ago(20) });
linkChildren(music.id, [musSub1.id, musSub2.id,
  file("song1.mp3", { size: 5.2 * 1024 * 1024, modified: ago(8), kind: "audio" }),
  file("song2.mp3", { size: 4.8 * 1024 * 1024, modified: ago(8), kind: "audio" }),
  file("podcast.flac", { size: 32 * 1024 * 1024, modified: ago(12), kind: "audio" }),
  file("audiobook.m4a", { size: 180 * 1024 * 1024, modified: ago(20), kind: "audio" }),
]);

// ===== Projects =====
const projSub1 = folder("FileForgePro", { modified: ago(1) });
const projSub2 = folder("MobileApp", { modified: ago(3) });
const projSub3 = folder("Website", { modified: ago(5) });
linkChildren(projects.id, [projSub1.id, projSub2.id, projSub3.id]);

const ffpSrc = folder("src", { modified: ago(1) });
const ffpTests = folder("tests", { modified: ago(2) });
const ffpDocs = folder("docs", { modified: ago(3) });
linkChildren(projSub1.id, [ffpSrc.id, ffpTests.id, ffpDocs.id,
  file("README.md", { size: 12 * 1024, modified: ago(1), kind: "text", content: SAMPLE_MD }),
  file("package.json", { size: 2 * 1024, modified: ago(1), kind: "code", content: SAMPLE_JSON }),
  file("tsconfig.json", { size: 1 * 1024, modified: ago(1), kind: "code", content: '{"compilerOptions":{"target":"ES2022","strict":true}}' }),
  file("vite.config.ts", { size: 1 * 1024, modified: ago(2), kind: "code" }),
  file(".gitignore", { size: 256, modified: ago(5), kind: "text", content: "node_modules\ndist\n.env\n*.log\n" }),
]);

const ffpSrcFiles = [
  file("main.ts", { size: 4 * 1024, modified: ago(1), kind: "code", content: SAMPLE_TS }),
  file("utils.ts", { size: 8 * 1024, modified: ago(1), kind: "code", content: SAMPLE_TS }),
  file("helpers.js", { size: 6 * 1024, modified: ago(2), kind: "code", content: SAMPLE_JS }),
  file("styles.css", { size: 3 * 1024, modified: ago(2), kind: "code", content: SAMPLE_CSS }),
  file("index.html", { size: 2 * 1024, modified: ago(2), kind: "html", content: SAMPLE_HTML }),
];
linkChildren(ffpSrc.id, ffpSrcFiles.map(f => f.id));

const ffpTestFiles = [
  file("main.test.ts", { size: 6 * 1024, modified: ago(2), kind: "code" }),
  file("utils.test.ts", { size: 4 * 1024, modified: ago(2), kind: "code" }),
  file("fixtures.json", { size: 12 * 1024, modified: ago(3), kind: "code", content: SAMPLE_JSON }),
];
linkChildren(ffpTests.id, ffpTestFiles.map(f => f.id));

const ffpDocFiles = [
  file("api.md", { size: 14 * 1024, modified: ago(3), kind: "text", content: "# FileForge Pro API\n\n## Methods\n\n### listFiles(path)\n\nLists files in the given directory." }),
  file("architecture.md", { size: 8 * 1024, modified: ago(4), kind: "text" }),
  file("changelog.md", { size: 4 * 1024, modified: ago(1), kind: "text", content: SAMPLE_MD }),
];
linkChildren(ffpDocs.id, ffpDocFiles.map(f => f.id));

const mobileAppFiles = [
  file("App.tsx", { size: 8 * 1024, modified: ago(3), kind: "code" }),
  file("app.json", { size: 2 * 1024, modified: ago(3), kind: "code", content: SAMPLE_JSON }),
  file("app.config.ts", { size: 1 * 1024, modified: ago(4), kind: "code" }),
  file("build.gradle", { size: 4 * 1024, modified: ago(5), kind: "code" }),
  file("AndroidManifest.xml", { size: 3 * 1024, modified: ago(5), kind: "code", content: SAMPLE_XML }),
];
linkChildren(projSub2.id, mobileAppFiles.map(f => f.id));

const websiteFiles = [
  file("index.html", { size: 8 * 1024, modified: ago(5), kind: "html", content: SAMPLE_HTML }),
  file("styles.css", { size: 6 * 1024, modified: ago(5), kind: "code", content: SAMPLE_CSS }),
  file("script.js", { size: 12 * 1024, modified: ago(5), kind: "code", content: SAMPLE_JS }),
  file("favicon.png", { size: 12 * 1024, modified: ago(10), kind: "image", width: 64, height: 64 }),
];
linkChildren(projSub3.id, websiteFiles.map(f => f.id));

// ===== Backups =====
const backupFiles = [
  file("system_backup_20260801.tar.gz", { size: 4.2 * 1024 * 1024 * 1024, modified: ago(10), kind: "archive", containedFiles: 12400, containedFolders: 380 }),
  file("photos_backup.zip", { size: 8.6 * 1024 * 1024 * 1024, modified: ago(15), kind: "archive", containedFiles: 4200, containedFolders: 12 }),
  file("contacts.vcf", { size: 84 * 1024, modified: ago(20), kind: "text" }),
  file("messages.xml", { size: 12 * 1024 * 1024, modified: ago(20), kind: "code", content: SAMPLE_XML }),
];
linkChildren(backups.id, backupFiles.map(f => f.id));

// ===== DCIM =====
const dcimSub1 = folder("Camera", { modified: ago(1) });
const dcimSub2 = folder("Twitter", { modified: ago(8) });
const dcimSub3 = folder("Facebook", { modified: ago(12) });
linkChildren(dcim.id, [dcimSub1.id, dcimSub2.id, dcimSub3.id]);

const dcimCameraFiles = Array.from({ length: 10 }, (_, i) =>
  file(`IMG_${String(20260810 - i).padStart(8, "0")}_${String(14 + i).padStart(2, "0")}${String(30 + i % 30).padStart(2, "0")}.jpg`, {
    size: Math.floor(2 + Math.random() * 4) * 1024 * 1024,
    modified: ago(i),
    kind: "image",
    width: 4032,
    height: 3024,
  })
);
linkChildren(dcimSub1.id, dcimCameraFiles.map(f => f.id));

// ===== Audiobooks =====
const abFiles = [
  file("chapter1.mp3", { size: 42 * 1024 * 1024, modified: ago(20), kind: "audio" }),
  file("chapter2.mp3", { size: 38 * 1024 * 1024, modified: ago(20), kind: "audio" }),
  file("chapter3.mp3", { size: 45 * 1024 * 1024, modified: ago(20), kind: "audio" }),
];
linkChildren(audiobooks.id, abFiles.map(f => f.id));

// ===== Downloads (second one) =====
const dl2Files = [
  file("installer.apk", { size: 45 * 1024 * 1024, modified: ago(2), kind: "apk", package: "com.app.installer" }),
  file("data.csv", { size: 8 * 1024, modified: ago(2), kind: "code", content: SAMPLE_CSV }),
  file("app.log", { size: 24 * 1024, modified: ago(1), kind: "text", content: SAMPLE_LOG }),
  file("setup.sh", { size: 2 * 1024, modified: ago(3), kind: "code", content: SAMPLE_SH }),
];
linkChildren(downloads.id, dl2Files.map(f => f.id));

// ===== Android =====
const andData = folder("data", { modified: ago(60) });
const andObb = folder("obb", { modified: ago(60) });
const andMedia = folder("media", { modified: ago(60) });
linkChildren(android.id, [andData.id, andObb.id, andMedia.id]);

// Mark some as starred
nodes[dlFiles[0].id].starred = true;
nodes[dlFiles[2].id].starred = true;
nodes[pictures.id].starred = true;
nodes[projects.id].starred = true;
nodes[dl2Files[0].id].starred = true;

// ============ NETWORK & CLOUD LOCATIONS (Virtual roots) ============
const sdCard = folder("SD Card", { id: "sd-card", modified: ago(0) });
const usbStorage = folder("USB Storage", { id: "usb-storage", modified: ago(0) });
const ftp = folder("FTP Server", { id: "ftp-server", modified: ago(0) });
const smb = folder("SMB Share", { id: "smb-share", modified: ago(0) });
const cloud = folder("Cloud Storage", { id: "cloud-storage", modified: ago(0) });

// SD Card contents
const sdBackup = folder("Backup", { modified: ago(5) });
const sdMovies = folder("Movies", { modified: ago(8) });
const sdPhotos = folder("Photos", { modified: ago(3) });
linkChildren("sd-card", [sdBackup.id, sdMovies.id, sdPhotos.id]);

const sdBackupFiles = [
  file("photos_2025.zip", { size: 12.4 * 1024 * 1024 * 1024, modified: ago(30), kind: "archive", containedFiles: 8400, containedFolders: 24 }),
  file("system.img", { size: 8 * 1024 * 1024 * 1024, modified: ago(45), kind: "unknown" }),
];
linkChildren(sdBackup.id, sdBackupFiles.map(f => f.id));

const sdMovieFiles = [
  file("movie1.mp4", { size: 1.8 * 1024 * 1024 * 1024, modified: ago(15), kind: "video", width: 1920, height: 1080 }),
  file("movie2.mkv", { size: 2.4 * 1024 * 1024 * 1024, modified: ago(20), kind: "video", width: 1920, height: 1080 }),
  file("movie3.mp4", { size: 1.6 * 1024 * 1024 * 1024, modified: ago(25), kind: "video", width: 1280, height: 720 }),
];
linkChildren(sdMovies.id, sdMovieFiles.map(f => f.id));

const sdPhotoFiles = Array.from({ length: 6 }, (_, i) =>
  file(`photo_${String(i + 1).padStart(3, "0")}.jpg`, {
    size: Math.floor(2 + Math.random() * 4) * 1024 * 1024,
    modified: ago(i + 1),
    kind: "image",
    width: 4032,
    height: 3024,
  })
);
linkChildren(sdPhotos.id, sdPhotoFiles.map(f => f.id));

// USB Storage contents
const usbBackup = folder("Backup", { modified: ago(2) });
const usbDocs = folder("Documents", { modified: ago(5) });
linkChildren("usb-storage", [usbBackup.id, usbDocs.id]);

const usbBackupFiles = [
  file("windows_backup.zip", { size: 32 * 1024 * 1024 * 1024, modified: ago(2), kind: "archive", containedFiles: 89000, containedFolders: 4200 }),
  file("mac_backup.dmg", { size: 64 * 1024 * 1024 * 1024, modified: ago(5), kind: "unknown" }),
];
linkChildren(usbBackup.id, usbBackupFiles.map(f => f.id));

const usbDocsFiles = [
  file("thesis.pdf", { size: 12.4 * 1024 * 1024, modified: ago(10), kind: "pdf" }),
  file("research.pdf", { size: 8.2 * 1024 * 1024, modified: ago(12), kind: "pdf" }),
  file("notes.docx", { size: 1.2 * 1024 * 1024, modified: ago(8), kind: "word" }),
];
linkChildren(usbDocs.id, usbDocsFiles.map(f => f.id));

// FTP contents (sparse)
const ftpPub = folder("public", { modified: ago(20) });
linkChildren("ftp-server", [ftpPub.id,
  file("readme.txt", { size: 1024, modified: ago(20), kind: "text", content: "Welcome to FTP server" }),
]);

const ftpPubFiles = [
  file("releases.zip", { size: 145 * 1024 * 1024, modified: ago(25), kind: "archive", containedFiles: 24, containedFolders: 4 }),
  file("changelog.txt", { size: 8 * 1024, modified: ago(25), kind: "text", content: SAMPLE_LOG }),
];
linkChildren(ftpPub.id, ftpPubFiles.map(f => f.id));

// SMB contents (sparse)
linkChildren("smb-share", [
  file("shared_doc.pdf", { size: 4.2 * 1024 * 1024, modified: ago(7), kind: "pdf" }),
  file("shared_video.mp4", { size: 850 * 1024 * 1024, modified: ago(14), kind: "video", width: 1920, height: 1080 }),
]);

// Cloud contents (sparse)
const cloudDrive = folder("Google Drive", { id: "gdrive", modified: ago(1) });
const cloudDropbox = folder("Dropbox", { id: "dropbox", modified: ago(2) });
const cloudOneDrive = folder("OneDrive", { id: "onedrive", modified: ago(3) });
linkChildren("cloud-storage", [cloudDrive.id, cloudDropbox.id, cloudOneDrive.id]);

const gdriveFiles = [
  file("proposal.docx", { size: 1.8 * 1024 * 1024, modified: ago(1), kind: "word" }),
  file("spreadsheet.xlsx", { size: 540 * 1024, modified: ago(2), kind: "excel" }),
  file("presentation.pptx", { size: 6.4 * 1024 * 1024, modified: ago(3), kind: "presentation" }),
];
linkChildren("gdrive", gdriveFiles.map(f => f.id));

const dropboxFiles = [
  file("contract.pdf", { size: 2.1 * 1024 * 1024, modified: ago(2), kind: "pdf" }),
  file("designs.zip", { size: 84 * 1024 * 1024, modified: ago(5), kind: "archive", containedFiles: 42, containedFolders: 8 }),
];
linkChildren("dropbox", dropboxFiles.map(f => f.id));

const onedriveFiles = [
  file("vacation_photos.zip", { size: 1.2 * 1024 * 1024 * 1024, modified: ago(3), kind: "archive", containedFiles: 240, containedFolders: 6 }),
  file("notes.txt", { size: 4 * 1024, modified: ago(5), kind: "text", content: SAMPLE_TXT }),
];
linkChildren("onedrive", onedriveFiles.map(f => f.id));

// ============ EXPORT ============
export const filesystem: Record<string, FileNode> = nodes;

export const ROOT_IDS = {
  internal: ROOT_ID,
  sdCard: "sd-card",
  usb: "usb-storage",
  ftp: "ftp-server",
  smb: "smb-share",
  cloud: "cloud-storage",
};

export const QUICK_ACCESS: { id: string; name: string; rootId: string; icon: string }[] = [
  { id: "internal", name: "Internal Storage", rootId: ROOT_ID, icon: "smartphone" },
  { id: "sd", name: "SD Card", rootId: "sd-card", icon: "sd-card" },
  { id: "usb", name: "USB Storage", rootId: "usb-storage", icon: "usb" },
  { id: "downloads", name: "Downloads", rootId: download.id, icon: "download" },
  { id: "pictures", name: "Pictures", rootId: pictures.id, icon: "image" },
  { id: "videos", name: "Videos", rootId: videos.id, icon: "video" },
  { id: "music", name: "Music", rootId: music.id, icon: "music" },
  { id: "documents", name: "Documents", rootId: documents.id, icon: "file-text" },
];

export const NETWORK_LOCATIONS = [
  { id: "ftp", name: "FTP", rootId: "ftp-server", icon: "globe" },
  { id: "smb", name: "SMB", rootId: "smb-share", icon: "share-2" },
];

export const CLOUD_LOCATIONS = [
  { id: "gdrive", name: "Google Drive", rootId: "gdrive", icon: "cloud" },
  { id: "dropbox", name: "Dropbox", rootId: "dropbox", icon: "cloud" },
  { id: "onedrive", name: "OneDrive", rootId: "onedrive", icon: "cloud" },
];

// ============ HELPERS ============
export function getNode(id: string): FileNode | undefined {
  return filesystem[id];
}

// Expose filesystem globally for debugging
if (typeof window !== "undefined") {
  (window as any).__fileforgeFS = { filesystem, getNode, getChildren };
}

// ============ HYBRID MODE: Real File Access ============
// Note: this used to also export listDirectoryHybrid/createFolderHybrid/
// deleteHybrid/renameHybrid/copyHybrid/moveHybrid/readTextHybrid/
// writeTextHybrid/requestStoragePermissionHybrid — all dead code, never
// called from anywhere in the UI (verified by search). The store's actual
// create/delete/rename/move/copy/save operations never routed through them
// on Android, which meant those operations only ever touched the in-memory
// mock filesystem, never real disk. The real, wired-in fix now lives in
// `storage-provider.ts` (`getStorageProvider()`), used by both FileBrowser.tsx
// (listing) and fileforge-store.ts (mutations). Only getStorageInfoHybrid is
// kept here since StorageAnalyzer.tsx actually calls it.
import { nativeFileSystem } from "./native-bridge";

export async function getStorageInfoHybrid(): Promise<{ total: number; free: number; used: number } | null> {
  return nativeFileSystem.getStorageInfo();
}

export function getChildren(id: string): FileNode[] {
  const node = getNode(id);
  if (!node?.childrenIds) return [];
  return node.childrenIds
    .map(cid => getNode(cid))
    .filter((n): n is FileNode => n !== undefined);
}

export function getPathSegments(nodeId: string): { name: string; path: string }[] {
  const segs: { name: string; path: string }[] = [];
  let cur: string | null = nodeId;
  while (cur) {
    const n = getNode(cur);
    if (!n) break;
    segs.unshift({ name: n.name, path: cur });
    cur = n.parentId;
  }
  return segs;
}

export function getDescendants(id: string): FileNode[] {
  const result: FileNode[] = [];
  const walk = (nid: string) => {
    const n = getNode(nid);
    if (!n) return;
    result.push(n);
    if (n.childrenIds) n.childrenIds.forEach(walk);
  };
  walk(id);
  return result;
}

export function getFolderSize(id: string): number {
  const node = getNode(id);
  if (!node) return 0;
  if (node.kind !== "folder") return node.size;
  return getChildren(id).reduce((sum, child) => sum + getFolderSize(child.id), 0);
}

export function countItems(id: string): { files: number; folders: number } {
  let files = 0, folders = 0;
  const walk = (nid: string) => {
    getChildren(nid).forEach(c => {
      if (c.kind === "folder") { folders++; walk(c.id); }
      else files++;
    });
  };
  walk(id);
  return { files, folders };
}

export function getAllFiles(): FileNode[] {
  return Object.values(filesystem).filter(n => n.kind !== "folder");
}

export function getAllFolders(): FileNode[] {
  return Object.values(filesystem).filter(n => n.kind === "folder");
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i];
}

export function formatDate(ts: number, locale?: string): string {
  const lang = locale ?? (typeof document !== "undefined" ? document.documentElement.lang : "en");
  const isArabic = lang.toLowerCase().startsWith("ar");
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 3600000) {
    const n = Math.floor(diff / 60000);
    return isArabic ? `${n} دقيقة` : `${n} min ago`;
  }
  if (diff < 86400000) {
    const n = Math.floor(diff / 3600000);
    return isArabic ? `${n} ساعة` : `${n} hours ago`;
  }
  if (diff < 2 * 86400000) return isArabic ? "أمس" : "Yesterday";
  if (diff < 7 * 86400000) {
    const n = Math.floor(diff / 86400000);
    return isArabic ? `قبل ${n} أيام` : `${n} days ago`;
  }
  const d = new Date(ts);
  return d.toLocaleDateString(isArabic ? "ar-YE" : "en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateShort(ts: number, locale?: string): string {
  const lang = locale ?? (typeof document !== "undefined" ? document.documentElement.lang : "en");
  const isArabic = lang.toLowerCase().startsWith("ar");
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 86400000) return isArabic ? "اليوم" : "Today";
  if (diff < 2 * 86400000) return isArabic ? "أمس" : "Yesterday";
  const d = new Date(ts);
  return d.toLocaleDateString(isArabic ? "ar-YE" : "en-US", { day: "2-digit", month: "short", year: "numeric" });
}
