// FileForge Pro — Hex/Binary Viewer
// Displays file content in hex dump format with offset, hex bytes, and ASCII.
// Uses chunked reading — only loads the visible portion of the file.

"use client";

import { useState, useEffect, useRef } from "react";
import {
  ZoomIn, ZoomOut, ExternalLink, Loader2, AlertCircle,
  Search, ChevronUp, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFileForge } from "@/store/fileforge-store";
import { nativeFileSystem, isNative } from "@/lib/fileforge/native-bridge";
import { getNode } from "@/lib/fileforge/filesystem";
import { formatBytes } from "@/lib/fileforge/file-utils";
import { cn } from "@/lib/utils";

const BYTES_PER_ROW = 16;
const ROW_HEIGHT = 22; // px
const VISIBLE_ROWS = 40;
const CHUNK_SIZE = BYTES_PER_ROW * VISIBLE_ROWS;

interface HexRow {
  offset: number;
  bytes: number[];
  ascii: string;
}

export function HexViewer({ nodeId, fileName }: { nodeId: string; fileName: string }) {
  const store = useFileForge();
  const [rows, setRows] = useState<HexRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]);
  const [currentSearchIdx, setCurrentSearchIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalRows = Math.ceil(fileSize / BYTES_PER_ROW);

  // Define loadChunk BEFORE the useEffect that calls it
  const loadChunk = async (offset: number, knownSize?: number) => {
    const size = knownSize ?? fileSize;
    if (size === 0) return;
    let bytes: Uint8Array | null = null;

    if (isNative() && (nodeId.startsWith("/") || nodeId.startsWith("content://"))) {
      // Never load the whole binary into memory. Ask the native layer only
      // for the visible chunk. This is critical for multi-GB files.
      const chunk = await nativeFileSystem.readFileChunk(nodeId, offset, Math.min(CHUNK_SIZE, 1024 * 1024));
      if (!chunk?.content) return;
      bytes = base64ToUint8Array(chunk.content);
    } else {
      const node = getNode(nodeId);
      if (node?.content) {
        const fullBytes = node.content.startsWith("data:")
          ? new Uint8Array(await (await fetch(node.content)).arrayBuffer())
          : new TextEncoder().encode(node.content);
        const end = Math.min(offset + CHUNK_SIZE, fullBytes.length);
        bytes = fullBytes.slice(offset, end);
      }
    }
    if (!bytes) return;

    const newRows: HexRow[] = [];
    for (let i = 0; i < bytes.length; i += BYTES_PER_ROW) {
      const rowBytes = Array.from(bytes.slice(i, i + BYTES_PER_ROW));
      const ascii = rowBytes.map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : ".").join("");
      newRows.push({ offset: offset + i, bytes: rowBytes, ascii });
    }
    setRows(newRows);
  };

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      setError(null);
      try {
        if (isNative() && (nodeId.startsWith("/") || nodeId.startsWith("content://"))) {
          const meta = await fileRepository.getMetadata(nodeId);
          if (cancelled) return;
          if (meta) {
            setFileSize(meta.size);
            await loadChunk(0, meta.size);
          }
        } else {
          const node = getNode(nodeId);
          if (node) {
            setFileSize(node.size);
            await loadChunk(0, node.size);
          }
        }
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, [nodeId]);

  // Re-load chunk when scroll position changes
  useEffect(() => {
    if (fileSize === 0 || loading) return;
    queueMicrotask(() => loadChunk(scrollOffset));
  }, [scrollOffset, fileSize, loading]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop;
    const newOffset = Math.floor(scrollTop / ROW_HEIGHT) * BYTES_PER_ROW;
    if (Math.abs(newOffset - scrollOffset) >= BYTES_PER_ROW * 10) {
      setScrollOffset(newOffset);
    }
  };

  const handleSearch = () => {
    if (!searchQuery) return;
    // Search in current loaded chunk (simplified — full search would need streaming)
    const queryBytes = searchQuery.split("").map(c => c.charCodeAt(0));
    const results: number[] = [];
    for (const row of rows) {
      for (let i = 0; i < row.bytes.length; i++) {
        let match = true;
        for (let j = 0; j < queryBytes.length; j++) {
          if (row.bytes[i + j] !== queryBytes[j]) { match = false; break; }
        }
        if (match) {
          results.push(row.offset + i);
          break;
        }
      }
    }
    setSearchResults(results);
    setCurrentSearchIdx(0);
  };

  const copyHex = () => {
    const text = rows.map(r =>
      `${r.offset.toString(16).padStart(8, "0")}  ${r.bytes.map(b => b.toString(16).padStart(2, "0")).join(" ")}`
    ).join("\n");
    navigator.clipboard.writeText(text);
    store.addToast("Hex copied to clipboard", "success");
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <div className="text-sm text-muted-foreground">Loading binary data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div className="text-sm font-medium">Failed to load file</div>
        <div className="text-xs text-muted-foreground text-center max-w-sm">{error}</div>
      </div>
    );
  }

  const mono = "font-mono text-xs leading-[22px]";

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-muted/30 flex-shrink-0">
        <span className="text-xs text-muted-foreground">{fileName}</span>
        <span className="text-xs text-muted-foreground ml-2">{formatBytes(fileSize)}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <Input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            className="h-7 w-32 text-xs"
          />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSearch} aria-label="Search">
            <Search className="h-3.5 w-3.5" />
          </Button>
          {searchResults.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{currentSearchIdx + 1}/{searchResults.length}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentSearchIdx(i => Math.max(0, i - 1))} aria-label="Previous result">
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setCurrentSearchIdx(i => Math.min(searchResults.length - 1, i + 1))} aria-label="Next result">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={copyHex} className="text-xs">Copy Hex</Button>
      </div>

      {/* Hex grid */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-zinc-950 text-zinc-300"
        style={{ position: "relative" }}
      >
        <div style={{ height: totalRows * ROW_HEIGHT, position: "relative" }}>
          <div style={{ position: "absolute", top: scrollOffset / BYTES_PER_ROW * ROW_HEIGHT, left: 0, right: 0 }}>
            {rows.map((row, idx) => (
              <div key={row.offset} className={cn(mono, "flex items-center px-3 hover:bg-zinc-800/50")}>
                <span className="text-zinc-500 w-24 flex-shrink-0">{row.offset.toString(16).padStart(8, "0")}</span>
                <span className="flex-shrink-0 mr-4">
                  {row.bytes.map((b, i) => (
                    <span
                      key={i}
                      className={cn(
                        "inline-block w-6 text-center",
                        b === 0 ? "text-zinc-600" : "text-zinc-300",
                        searchResults[currentSearchIdx] === row.offset + i && "bg-orange-500/30 rounded"
                      )}
                    >
                      {b.toString(16).padStart(2, "0")}
                    </span>
                  ))}
                  {/* Pad incomplete rows */}
                  {row.bytes.length < BYTES_PER_ROW && Array.from({ length: BYTES_PER_ROW - row.bytes.length }).map((_, i) => (
                    <span key={`pad-${i}`} className="inline-block w-6 text-zinc-700">··</span>
                  ))}
                </span>
                <span className="text-zinc-400 ml-4">{row.ascii}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function base64ToUint8Array(base64: string): Uint8Array {
  // Native bridge chunks are bounded by readFileChunk; this is never a whole-file conversion.
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Need to import fileRepository
import { fileRepository } from "@/lib/fileforge/file-repository";
