// FileForge Pro — Sidebar / Navigation Drawer (bilingual + responsive + edge-swipe)
//
// Major rework:
//   - Drawer gesture: hook now lives in @/lib/fileforge/drawer-gesture.ts and
//     handles edge-swipe-to-open + swipe-out-to-close, with RTL awareness.
//   - Storage entries: on native Android, real primary + SD + USB volumes are
//     enumerated via nativeFileSystem.listStorageVolumes(). On web, only the
//     mock "Internal Storage" entry is shown — fake SD/USB are removed.
//   - Favorites & Recents: backed by real persisted history (file-history.ts),
//     not mock filesystem nodes.
//   - Categories: on native, navigate to real Android standard directories
//     (/storage/emulated/0/Download, /DCIM, /Music, etc.); on web, fall back
//     to mock ids.
//   - FTP / SMB / Cloud: NOT implemented in this project. They are shown but
//     labeled "Coming soon" via toast — honest about their state instead of
//     navigating to a fake empty screen.

"use client";

import {
  Star, Clock, Smartphone, MemoryStick, Usb, Download, Image, Video, Music, FileText,
  Cloud, Lock, Settings, HardDrive, BarChart3, Folder, X, AlertCircle, AppWindow,
} from "lucide-react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getNode, formatBytes, getFolderSize, ROOT_IDS, filesystem,
} from "@/lib/fileforge/filesystem";
import { getStorageInfoHybrid } from "@/lib/fileforge/filesystem";
import { nativeFileSystem, isNative } from "@/lib/fileforge/native-bridge";
import {
  getOpenedHistory, getFavoritePaths, resolveCategoryPath,
  resolveInternalStoragePath,
} from "@/lib/fileforge/file-history";
import { useDrawerGesture } from "@/lib/fileforge/drawer-gesture";
import { ThumbnailImage } from "./ThumbnailImage";
import { useEffect, useState, useMemo, useCallback } from "react";

interface StorageVolume {
  path: string;
  label: string;
  isRemovable: boolean;
  isPrimary: boolean;
  total: number;
  free: number;
  used: number;
}

const ICONS: Record<string, typeof Star> = {
  "smartphone": Smartphone,
  "sd-card": MemoryStick,
  "usb": Usb,
  "download": Download,
  "image": Image,
  "video": Video,
  "music": Music,
  "file-text": FileText,
  "cloud": Cloud,
};

