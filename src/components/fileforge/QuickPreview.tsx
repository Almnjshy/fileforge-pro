// FileForge Pro — Quick Preview tooltip on hover
"use client";

import { useState, useRef, useEffect } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { getNode, formatBytes } from "@/lib/fileforge/filesystem";
import { getFileIconLarge, getFileTypeLabel, getThumbGradient, getFileExt } from "./FileIcons";
import { cn } from "@/lib/utils";

interface QuickPreviewProps {
  nodeId: string | null;
  x: number;
  y: number;
}

export function QuickPreview({ nodeId, x, y }: QuickPreviewProps) {
  if (!nodeId) return null;
  const node = getNode(nodeId);
  if (!node) return null;

  // Adjust position to stay in viewport
  const previewW = 280;
  const previewH = 220;
  const adjX = Math.min(x + 16, window.innerWidth - previewW - 16);
  const adjY = Math.min(y + 16, window.innerHeight - previewH - 16);

  const isImage = node.kind === "image";
  const isVideo = node.kind === "video";
  const showThumb = (isImage || isVideo) && !!node.thumbColor;

  return (
    <div
      className="fixed z-[90] pointer-events-none animate-in fade-in-0 zoom-in-95"
      style={{ left: adjX, top: adjY, width: previewW }}
    >
      <div className="rounded-lg border bg-popover shadow-2xl overflow-hidden">
        {/* Preview area */}
        <div className="h-36 bg-muted/40 flex items-center justify-center overflow-hidden">
          {showThumb ? (
            <div
              className={cn(
                "w-full h-full bg-gradient-to-br flex items-center justify-center relative",
                getThumbGradient(node.thumbColor)
              )}
            >
              <span className="text-white/90 font-bold text-2xl tracking-wider">
                {getFileExt(node).slice(0, 4) || "IMG"}
              </span>
              {isVideo && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center">
                    <div className="w-0 h-0 border-l-[10px] border-l-black border-y-[6px] border-y-transparent ml-1" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 p-4">
              {getFileIconLarge(node.kind, "h-14 w-14")}
              <span className="text-xs text-muted-foreground">{getFileTypeLabel(node.kind, node.name)}</span>
            </div>
          )}
        </div>
        {/* Info */}
        <div className="p-2.5 space-y-1">
          <div className="text-sm font-medium truncate">{node.name}</div>
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{node.kind === "folder" ? `${node.childrenIds?.length ?? 0} items` : formatBytes(node.size)}</span>
            <span>{getFileTypeLabel(node.kind, node.name)}</span>
          </div>
          {node.width && node.width > 0 && (
            <div className="text-[11px] text-muted-foreground">
              {node.width} × {node.height}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Hook to manage hover state with delay - disabled on touch devices
export function useQuickPreview() {
  const [preview, setPreview] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Detect touch device
  const isTouchDevice = typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  const show = (nodeId: string, e: React.MouseEvent) => {
    // Don't show quick preview on touch devices
    if (isTouchDevice) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setPreview({ nodeId, x: e.clientX, y: e.clientY });
    }, 600);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setPreview(null);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { preview, show, hide };
}
