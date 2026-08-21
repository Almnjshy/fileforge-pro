// FileForge Pro — Main App Shell (full features)
"use client";

import { useEffect, useState, useCallback } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { useCustomization } from "@/lib/fileforge/customization";
import { checkAllPermissions, PERMISSIONS as PERMISSIONS_LIST } from "@/lib/fileforge/permissions";
import { useBackHandler } from "@/lib/fileforge/back-handler";
import { isNative } from "@/lib/fileforge/native-bridge";
import { TopToolbar } from "./TopToolbar";
import { Sidebar } from "./Sidebar";
import { FileBrowser } from "./FileBrowser";
import { DualPane } from "./DualPane";
import { FloatingWindow, WindowManagerBar } from "./FloatingWindow";
import { ToastContainer } from "./ToastContainer";
import { OperationsPanel } from "./OperationsPanel";
import { ConflictDialog, type ConflictChoice } from "./ConflictDialog";
import { WelcomeOverlay } from "./WelcomeOverlay";
import { StatusBar } from "./StatusBar";
import { BatchProgressDialog } from "./BatchProgressDialog";
import { GlobalDropZone } from "./UploadZone";
import { PermissionsDialog } from "./PermissionsDialog";
import { ErrorBoundary } from "./ErrorBoundary";
import { logger } from "@/lib/fileforge/logger";
import { fileOperationEngine } from "@/lib/fileforge/file-operation-engine";
import { nativeFileSystem } from "@/lib/fileforge/native-bridge";
import { registerExternalNode, detectKind } from "@/lib/fileforge/filesystem";
import { fileOpenManager } from "@/lib/fileforge/file-open-manager";

