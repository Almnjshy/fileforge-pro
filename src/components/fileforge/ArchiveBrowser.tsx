// FileForge Pro — Archive Browser (unified, all formats)
//
// Talks ONLY to the ArchiveProvider interface — no direct JSZip/native-plugin
// calls here. The provider routes to the right engine:
//   - Native Android: ZIP, RAR (3 & 5, password), 7z (password), TAR, TAR.GZ,
//     TGZ, GZ, BZ2, XZ via the Kotlin ArchiveEngine.
//   - Web: ZIP only via JSZip.
//
// Features:
//   - Folder navigation (breadcrumbs)
//   - Extract single entry (downloads file on web, writes to disk on native)
//   - Extract all to a folder
//   - Open a file inside the archive directly (text/image/PDF) via
//     `readEntryPreview` + appropriate viewer
//   - Password prompt for encrypted archives
//   - Honest error messages for unsupported formats / wrong passwords

"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Archive, ChevronLeft, Folder, FileText, Download, FileArchive,
  Loader2, AlertCircle, Lock, Eye, EyeOff, KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getNode, formatBytes } from "@/lib/fileforge/filesystem";
import { nativeFileSystem, isNative } from "@/lib/fileforge/native-bridge";
import { getArchiveProvider, type ArchiveEntry, type OpenArchiveResult } from "@/lib/fileforge/archive-provider";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { cn } from "@/lib/utils";

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  modified: number;
  isEncrypted: boolean;
  children: Map<string, TreeNode>;
}

