// FileForge Pro — Selection toolbar (bilingual + batch ops + clipboard)
"use client";

import { useState } from "react";
import {
  Copy, Scissors, Share2, Trash2, MoreVertical, Pencil, Archive, Star,
  Info, X,
} from "lucide-react";
import { useFileForge } from "@/store/fileforge-store";
import { nativeFileSystem, isNative } from "@/lib/fileforge/native-bridge";
import { useI18n } from "@/lib/i18n/i18n-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { runBatchOperation } from "@/lib/fileforge/batch-ops";
import { getThumbnail } from "@/lib/fileforge/real-fs";
import { getNode } from "@/lib/fileforge/filesystem";
import { CompressionDialog } from "./CompressionDialog";

async function buildFileObjectsForShare(ids: string[]): Promise<File[]> {
  const files: File[] = [];

  for (const id of ids) {
    const node = getNode(id);
    if (!node) continue;

    const thumb = getThumbnail(id);

    if (thumb && thumb.startsWith("data:")) {
      // Convert data URL to File object
      try {
        const res = await fetch(thumb);
        const blob = await res.blob();

        files.push(
          new File(
            [blob],
            node.name,
            { type: blob.type || "application/octet-stream" }
          )
        );

        continue;
      } catch {
        // Fall through to text share
      }
    }

    if (node.content) {
      files.push(
        new File(
          [node.content],
          node.name,
          { type: "text/plain" }
        )
      );
    }
  }

  return files;
}

export function SelectionToolbar() {
  const store = useFileForge();
  const { t } = useI18n();

  const [compressionOpen, setCompressionOpen] = useState(false);

  const count = store.selectedIds.size;

  if (count === 0) return null;

  const ids = Array.from(store.selectedIds);

  const handleBatchDelete = async () => {
    if (!confirm(t("deleteConfirmMulti", { count }))) return;

    store.setBatchProgress({
      total: count,
      completed: 0,
      current: "",
      cancelled: false,
    });

    await runBatchOperation(
      ids,
      async (id) => {
        store.deleteNodes([id]);
      },
      (p) => store.setBatchProgress(p),
      () => store.batchProgress?.cancelled ?? false
    );

    store.clearSelection();
  };

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 animate-in slide-in-from-bottom-4 max-w-[calc(100vw-2rem)]">
      <div className="flex items-center gap-1 rounded-xl border bg-popover/95 backdrop-blur shadow-2xl px-2 py-1.5">

        <div className="px-2 sm:px-3 py-1 text-xs sm:text-sm font-medium whitespace-nowrap">
          <span className="text-orange-500">{count}</span>{" "}
          {t("itemsSelected")}
        </div>

        <div className="h-5 w-px bg-border mx-1" />

        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 sm:w-auto sm:gap-1.5 px-0 sm:px-3"
          onClick={() => store.copyToClipboard(ids, "copy")}
        >
          <Copy className="h-4 w-4" />
          <span className="hidden sm:inline">{t("copy")}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 sm:w-auto sm:gap-1.5 px-0 sm:px-3"
          onClick={() => store.copyToClipboard(ids, "cut")}
        >
          <Scissors className="h-4 w-4" />
          <span className="hidden sm:inline">{t("move")}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 sm:w-auto sm:gap-1.5 px-0 sm:px-3"
          onClick={async () => {
            try {
              if (isNative()) {
                const result = await nativeFileSystem.shareFiles(ids);

                if (!result.success && result.error) {
                  store.addToast(result.error, "error");
                }

                return;
              }

              // Browser path: construct File objects for Web Share API.
              const fileObjects = await buildFileObjectsForShare(ids);

              if (navigator.share) {
                if (
                  fileObjects.length > 0 &&
                  navigator.canShare &&
                  navigator.canShare({ files: fileObjects })
                ) {
                  await navigator.share({
                    title: "Files",
                    text: `${count} files`,
                    files: fileObjects,
                  });
                } else {
                  await navigator.share({
                    title: "Files",
                    text:
                      fileObjects.length > 0
                        ? fileObjects.map((f) => f.name).join(", ")
                        : `${count} files`,
                  });
                }
              } else if (fileObjects.length > 0) {
                // Fallback: trigger downloads for each file
                fileObjects.forEach((f) => {
                  const url = URL.createObjectURL(f);
                  const a = document.createElement("a");

                  a.href = url;
                  a.download = f.name;

                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);

                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                });
              } else {
                store.addToast(t("sharing"), "info");
              }
            } catch {
              // User cancelled share — no action needed.
            }
          }}
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">{t("share")}</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 sm:w-auto sm:gap-1.5 px-0 sm:px-3 text-destructive hover:text-destructive"
          onClick={handleBatchDelete}
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">{t("delete")}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 sm:w-auto sm:gap-1.5 px-0 sm:px-3"
            >
              <MoreVertical className="h-4 w-4" />
              <span className="hidden sm:inline">{t("more")}</span>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">

            <DropdownMenuItem
              onClick={() => {
                if (count === 1) {
                  const newName = prompt(
                    t("renameTo"),
                    getNode(ids[0])?.name ?? ""
                  );

                  if (newName) {
                    store.renameNode(ids[0], newName);
                  }
                } else {
                  store.addToast(t("rename"), "info");
                }
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t("rename")}
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => setCompressionOpen(true)}
            >
              <Archive className="mr-2 h-4 w-4" />
              {t("compress")}
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => ids.forEach((id) => store.toggleStar(id))}
            >
              <Star className="mr-2 h-4 w-4" />
              {t("addToFavorites")}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => {
                if (count === 1) {
                  store.openWindow({
                    type: "properties",
                    title: t("properties"),
                    nodeId: ids[0],
                    width: 420,
                    height: 480,
                  });
                } else {
                  store.addToast(
                    `${count} ${t("itemsSelected")}`,
                    "info"
                  );
                }
              }}
            >
              <Info className="mr-2 h-4 w-4" />
              {t("properties")}
            </DropdownMenuItem>

          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-5 w-px bg-border mx-1" />

        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => store.clearSelection()}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {compressionOpen && (
        <CompressionDialog
          sourceIds={ids}
          onClose={() => setCompressionOpen(false)}
        />
      )}
    </div>
  );
}