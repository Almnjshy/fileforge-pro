// FileForge Pro — Web Viewer
// Renders HTML files in a sandboxed iframe with local asset support.

"use client";

import { useState, useEffect, useRef } from "react";
import {
  ZoomIn, ZoomOut, RotateCw, ExternalLink, Loader2, AlertCircle, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileForge } from "@/store/fileforge-store";
import { nativeFileSystem, isNative } from "@/lib/fileforge/native-bridge";
import { getNode } from "@/lib/fileforge/filesystem";
import { getThumbnail } from "@/lib/fileforge/real-fs";

export function WebViewer({ nodeId, fileName }: { nodeId: string; fileName: string }) {
  const store = useFileForge();
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function loadHtml() {
      setLoading(true);
      setError(null);
      try {
        let htmlContent: string | null = null;

        if (isNative() && nodeId.startsWith("/")) {
          // Try streaming URI first
          const streamResult = await nativeFileSystem.getStreamUri(nodeId);
          if (streamResult?.uri) {
            if (!cancelled) {
              setSrc(streamResult.uri);
              setLoading(false);
              return;
            }
          }
          // Fallback: read as text
          htmlContent = await nativeFileSystem.readText(nodeId);
        } else {
          const node = getNode(nodeId);
          if (node?.content) {
            htmlContent = node.content.startsWith("data:")
              ? (await (await fetch(node.content)).text())
              : node.content;
          }
        }

        if (!htmlContent) {
          throw new Error("Could not load HTML content");
        }
        if (cancelled) return;

        const blob = new Blob([htmlContent], { type: "text/html" });
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setSrc(objectUrl);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }

    loadHtml();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [nodeId]);

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = src ?? "";
    }
  };

  const handleOpenExternal = async () => {
    if (isNative() && nodeId.startsWith("/")) {
      await nativeFileSystem.openFileExternal(nodeId, "text/html");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <div className="text-sm text-muted-foreground">Loading HTML...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div className="text-sm font-medium">Failed to load HTML</div>
        <div className="text-xs text-muted-foreground text-center max-w-sm">{error}</div>
        {isNative() && (
          <Button onClick={handleOpenExternal} variant="outline" size="sm">
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Externally
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30 flex-shrink-0">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} aria-label="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs text-muted-foreground min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(z => Math.min(5, z + 0.25))} aria-label="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleRefresh} aria-label="Reload">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground truncate max-w-[120px]">{fileName}</span>
        {isNative() && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenExternal} aria-label="Open externally">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto bg-white">
        <iframe
          ref={iframeRef}
          src={src ?? ""}
          className="w-full h-full border-0 bg-white"
          style={{ zoom: zoom }}
          sandbox="allow-scripts allow-same-origin"
          title={fileName}
          onError={() => setError("Failed to render HTML")}
        />
      </div>
    </div>
  );
}
