"use client";

import { PdfViewer } from "./PdfViewer";
// FileForge Pro — File preview (image, video, audio, pdf)
// REAL implementation: reads actual file bytes from disk (native) or
// in-memory content (web uploads) and creates blob URLs for <video>,
// <audio>, <iframe>, and zoomable image viewer.


import { useState, useRef, useEffect, useCallback } from "react";
import {
  ZoomIn, ZoomOut, RotateCw, Play, Pause, Volume2, SkipBack, SkipForward,
  Download, FileText, AlertCircle, Loader2, Maximize2, ExternalLink,
} from "lucide-react";
import { useFileForge } from "@/store/fileforge-store";
import { getNode, formatBytes } from "@/lib/fileforge/filesystem";
import { getThumbnail } from "@/lib/fileforge/real-fs";
import { nativeFileSystem, isNative, openNativeMedia, openNativeImage } from "@/lib/fileforge/native-bridge";
import { detectKind } from "@/lib/fileforge/filesystem";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { getThumbGradient, getFileExt } from "./FileIcons";

/**
 * Build a real blob URL for a media file by reading its actual bytes.
 * On Android native: reads the file from disk via base64.
 * On web: uses thumbnail data URL for images/videos, or content for text.
 */
function useMediaSrc(nodeId: string, kind: string): { src: string | null; loading: boolean; error: string | null } {
  const [state, setState] = useState<{ src: string | null; loading: boolean; error: string | null }>({
    src: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setState({ src: null, loading: true, error: null });
    });

    async function build() {
      await Promise.resolve();
      if (cancelled) return;

      const node = getNode(nodeId);
      if (!node) {
        if (!cancelled) setState({ src: null, loading: false, error: "File not found" });
        return;
      }

      // === Path 0 (BEST): Native streaming URI — no base64, no OOM ===
      // For video/audio on native: get a content:// URI for direct <video>/<audio> src.
      // This eliminates the entire base64 → Blob → objectURL pipeline.
      if (isNative() && (nodeId.startsWith("/") || nodeId.startsWith("content://")) && (kind === "video" || kind === "audio")) {
        const streamResult = await nativeFileSystem.getStreamUri(nodeId);
        if (cancelled) return;
        if (streamResult?.uri) {
          // content:// URIs work directly as <video src> in Android WebView
          if (!cancelled) setState({ src: streamResult.uri, loading: false, error: null });
          return;
        }
        // Fall through to base64 if streaming URI failed
      }

      // === Path 1: Native file (Android) — read real bytes from disk ===
      if (isNative() && (nodeId.startsWith("/") || nodeId.startsWith("content://"))) {
        try {
          const ext = getFileExt(node.name);

          // HEIC/HEIF: use native ImageDecoder instead of loading raw bytes
          if (ext === "heic" || ext === "heif") {
            const result = await nativeFileSystem.decodeHeic(nodeId, 1920);
            if (cancelled) return;
            if (result.supported && result.data) {
              try {
                const res = await fetch(result.data);
                const blob = await res.blob();
                if (cancelled) return;
                objectUrl = URL.createObjectURL(blob);
                if (!cancelled) setState({ src: objectUrl, loading: false, error: null });
                return;
              } catch {
                if (!cancelled) setState({ src: null, loading: false, error: "HEIC decode failed" });
                return;
              }
            } else {
              if (!cancelled) setState({
                src: null,
                loading: false,
                error: result.error ?? "HEIC decoding is not supported on this device",
              });
              return;
            }
          }

          // For images: try streaming URI first (works for JPG/PNG/WEBP/GIF/BMP)
          if (kind === "image") {
            const streamResult = await nativeFileSystem.getStreamUri(nodeId);
            if (cancelled) return;
            if (streamResult?.uri) {
              if (!cancelled) setState({ src: streamResult.uri, loading: false, error: null });
              return;
            }
          }

          // Do not fall back to whole-file Base64 on Android. A media file can
          // be hundreds of MB/GB and that path would duplicate the payload in
          // JS memory. Native stream URI is the only supported inline path.
          if (!cancelled) {
            setState({
              src: null,
              loading: false,
              error: "Native streaming URI is unavailable for this file",
            });
          }
          return;
        } catch (e) {
          if (!cancelled) setState({ src: null, loading: false, error: e instanceof Error ? e.message : "Read failed" });
          return;
        }
      }

      // === Path 2: Web upload with content stored ===
      if (node.content) {
        if (node.content.startsWith("data:")) {
          try {
            const res = await fetch(node.content);
            const blob = await res.blob();
            if (cancelled) return;
            objectUrl = URL.createObjectURL(blob);
            if (!cancelled) setState({ src: objectUrl, loading: false, error: null });
            return;
          } catch {
            // fall through
          }
        }
      }

      // === Path 3: Thumbnail fallback (only useful for images) ===
      const thumb = getThumbnail(nodeId);
      if (thumb && thumb.startsWith("data:") && kind === "image") {
        try {
          const res = await fetch(thumb);
          const blob = await res.blob();
          if (cancelled) return;
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setState({ src: objectUrl, loading: false, error: null });
          return;
        } catch {
          // fall through
        }
      }

      if (!cancelled) setState({ src: null, loading: false, error: "No preview source available for this file" });
    }

    build();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [nodeId, kind]);

  return state;
}

