// FileForge Pro — Professional Windows-style File & Folder icons
// Light, bright colors like Windows Explorer with type badges

"use client";

import {
  Folder, FileText, FileImage, FileVideo, FileAudio,
  FileArchive, FileCode, FileSpreadsheet, File, FileType2,
  Smartphone, Music, Film, Image as ImageIcon, Download, FileBox,
  Code, Database,
} from "lucide-react";
import type { FileKind } from "@/lib/fileforge/types";
import { cn } from "@/lib/utils";
import { useId } from "react";

// ============ SMALL ICONS ============
export function getFileIcon(kind: FileKind, className?: string) {
  const cls = cn("h-5 w-5", className);
  switch (kind) {
    case "folder":
      return <FolderIconSmall className={cls} />;
    case "image":
      return <ImageIcon className={cn(cls, "text-emerald-500")} />;
    case "video":
      return <Film className={cn(cls, "text-rose-500")} />;
    case "audio":
      return <Music className={cn(cls, "text-purple-500")} />;
    case "pdf":
      return <FileType2 className={cn(cls, "text-red-500")} />;
    case "text":
      return <FileText className={cn(cls, "text-sky-500")} />;
    case "code":
      return <FileCode className={cn(cls, "text-orange-500")} />;
    case "html":
      return <FileCode className={cn(cls, "text-orange-600")} />;
    case "archive":
      return <FileArchive className={cn(cls, "text-yellow-600")} />;
    case "apk":
      return <Smartphone className={cn(cls, "text-green-600")} />;
    case "word":
      return <FileText className={cn(cls, "text-blue-600")} />;
    case "excel":
      return <FileSpreadsheet className={cn(cls, "text-green-600")} />;
    case "presentation":
      return <FileText className={cn(cls, "text-orange-600")} />;
    case "font":
      return <FileType2 className={cn(cls, "text-pink-500")} />;
    default:
      return <File className={cn(cls, "text-muted-foreground")} />;
  }
}

function FolderIconSmall({ className }: { className?: string }) {
  return (
    <Folder className={cn(className, "text-yellow-400")} fill="#FFD93D" strokeWidth={1.2} />
  );
}

// ============ FOLDER TYPE DETECTION ============
type FolderType = "pictures" | "videos" | "music" | "documents" | "downloads" | "dcim" | "movies" | "audiobooks" | "projects" | "backups" | "android" | "generic";

function detectFolderType(name: string): FolderType {
  const lower = name.toLowerCase();
  if (lower === "pictures" || lower === "photos" || lower === "images" || lower === "camera") return "pictures";
  if (lower === "videos" || lower === "movies") return "videos";
  if (lower === "music" || lower === "audio" || lower === "songs") return "music";
  if (lower === "documents" || lower === "docs") return "documents";
  if (lower === "download" || lower === "downloads") return "downloads";
  if (lower === "dcim") return "dcim";
  if (lower === "audiobooks") return "audiobooks";
  if (lower === "projects") return "projects";
  if (lower === "backups" || lower === "backup") return "backups";
  if (lower === "android") return "android";
  return "generic";
}

// ============ FOLDER TYPE BADGE ============
function FolderTypeBadge({ type, className }: { type: FolderType; className?: string }) {
  const icons: Record<FolderType, { Icon: typeof ImageIcon; color: string; bg: string }> = {
    pictures: { Icon: ImageIcon, color: "text-emerald-700", bg: "bg-emerald-200" },
    videos: { Icon: Film, color: "text-rose-700", bg: "bg-rose-200" },
    music: { Icon: Music, color: "text-purple-700", bg: "bg-purple-200" },
    documents: { Icon: FileText, color: "text-blue-700", bg: "bg-blue-200" },
    downloads: { Icon: Download, color: "text-sky-700", bg: "bg-sky-200" },
    dcim: { Icon: ImageIcon, color: "text-emerald-700", bg: "bg-emerald-200" },
    movies: { Icon: Film, color: "text-rose-700", bg: "bg-rose-200" },
    audiobooks: { Icon: FileBox, color: "text-amber-700", bg: "bg-amber-200" },
    projects: { Icon: Code, color: "text-orange-700", bg: "bg-orange-200" },
    backups: { Icon: Database, color: "text-slate-700", bg: "bg-slate-200" },
    android: { Icon: Smartphone, color: "text-green-700", bg: "bg-green-200" },
    generic: { Icon: Folder, color: "text-amber-700", bg: "bg-amber-200" },
  };
  const { Icon, color, bg } = icons[type];
  return (
    <div className={cn("rounded-full p-1 flex items-center justify-center shadow-sm border border-white", bg, className)}>
      <Icon className={cn("h-3.5 w-3.5", color)} strokeWidth={2.5} />
    </div>
  );
}

