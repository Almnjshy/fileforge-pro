// FileForge Pro — Properties panel (bilingual)
// Uses async fileRepository for real folder counts/sizes on native.
// No more synchronous getFolderSize/countItems recursive walks.

"use client";

import { useState, useEffect } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { getNode } from "@/lib/fileforge/filesystem";
import { getPathSegments, formatBytes, formatDate, getFileTypeLabel } from "@/lib/fileforge/file-utils";
import { getExt } from "@/lib/fileforge/filesystem";
import { fileRepository } from "@/lib/fileforge/file-repository";
import { isNative } from "@/lib/fileforge/native-bridge";
import {
  Folder, FileText, Calendar, HardDrive, Hash, Box, Star, Package, Loader2,
} from "lucide-react";
import { getFileIconLarge } from "./FileIcons";

export function PropertiesPanel({ nodeId }: { nodeId: string }) {
  const store = useFileForge();
  const { t } = useI18n();
  const node = getNode(nodeId);
  const [folderSummary, setFolderSummary] = useState<{ fileCount: number; folderCount: number; totalSize: number } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    if (!node || node.kind !== "folder") return;
    queueMicrotask(() => setLoadingSummary(true));
    let cancelled = false;
    fileRepository.getFolderSummary(nodeId).then(summary => {
      if (!cancelled) {
        setFolderSummary({
          fileCount: summary.fileCount,
          folderCount: summary.folderCount,
          totalSize: summary.totalSize,
        });
        setLoadingSummary(false);
      }
    }).catch(() => {
      if (!cancelled) setLoadingSummary(false);
    });
    return () => { cancelled = true; };
  }, [nodeId, node?.kind]);

  if (!node) return <div className="p-4">{t("fileNotFound")}</div>;

  const path = getPathSegments(nodeId).map(s => s.name).join(" / ");
  const isFolder = node.kind === "folder";
  const ext = getExt(node.name);
  const fileSize = isFolder ? (folderSummary?.totalSize ?? 0) : node.size;
  const itemCount = isFolder ? (folderSummary ? folderSummary.fileCount + folderSummary.folderCount : null) : null;

  return (
    <div className="flex flex-col h-full overflow-y-auto p-5 gap-5">
      <div className="flex flex-col items-center text-center gap-3 pb-4 border-b">
        <div className="h-20 w-20 rounded-xl bg-muted/40 flex items-center justify-center">
          {getFileIconLarge(node.kind, "h-14 w-14")}
        </div>
        <div>
          <div className="font-semibold text-lg">{node.name}</div>
          <div className="text-sm text-muted-foreground">{getFileTypeLabel(node.kind, node.name)}</div>
        </div>
      </div>

      <div className="space-y-3">
        <PropertyRow icon={HardDrive} label={t("size" as any)} value={
          isFolder && loadingSummary ? "…" : formatBytes(fileSize)
        } />
        {isFolder && itemCount !== null && (
          <PropertyRow icon={Box} label={t("items" as any)} value={`${itemCount}`} />
        )}
        <PropertyRow icon={Calendar} label={t("modified" as any)} value={formatDate(node.modified)} />
        {ext && <PropertyRow icon={Hash} label={t("extension" as any)} value={`.${ext}`} />}
        <PropertyRow icon={FileText} label={t("path" as any)} value={path} />
        <PropertyRow icon={Star} label={t("starred" as any)} value={node.starred ? "★" : "—"} />
      </div>
    </div>
  );
}

function PropertyRow({ icon: Icon, label, value }: { icon: typeof Folder; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-accent/40">
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-sm text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-sm font-medium ml-auto truncate text-right">{value}</span>
    </div>
  );
}
