// FileForge Pro — Core Types

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
  | "word"
  | "excel"
  | "presentation"
  | "html"
  | "font"
  | "unknown";

export interface FileNode {
  id: string;
  name: string;
  kind: FileKind;
  size: number; // bytes
  modified: number; // epoch ms
  parentId: string | null;
  childrenIds?: string[];
  starred?: boolean;
  // Optional content for text/code files
  content?: string;
  // Optional thumbnail color (used as gradient seed for image/video thumbnails)
  thumbColor?: string;
  // Dimensions for image/video
  width?: number;
  height?: number;
  // For APK
  package?: string;
  // For archives: list of contained file/folder counts
  containedFiles?: number;
  containedFolders?: number;
}

export type ViewMode =
  | "xlarge-grid"
  | "large-grid"
  | "medium-grid"
  | "small-grid"
  | "list"
  | "compact-list"
  | "content"
  | "details";

export type ItemSize = "xs" | "sm" | "md" | "lg" | "xl";

export type SortKey = "name" | "modified" | "size" | "type" | "extension" | "created";
export type SortDir = "asc" | "desc";

export type GroupBy = "none" | "name" | "type" | "date" | "size";
export type Density = "comfortable" | "standard" | "compact";

export interface ColumnConfig {
  name: boolean;
  type: boolean;
  size: boolean;
  modified: boolean;
  created: boolean;
  extension: boolean;
  dimensions: boolean;
  duration: boolean;
  itemCount: boolean;
  path: boolean;
}

/** Central view state model — single source of truth for all view settings. */
export interface FileViewState {
  viewMode: ViewMode;
  itemSize: ItemSize;
  showThumbnails: boolean;
  showExtensions: boolean;
  showHiddenFiles: boolean;
  showFolderItemCount: boolean;
  sortBy: SortKey;
  sortDir: SortDir;
  foldersFirst: boolean;
  groupBy: GroupBy;
  density: Density;
  visibleColumns: ColumnConfig;
}

export interface HistoryEntry {
  path: string;
  windowId?: string;
}

export type FloatingWindowType =
  | "folder"
  | "text-editor"
  | "image-preview"
  | "video-preview"
  | "audio-preview"
  | "pdf-preview"
  | "archive-preview"
  | "web-preview"
  | "hex-preview"
  | "properties"
  | "search"
  | "storage-analyzer"
  | "apps"
  | "settings";

export interface FloatingWindow {
  id: string;
  type: FloatingWindowType;
  title: string;
  // For folder windows
  path?: string;
  // For file viewers
  nodeId?: string;
  // Geometry
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  minimized: boolean;
  maximized: boolean;
  // Previous geometry when maximized
  prevGeom?: { x: number; y: number; width: number; height: number };
}

export type ThemeMode = "light" | "dark" | "system";

export interface PathSegment {
  name: string;
  path: string;
}
