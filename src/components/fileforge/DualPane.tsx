// FileForge Pro — Dual Pane mode (bilingual + drop indicators)
"use client";

import { useState } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { FileBrowser } from "./FileBrowser";
import { Columns2, X, ArrowRight, ArrowLeft, Maximize2, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNode, getPathSegments, ROOT_IDS } from "@/lib/fileforge/filesystem";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function DualPane() {
  const store = useFileForge();
  const { t, lang } = useI18n();
  const [rightPath, setRightPath] = useState<string>(ROOT_IDS.sdCard);
  const [leftDragOver, setLeftDragOver] = useState(false);
  const [rightDragOver, setRightDragOver] = useState(false);

  if (!store.dualPane) return null;

  const handleDrop = (e: React.DragEvent, targetPath: string, isShift: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setLeftDragOver(false);
    setRightDragOver(false);
    const id = e.dataTransfer.getData("text/fileforge-id");
    if (id) {
      const node = getNode(id);
      if (node) {
        if (isShift) store.moveNode(id, targetPath);
        else store.copyNode(id, targetPath);
      }
    }
  };

  // On mobile (md:hidden), show only the main pane
  return (
    <>
      {/* Mobile: just show main FileBrowser (dual pane hidden on mobile) */}
      <div className="flex-1 flex min-h-0 md:hidden">
        <FileBrowser path={store.currentPath} paneId="main" />
      </div>

      {/* Desktop: full dual pane */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Left pane */}
        <div
          className={cn(
            "flex-1 flex flex-col min-w-0 border-r transition-colors",
            leftDragOver && "bg-orange-500/5 ring-2 ring-inset ring-orange-500/40"
          )}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setLeftDragOver(true); }}
          onDragLeave={() => setLeftDragOver(false)}
          onDrop={(e) => handleDrop(e, store.currentPath, e.shiftKey)}
        >
          <PaneHeader
            label={t("left")}
            path={store.currentPath}
            onNavigate={(p) => store.navigate(p)}
            isDropTarget={leftDragOver}
          />
          <FileBrowser path={store.currentPath} paneId="main" />
        </div>

        {/* Center controls */}
        <div className="flex items-center justify-center w-10 bg-muted/30 border-x">
          <div className="flex flex-col gap-1">
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => {
                const tmp = store.currentPath;
                store.navigate(rightPath);
                setRightPath(tmp);
              }}
              title={t("swapPanes")}
            >
              <Columns2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => setRightPath(store.currentPath)}
              title={t("copyPathRight")}
            >
              {lang === "ar" ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => store.navigate(rightPath)}
              title={t("copyPathLeft")}
            >
              {lang === "ar" ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Right pane */}
        <div
          className={cn(
            "flex-1 flex flex-col min-w-0 transition-colors",
            rightDragOver && "bg-orange-500/5 ring-2 ring-inset ring-orange-500/40"
          )}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setRightDragOver(true); }}
          onDragLeave={() => setRightDragOver(false)}
          onDrop={(e) => handleDrop(e, rightPath, e.shiftKey)}
        >
          <PaneHeader
            label={t("right")}
            path={rightPath}
            onNavigate={setRightPath}
            onClose={() => store.toggleDualPane()}
            isDropTarget={rightDragOver}
          />
          <FileBrowser path={rightPath} paneId="dual" />
        </div>
      </div>
    </>
  );
}

function PaneHeader({
  label, path, onNavigate, onClose, isDropTarget,
}: {
  label: string;
  path: string;
  onNavigate: (p: string) => void;
  onClose?: () => void;
  isDropTarget?: boolean;
}) {
  const store = useFileForge();
  const { t } = useI18n();
  const segments = getPathSegments(path);

  return (
    <div className={cn(
      "flex items-center gap-1 px-2 h-8 border-b bg-muted/30 flex-shrink-0 transition-colors",
      isDropTarget && "bg-orange-500/10"
    )}>
      <span className="text-[10px] font-medium uppercase text-muted-foreground px-1">{label}</span>
      {isDropTarget && (
        <span className="text-[10px] font-medium text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded bg-orange-500/15">
          {t("dropHere")}
        </span>
      )}
      <div className="flex-1 overflow-x-auto scrollbar-thin">
        <div className="flex items-center text-[11px] whitespace-nowrap">
          {segments.map((s, i) => (
            <span key={s.path} className="flex items-center">
              <button
                className={cn(
                  "px-1.5 py-0.5 rounded hover:bg-accent",
                  i === segments.length - 1 && "font-medium"
                )}
                onClick={() => onNavigate(s.path)}
              >
                {s.name}
              </button>
              {i < segments.length - 1 && <span className="text-muted-foreground">/</span>}
            </span>
          ))}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Maximize2 className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => onNavigate(ROOT_IDS.internal)}>{t("internalStorage")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate(ROOT_IDS.sdCard)}>{t("sdCard")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate(ROOT_IDS.usb)}>{t("usbStorage")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate(ROOT_IDS.ftp)}>{t("ftp")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate(ROOT_IDS.smb)}>{t("smb")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNavigate(ROOT_IDS.cloud)}>{t("cloudStorage")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost" size="icon" className="h-6 w-6"
        onClick={() => {
          const name = prompt(t("folderName"), t("newFolderDefault"));
          if (name) store.createFolder(path, name);
        }}
        title={t("newFolderHere")}
      >
        <FolderPlus className="h-3 w-3" />
      </Button>
      {onClose && (
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
