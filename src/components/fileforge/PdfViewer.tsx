// FileForge Pro — streaming PDF viewer backed by pdf.js range transport.
// Native Android files are never loaded as one giant Base64 payload. pdf.js
// requests only the byte ranges it needs; each native bridge response is a
// bounded chunk (<= 1 MiB).

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, ExternalLink, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nativeFileSystem, isNative, readNativeFileRange } from "@/lib/fileforge/native-bridge";

 type AnyPdfDoc = any;
 type AnyPdfPage = any;

type RangeResult = { content: string; bytesRead: number; offset: number; fileSize: number; eof: boolean };


export function PdfViewer({ nodeId, fileName }: { nodeId: string; fileName: string }) {
  const [pdfDoc, setPdfDoc] = useState<AnyPdfDoc | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let activeDoc: AnyPdfDoc | null = null;
    let loadingTask: any = null;

    async function loadPdf() {
      setLoading(true);
      setError(null);
      try {
        const pdfjsLib: any = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (cancelled) return;

        if (isNative() && (nodeId.startsWith("/") || nodeId.startsWith("content://"))) {
          const rangeReader = await createNativeRangeTransport(pdfjsLib, nodeId);
          if (!rangeReader) throw new Error("Native PDF range transport is unavailable");
          loadingTask = pdfjsLib.getDocument({
            range: rangeReader,
            rangeChunkSize: 1024 * 1024,
            disableStream: true,
            disableAutoFetch: false,
          });
        } else {
          const { getNode } = await import("@/lib/fileforge/filesystem");
          const node = getNode(nodeId);
          let pdfData: Uint8Array | null = null;
          if (node?.content?.startsWith("data:")) {
            const res = await fetch(node.content);
            pdfData = new Uint8Array(await res.arrayBuffer());
          } else if (node?.content) {
            pdfData = new Uint8Array(new TextEncoder().encode(node.content));
          }
          if (!pdfData) throw new Error("Could not load PDF data");
          loadingTask = pdfjsLib.getDocument({ data: pdfData });
        }

        const doc = await loadingTask.promise;
        if (cancelled) {
          await doc?.destroy?.();
          return;
        }
        activeDoc = doc;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Failed to load PDF. The file may be corrupted.");
        setLoading(false);
      }
    }

    void loadPdf();
    return () => {
      cancelled = true;
      try { loadingTask?.destroy?.(); } catch {}
      try { void activeDoc?.destroy?.(); } catch {}
    };
  }, [nodeId]);

  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !canvasRef.current) return;
    setRendering(true);
    try {
      renderTaskRef.current?.cancel?.();
      const page: AnyPdfPage = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("No canvas context");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      const task = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = task;
      await task.promise;
    } catch (e: any) {
      if (e?.name !== "RenderingCancelledException") console.warn("Page render failed:", e);
    } finally {
      renderTaskRef.current = null;
      setRendering(false);
    }
  }, [pdfDoc, scale]);

  useEffect(() => {
    if (pdfDoc && !loading) void renderPage(currentPage);
  }, [pdfDoc, currentPage, renderPage, loading]);

  const goPrev = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };
  const goNext = () => { if (currentPage < numPages) setCurrentPage(p => p + 1); };
  const zoomIn = () => setScale(s => Math.min(5, s + 0.25));
  const zoomOut = () => setScale(s => Math.max(0.25, s - 0.25));
  const fitWidth = () => {
    if (!containerRef.current || !canvasRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 32;
    setScale(prev => {
      const currentWidth = canvasRef.current?.width ?? 600;
      return Math.max(0.25, Math.min(5, prev * (containerWidth / currentWidth)));
    });
  };

  const handleOpenExternal = async () => {
    if (isNative() && (nodeId.startsWith("/") || nodeId.startsWith("content://"))) {
      await nativeFileSystem.openFileExternal(nodeId, "application/pdf");
    }
  };

  if (loading) return <div className="flex flex-col h-full items-center justify-center gap-3 p-8"><Loader2 className="h-8 w-8 animate-spin" /><div className="text-sm text-muted-foreground">Loading PDF...</div></div>;
  if (error) return <div className="flex flex-col h-full items-center justify-center gap-3 p-8"><AlertCircle className="h-10 w-10 text-destructive" /><div className="text-sm font-medium">PDF Preview Failed</div><div className="text-xs text-muted-foreground text-center max-w-sm">{error}</div>{isNative() && <Button onClick={handleOpenExternal} variant="default" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1" /> Open Externally</Button>}</div>;

  return <div className="flex flex-col h-full overflow-hidden">
    <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30 flex-shrink-0">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev} disabled={currentPage <= 1} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></Button>
      <span className="text-xs text-muted-foreground min-w-[80px] text-center">{currentPage} / {numPages}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext} disabled={currentPage >= numPages} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></Button>
      <div className="h-4 w-px bg-border mx-1" />
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut} disabled={scale <= 0.25} aria-label="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></Button>
      <span className="text-xs text-muted-foreground min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn} disabled={scale >= 5} aria-label="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></Button>
      <Button variant="ghost" size="sm" onClick={fitWidth} className="text-xs">Fit</Button>
      <div className="flex-1" />
      {rendering && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      <span className="text-xs text-muted-foreground truncate max-w-[120px]">{fileName}</span>
      {isNative() && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenExternal} aria-label="Open externally"><ExternalLink className="h-3.5 w-3.5" /></Button>}
    </div>
    <div ref={containerRef} className="flex-1 overflow-auto bg-muted/30 flex justify-center p-4">
      <canvas ref={canvasRef} className="bg-white shadow-lg max-w-none" style={{ display: loading ? "none" : "block" }} />
    </div>
  </div>;
}


function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function createNativeRangeTransport(pdfjsLib: any, ref: string): Promise<any | null> {
  const probe = await readNativeFileRange(ref, 0, 64 * 1024);
  if (!probe) return null;
  const total = probe.fileSize;
  if (!Number.isFinite(total) || total <= 0) throw new Error("Invalid PDF size");

  const Transport = pdfjsLib.PDFDataRangeTransport;
  if (typeof Transport !== "function") throw new Error("pdf.js range transport is unavailable");

  class NativeRangeTransport extends Transport {
    private aborted = false;
    constructor() { super(total, null, false); }
    requestDataRange(begin: number, end: number) {
      if (this.aborted) return;
      void readNativeFileRange(ref, begin, Math.min(end - begin, 1024 * 1024)).then((result: RangeResult | null) => {
        if (this.aborted || !result) return;
        this.onDataRange(result.offset, base64ToUint8Array(result.content));
        this.onDataProgress(result.offset + result.bytesRead, total);
      }).catch(() => { /* pdf.js will surface the failed range request */ });
    }
    abort() { this.aborted = true; }
  }

  const transport = new NativeRangeTransport();
  transport.transportReady();
  return transport;
}