export function ArchiveBrowser({ nodeId }: { nodeId: string }) {
  const { t } = useI18n();
  const store = useFileForge();
  const node = getNode(nodeId);

  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPath, setCurrentPath] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Build a navigation tree from the flat entries list
  const tree = useMemo(() => {
    const root: TreeNode = {
      name: "", path: "", isDirectory: true, size: 0, modified: 0,
      isEncrypted: false, children: new Map(),
    };
    for (const e of entries) {
      const parts = e.path.split("/").filter(Boolean);
      let current = root;
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        const p = parts.slice(0, i + 1).join("/");
        if (!current.children.has(part)) {
          current.children.set(part, {
            name: part, path: p,
            isDirectory: isLast ? e.isDirectory : true,
            size: isLast ? e.size : 0,
            modified: isLast ? e.modified : 0,
            isEncrypted: e.isEncrypted,
            children: new Map(),
          });
        }
        current = current.children.get(part)!;
      }
    }
    return root;
  }, [entries]);

  const currentChildren = useMemo(() => {
    const n = findNode(tree, currentPath);
    if (!n) return [];
    return Array.from(n.children.values()).sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [tree, currentPath]);

  const loadArchive = useCallback(async (pwd?: string) => {
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
      setNeedsPassword(false);
      setPasswordError(null);
    });
    try {
      await Promise.resolve();
      const provider = getArchiveProvider();
      const result: OpenArchiveResult = await provider.listEntries(nodeId, pwd);
      if (result.needsPassword) {
        setNeedsPassword(true);
        setLoading(false);
        return;
      }
      setEntries(result.entries);
      setLoading(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLoading(false);
    }
  }, [nodeId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadArchive();
  }, [loadArchive]);

  const handlePasswordSubmit = async () => {
    if (!password) return;
    setLoading(true);
    setPasswordError(null);
    try {
      const provider = getArchiveProvider();
      const result = await provider.listEntries(nodeId, password);
      if (result.needsPassword) {
        setPasswordError("Wrong password. Please try again.");
        setLoading(false);
        return;
      }
      setEntries(result.entries);
      setNeedsPassword(false);
      setLoading(false);
    } catch (e) {
      setPasswordError(e instanceof Error ? e.message : String(e));
      setLoading(false);
    }
  };

  const handleExtractAll = async () => {
    setExtracting(true);
    try {
      const provider = getArchiveProvider();
      const parentPath = node?.parentId ?? "";
      const baseName = (node?.name ?? "archive").replace(/\.(zip|rar|7z|tar|gz|bz2|xz|tgz)$/i, "");
      const extractDirName = `${baseName}_extracted`;

      if (isNative()) {
        let targetDir: string;
        try {
          targetDir = await nativeFileSystem.createDirectory(parentPath, extractDirName);
        } catch {
          const existing = await nativeFileSystem.listDirectory(parentPath);
          const match = existing.find((f: any) => f.name === extractDirName && f.kind === "folder");
          if (!match) throw new Error(`Unable to create extraction directory: ${extractDirName}`);
          targetDir = match.id;
        }
        const count = await provider.extractAll(nodeId, targetDir, needsPassword ? password : undefined);
        store.addToast(`Extracted ${count} files`, "success");
        store.bumpFsVersion();
      } else {
        // Web fallback: triggers per-entry downloads
        const count = await provider.extractAll(nodeId, "", needsPassword ? password : undefined);
        store.addToast(`Downloaded ${count} files`, "success");
      }
    } catch (e) {
      store.addToast(`Extraction failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setExtracting(false);
    }
  };

  const handleExtractFile = async (entry: TreeNode) => {
    if (entry.isDirectory) return;
    setExtracting(true);
    try {
      const provider = getArchiveProvider();
      if (isNative()) {
        // On native: extract to the selected storage parent, then open in external viewer
        const parentPath = node?.parentId ?? "/storage/emulated/0/Download";
        // Always pass the destination directory to the native archive engine.
        // The native layer creates/returns the actual child StorageReference;
        // concatenating a filename onto a content:// URI is not a valid SAF ref.
        const targetRef = await provider.extractEntry(
          nodeId, entry.path, parentPath, needsPassword ? password : undefined
        );
        if (targetRef) {
          store.addToast(`Extracted: ${entry.name}`, "success");
          const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
          const mime = guessMime(ext);
          await nativeFileSystem.openFileExternal(targetRef, mime);
          store.bumpFsVersion();
        } else {
          store.addToast(`Failed to extract: ${entry.name}`, "error");
        }
      } else {
        // Web: trigger download
        await provider.extractEntry(nodeId, entry.path, "", needsPassword ? password : undefined);
        store.addToast(`Downloaded: ${entry.name}`, "success");
      }
    } catch (e) {
      store.addToast(`Extraction failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setExtracting(false);
    }
  };

  const handleOpenEntry = async (entry: TreeNode) => {
    if (entry.isDirectory) {
      setCurrentPath(entry.path);
      return;
    }
    // For supported types (text/image/pdf), try to read the entry's bytes
    // and open directly in a viewer window.
    const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
    const viewerType =
      ["txt", "md", "log", "json", "xml", "yaml", "yml", "csv", "ini", "conf", "js", "ts", "py", "html", "css"].includes(ext) ? "text-editor" :
      ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg"].includes(ext) ? "image-preview" :
      ext === "pdf" ? "pdf-preview" : null;

    if (!viewerType) {
      // Fallback: just extract
      handleExtractFile(entry);
      return;
    }

    // Inline previews are deliberately bounded. Large archive entries stay
    // out of the JS heap; the user can extract them to a real StorageReference.
    if (entry.size > 4 * 1024 * 1024) {
      await handleExtractFile(entry);
      return;
    }

    setExtracting(true);
    try {
      const provider = getArchiveProvider();
      const bytes = await provider.readEntryPreview(nodeId, entry.path, needsPassword ? password : undefined);
      if (!bytes) {
        store.addToast("Failed to read entry", "error");
        return;
      }
      // Convert bytes to a synthetic file node and open in viewer.
      // We store the bytes as a data URL on a transient node keyed by
      // entry path, then open the viewer pointing at that key.
      const dataUrl = bytesToDataUrl(bytes, ext);
      // Use a synthetic node id "archive-entry:<archiveId>/<entryPath>"
      const syntheticId = `archive-entry:${nodeId}/${entry.path}`;
      // Inject into the in-memory filesystem via the store's helper
      const { filesystem } = await import("@/lib/fileforge/filesystem");
      filesystem[syntheticId] = {
        id: syntheticId,
        name: entry.name,
        kind: viewerType === "text-editor" ? "text" :
              viewerType === "image-preview" ? "image" : "pdf",
        size: entry.size,
        modified: entry.modified || Date.now(),
        parentId: nodeId,
        content: viewerType === "text-editor" ? new TextDecoder().decode(bytes) : dataUrl,
      };
      store.openWindow({
        type: viewerType,
        title: entry.name,
        nodeId: syntheticId,
        width: viewerType === "text-editor" ? 820 : 720,
        height: viewerType === "text-editor" ? 580 : 600,
      });
    } catch (e) {
      store.addToast(`Open failed: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setExtracting(false);
    }
  };

  const nodeName = node?.name ?? "Archive";
  // Breadcrumbs are cheap to compute — no memoization needed.
  const breadcrumbs = (() => {
    const parts = currentPath.split("/").filter(Boolean);
    const crumbs = [{ name: nodeName, path: "" }];
    let acc = "";
    for (const p of parts) {
      acc = acc ? `${acc}/${p}` : p;
      crumbs.push({ name: p, path: acc });
    }
    return crumbs;
  })();

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        <div className="text-sm text-muted-foreground">Loading archive...</div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-4 p-8">
        <Lock className="h-10 w-10 text-orange-500" />
        <div className="text-sm font-medium">Password required</div>
        <div className="text-xs text-muted-foreground text-center max-w-sm">
          This archive is encrypted. Enter the password to view its contents.
        </div>
        <div className="flex items-center gap-2 w-full max-w-xs">
          <KeyRound className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Input
            type={showPassword ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handlePasswordSubmit(); }}
            className="flex-1"
            autoFocus
          />
          <Button
            variant="ghost" size="icon"
            onClick={() => setShowPassword(s => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        </div>
        {passwordError && (
          <div className="text-xs text-destructive">{passwordError}</div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setNeedsPassword(false); setError("Archive is password-protected."); }}>
            Cancel
          </Button>
          <Button size="sm" onClick={handlePasswordSubmit} disabled={!password}>
            Unlock
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-8">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div className="text-sm font-medium">Cannot open archive</div>
        <div className="text-xs text-muted-foreground text-center max-w-sm">{error}</div>
        <Button onClick={() => loadArchive()} variant="outline" size="sm">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with breadcrumbs + extract-all */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Archive className="h-4 w-4 text-orange-500 flex-shrink-0" />
        <div className="flex-1 min-w-0 flex items-center gap-1 text-sm overflow-x-auto scrollbar-thin">
          {breadcrumbs.map((crumb, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentPath(crumb.path)}
              className={cn(
                "px-1.5 py-0.5 rounded hover:bg-accent whitespace-nowrap",
                idx === breadcrumbs.length - 1 && "font-semibold"
              )}
            >
              {crumb.name}
              {idx < breadcrumbs.length - 1 && <span className="text-muted-foreground mx-1">/</span>}
            </button>
          ))}
        </div>
        <Button
          onClick={handleExtractAll}
          disabled={extracting || entries.length === 0}
          size="sm"
          variant="default"
          className="flex-shrink-0"
        >
          {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          <span className="ml-1">{t("extractHere") || "Extract All"}</span>
        </Button>
      </div>

      {/* Folder contents */}
      <div className="flex-1 overflow-y-auto">
        {currentChildren.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
            <Folder className="h-10 w-10 opacity-40" />
            <div className="text-sm">Empty folder</div>
          </div>
        ) : (
          currentChildren.map(child => (
            <div
              key={child.path}
              className={cn(
                "flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer border-b",
                !child.isDirectory && "group"
              )}
              onClick={() => handleOpenEntry(child)}
              onDoubleClick={() => { if (!child.isDirectory) handleExtractFile(child); }}
            >
              {child.isDirectory ? (
                <Folder className="h-5 w-5 text-yellow-500 flex-shrink-0" />
              ) : (
                <FileArchive className="h-5 w-5 text-orange-500 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{child.name}</div>
                <div className="text-xs text-muted-foreground">
                  {child.isDirectory ? `${countDescendants(child)} items` : formatBytes(child.size)}
                  {child.modified > 0 && ` · ${new Date(child.modified).toLocaleDateString()}`}
                </div>
              </div>
              {child.isEncrypted && (
                <Lock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              )}
              {!child.isDirectory && (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExtractFile(child);
                  }}
                  disabled={extracting}
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t bg-muted/30 text-xs text-muted-foreground flex items-center justify-between">
        <span>{entries.length} entries</span>
        {currentPath && (
          <button
            onClick={() => {
              const parts = currentPath.split("/").filter(Boolean);
              parts.pop();
              setCurrentPath(parts.join("/"));
            }}
            className="flex items-center gap-1 hover:text-foreground"
          >
            <ChevronLeft className="h-3 w-3" />
            Up
          </button>
        )}
      </div>
    </div>
  );
}

// ============ Helpers ============

function findNode(root: TreeNode, path: string): TreeNode | null {
  if (!path) return root;
  const parts = path.split("/").filter(Boolean);
  let current = root;
  for (const part of parts) {
    const next = current.children.get(part);
    if (!next) return null;
    current = next;
  }
  return current;
}

function countDescendants(node: TreeNode): number {
  return node.children.size;
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml",
    mp4: "video/mp4", mkv: "video/x-matroska", webm: "video/webm", mov: "video/quicktime",
    mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", m4a: "audio/mp4",
    pdf: "application/pdf",
    txt: "text/plain", md: "text/markdown", json: "application/json",
    zip: "application/zip", rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed", tar: "application/x-tar", gz: "application/gzip",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}

function bytesToDataUrl(bytes: Uint8Array, ext: string): string {
  const mime = guessMime(ext);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[]
    );
  }
  return `data:${mime};base64,${btoa(binary)}`;
}
