// FileForge Pro — Bottom Status Bar (bilingual)
"use client";

import { useEffect, useState } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { getChildren, getNode, formatBytes, getStorageInfoHybrid } from "@/lib/fileforge/filesystem";
import { useFolderCount } from "@/lib/fileforge/use-folder-count";
import {
  Folder, FileText, CheckCircle2, Columns2, Layers, HardDrive, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function StatusBar() {
  const store = useFileForge();
  const { t } = useI18n();
  const node = getNode(store.currentPath);
  const children = getChildren(store.currentPath);
  const folders = children.filter(c => c.kind === "folder").length;
  const files = children.filter(c => c.kind !== "folder").length;
  const selectedCount = store.selectedIds.size;

  // Use async folder summary instead of synchronous recursive walk
  const { count: folderItemCount, loading: folderLoading } = useFolderCount(store.currentPath);

  // Real storage total from the hybrid provider
  const [realTotal, setRealTotal] = useState<number>(128 * 1024 * 1024 * 1024);
  const [realUsed, setRealUsed] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    getStorageInfoHybrid().then((info) => {
      if (!cancelled && info && info.total > 0) {
        setRealTotal(info.total);
        setRealUsed(info.used);
      }
    }).catch(() => { /* leave as default */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="hidden sm:flex items-center gap-3 px-3 h-6 border-t bg-muted/30 text-[11px] text-muted-foreground flex-shrink-0 select-none">
      {/* Items count */}
      <div className="flex items-center gap-1.5">
        <Folder className="h-3 w-3" />
        <span>{folders} {t("folders")}</span>
        <span className="opacity-50">·</span>
        <FileText className="h-3 w-3" />
        <span>{files} {t("files")}</span>
      </div>

      <div className="h-3 w-px bg-border" />

      {/* Selection */}
      {selectedCount > 0 ? (
        <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400">
          <CheckCircle2 className="h-3 w-3" />
          <span className="font-medium">{selectedCount} {t("selected")}</span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span>{t("size")}: {folderLoading ? "…" : formatBytes(node?.kind === "folder" ? folderItemCount : node?.size ?? 0)}</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Mode indicators */}
      <div className="flex items-center gap-1.5">
        {store.dualPane && (
          <>
            <Columns2 className="h-3 w-3 text-emerald-500" />
            <span className="hidden md:inline">{t("toggleDualPane")}</span>
          </>
        )}
      </div>

      {store.windows.length > 0 && (
        <>
          <div className="h-3 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <Layers className="h-3 w-3 text-violet-500" />
            <span className="hidden md:inline">{store.windows.length} {t("windowsCount")}</span>
          </div>
        </>
      )}

      <div className="h-3 w-px bg-border" />

      {/* Storage */}
      <div className="flex items-center gap-1.5">
        <HardDrive className="h-3 w-3" />
        <span>{formatBytes(realUsed ?? 0)} / {formatBytes(realTotal)}</span>
      </div>

      <div className="h-3 w-px bg-border" />
      <div className="flex items-center gap-1.5">
        <Star className="h-3 w-3 text-yellow-500" />
      </div>
    </div>
  );
}
