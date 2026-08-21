// FileForge Pro — Main file browser area with all view modes
"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import {
  Star, Check, MoreVertical, ChevronRight, AlertCircle, Lock, FolderX, Archive,
} from "lucide-react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import {
  getNode, formatBytes, formatDate, formatDateShort,
} from "@/lib/fileforge/filesystem";
import { nativeFileSystem, isNative, getApkInfo, installApk, installXapk } from "@/lib/fileforge/native-bridge";
import { getStorageProvider } from "@/lib/fileforge/storage-provider";
import type { FileNode, ViewMode, ItemSize, SortKey, SortDir } from "@/lib/fileforge/types";
import {
  getFileIcon, getFileIconLarge, getFileExt, getFileTypeLabel, getThumbGradient,
} from "./FileIcons";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import { SelectionToolbar } from "./SelectionToolbar";
import { QuickPreview, useQuickPreview } from "./QuickPreview";
import { OpenAsDialog } from "./OpenAsDialog";
import { ThumbnailImage } from "./ThumbnailImage";
import { useVirtualList, useGridColumns } from "@/lib/fileforge/virtual-scroller";
import { Button } from "@/components/ui/button";
import { useFolderCount } from "@/lib/fileforge/use-folder-count";

interface FileBrowserProps {
  path: string;
  paneId?: "main" | "dual";
  embeddedInWindow?: boolean;
  windowId?: string;  // when embedded in a folder window, navigate within it
}

