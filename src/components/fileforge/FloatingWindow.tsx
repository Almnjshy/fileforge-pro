// FileForge Pro — Floating window + Window Manager (Mobile-responsive)
"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  X, Minus, Square, Copy, GripVertical, Layers, Columns2, ChevronLeft, ChevronRight, Eye, Info,
} from "lucide-react";
import { useFileForge } from "@/store/fileforge-store";
import type { FloatingWindow as FW } from "@/lib/fileforge/types";
import { cn } from "@/lib/utils";
import { TextEditor } from "./TextEditor";
import { LargeTextEditor } from "./LargeTextEditor";
import { FilePreview } from "./FilePreview";
import { PdfViewer } from "./PdfViewer";
import { PropertiesPanel } from "./PropertiesPanel";
import { ArchiveBrowser } from "./ArchiveBrowser";
import { SearchPanel } from "./SearchPanel";
import { StorageAnalyzer } from "./StorageAnalyzer";
import { SettingsPanel } from "./SettingsPanel";
import { SecureVaultPanel } from "./SecureVaultPanel";
import { AppsPanel } from "./AppsPanel";
import { CustomizationPanel } from "./CustomizationPanel";
import { WebViewer } from "./WebViewer";
import { HexViewer } from "./HexViewer";
import { FileBrowser } from "./FileBrowser";
import { getNode, getPathSegments } from "@/lib/fileforge/filesystem";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-store";
import type { ReactNode } from "react";

class WindowErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Window content failed",
    };
  }

  componentDidCatch(error: unknown) {
    console.error("FileForge floating window failed", error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center">
        <div className="max-w-md space-y-2">
          <div className="font-medium">تعذر عرض محتوى هذه النافذة</div>
          <div className="text-xs text-muted-foreground break-words">
            {this.state.message}
          </div>
          <div className="text-xs text-muted-foreground">
            يمكن إغلاق النافذة وإعادة فتح الملف دون تجميد بقية التطبيق.
          </div>
        </div>
      </div>
    );
  }
}

// Hook to detect mobile/tablet
function useViewport() {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(window.innerWidth < 768);
      setIsTablet(window.innerWidth >= 768 && window.innerWidth < 1280);
    };

    check();
    window.addEventListener("resize", check);

    return () => window.removeEventListener("resize", check);
  }, []);

  return { isMobile, isTablet };
}