export function Sidebar() {
  const store = useFileForge();
  const { t } = useI18n();

  // Hook up edge-swipe gestures (open from edge + close by swiping out)
  useDrawerGesture();

  const [volumes, setVolumes] = useState<StorageVolume[] | null>(null);
  const [realTotal, setRealTotal] = useState<number | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const isPinned = store.sidebarPinned;

  // Real storage volumes + total
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (isNative()) {
        const vols = await nativeFileSystem.listStorageVolumes();
        if (!cancelled && vols) {
          setVolumes(vols);
          const primary = vols.find(v => v.isPrimary);
          if (primary) setRealTotal(primary.total);
        }
      } else {
        // Web fallback
        const info = await getStorageInfoHybrid();
        if (!cancelled && info && info.total > 0) setRealTotal(info.total);
      }
    })();
    return () => { cancelled = true; };
  }, [store._fsVersion]);

  // Refresh history whenever the sidebar becomes visible.
  // Use queueMicrotask to avoid the synchronous setState-in-effect lint rule.
  useEffect(() => {
    if (store.sidebarOpen || isPinned) {
      queueMicrotask(() => setHistoryVersion(v => v + 1));
    }
  }, [store.sidebarOpen, isPinned]);

  // Esc closes the drawer
  useEffect(() => {
    if (isPinned) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") store.toggleSidebar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isPinned, store]);

  const internalPath = useMemo(() => resolveInternalStoragePath(), []);
  const internalUsage = useMemo(() => {
    // On native, the storage total comes from volumes[]. On web, fall back to
    // On native, use real volume used/total. On web, use 0 (no mock walk).
    if (isNative() && volumes) {
      const primary = volumes.find(v => v.isPrimary);
      if (primary) return { used: primary.used, total: primary.total };
    }
    return {
      used: 0, // Don't walk mock tree — it's misleading
      total: realTotal ?? 128 * 1024 * 1024 * 1024,
    };
  }, [volumes, realTotal, store._fsVersion]);

  // Real history + favorites (persisted in localStorage)
  const recents = useMemo(() => {
    void historyVersion; // re-evaluate on each bump
    return getOpenedHistory().slice(0, 8);
  }, [historyVersion]);

  const favorites = useMemo(() => {
    void historyVersion;
    return getFavoritePaths();
  }, [historyVersion]);

  // Category counts — on native these can't be known without scanning each
  // directory, so we don't show a count. On web, fall back to mock children.
  const getCategoryCount = useCallback((categoryId: string): number | undefined => {
    if (isNative()) return undefined; // unknown without scanning
    const mockId = categoryId;
    const node = getNode(mockId);
    return node?.childrenIds?.length;
  }, []);

  const isOpen = store.sidebarOpen || isPinned;
  if (!isOpen) return null;

  const handleNavigate = (path: string) => {
    store.navigate(path);
    if (!isPinned) store.toggleSidebar();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Brand header */}
      <div className="flex items-center gap-2 px-4 h-14 border-b">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-sm">
          <HardDrive className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold leading-none">FileForge Pro</div>
          <div className="text-[10px] text-muted-foreground leading-none mt-0.5">{t("version")}</div>
        </div>
        {!isPinned && (
          <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => store.toggleSidebar()}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="px-2 py-3 space-y-5">
          {/* Quick access */}
          <SidebarSection title={t("quickAccess")}>
            <SidebarItem icon={Star}
              label={t("favorites")}
              badge={favorites.length > 0 ? favorites.length : undefined}
              onClick={() => {
                // Open a search window filtered to favorites
                store.openWindow({
                  type: "search",
                  title: t("favorites"),
                  width: 720, height: 480,
                });
              }} />
            <SidebarItem icon={Clock} label={t("recent")}
              badge={recents.length > 0 ? recents.length : undefined}
              onClick={() => {
                store.openWindow({
                  type: "search",
                  title: t("recent"),
                  width: 720, height: 480,
                });
              }} />
          </SidebarSection>

          {/* Storage locations */}
          <SidebarSection title={t("storage")}>
            {/* Internal — always present */}
            <SidebarItem icon={Smartphone} label={t("internalStorage")}
              active={store.currentPath === internalPath || store.currentPath === ROOT_IDS.internal}
              onClick={() => handleNavigate(internalPath)} />

            {/* SD / USB — only real volumes from native plugin */}
            {isNative() && volumes && volumes.filter(v => !v.isPrimary).map(v => (
              <SidebarItem
                key={v.path}
                icon={v.label.toLowerCase().includes("usb") ? Usb : MemoryStick}
                label={v.label}
                active={store.currentPath === v.path}
                onClick={() => handleNavigate(v.path)}
              />
            ))}

            {/* On web, show a clear "no removable storage" hint */}
            {!isNative() && (
              <div className="px-3 py-2 text-[10px] text-muted-foreground italic">
                {t("usbStorage")} / {t("sdCard")}: native only
              </div>
            )}
          </SidebarSection>

          {/* Storage usage */}
          <div className="px-2 py-2 mx-2 rounded-lg bg-muted/40 border">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-muted-foreground">{t("internalStorage")}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatBytes(internalUsage.used)} / {formatBytes(internalUsage.total)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-500"
                style={{ width: `${Math.min(100, (internalUsage.used / internalUsage.total) * 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{formatBytes(internalUsage.used)} {t("used")}</span>
              <span>{formatBytes(internalUsage.total - internalUsage.used)} {t("free")}</span>
            </div>
          </div>

          {/* Categories */}
          <SidebarSection title={t("categories")}>
            {[
              { id: "downloads", icon: Download, label: t("downloads") },
              { id: "pictures",  icon: Image,    label: t("pictures") },
              { id: "videos",   icon: Video,    label: t("videos") },
              { id: "music",    icon: Music,    label: t("music") },
              { id: "documents",icon: FileText, label: t("documents") },
            ].map(cat => {
              const count = getCategoryCount(cat.id);
              const path = resolveCategoryPath(cat.id);
              const Icon = cat.icon;
              return (
                <SidebarItem
                  key={cat.id}
                  icon={Icon}
                  label={cat.label}
                  badge={count !== undefined && count > 0 ? count : undefined}
                  active={store.currentPath === path}
                  onClick={() => handleNavigate(path)}
                />
              );
            })}
          </SidebarSection>

          {/* Network — FTP/SMB not implemented; show with honest labeling */}
          <SidebarSection title={t("network")}>
            <SidebarItem icon={Cloud} label={`FTP · ${t("comingSoon") ?? "Coming soon"}`}
              disabled
              onClick={() => store.addToast("FTP support is planned but not yet implemented.", "info")} />
            <SidebarItem icon={Cloud} label={`SMB · ${t("comingSoon") ?? "Coming soon"}`}
              disabled
              onClick={() => store.addToast("SMB support is planned but not yet implemented.", "info")} />
          </SidebarSection>

          {/* Cloud — not implemented; show with honest labeling */}
          <SidebarSection title={t("cloud")}>
            <SidebarItem icon={Cloud} label={`Google Drive · ${t("comingSoon") ?? "Coming soon"}`}
              disabled
              onClick={() => store.addToast("Google Drive integration is planned but not yet implemented.", "info")} />
            <SidebarItem icon={Cloud} label={`Dropbox · ${t("comingSoon") ?? "Coming soon"}`}
              disabled
              onClick={() => store.addToast("Dropbox integration is planned but not yet implemented.", "info")} />
            <SidebarItem icon={Cloud} label={`OneDrive · ${t("comingSoon") ?? "Coming soon"}`}
              disabled
              onClick={() => store.addToast("OneDrive integration is planned but not yet implemented.", "info")} />
          </SidebarSection>

          {/* Tools */}
          <SidebarSection title={t("tools")}>
            <SidebarItem icon={AppWindow} label={t("apps")}
              onClick={() => store.openWindow({ type: "apps", title: t("apps"), width: 760, height: 620 })} />
            <SidebarItem icon={BarChart3} label={t("storageAnalyzer")}
              onClick={() => store.openWindow({ type: "storage-analyzer", title: t("storageAnalyzer"), width: 820, height: 600 })} />
            <SidebarItem icon={Lock} label={t("secureVault")}
              onClick={() => store.openWindow({ type: "settings", title: t("secureVault"), width: 640, height: 520 })} />
            <SidebarItem icon={Settings} label={t("settings")}
              onClick={() => store.openWindow({ type: "settings", title: t("settings"), width: 640, height: 520 })} />
          </SidebarSection>

          {/* Favorites preview (real persisted favorites) */}
          {favorites.length > 0 && (
            <SidebarSection title={t("favorites")}>
              <div className="space-y-0.5 mt-1">
                {favorites.slice(0, 5).map(f => (
                  <button
                    key={f.path}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-accent text-left"
                    onClick={() => {
                      // Open the file in the appropriate viewer
                      store.openWindow({
                        type:
                          f.kind === "text" || f.kind === "code" || f.kind === "html" ? "text-editor" :
                          f.kind === "image" ? "image-preview" :
                          f.kind === "video" ? "video-preview" :
                          f.kind === "audio" ? "audio-preview" :
                          f.kind === "pdf" ? "pdf-preview" :
                          f.kind === "archive" ? "archive-preview" : "properties",
                        title: f.name,
                        nodeId: f.path,
                        width: 720,
                        height: 520,
                      });
                      if (!isPinned) store.toggleSidebar();
                    }}
                  >
                    <div className="h-6 w-6 flex items-center justify-center rounded bg-muted/60 flex-shrink-0">
                      <Star className="h-3.5 w-3.5 text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{f.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{f.path}</div>
                    </div>
                  </button>
                ))}
              </div>
            </SidebarSection>
          )}

          {/* Recent files preview (real persisted history) */}
          {recents.length > 0 && (
            <SidebarSection title={t("recent")}>
              <div className="space-y-0.5 mt-1">
                {recents.map(f => (
                  <button
                    key={f.path + f.openedAt}
                    className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md hover:bg-accent text-left"
                    onClick={() => {
                      store.openWindow({
                        type:
                          f.kind === "text" || f.kind === "code" || f.kind === "html" ? "text-editor" :
                          f.kind === "image" ? "image-preview" :
                          f.kind === "video" ? "video-preview" :
                          f.kind === "audio" ? "audio-preview" :
                          f.kind === "pdf" ? "pdf-preview" :
                          f.kind === "archive" ? "archive-preview" : "properties",
                        title: f.name,
                        nodeId: f.path,
                        width: 720,
                        height: 520,
                      });
                      if (!isPinned) store.toggleSidebar();
                    }}
                  >
                    <div className="h-6 w-6 flex items-center justify-center rounded bg-muted/60 flex-shrink-0 overflow-hidden">
                      {(f.kind === "image" || f.kind === "video") ? (
                        <ThumbnailImage path={f.path} kind={f.kind} className="h-6 w-6" size={48} showVideoBadge={false} />
                      ) : (
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{f.name}</div>
                      <div className="text-[10px] text-muted-foreground">{formatBytes(f.size)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </SidebarSection>
          )}

          {/* Empty-state hint when no recents yet */}
          {recents.length === 0 && favorites.length === 0 && (
            <div className="px-3 py-2 text-[10px] text-muted-foreground italic flex items-center gap-1.5">
              <AlertCircle className="h-3 w-3" />
              {isNative()
                ? "Open files to see them here."
                : "Open files to see them here. (Web preview)"}
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t px-3 py-2 text-[10px] text-muted-foreground text-center">
        {t("appTagline")}
      </div>
    </div>
  );

  // Pinned sidebar: part of layout (desktop only, ≥1024px)
  if (isPinned) {
    return (
      <aside className="hidden lg:flex w-64 flex-shrink-0 border-r bg-sidebar/50">
        {sidebarContent}
      </aside>
    );
  }

  // Drawer overlay (mobile/tablet) — id="ff-drawer" is used by the gesture hook
  // to detect touches inside the drawer (for swipe-out-to-close).
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        role="button"
        tabIndex={-1}
        aria-label="Close sidebar"
        onClick={() => store.toggleSidebar()}
      />
      <aside
        id="ff-drawer"
        className={cn("absolute top-0 bottom-0 w-72 max-w-[85vw] bg-background shadow-xl", "rtl:right-0 rtl:border-l ltr:left-0 ltr:border-r", store.sidebarOpen && "animate-in")}
      >
        {sidebarContent}
      </aside>
    </div>
  );
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function SidebarItem({
  icon: Icon, label, active, badge, onClick, disabled,
}: {
  icon: typeof Star;
  label: string;
  active?: boolean;
  badge?: number;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2.5 w-full px-3 py-2 sm:py-1.5 rounded-md text-sm transition-colors text-left min-h-[40px]",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : disabled
            ? "opacity-50 cursor-not-allowed hover:bg-transparent"
            : "hover:bg-accent/60 text-foreground/80"
      )}
    >
      <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-orange-500" : "text-muted-foreground")} />
      <span className="flex-1 truncate">{label}</span>
      {badge !== undefined && (
        <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
          {badge}
        </span>
      )}
    </button>
  );
}
