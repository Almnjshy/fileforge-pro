// FileForge Pro — Context Menu (bilingual + long-press for mobile)
"use client";

import { useState, useCallback, useEffect } from "react";
import {
  FolderOpen, Copy, Scissors, Pencil, Trash2, Archive, FileArchive,
  Share2, Star, Info, Eye, ChevronRight, FileText, Lock, Smartphone,
} from "lucide-react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import type { FileNode } from "@/lib/fileforge/types";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { getNode } from "@/lib/fileforge/filesystem";
import { getThumbnail } from "@/lib/fileforge/real-fs";
import { archiveService } from "@/lib/fileforge/archive-service";
import { SecureVault } from "@/lib/fileforge/secure-vault";
import {
  nativeFileSystem,
  isNative,
  installApk,
  installXapk,
} from "@/lib/fileforge/native-bridge";
import { CompressionDialog } from "./CompressionDialog";

async function buildFileObjectForNode(node: FileNode): Promise<File | null> {
  const thumb = getThumbnail(node.id);

  if (thumb && thumb.startsWith("data:")) {
    try {
      const res = await fetch(thumb);
      const blob = await res.blob();

      return new File(
        [blob],
        node.name,
        { type: blob.type || "application/octet-stream" }
      );
    } catch {
      // fall through
    }
  }

  if (node.content !== undefined) {
    return new File(
      [node.content],
      node.name,
      { type: "text/plain" }
    );
  }

  return null;
}

/**
 * Compress a node into a zip archive. Uses the unified ArchiveService,
 * which routes to the FileOperationEngine for real progress reporting.
 */
async function compressNodeToZip(
  node: FileNode,
  store: ReturnType<typeof useFileForge.getState>
): Promise<void> {
  window.dispatchEvent(
    new CustomEvent("fileforge:compress", {
      detail: { ids: [node.id] },
    })
  );
}

/**
 * Extract an archive in place. Uses the unified ArchiveService so the same
 * code path as ArchiveBrowser is taken — no duplicate JSZip logic.
 */
async function extractZipNode(
  node: FileNode,
  store: ReturnType<typeof useFileForge.getState>
): Promise<void> {
  try {
    const parentPath = node.parentId ?? "";

    if (isNative()) {
      await archiveService.extractAll(node.id, {});
      store.addToast(`Extracted "${node.name}"`, "success");
      store.bumpFsVersion();
    } else {
      await archiveService.extractAll(node.id, {});
      store.addToast(`Downloaded extracted files`, "success");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    if (msg.toLowerCase().includes("password")) {
      store.addToast(
        "This archive is password-protected. Open it in the archive browser to enter a password.",
        "info"
      );

      store.openWindow({
        type: "archive-preview",
        title: node.name,
        nodeId: node.id,
        path: node.id,
        width: 720,
        height: 560,
      });
    } else {
      store.addToast(`Extraction failed: ${msg}`, "error");
    }
  }
}

async function encryptNodeToVault(
  node: FileNode,
  store: ReturnType<typeof useFileForge.getState>,
  t: (
    key: TranslationKey,
    params?: Record<string, string | number>
  ) => string,
): Promise<void> {
  try {
    if (!SecureVault.isPinSet()) {
      store.addToast(t("vaultSetPinFirst"), "info");

      store.openWindow({
        type: "settings",
        title: t("secureVault"),
        width: 640,
        height: 520,
      });

      return;
    }

    const pin = window.prompt(t("vaultPinPrompt"));

    if (!pin) return;

    if (!(await SecureVault.verifyPin(pin))) {
      store.addToast(t("vaultWrongPin"), "error");
      return;
    }

    const collect = async (n: FileNode): Promise<any> => {
      if (n.kind === "folder") {
        const children = isNative()
          ? await nativeFileSystem.listDirectory(n.id, true)
          : (n.childrenIds ?? [])
              .map(id => getNode(id))
              .filter((x): x is FileNode => !!x);

        const entries: any[] = [];

        for (const child of children) {
          entries.push(await collect(child));
        }

        return {
          name: n.name,
          kind: n.kind,
          size: n.size,
          modified: n.modified,
          parentRef: n.parentId,
          entries,
        };
      }

      let data = "";

      if (isNative()) {
        data = (await nativeFileSystem.readFileBase64(n.id)) ?? "";
      } else if (n.content != null) {
        data = btoa(unescape(encodeURIComponent(n.content)));
      }

      if (!data && n.size > 0) {
        throw new Error(t("vaultReadFailed"));
      }

      return {
        name: n.name,
        kind: n.kind,
        size: n.size,
        modified: n.modified,
        base64: data,
      };
    };

    const envelope = await collect(node);

    const encrypted = await SecureVault.encrypt(
      JSON.stringify(envelope),
      pin
    );

    await SecureVault.addEntry({
      name: node.name,
      kind: node.kind,
      size: node.size,
      encryptedData: encrypted.encryptedData,
      iv: encrypted.iv,

      // FIX: VaultEntry expects string | undefined,
      // while FileNode.parentId may be null.
      sourceParent: node.parentId ?? undefined,
    });

    store.deleteNodes([node.id]);
    store.addToast(t("encryptedToVault"), "success");
  } catch (e) {
    store.addToast(
      `${t("vaultEncryptFailed")}: ${
        e instanceof Error ? e.message : String(e)
      }`,
      "error"
    );
  }
}

// MIME type guesser for "Open With" on native
function guessMimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    heic: "image/heic",

    mp4: "video/mp4",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mov: "video/quicktime",
    webm: "video/webm",
    flv: "video/x-flv",
    wmv: "video/x-ms-wmv",
    "3gp": "video/3gpp",

    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",
    aac: "audio/aac",
    opus: "audio/opus",

    pdf: "application/pdf",

    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    xml: "application/xml",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",

    zip: "application/zip",
    rar: "application/x-rar-compressed",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    gz: "application/gzip",
    bz2: "application/x-bzip2",
    xz: "application/x-xz",

    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    apk: "application/vnd.android.package-archive",
  };

  return map[ext.toLowerCase()] ?? "*/*";
}