export function FileForgeApp() {
  const store = useFileForge();
  const { lang } = useI18n();
  const cust = useCustomization();
  const openWindow = useFileForge(s => s.openWindow);
  const [welcomeShown, setWelcomeShown] = useState(false);
  const [autoDualPaneApplied, setAutoDualPaneApplied] = useState(false);
  const [permissionsShown, setPermissionsShown] = useState(false);
  const [conflictFileName, setConflictFileName] = useState<string | null>(null);
  const [conflictResolver, setConflictResolver] = useState<((choice: ConflictChoice) => void) | null>(null);

  // Register conflict resolver with the operation engine
  useEffect(() => {
    fileOperationEngine.setConflictResolver(async (fileName: string): Promise<ConflictChoice> => {
      return new Promise<ConflictChoice>((resolve) => {
        setConflictFileName(fileName);
        setConflictResolver(() => resolve);
      });
    });
    return () => { fileOperationEngine.setConflictResolver(null); };
  }, []);

  const handleConflictResolve = useCallback((choice: ConflictChoice) => {
    if (conflictResolver) conflictResolver(choice);
    setConflictFileName(null);
    setConflictResolver(null);
  }, [conflictResolver]);

  // Centralized back button handler
  useBackHandler();

  // Android integration: consume ACTION_VIEW / SEND intents through the typed
  // native bridge. Incoming content:// URIs become ephemeral FileForge nodes;
  // the URI itself remains the source of truth and no file is copied into JS
  // memory. This works for both cold starts and singleTask onNewIntent.
  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;
    (async () => {
      const incoming = await nativeFileSystem.consumeIncomingIntent();
      if (cancelled || !incoming?.available || incoming.uris.length === 0) return;
      for (const uri of incoming.uris.slice(0, 8)) {
        if (cancelled) return;
        const meta = await nativeFileSystem.getFileMetadata(uri);
        if (!meta) continue;
        const kind = meta.isDirectory
          ? "folder"
          : meta.mimeType?.startsWith("image/") ? "image"
          : meta.mimeType?.startsWith("video/") ? "video"
          : meta.mimeType?.startsWith("audio/") ? "audio"
          : meta.mimeType === "application/pdf" ? "pdf"
          : detectKind(meta.name);
        const node = registerExternalNode({
          id: uri,
          name: meta.name,
          kind,
          size: meta.size,
          modified: meta.lastModified,
          parentId: null,
        });
        fileOpenManager.openFile(node, { openWindow }, "auto");
      }
    })().catch(() => { /* malformed external intents are ignored safely */ });
    return () => { cancelled = true; };
  }, [openWindow]);

  // Rehydrate previously uploaded/edited files from IndexedDB (web preview
  // mode only — on native Android the file access goes straight to disk).
  useEffect(() => {
    if (isNative()) return;
    import("@/lib/fileforge/real-fs")
      .then(({ hydrateUserFiles }) => hydrateUserFiles())
      .then(() => {
        // Force FileBrowser's effect to re-run so rehydrated files show up
        store.bumpFsVersion();
      })
      .catch((e) => logger.error("FileForgeApp", "Failed to hydrate user files", e));
  }, []);

  // Apply theme + RTL
  useEffect(() => {
    const apply = (theme: "light" | "dark") => {
      if (theme === "dark") document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
    };
    if (store.theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      apply(mq.matches ? "dark" : "light");
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? "dark" : "light");
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      apply(store.theme);
    }
  }, [store.theme]);

  // Apply RTL/LTR direction
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }, [lang]);

  // Apply customization (high contrast, reduced motion, background)
  useEffect(() => {
    cust.loadFromStorage();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("high-contrast", cust.highContrast);
    document.documentElement.classList.toggle("reduced-motion", cust.reducedMotion);
  }, [cust.highContrast, cust.reducedMotion]);

  // Persistence: load settings on mount
  // Validate the localStorage values before casting — previously read with
  // `as any` casts which would silently apply invalid strings and break the
  // theme/view mode logic downstream.
  useEffect(() => {
    try {
      const VALID_THEMES = ["light", "dark", "system"] as const;
      const VALID_VIEWMODES = ["large-grid", "medium-grid", "small-grid", "list", "compact-list", "details"] as const;
      const VALID_ITEMSIZES = ["sm", "md", "lg"] as const;
      const savedTheme = localStorage.getItem("fileforge-theme");
      if (savedTheme && (VALID_THEMES as readonly string[]).includes(savedTheme)) {
        store.setTheme(savedTheme as typeof VALID_THEMES[number]);
      }
      const savedViewMode = localStorage.getItem("fileforge-viewMode");
      if (savedViewMode && (VALID_VIEWMODES as readonly string[]).includes(savedViewMode)) {
        store.setViewMode(savedViewMode as typeof VALID_VIEWMODES[number]);
      }
      const savedItemSize = localStorage.getItem("fileforge-itemSize");
      if (savedItemSize && (VALID_ITEMSIZES as readonly string[]).includes(savedItemSize)) {
        store.setItemSize(savedItemSize as typeof VALID_ITEMSIZES[number]);
      }
    } catch (e) {
      logger.warn("FileForgeApp", "Failed to load saved settings", e);
    }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("fileforge-theme", store.theme); } catch (e) { logger.warn("FileForgeApp", "Failed to save theme", e); }
  }, [store.theme]);
  useEffect(() => {
    try { localStorage.setItem("fileforge-viewMode", store.viewMode); } catch (e) { logger.warn("FileForgeApp", "Failed to save view mode", e); }
  }, [store.viewMode]);
  useEffect(() => {
    try { localStorage.setItem("fileforge-itemSize", store.itemSize); } catch (e) { logger.warn("FileForgeApp", "Failed to save item size", e); }
  }, [store.itemSize]);

  // Register service worker for PWA
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      });
    }
  }, []);

  // Auto-enable Dual Pane on large screens
  useEffect(() => {
    if (autoDualPaneApplied) return;
    const mq = window.matchMedia("(min-width: 1280px)");
    if (mq.matches && !store.dualPane) {
      store.toggleDualPane();
      store.setSidebarPinned(true);
    }
    queueMicrotask(() => setAutoDualPaneApplied(true));
  }, [autoDualPaneApplied]);

  // Show welcome overlay on first load
  useEffect(() => {
    const seen = typeof window !== "undefined" && localStorage.getItem("fileforge-welcome-seen");
    if (!seen && !welcomeShown) {
      const timer = setTimeout(() => setWelcomeShown(true), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  // Check permissions on first load — show dialog if not all required granted
  useEffect(() => {
    if (welcomeShown) return; // Wait for welcome to close
    const permsSeen = localStorage.getItem("fileforge-permissions-seen");
    if (permsSeen) return;
    // Check after a delay so it doesn't conflict with welcome
    const timer = setTimeout(async () => {
      const statuses = await checkAllPermissions();
      const requiredNotGranted = Object.entries(statuses)
        .filter(([name]) => {
          const perm = PERMISSIONS_LIST.find(p => p.name === name);
          return perm?.required;
        })
        .some(([, status]) => status !== "granted");
      if (requiredNotGranted) {
        setPermissionsShown(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [welcomeShown]);

  // Keyboard shortcuts (extended)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        store.selectAll();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "c") {
        if (store.selectedIds.size > 0) {
          store.copyToClipboard(Array.from(store.selectedIds), "copy");
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "x") {
        if (store.selectedIds.size > 0) {
          store.copyToClipboard(Array.from(store.selectedIds), "cut");
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "v") {
        if (store.clipboard) {
          store.pasteFromClipboard(store.currentPath);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        store.performUndo();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        store.performRedo();
      } else if (e.key === "Escape") {
        store.clearSelection();
      } else if (e.key === "Delete" && store.selectedIds.size > 0) {
        // Wrap confirm in try/catch: some sandboxed environments (e.g. inside
        // an iframe with sandbox flags) throw on window.confirm. Treat that
        // as "user dismissed" and skip the delete.
        let ok = false;
        try {
          ok = confirm(`Delete ${store.selectedIds.size} items?`);
        } catch {
          ok = false;
        }
        if (ok) {
          store.deleteNodes(Array.from(store.selectedIds));
        }
      } else if (e.altKey && e.key === "d") {
        e.preventDefault();
        store.toggleDualPane();
      } else if (e.altKey && ["1", "2", "3", "4", "5", "6"].includes(e.key)) {
        e.preventDefault();
        const modes = ["large-grid", "medium-grid", "small-grid", "list", "compact-list", "details"] as const;
        store.setViewMode(modes[parseInt(e.key) - 1]);
      } else if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        store.openWindow({ type: "search", title: "Search", width: 800, height: 560 });
      } else if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        store.openWindow({
          type: "folder", title: "New Window", path: store.currentPath, width: 560, height: 420,
        });
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "W") {
        e.preventDefault();
        store.closeAllWindows();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [store]);

  // Note: Back button handling is now centralized in useBackHandler()

  return (
    <ErrorBoundary>
      <a href="#main-content" className="sr-skip">Skip to content</a>
      <GlobalDropZone />
      <div
        className="ff-root flex h-screen w-screen overflow-hidden bg-background"
        style={{
          paddingTop: "var(--safe-top)",
          paddingBottom: "var(--safe-bottom)",
          paddingLeft: "var(--safe-left)",
          paddingRight: "var(--safe-right)",
          ...(cust.background === "gradient" ? {
            backgroundImage: "linear-gradient(to bottom right, rgba(249,115,22,0.05), rgba(245,158,11,0.05))",
          } : cust.background === "pattern" ? {
            backgroundImage: "radial-gradient(circle at 1px 1px, rgba(128,128,128,0.15) 1px, transparent 0)",
            backgroundSize: "20px 20px",
          } : {}),
        } as React.CSSProperties}
      >
        <Sidebar />

        <div id="main-content" className="flex-1 flex flex-col min-w-0 relative">
          <TopToolbar />

          <div className="flex-1 flex min-h-0 relative">
            {store.dualPane ? (
              <DualPane />
            ) : (
              <FileBrowser path={store.currentPath} paneId="main" />
            )}
          </div>

          <StatusBar />
        </div>

        {/* Floating windows layer — OUTSIDE main-content so it covers toolbar on mobile */}
        {store.windows.length > 0 && (
          /*
           * Window layer must NEVER own the whole-screen pointer surface.
           * Only the actual window cards are interactive.  The old nested
           * pointer-events-auto overlay intercepted taps/clicks intended for
           * the main FileBrowser and made the app appear frozen whenever a
           * floating window existed.
           */
          <div
            className="fixed inset-0 z-[100] pointer-events-none"
            aria-label="Floating windows layer"
          >
            {store.windows.map(win => (
              <ErrorBoundary key={win.id} resetKey={win.id}>
                <FloatingWindow win={win} />
              </ErrorBoundary>
            ))}
          </div>
        )}

        <WindowManagerBar />
        <ToastContainer />
        <OperationsPanel />

        {/* Conflict resolution dialog */}
        {conflictFileName && (
          <ConflictDialog fileName={conflictFileName} onResolve={handleConflictResolve} />
        )}
        <BatchProgressDialog />

        {welcomeShown && (
          <WelcomeOverlay
            onClose={() => {
              localStorage.setItem("fileforge-welcome-seen", "1");
              setWelcomeShown(false);
            }}
          />
        )}

        {permissionsShown && (
          <PermissionsDialog
            onClose={() => {
              localStorage.setItem("fileforge-permissions-seen", "1");
              setPermissionsShown(false);
            }}
            onAllGranted={() => {
              localStorage.setItem("fileforge-permissions-seen", "1");
              setPermissionsShown(false);
            }}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
