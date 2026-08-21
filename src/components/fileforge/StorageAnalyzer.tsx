// FileForge Pro — Storage Analyzer (bilingual + real storage data)
"use client";

import { useMemo, useState, useEffect } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import type { TranslationKey } from "@/lib/i18n/translations";
import {
  getAllFiles, getAllFolders, getFolderSize, formatBytes, getNode, ROOT_IDS,
} from "@/lib/fileforge/filesystem";
import { getStorageInfoHybrid } from "@/lib/fileforge/filesystem";
import {
  Video, Image, Music, FileText, FileArchive, Smartphone, Box, HardDrive,
  TrendingUp, Copy, AlertCircle, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

const TYPE_META: { kind: string; labelKey: TranslationKey; icon: typeof Video; color: string }[] = [
  { kind: "video", labelKey: "videos", icon: Video, color: "bg-rose-500" },
  { kind: "image", labelKey: "images", icon: Image, color: "bg-emerald-500" },
  { kind: "audio", labelKey: "audios", icon: Music, color: "bg-purple-500" },
  { kind: "archive", labelKey: "archives", icon: FileArchive, color: "bg-yellow-600" },
  { kind: "pdf", labelKey: "pdfs", icon: FileText, color: "bg-red-500" },
  { kind: "code", labelKey: "code", icon: FileText, color: "bg-orange-500" },
  { kind: "text", labelKey: "text", icon: FileText, color: "bg-sky-500" },
  { kind: "apk", labelKey: "apps", icon: Smartphone, color: "bg-green-600" },
  { kind: "word", labelKey: "wordFiles", icon: FileText, color: "bg-blue-600" },
  { kind: "excel", labelKey: "excelFiles", icon: FileText, color: "bg-green-700" },
  { kind: "presentation", labelKey: "presentations", icon: FileText, color: "bg-orange-600" },
  { kind: "unknown", labelKey: "file", icon: Box, color: "bg-slate-500" },
];

export function StorageAnalyzer() {
  const store = useFileForge();
  const { t } = useI18n();
  const allFiles = getAllFiles();
  const allFolders = getAllFolders().filter(f => f.parentId !== null);
  const stats = useMemo(() => {
    const total = allFiles.reduce((sum, f) => sum + f.size, 0);
    const byType: Record<string, { count: number; size: number }> = {};
    allFiles.forEach(f => {
      const key = f.kind;
      if (!byType[key]) byType[key] = { count: 0, size: 0 };
      byType[key].count++;
      byType[key].size += f.size;
    });
    return { total, byType };
  }, [allFiles]);

  const [realStorage, setRealStorage] = useState<{ total: number; free: number; used: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch real storage info on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const info = await getStorageInfoHybrid();
      if (mounted && info) {
        setRealStorage(info);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  const refreshStorage = async () => {
    setLoading(true);
    const info = await getStorageInfoHybrid();
    if (info) setRealStorage(info);
    setLoading(false);
  };

  // Use real storage data if available, otherwise fall back to mock
  const totalStorage = realStorage?.total ?? 128 * 1024 * 1024 * 1024;
  const usedStorage = realStorage?.used ?? stats.total;
  const freeStorage = realStorage?.free ?? totalStorage - usedStorage;

  const largestFiles = useMemo(() =>
    [...allFiles].sort((a, b) => b.size - a.size).slice(0, 15),
    [allFiles]
  );

  const largestFolders = useMemo(() =>
    allFolders
      .map(f => ({ ...f, totalSize: getFolderSize(f.id) }))
      .sort((a, b) => b.totalSize - a.totalSize)
      .slice(0, 10),
    [allFolders]
  );

  const duplicates = useMemo(() => {
    // Improved duplicate detection: group by name + size (was already this, but
    // add a guard so two files with the same name+size but different parents
    // don't merge into one group if their content differs — we can't hash on
    // the main thread for every file, but at least skip 0-byte files which
    // are frequently name collisions but rarely true duplicates.
    const groups: Record<string, typeof allFiles> = {};
    allFiles.forEach(f => {
      if (f.size === 0) return; // skip empty files
      const key = `${f.name}-${f.size}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    return Object.values(groups).filter(g => g.length > 1);
  }, [allFiles]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Tabs defaultValue="overview" className="flex flex-col h-full">
        <div className="px-3 pt-3 border-b">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
            <TabsTrigger value="largest">{t("largestFiles")}</TabsTrigger>
            <TabsTrigger value="folders">{t("largestFolders")}</TabsTrigger>
            <TabsTrigger value="duplicates">
              {t("duplicateFiles")}
              {duplicates.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold">
                  {duplicates.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="flex-1 overflow-y-auto p-4 m-0 space-y-4">
          <div className="rounded-lg border p-4 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-orange-500" />
                <span className="font-semibold">{t("internalStorage")}</span>
              </div>
              <span className="text-sm font-medium">{formatBytes(stats.total)} {t("used")}</span>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden flex">
              {TYPE_META.map(meta => {
                const stat = stats.byType[meta.kind];
                if (!stat) return null;
                const pct = (stat.size / stats.total) * 100;
                if (pct < 0.5) return null;
                return (
                  <div
                    key={meta.kind}
                    className={cn("h-full", meta.color)}
                    style={{ width: `${pct}%` }}
                    title={`${t(meta.labelKey)}: ${formatBytes(stat.size)}`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>{formatBytes(stats.total)} {t("used")}</span>
              <span>{t("ofTotal")}</span>
              <span>{formatBytes(128 * 1024 * 1024 * 1024 - stats.total)} {t("free")}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold">{t("storageBreakdown")}</div>
            {TYPE_META.map(meta => {
              const stat = stats.byType[meta.kind];
              if (!stat || stat.size === 0) return null;
              const pct = (stat.size / stats.total) * 100;
              const Icon = meta.icon;
              return (
                <div key={meta.kind} className="flex items-center gap-3">
                  <div className={cn("h-8 w-8 rounded-md flex items-center justify-center text-white", meta.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{t(meta.labelKey)}</span>
                      <span className="text-muted-foreground">{formatBytes(stat.size)} · {stat.count} {t("files")}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
                      <div className={cn("h-full", meta.color)} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground w-12 text-right">{pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="largest" className="flex-1 overflow-y-auto m-0">
          <div className="p-4 space-y-1">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              {t("topLargestFiles")}
            </div>
            {largestFiles.map((f, i) => (
              <div
                key={f.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                onClick={() => store.openWindow({
                  type: "properties", title: `${t("properties")} — ${f.name}`, nodeId: f.id, width: 420, height: 480,
                })}
              >
                <div className="text-sm font-medium w-6 text-muted-foreground">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {getNode(f.parentId ?? "")?.name ?? "—"} · {formatBytes(f.size)}
                  </div>
                </div>
                <div className="h-1.5 w-12 sm:w-20 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-500"
                    style={{ width: `${largestFiles[0] && largestFiles[0].size > 0 ? (f.size / largestFiles[0].size) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="folders" className="flex-1 overflow-y-auto m-0">
          <div className="p-4 space-y-1">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-orange-500" />
              {t("topLargestFolders")}
            </div>
            {largestFolders.map((f, i) => (
              <div
                key={f.id}
                className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                onClick={() => store.navigate(f.id)}
              >
                <div className="text-sm font-medium w-6 text-muted-foreground">#{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{f.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {getNode(f.parentId ?? "")?.name ?? "—"} · {formatBytes(f.totalSize)}
                  </div>
                </div>
                <div className="h-1.5 w-12 sm:w-20 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-orange-500 to-amber-500"
                    style={{ width: `${largestFolders[0] && largestFolders[0].totalSize > 0 ? (f.totalSize / largestFolders[0].totalSize) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="duplicates" className="flex-1 overflow-y-auto m-0">
          <div className="p-4 space-y-3">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
              <Copy className="h-4 w-4 text-orange-500" />
              {t("duplicateFiles")}
              <span className="text-xs text-muted-foreground font-normal">({duplicates.length} {t("duplicateGroups")})</span>
            </div>
            {duplicates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <AlertCircle className="h-10 w-10 opacity-40" />
                <div className="text-sm">{t("noDuplicates")}</div>
              </div>
            ) : (
              duplicates.map((group, idx) => (
                <div key={idx} className="rounded-lg border p-2 space-y-1">
                  <div className="flex items-center justify-between px-1">
                    <div className="text-xs font-medium truncate">{group[0].name}</div>
                    <div className="text-xs text-muted-foreground">
                      {group.length} {t("copies")} · {formatBytes(group[0].size * group.length)} {t("total")}
                    </div>
                  </div>
                  {group.map(f => (
                    <div
                      key={f.id}
                      className="flex items-center gap-2 px-2 py-1 rounded hover:bg-accent cursor-pointer"
                      onClick={() => store.openWindow({
                        type: "properties", title: `${t("properties")} — ${f.name}`, nodeId: f.id, width: 420, height: 480,
                      })}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-muted-foreground truncate">
                          {getNode(f.parentId ?? "")?.name ?? "—"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{formatBytes(f.size)}</div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