export function FloatingWindow({ win }: { win: FW }) {
  const store = useFileForge();
  const { t } = useI18n();

  type DragType =
    | "move"
    | "resize-se"
    | "resize-sw"
    | "resize-ne"
    | "resize-nw"
    | "resize-e"
    | "resize-w"
    | "resize-n"
    | "resize-s";

  const drag = useRef<{
    type: DragType;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  /*
   * Keep the latest window state available to event listeners without
   * mutating a ref during render.
   */
  const latest = useRef(win);

  useEffect(() => {
    latest.current = win;
  }, [win]);

  const moveWindow = store.moveWindow;
  const resizeWindow = store.resizeWindow;
  const isActive = store.activeWindowId === win.id;

  const begin = (e: React.PointerEvent, type: DragType) => {
    if (
      win.maximized ||
      win.minimized ||
      (e.pointerType === "mouse" && e.button !== 0)
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    store.focusWindow(win.id);

    drag.current = {
      type,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: win.x,
      y: win.y,
      w: win.width,
      h: win.height,
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;

    if (!d || d.pointerId !== e.pointerId) return;

    e.preventDefault();

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    let x = d.x;
    let y = d.y;
    let w = d.w;
    let h = d.h;

    switch (d.type) {
      case "move":
        x = d.x + dx;
        y = d.y + dy;
        break;

      case "resize-se":
        w = Math.max(280, d.w + dx);
        h = Math.max(200, d.h + dy);
        break;

      case "resize-sw":
        w = Math.max(280, d.w - dx);
        h = Math.max(200, d.h + dy);
        x = d.x + d.w - w;
        break;

      case "resize-ne":
        w = Math.max(280, d.w + dx);
        h = Math.max(200, d.h - dy);
        y = d.y + d.h - h;
        break;

      case "resize-nw":
        w = Math.max(280, d.w - dx);
        h = Math.max(200, d.h - dy);
        x = d.x + d.w - w;
        y = d.y + d.h - h;
        break;

      case "resize-e":
        w = Math.max(280, d.w + dx);
        break;

      case "resize-w":
        w = Math.max(280, d.w - dx);
        x = d.x + d.w - w;
        break;

      case "resize-s":
        h = Math.max(200, d.h + dy);
        break;

      case "resize-n":
        h = Math.max(200, d.h - dy);
        y = d.y + d.h - h;
        break;
    }

    if (d.type === "move") {
      store.moveWindow(win.id, x, y);
    } else {
      store.resizeWindow(win.id, w, h, x, y);
    }
  };

  const end = (e: React.PointerEvent) => {
    if (drag.current?.pointerId === e.pointerId) {
      drag.current = null;
    }
  };

  const lostCapture = (e: React.PointerEvent) => {
    if (drag.current?.pointerId === e.pointerId) {
      drag.current = null;
    }
  };

  useEffect(() => {
    const onResize = () => {
      const w = latest.current;

      if (w.maximized || w.minimized) return;

      moveWindow(w.id, w.x, w.y);
      resizeWindow(w.id, w.width, w.height, w.x, w.y);
    };

    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [moveWindow, resizeWindow]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && store.activeWindowId === win.id) {
        drag.current = null;
      }
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [store.activeWindowId, win.id]);

  if (win.minimized) return null;

  const resize = (type: DragType, c: string, l: string) => (
    <div
      className={cn("absolute z-30", c)}
      style={{ touchAction: "none" }}
      aria-label={l}
      onPointerDown={(e) => begin(e, type)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={lostCapture}
    />
  );

  const style: React.CSSProperties = win.maximized
    ? {
        left: 0,
        top: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: win.zIndex,
      }
    : {
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: win.zIndex,
      };

  return (
    <div
      className={cn(
        "fixed flex flex-col bg-background border shadow-2xl rounded-lg overflow-hidden pointer-events-auto",
        isActive
          ? "border-orange-500/70 ring-2 ring-orange-500/20 shadow-orange-500/10"
          : "border-border"
      )}
      style={{
        ...style,
        maxWidth: win.maximized ? "100vw" : "calc(100vw - 24px)",
        maxHeight: win.maximized ? "100dvh" : "calc(100dvh - 24px)",
      }}
      onPointerDown={() => {
        if (!isActive) store.focusWindow(win.id);
      }}
      role="dialog"
      aria-label={win.title}
    >
      <div
        className="flex items-center gap-1 px-2 h-9 border-b bg-muted/40 flex-shrink-0 select-none"
        style={{
          touchAction: "none",
          cursor: win.maximized ? "default" : "move",
        }}
        onPointerDown={(e) => begin(e, "move")}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={lostCapture}
        onDoubleClick={() => store.toggleMaximizeWindow(win.id)}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

        <span className="text-xs font-medium truncate flex-1">
          {win.title}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            store.minimizeWindow(win.id);
          }}
          aria-label={t("minimize")}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            store.toggleMaximizeWindow(win.id);
          }}
          aria-label={t("maximize")}
        >
          <Square className="h-3 w-3" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 hover:bg-destructive hover:text-destructive-foreground"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            store.closeWindow(win.id);
          }}
          aria-label={t("close")}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden bg-background">
        <WindowErrorBoundary>
          <WindowContent win={win} />
        </WindowErrorBoundary>
      </div>

      {!win.maximized && (
        <>
          {resize(
            "resize-nw",
            "top-0 left-0 w-3 h-3 cursor-nwse-resize",
            "Resize northwest"
          )}
          {resize(
            "resize-ne",
            "top-0 right-0 w-3 h-3 cursor-nesw-resize",
            "Resize northeast"
          )}
          {resize(
            "resize-sw",
            "bottom-0 left-0 w-3 h-3 cursor-nesw-resize",
            "Resize southwest"
          )}
          {resize(
            "resize-se",
            "bottom-0 right-0 w-3 h-3 cursor-nwse-resize",
            "Resize southeast"
          )}
          {resize(
            "resize-n",
            "top-0 left-3 right-3 h-1 cursor-n-resize",
            "Resize north"
          )}
          {resize(
            "resize-s",
            "bottom-0 left-3 right-3 h-1 cursor-s-resize",
            "Resize south"
          )}
          {resize(
            "resize-w",
            "left-0 top-3 bottom-3 w-1 cursor-w-resize",
            "Resize west"
          )}
          {resize(
            "resize-e",
            "right-0 top-3 bottom-3 w-1 cursor-e-resize",
            "Resize east"
          )}
        </>
      )}
    </div>
  );
}

