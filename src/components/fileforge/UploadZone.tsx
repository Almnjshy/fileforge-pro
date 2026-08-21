// FileForge Pro — File Upload Zone (drag & drop from OS)
"use client";

import { useState, useRef } from "react";
import { UploadCloud, X } from "lucide-react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { cn } from "@/lib/utils";

export function UploadZone({ parentId }: { parentId: string }) {
  const store = useFileForge();
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    await store.uploadFiles(arr, parentId);
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 px-2 h-7 rounded text-xs hover:bg-accent"
      >
        <UploadCloud className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("uploadFiles") || "Upload"}</span>
      </button>
    </>
  );
}

// Full-page drop overlay when dragging files from OS
export function GlobalDropZone() {
  const store = useFileForge();
  const { t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (e.dataTransfer.types.includes("Files")) {
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) setDragging(false);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setDragging(false);
        if (e.dataTransfer.files.length > 0) {
          store.uploadFiles(Array.from(e.dataTransfer.files), store.currentPath);
        }
      }}
      className="contents"
    >
      {dragging && (
        <div className="fixed inset-0 z-[400] bg-orange-500/20 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-4 border-dashed border-orange-500 rounded-3xl p-12 bg-white/90 dark:bg-black/90 shadow-2xl">
            <div className="flex flex-col items-center gap-4">
              <UploadCloud className="h-16 w-16 text-orange-500" />
              <div className="text-2xl font-bold">{t("dropFilesHere") || "Drop files here"}</div>
              <div className="text-sm text-muted-foreground">{t("dropFilesDesc") || "Files will be added to current folder"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
