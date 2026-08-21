// FileForge Pro — Search panel (bilingual + live search)
"use client";

import { useEffect, useState } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import type { TranslationKey } from "@/lib/i18n/translations";
import { getNode, formatBytes, formatDate, detectKind } from "@/lib/fileforge/filesystem";
import { nativeFileSystem, isNative } from "@/lib/fileforge/native-bridge";
import type { FileNode } from "@/lib/fileforge/types";
import { getFileIcon } from "./FileIcons";
import { ThumbnailImage } from "./ThumbnailImage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";

const TYPE_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: "all", labelKey: "allTypes" },
  { value: "image", labelKey: "images" },
  { value: "video", labelKey: "videos" },
  { value: "audio", labelKey: "audios" },
  { value: "pdf", labelKey: "pdfs" },
  { value: "text", labelKey: "text" },
  { value: "code", labelKey: "code" },
  { value: "archive", labelKey: "archives" },
  { value: "apk", labelKey: "apps" },
  { value: "word", labelKey: "wordFiles" },
  { value: "excel", labelKey: "excelFiles" },
  { value: "presentation", labelKey: "presentations" },
];

const SIZE_OPTIONS = [
  { value: "any", labelKey: "anySize" as TranslationKey, min: 0, max: Infinity },
  { value: "tiny", labelKey: "sizeTiny" as TranslationKey, min: 0, max: 1024 * 1024 },
  { value: "small", labelKey: "sizeSmall" as TranslationKey, min: 1024 * 1024, max: 100 * 1024 * 1024 },
  { value: "medium", labelKey: "sizeMedium" as TranslationKey, min: 100 * 1024 * 1024, max: 1024 * 1024 * 1024 },
  { value: "large", labelKey: "sizeLarge" as TranslationKey, min: 1024 * 1024 * 1024, max: Infinity },
];

const DATE_OPTIONS = [
  { value: "any", labelKey: "anyTime" as TranslationKey, ms: 0 },
  { value: "today", labelKey: "pastToday" as TranslationKey, ms: 86400000 },
  { value: "week", labelKey: "pastWeek" as TranslationKey, ms: 7 * 86400000 },
  { value: "month", labelKey: "pastMonth" as TranslationKey, ms: 30 * 86400000 },
  { value: "year", labelKey: "pastYear" as TranslationKey, ms: 365 * 86400000 },
];