function WindowContent({ win }: { win: FW }) {
  if (win.type === "folder" && win.path) {
    return <FolderWindowContent win={win} />;
  }

  if (win.type === "text-editor" && win.nodeId) {
    const node = getNode(win.nodeId);

    if (node?.size != null && node.size > 5_000_000) {
      return <LargeTextEditor nodeId={win.nodeId} winId={win.id} />;
    }

    return <TextEditor nodeId={win.nodeId} winId={win.id} />;
  }

  if (win.type === "image-preview" && win.nodeId) {
    return (
      <FilePreview
        nodeId={win.nodeId}
        kind="image"
        windowId={win.id}
        windowGeometry={win}
      />
    );
  }

  if (win.type === "video-preview" && win.nodeId) {
    return (
      <FilePreview
        nodeId={win.nodeId}
        kind="video"
        windowId={win.id}
        windowGeometry={win}
      />
    );
  }

  if (win.type === "audio-preview" && win.nodeId) {
    return (
      <FilePreview
        nodeId={win.nodeId}
        kind="audio"
        windowId={win.id}
        windowGeometry={win}
      />
    );
  }

  if (win.type === "pdf-preview" && win.nodeId) {
    return <PdfViewer nodeId={win.nodeId} fileName={win.title} />;
  }

  if (win.type === "archive-preview" && win.nodeId) {
    return <ArchiveBrowser nodeId={win.nodeId} />;
  }

  if (win.type === "web-preview" && win.nodeId) {
    return <WebViewer nodeId={win.nodeId} fileName={win.title} />;
  }

  if (win.type === "hex-preview" && win.nodeId) {
    return <HexViewer nodeId={win.nodeId} fileName={win.title} />;
  }

  if (win.type === "properties" && win.nodeId) {
    return <PropertiesPanel nodeId={win.nodeId} />;
  }

  if (win.type === "search") {
    return <SearchPanel />;
  }

  if (win.type === "storage-analyzer") {
    return <StorageAnalyzer />;
  }

  if (win.type === "apps") {
    return <AppsPanel />;
  }

  if (win.type === "settings") {
    if (
      win.title.includes("Vault") ||
      win.title.includes("خزنة") ||
      win.title.includes("الخزنة")
    ) {
      return <SecureVaultPanel />;
    }

    if (win.title === "Customization") {
      return <CustomizationPanel />;
    }

    return <SettingsPanel />;
  }

  return (
    <div className="p-4 text-sm text-muted-foreground">
      Unknown window type
    </div>
  );
}