function getMimeType(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", heic: "image/heic",
    mp4: "video/mp4", mkv: "video/x-matroska", avi: "video/x-msvideo",
    mov: "video/quicktime", webm: "video/webm", flv: "video/x-flv",
    wmv: "video/x-ms-wmv", "3gp": "video/3gpp",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac",
    m4a: "audio/mp4", aac: "audio/aac", opus: "audio/opus",
    pdf: "application/pdf",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}


function downloadNode(nodeId: string): void {
  const node = getNode(nodeId);
  if (!node) return;
  // Try to trigger download via blob URL if available
  const doDownload = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = node.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  (async () => {
    try {
      if (isNative() && (nodeId.startsWith("/") || nodeId.startsWith("content://"))) {
        // Never materialize a native file into JS memory just to download it.
        // Use Android's external opener/share flow instead.
        const ext = getFileExt(node.name);
        const ok = await nativeFileSystem.openFileExternal(nodeId, getMimeType(ext));
        if (!ok) throw new Error("No external app available to open this file");
        return;
      }
      const thumb = getThumbnail(nodeId);
      if (thumb && thumb.startsWith("data:")) {
        const res = await fetch(thumb);
        doDownload(await res.blob());
        return;
      }
      if (node.content) {
        if (node.content.startsWith("data:")) {
          const res = await fetch(node.content);
          doDownload(await res.blob());
        } else {
          doDownload(new Blob([node.content], { type: "text/plain" }));
        }
        return;
      }
      useFileForge.getState().addToast("Download not available for this file", "info");
    } catch (e) {
      useFileForge.getState().addToast("Download failed", "error");
    }
  })();
}