export function SearchPanel() {
  const store = useFileForge();
  const { t } = useI18n();
  // Local input state for the search field — debounced so we don't recompute
  // results on every keystroke (was synchronous on every change). The store
  // is updated once the debounced value settles.
  const storeQuery = useFileForge((s) => s.searchQuery);
  const [query, setQuery] = useState(storeQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(storeQuery);
  const [type, setType] = useState("all");
  const [sizeRange, setSizeRange] = useState("any");
  const [dateRange, setDateRange] = useState("any");
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [searchError, setSearchError] = useState(false);

  // Debounce text input: update both the local debounced value (used to
  // filter results) and the store's searchQuery (so other components that
  // read it stay in sync). 200ms matches typical typing-cadence debounce.
  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(query);
      store.setSearchQuery(query);
    }, 200);
    return () => clearTimeout(handle);
  }, [query, store]);

  // Live search — uses native searchFiles on Android, mock on web.
  // Async results are stored in local state to avoid blocking render.
  const [searchResults, setSearchResults] = useState<FileNode[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q) {
      queueMicrotask(() => { setSearchResults([]); setSearchTruncated(false); setSearchError(false); });
      return;
    }
    let cancelled = false;
    const searchId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    queueMicrotask(() => { setSearching(true); setSearchError(false); });
    (async () => {
      try {
        // Use native search on Android; web falls back to mock.
        const searchPath = isNative()
          ? (store.currentPath.startsWith("/") || store.currentPath.startsWith("content://")
              ? store.currentPath
              : store.currentPath === "sd-card" ? "sd-card"
              : store.currentPath === "usb-storage" ? "usb-storage"
              : "/storage/emulated/0")
          : store.currentPath;
        const sizeOpt = SIZE_OPTIONS.find(s => s.value === sizeRange)!;
        const dateOpt = DATE_OPTIONS.find(d => d.value === dateRange)!;
        const now = Date.now();
        const searchResult = await nativeFileSystem.searchFiles(searchPath, q, {
          searchId,
          kind: type,
          minSize: sizeOpt.min,
          maxSize: Number.isFinite(sizeOpt.max) ? sizeOpt.max : Number.MAX_SAFE_INTEGER,
          modifiedAfter: dateOpt.ms > 0 ? now - dateOpt.ms : 0,
          modifiedBefore: Number.MAX_SAFE_INTEGER,
          includeHidden: false,
          includeDirectories: true,
          recursive: true,
          maxResults: 500,
        });
        if (cancelled) return;
        let rawResults = searchResult.results;
        // Some Android WebView/plugin combinations can return an empty native
        // result for a Unicode query even though the directory is readable.
        // Keep search functional by falling back to the mirrored filesystem
        // when that happens; the native search remains the primary recursive path.
        if (rawResults.length === 0) {
          const { getAllFiles } = await import("@/lib/fileforge/filesystem");
          const normalizedQuery = q.toLocaleLowerCase();
          rawResults = getAllFiles()
            .filter(n => n.name.toLocaleLowerCase().includes(normalizedQuery))
            .filter(n => type === "all" || n.kind === type)
            .filter(n => n.size >= sizeOpt.min && n.size <= sizeOpt.max)
            .filter(n => dateOpt.ms === 0 || n.modified >= now - dateOpt.ms)
            .map(n => ({ name: n.name, path: n.id, isDirectory: n.kind === "folder", size: n.size, lastModified: n.modified, mimeType: "" }))
            .slice(0, 500);
        }
        setSearchTruncated(searchResult.truncated);
        // Native performs the expensive recursive traversal and filtering.
        // JavaScript only maps the bounded result set to presentation models.
        const nodes: FileNode[] = rawResults.map(r => ({
          id: r.path,
          name: r.name,
          kind: r.isDirectory ? "folder" : detectKind(r.name),
          size: r.size,
          modified: r.lastModified,
          parentId: r.path.substring(0, r.path.lastIndexOf("/")) || null,
        }));
        if (!cancelled) {
          setSearchResults(nodes);
          setSearchError(false);
          setSearching(false);
        }
      } catch (e) {
        if (!cancelled) {
          setSearchResults([]);
          setSearchTruncated(false);
          setSearchError(true);
          setSearching(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (isNative()) void nativeFileSystem.cancelSearch(searchId);
    };
  }, [debouncedQuery, type, sizeRange, dateRange, store.currentPath]);

  // Use searchResults from async search
  const results = searchResults;

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-3 border-b space-y-2 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            dir="auto"
            lang="ar"
            inputMode="search"
            autoComplete="off"
            placeholder={t("searchFiles")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="pl-9 text-start"
          />
        </div>
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sizeRange} onValueChange={setSizeRange}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZE_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{t(s.labelKey)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_OPTIONS.map(d => <SelectItem key={d.value} value={d.value}>{t(d.labelKey)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant="secondary" className="h-8 px-2 text-xs">
            {results.length}{searchTruncated ? "+" : ""} {t("searchResults")}
          </Badge>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-8">
            <Search className="h-12 w-12 opacity-30" />
            <div className="text-sm">{searchError ? t("searchFailed") : t("noResults")}</div>
            <div className="text-xs">{searchError ? t("tryAdjusting") : t("tryAdjusting")}</div>
          </div>
        ) : (
          <div className="divide-y">
            {results.map(n => (
              <div
                key={n.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer"
                onClick={() => {
                  const kind = n.kind;
                  if (kind === "folder") {
                    store.navigate(n.id);
                  } else if (kind === "text" || kind === "code" || kind === "html") {
                    store.openWindow({ type: "text-editor", title: n.name, nodeId: n.id, width: 820, height: 580 });
                  } else if (kind === "image") {
                    store.openWindow({ type: "image-preview", title: n.name, nodeId: n.id, width: 720, height: 560 });
                  } else if (kind === "video") {
                    store.openWindow({ type: "video-preview", title: n.name, nodeId: n.id, width: 800, height: 560 });
                  } else if (kind === "audio") {
                    store.openWindow({ type: "audio-preview", title: n.name, nodeId: n.id, width: 480, height: 320 });
                  } else if (kind === "pdf") {
                    store.openWindow({ type: "pdf-preview", title: n.name, nodeId: n.id, width: 720, height: 600, maximized: true });
                  } else if (kind === "archive") {
                    store.openWindow({ type: "archive-preview", title: n.name, nodeId: n.id, width: 720, height: 560 });
                  } else {
                    store.openWindow({ type: "properties", title: `${t("properties")} — ${n.name}`, nodeId: n.id, width: 420, height: 480 });
                  }
                }}
              >
                <div className="flex-shrink-0">
                  {(n.kind === "image" || n.kind === "video") ? (
                    <ThumbnailImage path={n.id} kind={n.kind} className="h-8 w-8 rounded" lastModified={n.modified} fileSize={n.size} showVideoBadge={n.kind === "video"} />
                  ) : getFileIcon(n.kind, "h-8 w-8")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{n.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {(n.parentId ? getNode(n.parentId)?.name : undefined) ?? "—"} · {formatDate(n.modified)}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground flex-shrink-0">{formatBytes(n.size)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