export function FileBrowser({ path, paneId = "main", embeddedInWindow = false, windowId }: FileBrowserProps) {
  const store = useFileForge();
  const { t, lang } = useI18n();
  const [lastSelected, setLastSelected] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ctxMenu = useContextMenu();
  const quickPreview = useQuickPreview();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressNode = useRef<FileNode | null>(null);
  const [openAsNode, setOpenAsNode] = useState<FileNode | null>(null);
  const [installApkNode, setInstallApkNode] = useState<FileNode | null>(null);
  const [installXapkNode, setInstallXapkNode] = useState<FileNode | null>(null);

  // Real file system state
  const [realFiles, setRealFiles] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);

  // Narrow selectors — only re-render when these specific fields change.
  // This prevents the 60fps re-render storm during window drag/resize.
  const viewMode = useFileForge(s => s.viewMode);
  const itemSize = useFileForge(s => s.itemSize);
  const showThumbnails = useFileForge(s => s.showThumbnails);
  const showExtensions = useFileForge(s => s.showExtensions);
  const showHidden = useFileForge(s => s.showHidden);
  const showFolderItemCount = useFileForge(s => s.showFolderItemCount);
  const foldersFirst = useFileForge(s => s.foldersFirst);
  const groupBy = useFileForge(s => s.groupBy);
  const density = useFileForge(s => s.density);
  const visibleColumns = useFileForge(s => s.visibleColumns);
  const sortKey = useFileForge(s => s.sortKey);
  const sortDir = useFileForge(s => s.sortDir);
  const _fsVersion = useFileForge(s => s._fsVersion);

  // Load files from real filesystem (native) or fallback to mock (web preview only)
  useEffect(() => {
    let cancelled = false;
    async function loadFiles() {
      setLoading(true);
      setError(null);
      setNeedsPermission(false);

      try {
        // Check if native bridge is available (real APK)
        if (isNative()) {
          const available = await nativeFileSystem.isAvailable();
          if (!available) {
            setNeedsPermission(true);
            setError("FileForge Pro needs storage permission to access files");
            setLoading(false);
            return;
          }
        }
        const files = await getStorageProvider().listDirectory(path, showHidden);
        if (!cancelled) {
          setRealFiles(files);
          setNeedsPermission(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "Failed to load directory");
          setNeedsPermission(e?.message?.includes("permission") || e?.message?.includes("denied"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFiles();
    return () => { cancelled = true; };
  }, [path, _fsVersion]);

  // Sort files with foldersFirst + groupBy support + hidden file filtering
  const groupedItems = useMemo(() => {
    // Filter hidden files if showHidden is off
    const items = showHidden
      ? [...realFiles]
      : realFiles.filter(n => !n.name.startsWith("."));
    // Sort
    items.sort((a, b) => {
      // Folders first (if enabled)
      if (foldersFirst) {
        if (a.kind === "folder" && b.kind !== "folder") return -1;
        if (a.kind !== "folder" && b.kind === "folder") return 1;
      }
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "size": cmp = a.size - b.size; break;
        case "modified": cmp = a.modified - b.modified; break;
        case "created": cmp = a.modified - b.modified; break; // fallback to modified
        case "type": cmp = a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name); break;
        case "extension": {
          const extA = a.name.split(".").pop() ?? "";
          const extB = b.name.split(".").pop() ?? "";
          cmp = extA.localeCompare(extB) || a.name.localeCompare(b.name);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    // Group by
    if (groupBy === "none") {
      return [{ group: "", items }];
    }
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      let key = "";
      switch (groupBy) {
        case "name": key = item.name[0]?.toUpperCase() ?? "#"; break;
        case "type": key = item.kind; break;
        case "date": {
          const d = new Date(item.modified);
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          break;
        }
        case "size": {
          if (item.size < 1024) key = "< 1 KB";
          else if (item.size < 1024 * 1024) key = "1 KB - 1 MB";
          else if (item.size < 100 * 1024 * 1024) key = "1 MB - 100 MB";
          else key = "> 100 MB";
          break;
        }
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
  }, [realFiles, sortKey, sortDir, foldersFirst, groupBy, showHidden]);

  // Show permission required state
  if (needsPermission) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="h-16 w-16 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-orange-500" />
        </div>
        <div>
          <div className="font-semibold text-lg">{t("storageAccessRequired") || "Storage Access Required"}</div>
          <div className="text-sm text-muted-foreground mt-1 max-w-sm">
            {error || "FileForge Pro needs permission to access your files"}
          </div>
        </div>
        <Button
          onClick={async () => {
            const granted = await nativeFileSystem.requestPermission();
            if (granted) {
              setNeedsPermission(false);
              store.bumpFsVersion();
            }
          }}
          className="bg-gradient-to-r from-orange-500 to-amber-600"
        >
          <Lock className="h-4 w-4 mr-2" />
          {t("grantAccess") || "Grant Access"}
        </Button>
      </div>
    );
  }

  // Show error state
  if (error && !loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <div>
          <div className="font-semibold">{t("error") || "Error"}</div>
          <div className="text-sm text-muted-foreground mt-1 max-w-sm">{error}</div>
        </div>
        <Button variant="outline" onClick={() => store.bumpFsVersion()}>
          {t("retry") || "Retry"}
        </Button>
      </div>
    );
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground gap-2">
        <div className="h-6 w-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{t("loading") || "Loading..."}</span>
      </div>
    );
  }

  // Open folder in main view (or within containing window), file in floating window
  const handleOpen = (n: FileNode) => {
    if (n.kind === "folder") {
      if (embeddedInWindow && windowId) {
        // Navigate within the containing window — don't touch the main pane
        store.navigateInWindow(windowId, n.id);
      } else {
        store.navigate(n.id);
      }
    } else {
      if (n.kind === "apk") {
        if (n.name.toLowerCase().endsWith(".xapk")) setInstallXapkNode(n);
        else setInstallApkNode(n);
      }
      else if (n.kind === "unknown") setOpenAsNode(n);
      else openFileInViewer(n, store, setOpenAsNode);
    }
  };

  const handleSelect = (n: FileNode, e: React.MouseEvent) => {
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (e.shiftKey && lastSelected) {
      store.selectRange(n.id);
    } else {
      store.toggleSelect(n.id, additive);
    }
    setLastSelected(n.id);
  };

  const handleLongPress = (n: FileNode, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!store.selectedIds.has(n.id)) {
      store.clearSelection();
      store.toggleSelect(n.id, false);
    }
    let clientX = 0, clientY = 0;
    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    ctxMenu.open(clientX, clientY, n);
  };

  // Long press handlers for touch devices
  const startLongPress = (n: FileNode, e: React.TouchEvent) => {
    longPressNode.current = n;
    longPressTimer.current = setTimeout(() => {
      if (longPressNode.current) {
        handleLongPress(longPressNode.current, e);
      }
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressNode.current = null;
  };

  return (
    <div
      ref={containerRef}
      className="relative flex-1 flex flex-col min-h-0 bg-background"
      onContextMenu={(e) => {
        e.preventDefault();
        ctxMenu.open(e.clientX, e.clientY, null);
      }}
    >
      {/* Empty state */}
      {groupedItems.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 p-8">
          <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center">
            <span className="text-3xl opacity-40">📁</span>
          </div>
          <div className="text-center">
            <div className="font-medium">{t("emptyFolder")}</div>
            <div className="text-xs mt-1">{t("emptyFolderDesc")}</div>
          </div>
        </div>
      )}

      {/* Content */}
      {groupedItems.length > 0 && groupedItems[0].items.length > 0 && (
        <div className="flex-1 overflow-auto p-2 sm:p-3">
          {groupedItems.map(({ group, items: groupItems }, gi) => (
            <div key={group || gi}>
              {group && (
                <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b mb-1">
                  {group}
                </div>
              )}
              {viewMode === "xlarge-grid" && <XLargeGridView items={groupItems} {...{ store, itemSize, paneId, onOpen: handleOpen, onSelect: handleSelect, onContext: handleLongPress, onHover: (n, e) => { if (n && e) quickPreview.show(n.id, e); else quickPreview.hide(); }, onLongPressStart: startLongPress, onLongPressCancel: cancelLongPress, lastSelected, t, showThumbnails, showExtensions, showFolderItemCount, lang }} />}
              {viewMode === "large-grid" && <LargeGridView items={groupItems} {...{ store, itemSize, paneId, onOpen: handleOpen, onSelect: handleSelect, onContext: handleLongPress, onHover: (n, e) => { if (n && e) quickPreview.show(n.id, e); else quickPreview.hide(); }, onLongPressStart: startLongPress, onLongPressCancel: cancelLongPress, lastSelected, t, showThumbnails, showExtensions, showFolderItemCount, lang }} />}
              {viewMode === "medium-grid" && <MediumGridView items={groupItems} {...{ store, itemSize, paneId, onOpen: handleOpen, onSelect: handleSelect, onContext: handleLongPress, onHover: (n, e) => { if (n && e) quickPreview.show(n.id, e); else quickPreview.hide(); }, onLongPressStart: startLongPress, onLongPressCancel: cancelLongPress, lastSelected, t, showThumbnails, showExtensions, showFolderItemCount, lang }} />}
              {viewMode === "small-grid" && <SmallGridView items={groupItems} {...{ store, itemSize, paneId, onOpen: handleOpen, onSelect: handleSelect, onContext: handleLongPress, onHover: (n, e) => { if (n && e) quickPreview.show(n.id, e); else quickPreview.hide(); }, onLongPressStart: startLongPress, onLongPressCancel: cancelLongPress, lastSelected, t, showThumbnails, showExtensions, showFolderItemCount, lang }} />}
              {viewMode === "list" && <ListView items={groupItems} {...{ store, itemSize, paneId, onOpen: handleOpen, onSelect: handleSelect, onContext: handleLongPress, lastSelected, t, showThumbnails, showExtensions, showFolderItemCount, lang }} />}
              {viewMode === "compact-list" && <CompactListView items={groupItems} {...{ store, paneId, onOpen: handleOpen, onSelect: handleSelect, onContext: handleLongPress, lastSelected, t, showThumbnails, showExtensions, showFolderItemCount, lang }} />}
              {viewMode === "content" && <ListView items={groupItems} {...{ store, itemSize, paneId, onOpen: handleOpen, onSelect: handleSelect, onContext: handleLongPress, lastSelected, t, showThumbnails, showExtensions, showFolderItemCount, lang }} />}
              {viewMode === "details" && <DetailsView items={groupItems} {...{ store, paneId, onOpen: handleOpen, onSelect: handleSelect, onContext: handleLongPress, lastSelected, t, showThumbnails, showExtensions, showFolderItemCount, sortKey, sortDir, lang }} />}
            </div>
          ))}
        </div>
      )}

      {/* Selection toolbar */}
      {paneId === "main" && store.selectedIds.size > 0 && !embeddedInWindow && (
        <SelectionToolbar />
      )}

      {/* Quick preview on hover - disabled on touch devices */}
      <QuickPreview
        nodeId={quickPreview.preview?.nodeId ?? null}
        x={quickPreview.preview?.x ?? 0}
        y={quickPreview.preview?.y ?? 0}
      />

      {/* Context menu */}
      <ContextMenu {...ctxMenu} currentPath={path} onOpenAs={(node) => { setOpenAsNode(node); ctxMenu.close(); }} />

      {/* Open As dialog */}
      {openAsNode && (
        <OpenAsDialog node={openAsNode} onClose={() => setOpenAsNode(null)} />
      )}

      {installApkNode && (
        <ApkInstallDialog node={installApkNode} onClose={() => setInstallApkNode(null)} />
      )}
      {installXapkNode && (
        <XapkInstallDialog node={installXapkNode} onClose={() => setInstallXapkNode(null)} />
      )}
    </div>
  );
}


function XapkInstallDialog({ node, onClose }: { node: FileNode; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const { lang } = useI18n();
  const install = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await installXapk(node.id);
      if (result.permissionRequired) return;
      if (!result.installed) throw new Error(result.error || (lang === "ar" ? "تعذر بدء تثبيت XAPK" : "Unable to start XAPK installation"));
      onClose();
    } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-2xl border bg-popover text-popover-foreground shadow-2xl overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="p-5 flex items-center gap-4">
          <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0"><Archive className="h-8 w-8 text-orange-500" /></div>
          <div className="min-w-0"><div className="font-semibold truncate">{node.name}</div><div className="text-xs text-muted-foreground">XAPK</div></div>
        </div>
        <div className="px-5 pb-4 text-sm text-muted-foreground">{lang === "ar" ? "حزمة XAPK متعددة الملفات. سيقوم FileForge بتثبيت ملفات APK وتقسيمات التطبيق ثم معالجة ملفات OBB إن وجدت." : "A multi-package XAPK. FileForge will install the APKs/splits and process OBB data when present."}</div>
        <div className="flex gap-2 justify-end border-t p-3">
          <button className="px-4 py-2 rounded-lg hover:bg-accent" onClick={onClose}>{lang === "ar" ? "إلغاء" : "Cancel"}</button>
          <button className="px-4 py-2 rounded-lg bg-orange-500 text-white disabled:opacity-50" disabled={busy} onClick={install}>{busy ? (lang === "ar" ? "جارٍ…" : "Starting…") : (lang === "ar" ? "تثبيت" : "Install")}</button>
        </div>
      </div>
    </div>
  );
}

function ApkInstallDialog({ node, onClose }: { node: FileNode; onClose: () => void }) {
  const [info, setInfo] = useState<{ packageName: string; appName: string; versionName?: string; icon?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const { lang } = useI18n();
  useEffect(() => { let alive = true; getApkInfo(node.id).then(v => { if (alive) setInfo(v); }); return () => { alive = false; }; }, [node.id]);
  const install = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await installApk(node.id);
      if (result.permissionRequired) return;
      if (!result.installed) throw new Error(lang === "ar" ? "تعذر بدء تثبيت التطبيق" : "Unable to start installation");
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-2xl border bg-popover text-popover-foreground shadow-2xl overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="p-5 flex items-center gap-4">
          <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
            {info?.icon ? <img src={info.icon} alt="" className="h-full w-full object-contain" /> : <span className="text-xl font-bold text-green-600">APK</span>}
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{info?.appName || node.name}</div>
            {info?.packageName && <div className="text-xs text-muted-foreground truncate">{info.packageName}</div>}
            {info?.versionName && <div className="text-xs text-muted-foreground">{lang === "ar" ? `الإصدار ${info.versionName}` : `Version ${info.versionName}`}</div>}
          </div>
        </div>
        <div className="px-5 pb-4 text-sm text-muted-foreground">
          {lang === "ar" ? "هذا ملف تثبيت تطبيق Android. اضغط تثبيت لبدء مثبت النظام." : "This is an Android application package. Press Install to start the system installer."}
        </div>
        <div className="flex gap-2 justify-end border-t p-3">
          <button className="px-4 py-2 rounded-lg hover:bg-accent" onClick={onClose}>{lang === "ar" ? "إلغاء" : "Cancel"}</button>
          <button className="px-4 py-2 rounded-lg bg-orange-500 text-white disabled:opacity-50" disabled={busy} onClick={install}>{busy ? (lang === "ar" ? "جارٍ…" : "Starting…") : (lang === "ar" ? "تثبيت" : "Install")}</button>
        </div>
      </div>
    </div>
  );
}

function openFileInViewer(n: FileNode, store: ReturnType<typeof useFileForge.getState>, onOpenAs?: (node: FileNode) => void) {
  // Record this open in the real persistent history (used by Sidebar Recents)
  try {
    import("@/lib/fileforge/file-history").then(({ recordOpenedFile }) => {
      recordOpenedFile({
        path: n.id,
        name: n.name,
        kind: n.kind,
        size: n.size,
        modified: n.modified,
      });
    });
  } catch { /* history is best-effort */ }

  const kind = n.kind;
  if (kind === "text" || kind === "code" || kind === "html") {
    store.openWindow({
      type: "text-editor",
      title: n.name,
      nodeId: n.id,
      width: 820,
      height: 580,
    });
  } else if (kind === "image") {
    store.openWindow({
      type: "image-preview",
      title: n.name,
      nodeId: n.id,
      width: 720,
      height: 560,
    });
  } else if (kind === "video") {
    store.openWindow({
      type: "video-preview",
      title: n.name,
      nodeId: n.id,
      width: 800,
      height: 560,
    });
  } else if (kind === "audio") {
    store.openWindow({
      type: "audio-preview",
      title: n.name,
      nodeId: n.id,
      width: 480,
      height: 320,
    });
  } else if (kind === "pdf") {
    store.openWindow({
      type: "pdf-preview",
      title: n.name,
      nodeId: n.id,
      width: 720,
      height: 600,
      maximized: true,
    });
  } else if (kind === "archive") {
    // Archives get their own browser — not properties
    store.openWindow({
      type: "archive-preview",
      title: n.name,
      nodeId: n.id,
      path: n.id,
      width: 720,
      height: 560,
    });
  } else if (kind === "word" || kind === "excel" || kind === "presentation" || kind === "font" || kind === "unknown") {
    onOpenAs?.(n);
  }
}

// ============ ITEM CARD HELPERS ============
interface ItemViewProps {
  items: FileNode[];
  store: ReturnType<typeof useFileForge.getState>;
  itemSize?: ItemSize;
  paneId: "main" | "dual";
  onOpen: (n: FileNode) => void;
  onSelect: (n: FileNode, e: React.MouseEvent) => void;
  onContext: (n: FileNode, e: React.MouseEvent | React.TouchEvent) => void;
  onHover?: (n: FileNode | null, e: React.MouseEvent | null) => void;
  onLongPressStart?: (n: FileNode, e: React.TouchEvent) => void;
  onLongPressCancel?: () => void;
  lastSelected: string | null;
  t: (key: any, params?: any) => string;
  showThumbnails?: boolean;
  showExtensions?: boolean;
  showFolderItemCount?: boolean;
  sortKey?: SortKey;
  sortDir?: SortDir;
  lang: string;
}

const GRID_SIZE_CLASSES: Record<ItemSize, { container: string; card: string; icon: string; thumb: string; title: string; meta: string }> = {
  xs: { container: "grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-1.5", card: "p-1.5", icon: "h-8 w-8", thumb: "h-12", title: "text-[10px]", meta: "text-[9px]" },
  sm: { container: "grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2", card: "p-2", icon: "h-10 w-10", thumb: "h-20", title: "text-xs", meta: "text-[10px]" },
  md: { container: "grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3", card: "p-3", icon: "h-12 w-12", thumb: "h-28", title: "text-sm", meta: "text-xs" },
  lg: { container: "grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3", card: "p-3.5", icon: "h-14 w-14", thumb: "h-36", title: "text-sm", meta: "text-xs" },
  xl: { container: "grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4", card: "p-4", icon: "h-16 w-16", thumb: "h-44", title: "text-base", meta: "text-xs" },
};

function getGridSizeClasses(itemSize: ItemSize, viewMode: ViewMode) {
  if (viewMode === "xlarge-grid") {
    const sizes = {
      xs: { container: "grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3", card: "p-3", icon: "h-16 w-16", thumb: "h-40", title: "text-sm", meta: "text-xs" },
      sm: { container: "grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4", card: "p-3.5", icon: "h-20 w-20", thumb: "h-48", title: "text-base", meta: "text-xs" },
      md: { container: "grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4", card: "p-4", icon: "h-24 w-24", thumb: "h-56", title: "text-base", meta: "text-xs" },
      lg: { container: "grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5", card: "p-5", icon: "h-28 w-28", thumb: "h-64", title: "text-lg", meta: "text-sm" },
      xl: { container: "grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-5", card: "p-6", icon: "h-32 w-32", thumb: "h-72", title: "text-xl", meta: "text-sm" },
    };
    return sizes[itemSize];
  }
  if (viewMode === "large-grid") {
    // Larger overall
    const sizes: Record<ItemSize, typeof GRID_SIZE_CLASSES.xs> = {
      xs: { container: "grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2", card: "p-2.5", icon: "h-12 w-12", thumb: "h-28", title: "text-xs", meta: "text-[10px]" },
      sm: { container: "grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3", card: "p-3", icon: "h-14 w-14", thumb: "h-36", title: "text-sm", meta: "text-[10px]" },
      md: { container: "grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3", card: "p-3.5", icon: "h-16 w-16", thumb: "h-44", title: "text-sm", meta: "text-xs" },
      lg: { container: "grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4", card: "p-4", icon: "h-20 w-20", thumb: "h-52", title: "text-base", meta: "text-xs" },
      xl: { container: "grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4", card: "p-5", icon: "h-24 w-24", thumb: "h-64", title: "text-lg", meta: "text-xs" },
    };
    return sizes[itemSize];
  }
  if (viewMode === "small-grid") {
    const sizes: Record<ItemSize, typeof GRID_SIZE_CLASSES.xs> = {
      xs: { container: "grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1", card: "p-1", icon: "h-7 w-7", thumb: "h-10", title: "text-[9px]", meta: "text-[8px]" },
      sm: { container: "grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-1.5", card: "p-1.5", icon: "h-8 w-8", thumb: "h-14", title: "text-[10px]", meta: "text-[9px]" },
      md: { container: "grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2", card: "p-2", icon: "h-10 w-10", thumb: "h-20", title: "text-xs", meta: "text-[10px]" },
      lg: { container: "grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2", card: "p-2.5", icon: "h-12 w-12", thumb: "h-24", title: "text-sm", meta: "text-[10px]" },
      xl: { container: "grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3", card: "p-3", icon: "h-14 w-14", thumb: "h-28", title: "text-sm", meta: "text-xs" },
    };
    return sizes[itemSize];
  }
  return GRID_SIZE_CLASSES[itemSize];
}

// ============ VIRTUALIZED GRID VIEW ============
// All grid modes use the same virtualized renderer.
// Only visible rows (+overscan) are mounted in the DOM.
// Handles 10,000+ items without jank.
function VirtualGridView(props: ItemViewProps & { minCardWidth: number; rowHeight: number; gridMode: ViewMode }) {
  const { items, store, itemSize = "md", onOpen, onSelect, onContext, onHover, onLongPressStart, onLongPressCancel, t, lang, showThumbnails = true, showExtensions = true, showFolderItemCount = true, minCardWidth, rowHeight, gridMode } = props;
  const sz = getGridSizeClasses(itemSize, gridMode);
  const { columns, containerRef: gridContainerRef } = useGridColumns(minCardWidth);
  const { visibleRange, totalHeight, offsetY, onScroll, containerRef: scrollRef } = useVirtualList({
    itemCount: Math.ceil(items.length / columns),
    itemHeight: rowHeight,
  });

  return (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="overflow-auto"
      style={{ position: "relative", height: "100%" }}
    >
      <div ref={gridContainerRef} style={{ height: totalHeight, position: "relative" }}>
        <div
          className={cn("grid", sz.container)}
          style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}
        >
          {visibleRange.map(rowIdx => {
            const start = rowIdx * columns;
            const end = Math.min(start + columns, items.length);
            const rowItems = items.slice(start, end);
            return rowItems.map(n => (
              <GridCard
                key={n.id}
                node={n}
                store={store}
                sz={sz}
                onOpen={onOpen}
                onSelect={onSelect}
                onContext={onContext}
                onHover={onHover}
                onLongPressStart={onLongPressStart}
                onLongPressCancel={onLongPressCancel}
                showThumb={showThumbnails}
                showExtensions={showExtensions}
                showFolderItemCount={showFolderItemCount}
                t={t}
                lang={lang}
              />
            ));
          })}
        </div>
      </div>
    </div>
  );
}

function XLargeGridView(props: ItemViewProps) {
  const { itemSize = "md" } = props;
  const minCardWidth = itemSize === "xs" ? 180 : itemSize === "sm" ? 220 : itemSize === "md" ? 260 : itemSize === "lg" ? 300 : 360;
  const rowHeight = itemSize === "xs" ? 220 : itemSize === "sm" ? 260 : itemSize === "md" ? 300 : itemSize === "lg" ? 340 : 390;
  return <VirtualGridView {...props} gridMode="xlarge-grid" minCardWidth={minCardWidth} rowHeight={rowHeight} />;
}

function LargeGridView(props: ItemViewProps) {
  const { itemSize = "md" } = props;
  const minCardWidth = itemSize === "xs" ? 140 : itemSize === "sm" ? 170 : itemSize === "md" ? 200 : itemSize === "lg" ? 240 : 290;
  const rowHeight = itemSize === "xs" ? 180 : itemSize === "sm" ? 220 : itemSize === "md" ? 260 : itemSize === "lg" ? 300 : 340;
  return <VirtualGridView {...props} gridMode="large-grid" minCardWidth={minCardWidth} rowHeight={rowHeight} />;
}

function MediumGridView(props: ItemViewProps) {
  const { itemSize = "md" } = props;
  const minCardWidth = itemSize === "xs" ? 80 : itemSize === "sm" ? 110 : itemSize === "md" ? 150 : itemSize === "lg" ? 190 : 230;
  const rowHeight = itemSize === "xs" ? 140 : itemSize === "sm" ? 170 : itemSize === "md" ? 210 : itemSize === "lg" ? 250 : 290;
  return <VirtualGridView {...props} gridMode="medium-grid" minCardWidth={minCardWidth} rowHeight={rowHeight} />;
}

function SmallGridView(props: ItemViewProps) {
  const { itemSize = "md" } = props;
  const minCardWidth = itemSize === "xs" ? 70 : itemSize === "sm" ? 90 : itemSize === "md" ? 110 : itemSize === "lg" ? 130 : 160;
  const rowHeight = itemSize === "xs" ? 100 : itemSize === "sm" ? 120 : itemSize === "md" ? 150 : itemSize === "lg" ? 170 : 190;
  return <VirtualGridView {...props} gridMode="small-grid" minCardWidth={minCardWidth} rowHeight={rowHeight} />;
}

function GridCard({
  node, store, sz, onOpen, onSelect, onContext, onHover, onLongPressStart, onLongPressCancel, showThumb, showExtensions = true, showFolderItemCount = true, compact, t, lang,
}: {
  node: FileNode;
  store: ReturnType<typeof useFileForge.getState>;
  sz: ReturnType<typeof getGridSizeClasses>;
  onOpen: (n: FileNode) => void;
  onSelect: (n: FileNode, e: React.MouseEvent) => void;
  onContext: (n: FileNode, e: React.MouseEvent | React.TouchEvent) => void;
  onHover?: (n: FileNode | null, e: React.MouseEvent | null) => void;
  onLongPressStart?: (n: FileNode, e: React.TouchEvent) => void;
  onLongPressCancel?: () => void;
  showThumb?: boolean;
  showExtensions?: boolean;
  showFolderItemCount?: boolean;
  compact?: boolean;
  t: (key: any, params?: any) => string;
  lang: string;
}) {
  const selected = store.selectedIds.has(node.id);
  const isImage = node.kind === "image";
  const isVideo = node.kind === "video";
  const showThumbnail = showThumb && (isImage || isVideo || node.kind === "apk");

  return (
    <div
      className={cn(
        "group relative rounded-lg border bg-card cursor-pointer transition-all hover:border-orange-400/50 hover:shadow-sm",
        sz.card,
        selected && "border-orange-500 ring-2 ring-orange-500/30 bg-orange-50/40 dark:bg-orange-950/20",
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/fileforge-id", node.id);
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      onClick={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          onSelect(node, e);
        } else {
          onOpen(node);
        }
      }}
      onContextMenu={(e) => onContext(node, e)}
      onMouseEnter={(e) => onHover?.(node, e)}
      onMouseLeave={() => onHover?.(null, null)}
      onTouchStart={(e) => onLongPressStart?.(node, e)}
      onTouchEnd={() => onLongPressCancel?.()}
      onTouchMove={() => onLongPressCancel?.()}
    >
      {/* Selection checkbox - shows on hover or when selected */}
      <div
        className={cn(
          "absolute top-1.5 right-1.5 z-10 transition-opacity",
          selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => { e.stopPropagation(); onSelect(node, e); }}
      >
        <div className={cn(
          "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors",
          selected ? "bg-orange-500 border-orange-500 text-white" : "bg-white/80 border-gray-400 dark:bg-black/60"
        )}>
          {selected && <Check className="h-3 w-3" strokeWidth={3} />}
        </div>
      </div>

      {/* Star indicator */}
      {node.starred && (
        <Star className="absolute top-1.5 left-1.5 h-3.5 w-3.5 text-yellow-500 fill-yellow-500 z-10" />
      )}

      {/* Thumbnail or icon area */}
      <div className={cn("flex items-center justify-center mb-2", sz.thumb)}>
        {showThumbnail ? (
          <ThumbnailImage
            path={node.id}
            kind={node.kind}
            className="w-full h-full"
            lastModified={node.modified}
            fileSize={node.size}
            showVideoBadge={isVideo}
          />
        ) : (
          <div className="flex flex-col items-center gap-1">
            {getFileIconLarge(node.kind, sz.icon, node.name)}
            {node.kind === "folder" && showFolderItemCount && (
              <FolderCountBadge path={node.id} t={t} />
            )}
          </div>
        )}
      </div>

      {/* Title */}
      <div className={cn("font-medium truncate text-center", sz.title)} title={node.name}>
        {showExtensions ? node.name : stripExtension(node.name)}
      </div>

      {/* Meta */}
      {!compact && (
        <div className={cn("text-muted-foreground text-center truncate mt-0.5", sz.meta)}>
          {node.kind === "folder"
            ? `${formatDate(node.modified, lang)}`
            : `${formatBytes(node.size)} · ${formatDate(node.modified, lang)}`
          }
        </div>
      )}
    </div>
  );
}

// ============ LIST VIEW (virtualized) ============
function ListView(props: ItemViewProps) {
  const { items, store, itemSize = "md", onOpen, onSelect, onContext, t, showThumbnails = true, showExtensions = true, showFolderItemCount = true } = props;
  const sizes: Record<ItemSize, { icon: string; padding: string; title: string; meta: string }> = {
    xs: { icon: "h-6 w-6", padding: "py-1 px-2", title: "text-xs", meta: "text-[10px]" },
    sm: { icon: "h-7 w-7", padding: "py-1.5 px-2", title: "text-xs", meta: "text-[10px]" },
    md: { icon: "h-9 w-9", padding: "py-2 px-3", title: "text-sm", meta: "text-xs" },
    lg: { icon: "h-10 w-10", padding: "py-2.5 px-3", title: "text-sm", meta: "text-xs" },
    xl: { icon: "h-12 w-12", padding: "py-3 px-4", title: "text-base", meta: "text-xs" },
  };
  const sz = sizes[itemSize];
  const rowHeight = itemSize === "xs" ? 36 : itemSize === "sm" ? 42 : itemSize === "md" ? 52 : itemSize === "lg" ? 58 : 68;
  const { visibleRange, totalHeight, offsetY, onScroll, containerRef } = useVirtualList({
    itemCount: items.length,
    itemHeight: rowHeight,
  });
  return (
    <div ref={containerRef} onScroll={onScroll} className="overflow-auto overscroll-contain" style={{ position: "relative", height: "100%", overscrollBehavior: "contain" }}>
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ position: "absolute", top: offsetY, left: 0, right: 0 }} className="flex flex-col gap-0.5">
          {visibleRange.map(i => (
            <ListRow key={items[i].id} node={items[i]} store={store} sz={sz} onOpen={onOpen} onSelect={onSelect} onContext={onContext} showMeta showExtensions={showExtensions} showThumbnails={showThumbnails} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ============ COMPACT LIST (virtualized) ============
function CompactListView(props: Omit<ItemViewProps, "itemSize">) {
  const { items, store, onOpen, onSelect, onContext, t, showThumbnails = true, showExtensions = true, showFolderItemCount = true } = props;
  const sz = { icon: "h-5 w-5", padding: "py-1 px-2", title: "text-xs", meta: "text-[10px]" };
  const rowHeight = 32;
  const { visibleRange, totalHeight, offsetY, onScroll, containerRef } = useVirtualList({
    itemCount: items.length,
    itemHeight: rowHeight,
  });
  return (
    <div ref={containerRef} onScroll={onScroll} className="overflow-auto overscroll-contain" style={{ position: "relative", height: "100%", overscrollBehavior: "contain" }}>
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ position: "absolute", top: offsetY, left: 0, right: 0 }} className="flex flex-col gap-0">
          {visibleRange.map(i => (
            <ListRow key={items[i].id} node={items[i]} store={store} sz={sz} onOpen={onOpen} onSelect={onSelect} onContext={onContext} compact showExtensions={showExtensions} showThumbnails={showThumbnails} t={t} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ListRow({
  node, store, sz, onOpen, onSelect, onContext, showMeta, compact, t, showExtensions = true, showThumbnails = true,
}: {
  node: FileNode;
  store: ReturnType<typeof useFileForge.getState>;
  sz: { icon: string; padding: string; title: string; meta: string };
  onOpen: (n: FileNode) => void;
  onSelect: (n: FileNode, e: React.MouseEvent) => void;
  onContext: (n: FileNode, e: React.MouseEvent) => void;
  showMeta?: boolean;
  compact?: boolean;
  showExtensions?: boolean;
  showThumbnails?: boolean;
  t: (key: any, params?: any) => string;
}) {
  const selected = store.selectedIds.has(node.id);
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md cursor-pointer transition-colors",
        sz.padding,
        selected ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "hover:bg-accent/60"
      )}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/fileforge-id", node.id);
        e.dataTransfer.effectAllowed = "copyMove";
      }}
      onClick={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) onSelect(node, e);
        else onOpen(node);
      }}
      onContextMenu={(e) => onContext(node, e)}
    >
      <Checkbox
        checked={selected}
        onClick={(e) => { e.stopPropagation(); onSelect(node, e as unknown as React.MouseEvent); }}
        className="data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
      />
      {node.starred && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
      <div className="flex-shrink-0">
        {(node.kind === "image" || node.kind === "video" || node.kind === "apk") ? (
          <ThumbnailImage
            path={node.id}
            kind={node.kind}
            className={cn("rounded", sz.icon)}
            lastModified={node.modified}
            fileSize={node.size}
            showVideoBadge={node.kind === "video"}
          />
        ) : getFileIcon(node.kind, sz.icon)}
      </div>
      <div className="flex-1 min-w-0">
        <div className={cn("font-medium truncate", sz.title)} title={node.name}>{showExtensions ? node.name : stripExtension(node.name)}</div>
        {showMeta && (
          <div className={cn("text-muted-foreground truncate", sz.meta)}>
            {getFileTypeLabel(node.kind, node.name)}
          </div>
        )}
      </div>
      {!compact && (
        <div className={cn("text-muted-foreground flex-shrink-0", sz.meta)}>
          {node.kind === "folder" ? <FolderCountBadge path={node.id} t={t} /> : formatBytes(node.size)}
        </div>
      )}
      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 opacity-0 group-hover:opacity-100" />
    </div>
  );
}

// ============ DETAILS VIEW (Windows Explorer style) ============
function DetailsView(props: Omit<ItemViewProps, "itemSize">) {
  const { items, store, onOpen, onSelect, onContext, t, lang, showThumbnails = true, showExtensions = true, showFolderItemCount = true, sortKey = "name" as SortKey, sortDir = "asc" as SortDir } = props;
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="grid grid-cols-[1fr_80px_sm:100px_100px_sm:120px_110px_sm:140px] gap-2 px-2 sm:px-3 py-1.5 border-b bg-muted/40 text-xs font-medium text-muted-foreground sticky top-0">
        <div className="flex items-center gap-1">
          <button
            className="hover:text-foreground truncate"
            onClick={() => {
              store.setSortKey("name");
              store.setSortDir(sortKey === "name" && sortDir === "asc" ? "desc" : "asc");
            }}
          >
            {t("name")} {sortKey === "name" && (sortDir === "asc" ? "↑" : "↓")}
          </button>
        </div>
        <button
          className="hover:text-foreground text-right"
          onClick={() => {
            store.setSortKey("size");
            store.setSortDir(sortKey === "size" && sortDir === "asc" ? "desc" : "asc");
          }}
        >
          {t("size")} {sortKey === "size" && (sortDir === "asc" ? "↑" : "↓")}
        </button>
        <button
          className="hover:text-foreground hidden sm:block"
          onClick={() => {
            store.setSortKey("type");
            store.setSortDir(sortKey === "type" && sortDir === "asc" ? "desc" : "asc");
          }}
        >
          {t("type")} {sortKey === "type" && (sortDir === "asc" ? "↑" : "↓")}
        </button>
        <button
          className="hover:text-foreground"
          onClick={() => {
            store.setSortKey("modified");
            store.setSortDir(sortKey === "modified" && sortDir === "asc" ? "desc" : "asc");
          }}
        >
          {t("modified")} {sortKey === "modified" && (sortDir === "asc" ? "↑" : "↓")}
        </button>
      </div>
      {/* Rows */}
      <div className="flex flex-col">
        {items.map(n => {
          const selected = store.selectedIds.has(n.id);
          return (
            <div
              key={n.id}
              className={cn(
                "grid grid-cols-[1fr_80px_sm:100px_100px_sm:120px_110px_sm:140px] gap-2 px-2 sm:px-3 py-2 border-b border-border/40 cursor-pointer transition-colors text-sm items-center",
                selected ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "hover:bg-accent/60"
              )}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/fileforge-id", n.id);
                e.dataTransfer.effectAllowed = "copyMove";
              }}
              onClick={(e) => {
                if (e.shiftKey || e.ctrlKey || e.metaKey) onSelect(n, e);
                else onOpen(n);
              }}
              onContextMenu={(e) => onContext(n, e)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Checkbox
                  checked={selected}
                  onClick={(e) => { e.stopPropagation(); onSelect(n, e as unknown as React.MouseEvent); }}
                  className="data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                />
                {n.starred && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />}
                {getFileIcon(n.kind, "h-4 w-4")}
                <span className="truncate font-medium" title={n.name}>{n.name}</span>
              </div>
              <div className="text-right text-muted-foreground">
                {n.kind === "folder" ? <FolderCountBadge path={n.id} t={t} /> : formatBytes(n.size)}
              </div>
              <div className="text-muted-foreground truncate hidden sm:block">{getFileTypeLabel(n.kind, n.name)}</div>
              <div className="text-muted-foreground">{formatDateShort(n.modified, lang)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============ FolderCountBadge ============
// Displays a real folder item count. On native, this calls getFolderSummary
// (background thread) via useFolderCount — no more hardcoded "0 items".
function FolderCountBadge({ path, t }: { path: string; t?: (key: any, params?: any) => string }) {
  const { count, loading } = useFolderCount(path);
  const label = t ? t("items") : "items";
  if (loading) return <span className="text-[10px] leading-tight text-muted-foreground">…</span>;
  return <span className="text-[10px] leading-tight text-muted-foreground">{count} {label}</span>;
}

// Strip the file extension from a name when showExtensions is off.
function stripExtension(name: string): string {
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return name; // hidden files (starting with .) keep their name
  return name.substring(0, dotIdx);
}