export function FilePreview({ nodeId, kind, windowId, windowGeometry }: { nodeId: string; kind: "image" | "video" | "audio" | "pdf"; windowId?: string; windowGeometry?: { x: number; y: number; width: number; height: number; minimized: boolean; maximized: boolean } }) {
  const node = getNode(nodeId);
  const store = useFileForge();
  const { src, loading, error } = useMediaSrc(nodeId, kind);
  // Backwards-compat: some downstream code reads src/loading/error directly
  const mediaSrc = src;

  // Image state
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Media state
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const nativeLaunchRef = useRef(false);

  // Android images open in the dedicated native image viewer. This prevents
  // image files from entering the legacy WebView/media preview path.
  useEffect(() => {
    if (!isNative() || !windowId || kind !== "image" || nativeLaunchRef.current || !nodeId) return;
    nativeLaunchRef.current = true;
    let cancelled = false;
    void (async () => {
      const ok = await openNativeImage(nodeId, node?.name ?? "");
      if (cancelled) return;
      if (ok) {
        useFileForge.getState().closeWindow(windowId);
      } else {
        nativeLaunchRef.current = false;
      }
    })();
    return () => { cancelled = true; };
  }, [kind, nodeId, node?.name, windowId]);

  // Android media opens directly in the new native Media3 player.
  // Do not render the legacy black floating media surface first.
  useEffect(() => {
    if (!isNative() || !windowId || (kind !== "video" && kind !== "audio") || nativeLaunchRef.current || !nodeId) return;
    nativeLaunchRef.current = true;
    let cancelled = false;
    void (async () => {
      const ok = await openNativeMedia(nodeId, getMimeType(getFileExt(node?.name ?? "")), node?.name ?? "");
      if (cancelled) return;
      if (ok) {
        useFileForge.getState().closeWindow(windowId);
      } else {
        nativeLaunchRef.current = false;
        useFileForge.getState().addToast("تعذر فتح المشغل الأصلي", "error");
      }
    })();
    return () => { cancelled = true; };
  }, [kind, nodeId, node?.name, windowId]);

  // Open external (ACTION_VIEW on Android) — fallback for files that
  // can't be previewed inline (e.g. very large videos, unsupported codecs)
  const handleOpenExternal = useCallback(async () => {
    if (isNative() && nodeId.startsWith("/")) {
      const ext = getFileExt(node?.name ?? "");
      const mime = getMimeType(ext);
      const ok = await nativeFileSystem.openFileExternal(nodeId, mime);
      if (!ok) store.addToast("No external app available to open this file", "info");
    } else {
      store.addToast("External open is only available on Android", "info");
    }
  }, [nodeId, node?.name, store]);



  // Media event handlers
  useEffect(() => {
    const media = videoRef.current ?? audioRef.current;
    if (!media) return;
    const onTime = () => setProgress(media.currentTime);
    const onDur = () => setDuration(media.duration || 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setProgress(0); };
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("durationchange", onDur);
    media.addEventListener("loadedmetadata", onDur);
    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onPause);
    media.addEventListener("ended", onEnd);
    return () => {
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("durationchange", onDur);
      media.removeEventListener("loadedmetadata", onDur);
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onPause);
      media.removeEventListener("ended", onEnd);
    };
  }, [src, kind]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const media = videoRef.current ?? audioRef.current;
      if (media) {
        media.pause();
        media.removeAttribute("src");
        media.load();
      }
    };
  }, []);

  if (!node) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2 p-8 text-muted-foreground">
        <FileText className="h-8 w-8 opacity-40" />
        <div className="text-sm">File not found</div>
      </div>
    );
  }

  if (isNative() && windowId && kind === "image") {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-orange-500" />
          <div className="text-sm font-medium">جار فتح عارض الصور الأصلي…</div>
          <div className="text-xs text-muted-foreground">يتم فتح الصورة مباشرة عبر عارض Android الأصلي.</div>
        </div>
      </div>
    );
  }

  if (isNative() && windowId && (kind === "video" || kind === "audio")) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div className="space-y-2">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-orange-500" />
          <div className="text-sm font-medium">جار فتح المشغل الأصلي…</div>
          <div className="text-xs text-muted-foreground">يتم فتح Media3 مباشرة بدون نافذة المشغل القديمة.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <div className="text-sm text-muted-foreground">Loading {node.name}...</div>
      </div>
    );
  }

  if (error || !src) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <div className="text-sm font-medium">Preview not available</div>
        <div className="text-xs text-muted-foreground text-center max-w-sm">{error ?? "Unknown error"}</div>
        <div className="flex gap-2">
          <Button onClick={() => downloadNode(nodeId)} variant="outline" size="sm">
            <Download className="h-3.5 w-3.5 mr-1" /> Download
          </Button>
          {isNative() && (
            <Button onClick={handleOpenExternal} variant="default" size="sm">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Externally
            </Button>
          )}
        </div>
      </div>
    );
  }

  // ============ IMAGE VIEWER ============
  if (kind === "image") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground flex-1">{Math.round(zoom * 100)}%</span>
          <Button onClick={() => setZoom(z => Math.max(0.1, z - 0.25))} variant="ghost" size="sm" aria-label="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button onClick={() => setZoom(1)} variant="ghost" size="sm" className="text-xs">Fit</Button>
          <Button onClick={() => setZoom(z => Math.min(10, z + 0.25))} variant="ghost" size="sm" aria-label="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
          <Button onClick={() => setRotation(r => r + 90)} variant="ghost" size="sm" aria-label="Rotate">
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
          <Button onClick={() => downloadNode(nodeId)} variant="ghost" size="sm" aria-label="Download">
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div
          className="flex-1 overflow-auto relative bg-muted/30 flex items-center justify-center"
          onMouseDown={(e) => { setDragging(true); dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }; }}
          onMouseMove={(e) => { if (dragging) setPan({ x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y }); }}
          onMouseUp={() => setDragging(false)}
          onMouseLeave={() => setDragging(false)}
          style={{ cursor: dragging ? "grabbing" : "grab" }}
        >
          <img
            src={src}
            alt={node.name}
            className="max-w-full max-h-full select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center",
              transition: dragging ? "none" : "transform 0.1s ease-out",
            }}
            draggable={false}
            onError={() => useFileForge.getState().addToast("Failed to load image", "error")}
          />
        </div>
      </div>
    );
  }

  // ============ VIDEO PLAYER ============
  if (kind === "video") {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-1 flex items-center justify-center bg-black relative">
          <video
              ref={videoRef}
              src={src}
              controls
              autoPlay
              className="max-w-full max-h-full"
              style={{ width: "100%", height: "100%" }}
              onError={() => useFileForge.getState().addToast("Failed to play video. Try opening externally.", "error")}
            />
        </div>
        <div className="px-3 py-1 border-t bg-muted/30 text-xs flex items-center justify-between">
          <span className="truncate">{node.name}</span>
          <Button onClick={handleOpenExternal} variant="ghost" size="sm">
            <ExternalLink className="h-3 w-3 mr-1" /> External
          </Button>
        </div>
      </div>
    );
  }

  // ============ AUDIO PLAYER ============
  if (kind === "audio") {
    const fmtTime = (s: number) => {
      if (!isFinite(s) || s < 0) return "0:00";
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return `${m}:${sec.toString().padStart(2, "0")}`;
    };
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {!isNative() && (
          <audio
            ref={audioRef}
            src={src}
            autoPlay
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        )}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 bg-black/95">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg">
            <Volume2 className="h-12 w-12 text-white" />
          </div>
          <div className="text-center">
            <div className="font-medium truncate max-w-sm">{node.name}</div>
            <div className="text-xs text-muted-foreground">{formatBytes(node.size)}</div>
          </div>
          <div className="w-full max-w-sm space-y-2">
            <Slider
              value={[progress]}
              max={duration || 100}
              step={0.1}
              onValueChange={(v) => {
                if (audioRef.current) audioRef.current.currentTime = v[0];
              }}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{fmtTime(progress)}</span>
              <span>{fmtTime(duration)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, progress - 10); }}
              aria-label="Back 10s"
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="default"
              size="lg"
              className="rounded-full h-12 w-12 p-0"
              onClick={() => {
                if (!audioRef.current) return;
                if (playing) audioRef.current.pause();
                else audioRef.current.play();
              }}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.min(duration, progress + 10); }}
              aria-label="Forward 10s"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-xs">
            <Volume2 className="h-3 w-3 text-muted-foreground" />
            <Slider
              value={[volume]}
              max={100}
              onValueChange={(v) => {
                setVolume(v[0]);
                if (audioRef.current) audioRef.current.volume = v[0] / 100;
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ============ PDF VIEWER ============
  // Use the real canvas renderer instead of an iframe. The PDF viewer owns
  // page navigation, zoom, rendering cancellation and external fallback.
  if (kind === "pdf") {
    return <PdfViewer nodeId={nodeId} fileName={node.name} />;
  }

  return (
    <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
      <AlertCircle className="h-10 w-10 text-muted-foreground" />
      <div className="text-sm">Unsupported preview type</div>
    </div>
  );
}
