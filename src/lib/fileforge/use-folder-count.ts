// FileForge Pro — useFolderCount hook
//
// Returns a real folder count (files + folders) for a given path.
// On native Android: calls getFolderSummary (background thread).
// On web: walks the in-memory mock tree.
//
// The hook caches results across components via the fileRepository's
// internal 30s cache to avoid re-scanning on every render.

"use client";

import { useState, useEffect } from "react";
import { fileRepository } from "./file-repository";
import { isNative, nativeFileSystem } from "./native-bridge";
import { getNode } from "./filesystem";

export interface FolderCount {
  count: number;          // total items (files + folders)
  fileCount: number;
  folderCount: number;
  loading: boolean;
}

export function useFolderCount(path: string | null | undefined): FolderCount {
  const [state, setState] = useState<FolderCount>({
    count: 0, fileCount: 0, folderCount: 0, loading: true,
  });

  useEffect(() => {
    if (!path) {
      queueMicrotask(() => setState({ count: 0, fileCount: 0, folderCount: 0, loading: false }));
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      // On web (mock), do a synchronous lookup — no async overhead
      if (!isNative()) {
        const node = getNode(path);
        const childCount = node?.childrenIds?.length ?? 0;
        setState({
          count: childCount,
          fileCount: childCount,
          folderCount: 0,
          loading: false,
        });
        return;
      }
      // Native: async fetch real count
      nativeFileSystem.getStorageFolderSummary(path).then(summary => {
        if (cancelled) return;
        setState({
          count: (summary?.fileCount ?? 0) + (summary?.folderCount ?? 0),
          fileCount: summary?.fileCount ?? 0,
          folderCount: summary?.folderCount ?? 0,
          loading: false,
        });
      }).catch(() => {
        if (!cancelled) setState({ count: 0, fileCount: 0, folderCount: 0, loading: false });
      });
    });

    return () => { cancelled = true; };
  }, [path]);

  return state;
}
