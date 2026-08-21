// FileForge Pro — Thumbnail Image Component + useThumbnail hook
//
// Central component used by ALL file display surfaces:
//   FileBrowser (Grid/List/Details), SearchPanel, Sidebar recents,
//   FloatingWindow folder contents.
//
// Calls thumbnailManager.getThumbnail() on mount (and when path/kind changes),
// shows a loading placeholder while waiting, and renders a real <img> when
// the thumbnail is ready. Cancellations are handled by the promise chain
// (the thumbnailManager deduplicates requests; when this component unmounts,
// the pending promise simply resolves into nothing).
//
// Key design choices:
//   - No synchronous disk I/O on the render thread.
//   - Requests are deduplicated by thumbnailManager.
//   - Memory cache means previously-loaded thumbnails are instant.
//   - Fallback: shows a type-appropriate SVG icon (not a gradient placeholder).

"use client";

import { useState, useEffect, useRef } from "react";
import {
  Image as ImageIcon, Film, Loader2, FileText,
} from "lucide-react";
import { thumbnailManager } from "@/lib/fileforge/thumbnail-manager";
import { getApkInfo, isNative } from "@/lib/fileforge/native-bridge";
import { getNode } from "@/lib/fileforge/filesystem";
import { cn } from "@/lib/utils";

interface ThumbnailImageProps {
  path: string;
  kind: string;          // "image" | "video" | "folder" | etc.
  className?: string;
  size?: number;         // max dimension in px for thumbnail generation, default 200
  lastModified?: number;
  fileSize?: number;
  showVideoBadge?: boolean;
  rounded?: boolean;
}

export function ThumbnailImage({
  path,
  kind,
  className,
  size = 200,
  lastModified,
  fileSize,
  showVideoBadge = true,
  rounded = true,
}: ThumbnailImageProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    // Defer state reset to avoid synchronous setState-in-effect lint.
    queueMicrotask(() => {
      if (cancelledRef.current) return;
      setLoading(true);
      setFailed(false);
      setThumbUrl(null);
    });

    // APKs use the real application icon from Android PackageManager.
    if (kind === "apk" && isNative()) {
      getApkInfo(path).then(result => {
        if (cancelledRef.current) return;
        if (result?.icon) { setThumbUrl(result.icon); setLoading(false); }
        else { setFailed(true); setLoading(false); }
      }).catch(() => { if (!cancelledRef.current) { setFailed(true); setLoading(false); } });
      return () => { cancelledRef.current = true; };
    }

    // For non-image/video, skip thumbnail entirely
    if (kind !== "image" && kind !== "video") {
      queueMicrotask(() => {
        if (cancelledRef.current) return;
        setLoading(false);
        setFailed(true);
      });
      return;
    }

    // Try to get metadata from the node if not provided
    let lm = lastModified;
    let fs = fileSize;
    if (lm === undefined || fs === undefined) {
      const node = getNode(path);
      if (node) {
        lm = lm ?? node.modified;
        fs = fs ?? node.size;
      }
    }

    thumbnailManager.getThumbnail({
      path,
      kind,
      size,
      lastModified: lm,
      fileSize: fs,
      priority: 100,
    }).then(result => {
      if (cancelledRef.current) return;
      if (result) {
        setThumbUrl(result);
        setLoading(false);
      } else {
        setFailed(true);
        setLoading(false);
      }
    }).catch(() => {
      if (cancelledRef.current) return;
      setFailed(true);
      setLoading(false);
    });

    return () => {
      cancelledRef.current = true;
    };
  }, [path, kind, size, lastModified, fileSize]);

  // Loading state
  if (loading) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/40", className, rounded && "rounded-md")}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground opacity-50" />
      </div>
    );
  }

  // Success: show the real thumbnail
  if (thumbUrl) {
    return (
      <div className={cn("relative overflow-hidden bg-muted/30", className, rounded && "rounded-md")}>
        <img
          src={thumbUrl}
          alt={path.split("/").pop() ?? ""}
          className="w-full h-full object-cover"
          loading="lazy"
          draggable={false}
        />
        {showVideoBadge && kind === "video" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="h-7 w-7 rounded-full bg-white/90 flex items-center justify-center shadow-md">
              <div className="w-0 h-0 border-l-[7px] border-l-black border-y-[5px] border-y-transparent ml-0.5" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // Fallback: show type-appropriate icon
  return (
    <div className={cn("flex items-center justify-center bg-muted/40", className, rounded && "rounded-md")}>
      {kind === "apk" && thumbUrl ? (
        <img src={thumbUrl} alt="" className="h-full w-full object-contain" draggable={false} />
      ) : kind === "image" ? (
        <ImageIcon className="h-6 w-6 text-muted-foreground opacity-50" />
      ) : kind === "video" ? (
        <Film className="h-6 w-6 text-muted-foreground opacity-50" />
      ) : (
        <FileText className="h-6 w-6 text-muted-foreground opacity-50" />
      )}
    </div>
  );
}

// Hook version for components that need just the URL (not the JSX)
export function useThumbnail(path: string, kind: string, size = 200): {
  url: string | null;
  loading: boolean;
  failed: boolean;
} {
  const [state, setState] = useState({ url: null as string | null, loading: true, failed: false });
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    // Defer state reset to avoid synchronous setState-in-effect lint.
    queueMicrotask(() => {
      if (cancelledRef.current) return;
      setState({ url: null, loading: true, failed: false });
    });

    if (kind !== "image" && kind !== "video") {
      queueMicrotask(() => {
        if (cancelledRef.current) return;
        setState({ url: null, loading: false, failed: true });
      });
      return;
    }

    const node = getNode(path);
    thumbnailManager.getThumbnail({
      path,
      kind,
      size,
      lastModified: node?.modified,
      fileSize: node?.size,
      priority: 100,
    }).then(result => {
      if (cancelledRef.current) return;
      if (result) {
        setState({ url: result, loading: false, failed: false });
      } else {
        setState({ url: null, loading: false, failed: true });
      }
    }).catch(() => {
      if (cancelledRef.current) return;
      setState({ url: null, loading: false, failed: true });
    });

    return () => { cancelledRef.current = true; };
  }, [path, kind, size]);

  return state;
}