// ============ LARGE FOLDER ICON ============
// FileForge signature folder: layered, softly dimensional, deliberately restrained.
// The silhouette stays readable at every density; the small type badge is an accent,
// never the primary icon.
function FolderIconLarge({ className, folderName }: { className?: string; folderName?: string }) {
  const folderType = folderName ? detectFolderType(folderName) : "generic";
  const rawId = useId().replace(/[:]/g, "");
  const backId = `ff-folder-back-${rawId}`;
  const frontId = `ff-folder-front-${rawId}`;
  const shineId = `ff-folder-shine-${rawId}`;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg
        viewBox="0 0 96 80"
        className="relative h-full w-full overflow-visible"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={backId} x1="12" y1="6" x2="82" y2="72" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFF8D6" />
            <stop offset="0.52" stopColor="#FFE58A" />
            <stop offset="1" stopColor="#EAB63F" />
          </linearGradient>
          <linearGradient id={frontId} x1="14" y1="22" x2="82" y2="70" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#FFE66A" />
            <stop offset="0.48" stopColor="#FFC83D" />
            <stop offset="1" stopColor="#E6A51D" />
          </linearGradient>
          <linearGradient id={shineId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          <filter id={`${backId}-shadow`} x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="0" dy="2.2" stdDeviation="2.2" floodColor="#8B6517" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Subtle ground shadow keeps the icon visually anchored without a heavy outline. */}
        <path d="M14 70 C28 76 67 76 83 69" fill="none" stroke="#9A741E" strokeOpacity="0.12" strokeWidth="4" strokeLinecap="round" />

        <g filter={`url(#${backId}-shadow)`}>
          {/* Rear shell / tab */}
          <path
            d="M10 22V15.5C10 11.9 12.9 9 16.5 9H39L47 16H79.5C83.1 16 86 18.9 86 22.5V28H10V22Z"
            fill={`url(#${backId})`}
          />

          {/* Front shell */}
          <path
            d="M10 24.5C10 21.7 12.2 19.5 15 19.5H81C84.3 19.5 87 22.2 87 25.5V61.5C87 65.9 83.4 69.5 79 69.5H18C13.6 69.5 10 65.9 10 61.5V24.5Z"
            fill={`url(#${frontId})`}
          />

          {/* Refined top plane */}
          <path
            d="M12 24.5C12 22.3 13.8 20.5 16 20.5H80C82.8 20.5 85 22.7 85 25.5V30H12V24.5Z"
            fill={`url(#${shineId})`}
          />

          {/* Soft lower bevel */}
          <path
            d="M12 61.5V59.5C28 64 66 64.5 85 59V61.5C85 65.4 81.9 68 78 68H19C15.1 68 12 65.4 12 61.5Z"
            fill="#A8730D"
            opacity="0.13"
          />
        </g>
      </svg>

      {/* Semantic folder badge — deliberately smaller than the folder itself. */}
      {folderType !== "generic" && (
        <div className="absolute bottom-0 right-0 z-10 translate-x-[7%] translate-y-[7%]">
          <FolderTypeBadge type={folderType} className="h-[34%] min-h-5 w-[34%] min-w-5 border-white/90 bg-background/90 shadow-md backdrop-blur-sm" />
        </div>
      )}
    </div>
  );
}

// ============ LARGE FILE ICON ============
export function getFileIconLarge(kind: FileKind, className?: string, fileName?: string) {
  const cls = cn("h-12 w-12", className);
  if (kind === "folder") {
    return <FolderIconLarge className={cls} folderName={fileName} />;
  }
  return <FileIconLarge className={cls} gradient={getFileGradient(kind)} Icon={getFileIconForKind(kind)} badge={getFileBadge(kind)} badgeColor={getFileBadgeColor(kind)} />;
}

function getFileIconForKind(kind: FileKind): typeof FileText {
  switch (kind) {
    case "image": return ImageIcon;
    case "video": return Film;
    case "audio": return Music;
    case "pdf": return FileType2;
    case "text": return FileText;
    case "code": return FileCode;
    case "html": return FileCode;
    case "archive": return FileArchive;
    case "apk": return Smartphone;
    case "word": return FileText;
    case "excel": return FileSpreadsheet;
    case "presentation": return FileText;
    case "font": return FileType2;
    default: return File;
  }
}