function FolderWindowContent({ win }: { win: FW }) {
  const store = useFileForge();
  const path = win.path!;
  const segments = getPathSegments(path);
  const node = getNode(path);

  const canBack = store.canGoBackInWindow(win.id);
  const canForward = store.canGoForwardInWindow(win.id);

  return (
    <div className="flex flex-col h-full">
      {/* Mini toolbar with working navigation: Back / Forward / Up + breadcrumbs */}
      <div className="flex items-center gap-1 px-2 h-8 border-b bg-muted/20 flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!canBack}
          onClick={() => store.goBackInWindow(win.id)}
          aria-label="Back"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!canForward}
          onClick={() => store.goForwardInWindow(win.id)}
          aria-label="Forward"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={!node?.parentId}
          onClick={() => {
            if (node?.parentId) {
              store.navigateInWindow(win.id, node.parentId!);
            }
          }}
          aria-label="Up"
        >
          <span className="text-xs">↑</span>
        </Button>

        <div className="flex-1 overflow-x-auto scrollbar-thin">
          <div className="flex items-center text-[11px] whitespace-nowrap px-1">
            {segments.map((s, i) => (
              <span key={s.path} className="flex items-center">
                <button
                  className={cn(
                    "px-1.5 py-0.5 rounded hover:bg-accent",
                    i === segments.length - 1 && "font-medium"
                  )}
                  onClick={() => {
                    store.navigateInWindow(win.id, s.path);
                  }}
                >
                  {s.name}
                </button>

                {i < segments.length - 1 && (
                  <span className="text-muted-foreground">/</span>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      <FileBrowser
        path={path}
        paneId="dual"
        embeddedInWindow
        windowId={win.id}
      />
    </div>
  );
}

// ============ Window Manager Bar (Professional Dock) ============
export function WindowManagerBar() {
  const store = useFileForge();
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const { isMobile } = useViewport();

  // Count minimized windows
  const minimizedCount = store.windows.filter((w) => w.minimized).length;
  const totalCount = store.windows.length;

  if (totalCount === 0) return null;

  return (
    <>
      {/* Dock button - always visible when windows exist */}
      <div
        className={cn(
          "fixed z-[200] flex items-center gap-1",
          isMobile ? "bottom-4 right-4" : "bottom-4 right-4"
        )}
      >
        {/* Quick restore minimized windows (chips) */}
        {minimizedCount > 0 && !open && (
          <div className="flex items-center gap-1 mr-1">
            {store.windows
              .filter((w) => w.minimized)
              .slice(0, 3)
              .map((w) => (
                <button
                  key={w.id}
                  onClick={() => store.focusWindow(w.id)}
                  className="h-9 px-2 rounded-lg bg-popover border shadow-md flex items-center gap-1.5 hover:bg-accent transition-colors max-w-[120px]"
                  title={w.title}
                >
                  {w.type === "folder" ? (
                    <Columns2 className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : w.type === "text-editor" ? (
                    <Copy className="h-3.5 w-3.5 flex-shrink-0" />
                  ) : (
                    <Layers className="h-3.5 w-3.5 flex-shrink-0" />
                  )}

                  <span className="text-xs truncate">{w.title}</span>
                </button>
              ))}

            {minimizedCount > 3 && (
              <button
                onClick={() => setOpen(true)}
                className="h-9 px-2 rounded-lg bg-popover border shadow-md flex items-center text-xs hover:bg-accent"
              >
                +{minimizedCount - 3}
              </button>
            )}
          </div>
        )}

        {/* Main dock button */}
        <Button
          variant="secondary"
          size="sm"
          className={cn(
            "shadow-lg gap-2 h-10 px-3",
            open && "ring-2 ring-orange-500/50"
          )}
          onClick={() => setOpen(!open)}
        >
          <Layers className="h-4 w-4" />
          <span className="font-bold text-orange-500">{totalCount}</span>
          {!isMobile && (
            <span className="text-muted-foreground text-xs">
              {t("windowsCount")}
            </span>
          )}
        </Button>
      </div>

      {/* Dock panel (expandable) */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[150]"
            onClick={() => setOpen(false)}
          />

          <div
            className={cn(
              "fixed z-[200] rounded-xl border bg-popover shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2",
              isMobile
                ? "bottom-20 right-4 left-4 max-h-[60vh]"
                : "bottom-20 right-4 w-80 max-h-[70vh]"
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-orange-500" />
                <span className="text-sm font-semibold">
                  {t("openWindows")}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({totalCount})
                </span>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    store.windows
                      .filter((w) => w.minimized)
                      .forEach((w) => store.focusWindow(w.id));
                  }}
                >
                  {lang === "ar" ? "استعادة الكل" : "Restore All"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive"
                  onClick={() => store.closeAllWindows()}
                >
                  {t("closeAll")}
                </Button>
              </div>
            </div>

            {/* Window list */}
            <div className="max-h-[50vh] overflow-y-auto p-2 space-y-1">
              {store.windows.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors group",
                    w.minimized
                      ? "bg-muted/40 hover:bg-accent opacity-70"
                      : store.activeWindowId === w.id
                      ? "bg-orange-500/10 ring-1 ring-orange-500/30"
                      : "hover:bg-accent"
                  )}
                  onClick={() => {
                    store.focusWindow(w.id);
                    setOpen(false);
                  }}
                >
                  {/* Icon */}
                  <div
                    className={cn(
                      "h-8 w-8 flex items-center justify-center rounded-lg flex-shrink-0",
                      w.minimized ? "bg-muted" : "bg-primary/10"
                    )}
                  >
                    {w.type === "folder" ? (
                      <Columns2 className="h-4 w-4" />
                    ) : w.type === "text-editor" ? (
                      <Copy className="h-4 w-4" />
                    ) : w.type === "image-preview" ? (
                      <Eye className="h-4 w-4" />
                    ) : w.type === "properties" ? (
                      <Info className="h-4 w-4" />
                    ) : (
                      <Layers className="h-4 w-4" />
                    )}
                  </div>

                  {/* Title + status */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {w.title}
                    </div>

                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {w.minimized && (
                        <span className="text-orange-500">
                          ● {t("minimize")}
                        </span>
                      )}

                      {!w.minimized &&
                        store.activeWindowId === w.id && (
                          <span className="text-emerald-500">
                            ● Active
                          </span>
                        )}

                      <span className="capitalize">
                        {w.type.replace("-", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!w.minimized ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          store.minimizeWindow(w.id);
                        }}
                        title={t("minimize")}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => {
                          e.stopPropagation();
                          store.focusWindow(w.id);
                        }}
                        title="Restore"
                      >
                        <Square className="h-3 w-3" />
                      </Button>
                    )}

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        store.closeWindow(w.id);
                      }}
                      title={t("close")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t bg-muted/20 text-xs text-muted-foreground flex justify-between">
              <span>
                {minimizedCount} {t("minimize")}
              </span>
              <span>{totalCount - minimizedCount} Active</span>
            </div>
          </div>
        </>
      )}
    </>
  );
}