export interface ContextMenuState {
  x: number;
  y: number;
  node: FileNode | null;
}

export function useContextMenu() {
  const [state, setState] =
    useState<ContextMenuState | null>(null);

  const open = useCallback(
    (x: number, y: number, node: FileNode | null) => {
      setState({ x, y, node });
    },
    []
  );

  const close = useCallback(() => setState(null), []);

  return { state, open, close };
}

interface ContextMenuProps {
  state: ContextMenuState | null;
  close: () => void;
  open: (x: number, y: number, node: FileNode | null) => void;
  currentPath: string;
  onOpenAs?: (node: FileNode) => void;
}

export function ContextMenu({
  state,
  close,
  currentPath,
  onOpenAs,
}: ContextMenuProps) {
  const store = useFileForge();
  const { t, lang } = useI18n();
  const [compressionIds, setCompressionIds] =
    useState<string[] | null>(null);

  useEffect(() => {
    if (!state) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      const menu = document.querySelector(
        '[data-fileforge-context-menu="true"]'
      );

      if (menu && target && menu.contains(target)) return;

      close();
    };

    const handleContextMenu = () => close();

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };

    window.addEventListener(
      "pointerdown",
      handlePointerDown,
      true
    );
    window.addEventListener(
      "contextmenu",
      handleContextMenu,
      true
    );
    window.addEventListener("keydown", handleEsc);

    return () => {
      window.removeEventListener(
        "pointerdown",
        handlePointerDown,
        true
      );
      window.removeEventListener(
        "contextmenu",
        handleContextMenu,
        true
      );
      window.removeEventListener("keydown", handleEsc);
    };
  }, [state, close]);

  useEffect(() => {
    const handler = (event: Event) => {
      const ids = (
        event as CustomEvent<{ ids?: string[] }>
      ).detail?.ids;

      if (ids?.length) {
        setCompressionIds(ids);
      }
    };

    window.addEventListener(
      "fileforge:compress",
      handler
    );

    return () => {
      window.removeEventListener(
        "fileforge:compress",
        handler
      );
    };
  }, []);

  if (!state) {
    return compressionIds ? (
      <CompressionDialog
        sourceIds={compressionIds}
        onClose={() => setCompressionIds(null)}
      />
    ) : null;
  }

  const node = state.node;

  const items = node
    ? buildNodeItems(
        node,
        store,
        close,
        t,
        lang,
        onOpenAs
      )
    : buildEmptyItems(
        currentPath,
        store,
        close,
        t
      );

  const estimatedHeight = Math.min(
    items.length * 36 + (node ? 62 : 16),
    Math.floor(window.innerHeight * 0.6)
  );

  const estimatedWidth = Math.min(
    320,
    window.innerWidth - 16
  );

  const x = Math.min(
    Math.max(8, state.x),
    Math.max(
      8,
      window.innerWidth - estimatedWidth - 8
    )
  );

  const y =
    state.y + estimatedHeight <= window.innerHeight - 8
      ? Math.max(8, state.y)
      : Math.max(8, state.y - estimatedHeight);

  return (
    <>
      <div
        data-fileforge-context-menu="true"
        className="fixed z-[100] min-w-[200px] max-w-[calc(100vw-16px)] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl py-1 animate-in fade-in-0 zoom-in-95 overflow-hidden"
        style={{
          left: x,
          top: y,
          maxHeight: "60vh",
        }}
        onClick={e => e.stopPropagation()}
      >
        {node && (
          <div className="px-3 py-2 border-b">
            <div className="text-sm font-medium truncate">
              {node.name}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {node.kind}
            </div>
          </div>
        )}

        <div className="py-0.5 max-h-[60vh] overflow-y-auto">
          {items.map((item, idx) =>
            item.type === "separator" ? (
              <div
                key={idx}
                className="h-px bg-border my-1"
              />
            ) : item.type === "submenu" ? (
              <SubMenuItem key={idx} item={item} />
            ) : (
              <button
                key={idx}
                onClick={e => {
                  e.stopPropagation();
                  item.onClick?.();
                  close();
                }}
                disabled={item.disabled}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors min-h-[36px]",
                  item.danger
                    ? "text-destructive hover:bg-destructive/10"
                    : "hover:bg-accent",
                  item.disabled &&
                    "opacity-40 pointer-events-none"
                )}
              >
                {item.icon && (
                  <item.icon className="h-4 w-4 flex-shrink-0" />
                )}

                <span className="flex-1">
                  {item.label}
                </span>

                {item.shortcut && (
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    {item.shortcut}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      </div>

      {compressionIds && (
        <CompressionDialog
          sourceIds={compressionIds}
          onClose={() => setCompressionIds(null)}
        />
      )}
    </>
  );
}

function SubMenuItem({ item }: { item: any }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-accent min-h-[36px]">
        {item.icon && (
          <item.icon className="h-4 w-4 flex-shrink-0" />
        )}

        <span className="flex-1">
          {item.label}
        </span>

        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-full top-0 ml-1 z-[110] min-w-[180px] rounded-lg border border-border bg-popover text-popover-foreground shadow-xl py-1 overflow-hidden">
          {item.items.map(
            (sub: any, idx: number) => (
              <button
                key={idx}
                onClick={() => {
                  sub.onClick?.();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-accent min-h-[36px]"
              >
                {sub.icon && (
                  <sub.icon className="h-4 w-4" />
                )}
                <span>{sub.label}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

type MenuItem =
  | {
      type: "item";
      label: string;
      icon?: typeof Info;
      onClick?: () => void;
      danger?: boolean;
      disabled?: boolean;
      shortcut?: string;
    }
  | {
      type: "separator";
    }
  | {
      type: "submenu";
      label: string;
      icon?: typeof Info;
      items: any[];
    };

function buildNodeItems(
  node: FileNode,
  store: ReturnType<typeof useFileForge.getState>,
  close: () => void,
  t: (
    key: TranslationKey,
    params?: Record<string, string | number>
  ) => string,
  lang: string,
  onOpenAs?: (node: FileNode) => void
): MenuItem[] {
  const isFolder = node.kind === "folder";
  const isText =
    node.kind === "text" ||
    node.kind === "code" ||
    node.kind === "html";
  const isArchive = node.kind === "archive";

  const openInWindow = () => {
    if (node.kind === "apk") {
      const installer =
        node.name.toLowerCase().endsWith(".xapk")
          ? installXapk
          : installApk;

      installer(node.id).then(result => {
        if (result.permissionRequired) {
          store.addToast(
            lang === "ar"
              ? "فعّل السماح بالتثبيت من هذا المصدر ثم اضغط تثبيت مرة أخرى"
              : "Allow installs from this source, then press Install again",
            "info"
          );
        } else if (!result.installed) {
          store.addToast(
            lang === "ar"
              ? "تعذر بدء تثبيت التطبيق"
              : "Unable to start APK installation",
            "error"
          );
        }
      });

      return;
    }

    if (isFolder) {
      store.openWindow({
        type: "folder",
        title: node.name,
        path: node.id,
        width: 560,
        height: 420,
      });
    } else if (isText) {
      store.openWindow({
        type: "text-editor",
        title: node.name,
        nodeId: node.id,
        width: 820,
        height: 580,
      });
    } else if (node.kind === "image") {
      store.openWindow({
        type: "image-preview",
        title: node.name,
        nodeId: node.id,
        width: 720,
        height: 560,
      });
    } else if (node.kind === "video") {
      store.openWindow({
        type: "video-preview",
        title: node.name,
        nodeId: node.id,
        width: 800,
        height: 560,
      });
    } else if (node.kind === "audio") {
      store.openWindow({
        type: "audio-preview",
        title: node.name,
        nodeId: node.id,
        width: 480,
        height: 320,
      });
    } else if (node.kind === "pdf") {
      store.openWindow({
        type: "pdf-preview",
        title: node.name,
        nodeId: node.id,
        width: 720,
        height: 600,
        maximized: true,
      });
    } else if (node.kind === "archive") {
      store.openWindow({
        type: "archive-preview",
        title: node.name,
        nodeId: node.id,
        path: node.id,
        width: 720,
        height: 560,
      });
    } else {
      store.openWindow({
        type: "properties",
        title: `${t("properties")} — ${node.name}`,
        nodeId: node.id,
        width: 420,
        height: 480,
      });
    }
  };

  return [
    {
      type: "item",
      label: t("open"),
      icon: FolderOpen,
      onClick: () => {
        if (isFolder) {
          store.navigate(node.id);
        } else {
          openInWindow();
        }
      },
    },

    ...(node.kind === "apk"
      ? [
          {
            type: "item",
            label: node.name
              .toLowerCase()
              .endsWith(".xapk")
              ? lang === "ar"
                ? "تثبيت XAPK"
                : "Install XAPK"
              : lang === "ar"
              ? "تثبيت التطبيق"
              : "Install application",
            icon: Smartphone,
            onClick: () => {
              const installer =
                node.name
                  .toLowerCase()
                  .endsWith(".xapk")
                  ? installXapk
                  : installApk;

              installer(node.id).then(result => {
                if (result.permissionRequired) {
                  store.addToast(
                    lang === "ar"
                      ? "فعّل السماح بالتثبيت من هذا المصدر ثم اضغط تثبيت مرة أخرى"
                      : "Allow installs from this source, then press Install again",
                    "info"
                  );
                } else if (!result.installed) {
                  store.addToast(
                    lang === "ar"
                      ? "تعذر بدء التثبيت"
                      : "Unable to start installation",
                    "error"
                  );
                }

                close();
              });
            },
          } as MenuItem,
        ]
      : []),

    {
      type: "item",
      label:
        t("openInWindow") ||
        "فتح في نافذة منبثقة",
      icon: Eye,
      onClick: openInWindow,
    },

    {
      type: "item",
      label:
        lang === "ar"
          ? "فتح كـ..."
          : "Open As...",
      icon: FileText,
      onClick: () => {
        if (onOpenAs) {
          onOpenAs(node);
        }
      },
    },

    {
      type: "item",
      label: t("openWith"),
      icon: FolderOpen,
      onClick: async () => {
        if (
          isNative() &&
          (node.id.startsWith("/") ||
            node.id.startsWith("content://"))
        ) {
          const ext =
            node.name
              .split(".")
              .pop()
              ?.toLowerCase() ?? "";

          const mime = guessMimeFromExt(ext);
          const ok =
            await nativeFileSystem.openFileExternal(
              node.id,
              mime
            );

          if (!ok) {
            store.addToast(
              "No external app available to open this file",
              "info"
            );
          }

          return;
        }

        const fileObj =
          await buildFileObjectForNode(node);

        if (
          fileObj &&
          navigator.share &&
          navigator.canShare &&
          navigator.canShare({
            files: [fileObj],
          })
        ) {
          try {
            await navigator.share({
              files: [fileObj],
            });
          } catch {
            // user cancelled
          }
        } else if (fileObj) {
          const url =
            URL.createObjectURL(fileObj);

          const a =
            document.createElement("a");

          a.href = url;
          a.download = fileObj.name;

          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          setTimeout(
            () => URL.revokeObjectURL(url),
            1000
          );
        } else {
          store.addToast(
            "Open With not available in this context",
            "info"
          );
        }
      },
    },

    {
      type: "item",
      label: t("quickPreview"),
      icon: Eye,
      onClick: openInWindow,
    },

    { type: "separator" },

    {
      type: "item",
      label: t("copy"),
      icon: Copy,
      shortcut: "Ctrl+C",
      onClick: () =>
        store.copyToClipboard(
          [node.id],
          "copy"
        ),
    },

    {
      type: "item",
      label: t("move"),
      icon: Scissors,
      shortcut: "Ctrl+X",
      onClick: () =>
        store.copyToClipboard(
          [node.id],
          "cut"
        ),
    },

    {
      type: "item",
      label: t("rename"),
      icon: Pencil,
      shortcut: "F2",
      onClick: () => {
        const newName = prompt(
          t("renameTo"),
          node.name
        );

        if (
          newName &&
          newName !== node.name
        ) {
          store.renameNode(
            node.id,
            newName
          );
        }
      },
    },

    {
      type: "item",
      label: t("delete"),
      icon: Trash2,
      danger: true,
      shortcut: "Del",
      onClick: () => {
        if (
          confirm(
            t("deleteConfirm", {
              name: node.name,
            })
          )
        ) {
          store.deleteNodes([
            node.id,
          ]);
        }
      },
    },

    {
      type: "item",
      label: t("encryptToVault"),
      icon: Lock,
      onClick: async () => {
        await encryptNodeToVault(
          node,
          store,
          t
        );
      },
    },

    { type: "separator" },

    isArchive
      ? {
          type: "item",
          label: t("extractHere"),
          icon: FileArchive,
          onClick: () =>
            extractZipNode(
              node,
              store
            ),
        }
      : {
          type: "item",
          label: t("compress"),
          icon: Archive,
          onClick: () =>
            compressNodeToZip(
              node,
              store
            ),
        },

    {
      type: "item",
      label: t("share"),
      icon: Share2,
      onClick: async () => {
        if (isNative()) {
          const result =
            await nativeFileSystem.shareFiles([
              node.id,
            ]);

          if (
            !result.success &&
            result.error
          ) {
            store.addToast(
              result.error,
              "error"
            );
          }

          return;
        }

        if (navigator.share) {
          navigator
            .share({
              title: node.name,
              text: node.name,
            })
            .catch(() => {});
        } else {
          store.addToast(
            t("sharing"),
            "info"
          );
        }
      },
    },

    { type: "separator" },

    {
      type: "item",
      label: node.starred
        ? t("removeFromFavorites")
        : t("addToFavorites"),
      icon: Star,
      onClick: () =>
        store.toggleStar(node.id),
    },

    {
      type: "item",
      label: t("properties"),
      icon: Info,
      onClick: () => {
        store.openWindow({
          type: "properties",
          title: `${t("properties")} — ${node.name}`,
          nodeId: node.id,
          width: 420,
          height: 480,
        });
      },
    },
  ];
}

function buildEmptyItems(
  currentPath: string,
  store: ReturnType<
    typeof useFileForge.getState
  >,
  close: () => void,
  t: (
    key: TranslationKey,
    params?: Record<string, string | number>
  ) => string
): MenuItem[] {
  return [
    {
      type: "item",
      label: t("newFolder"),
      icon: FolderOpen,
      onClick: () => {
        const name = prompt(
          t("folderName"),
          t("newFolderDefault")
        );

        if (name) {
          store.createFolder(
            currentPath,
            name
          );
        }
      },
    },

    {
      type: "item",
      label: t("newFile"),
      icon: FileText,
      onClick: () => {
        const name = prompt(
          t("fileName"),
          t("newFileDefault")
        );

        if (name) {
          store.createFile(
            currentPath,
            name,
            ""
          );
        }
      },
    },

    { type: "separator" },

    {
      type: "item",
      label: t("paste"),
      icon: Copy,
      disabled: !store.clipboard,
      shortcut: "Ctrl+V",
      onClick: () =>
        store.clipboard &&
        store.pasteFromClipboard(
          currentPath
        ),
    },

    { type: "separator" },

    {
      type: "item",
      label: t("selectAll"),
      icon: Info,
      shortcut: "Ctrl+A",
      onClick: () =>
        store.selectAll(),
    },

    {
      type: "item",
      label: t("sortBy"),
      icon: Info,
      onClick: () =>
        store.addToast(
          t("sortBy"),
          "info"
        ),
    },
  ];
}