function getFileGradient(kind: FileKind): string {
  switch (kind) {
    case "image": return "from-emerald-300 to-teal-500";
    case "video": return "from-rose-300 to-red-500";
    case "audio": return "from-purple-300 to-violet-500";
    case "pdf": return "from-red-300 to-rose-500";
    case "text": return "from-sky-300 to-blue-500";
    case "code": return "from-orange-300 to-amber-500";
    case "html": return "from-orange-400 to-red-500";
    case "archive": return "from-yellow-300 to-amber-500";
    case "apk": return "from-green-300 to-emerald-500";
    case "word": return "from-blue-300 to-indigo-500";
    case "excel": return "from-green-300 to-teal-500";
    case "presentation": return "from-orange-300 to-red-500";
    case "font": return "from-pink-300 to-rose-500";
    default: return "from-slate-300 to-slate-500";
  }
}

function getFileBadge(kind: FileKind): string {
  switch (kind) {
    case "image": return "IMG";
    case "video": return "MP4";
    case "audio": return "MP3";
    case "pdf": return "PDF";
    case "text": return "TXT";
    case "code": return "</>";
    case "html": return "HTML";
    case "archive": return "ZIP";
    case "apk": return "APK";
    case "word": return "DOC";
    case "excel": return "XLS";
    case "presentation": return "PPT";
    case "font": return "TTF";
    default: return "?";
  }
}

function getFileBadgeColor(kind: FileKind): string {
  switch (kind) {
    case "image": return "bg-emerald-500";
    case "video": return "bg-rose-500";
    case "audio": return "bg-purple-500";
    case "pdf": return "bg-red-500";
    case "text": return "bg-sky-500";
    case "code": return "bg-orange-500";
    case "html": return "bg-orange-600";
    case "archive": return "bg-yellow-600";
    case "apk": return "bg-green-600";
    case "word": return "bg-blue-600";
    case "excel": return "bg-green-600";
    case "presentation": return "bg-orange-600";
    case "font": return "bg-pink-500";
    default: return "bg-slate-500";
  }
}

// ============ FILE ICON LARGE ============
function FileIconLarge({
  className, gradient, Icon, badge, badgeColor,
}: {
  className?: string;
  gradient: string;
  Icon: typeof FileText;
  badge: string;
  badgeColor: string;
}) {
  const rawId = useId();
  const id = rawId.replace(/[:]/g, "");
  const gradId = `fileGrad-${id}`;
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <div className={cn("absolute inset-0 bg-gradient-to-br rounded-md shadow-sm", gradient)} />
      <svg viewBox="0 0 48 56" className="relative w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.95" />
            <stop offset="100%" stopColor="white" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        <path d="M8 2 Q8 0 10 0 L30 0 L42 12 L42 50 Q42 54 38 54 L10 54 Q8 54 8 50 Z" fill={`url(#${gradId})`} />
        <path d="M30 0 L42 12 L34 12 Q30 12 30 8 Z" fill="#ffffff" opacity="0.6" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center pt-2">
        <Icon className="h-1/3 w-1/3 text-white drop-shadow" strokeWidth={1.8} />
      </div>
      <div className={cn("absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[9px] font-bold text-white shadow-md", badgeColor)}>
        {badge}
      </div>
    </div>
  );
}

// ============ HELPERS ============
export function getFileExt(node: { name?: string } | string): string {
  const name = typeof node === "string" ? node : (node?.name ?? "");
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "";
  return name.slice(idx + 1).toUpperCase();
}

export function getFileTypeLabel(kind: FileKind, name: string): string {
  const ext = getFileExt(name);
  switch (kind) {
    case "folder": return "Folder";
    case "image": return ext ? `${ext} Image` : "Image";
    case "video": return ext ? `${ext} Video` : "Video";
    case "audio": return ext ? `${ext} Audio` : "Audio";
    case "pdf": return "PDF Document";
    case "text": return ext ? `${ext} File` : "Text File";
    case "code": return ext ? `${ext} Source` : "Source Code";
    case "html": return "HTML Document";
    case "archive": return ext ? `${ext} Archive` : "Archive";
    case "apk": return "Android App";
    case "word": return "Word Document";
    case "excel": return "Spreadsheet";
    case "presentation": return "Presentation";
    case "font": return "Font File";
    default: return "File";
  }
}

export function getThumbGradient(color?: string): string {
  if (!color) return "from-slate-400 to-slate-600";
  const map: Record<string, string> = {
    "#f97316": "from-orange-400 to-orange-600",
    "#ef4444": "from-red-400 to-red-600",
    "#eab308": "from-yellow-400 to-yellow-600",
    "#22c55e": "from-green-400 to-green-600",
    "#06b6d4": "from-cyan-400 to-cyan-600",
    "#8b5cf6": "from-violet-400 to-violet-600",
    "#ec4899": "from-pink-400 to-pink-600",
    "#14b8a6": "from-teal-400 to-teal-600",
  };
  return map[color] ?? "from-slate-400 to-slate-600";
}
