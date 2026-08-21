"use client";

import { useMemo, useState } from "react";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import {
  SecureVault,
  type VaultEntry,
} from "@/lib/fileforge/secure-vault";
import {
  nativeFileSystem,
  isNative,
} from "@/lib/fileforge/native-bridge";
import {
  Lock,
  Unlock,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Shield,
  RotateCcw,
  X,
  Folder,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }

  return out.buffer;
}

function mimeFor(name: string): string {
  const ext =
    name.split(".").pop()?.toLowerCase() ?? "";

  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",

    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",

    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/mp4",

    pdf: "application/pdf",
    txt: "text/plain",
    md: "text/markdown",
    json: "application/json",
  };

  return (
    map[ext] ??
    "application/octet-stream"
  );
}

function collectFiles(
  entry: any,
  prefix = ""
): Array<{
  path: string;
  name: string;
  kind: string;
  base64?: string;
  size: number;
}> {
  const current = prefix
    ? `${prefix}/${entry.name}`
    : entry.name;

  if (entry.kind === "folder") {
    return (entry.entries ?? []).flatMap(
      (child: any) =>
        collectFiles(child, current)
    );
  }

  return [
    {
      path: current,
      name: entry.name,
      kind: entry.kind,
      base64: entry.base64,
      size: Number(
        entry.size ?? 0
      ),
    },
  ];
}

export function SecureVaultPanel() {
  const store = useFileForge();
  const { t } = useI18n();

  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] =
    useState(false);
  const [error, setError] = useState("");
  const [showPin, setShowPin] =
    useState(false);
  const [entries, setEntries] =
    useState<VaultEntry[]>([]);
  const [preview, setPreview] =
    useState<{
      entry: VaultEntry;
      envelope: any;
      url?: string;
    } | null>(null);
  const [busyId, setBusyId] =
    useState<string | null>(null);
  const [newName, setNewName] =
    useState("");
  const [newContent, setNewContent] =
    useState("");

  const refresh = () =>
    setEntries(
      SecureVault.getEntries()
    );

  const handleSetPin = async () => {
    if (pin.length < 4) {
      setError(
        "PIN must be at least 4 digits"
      );
      return;
    }

    await SecureVault.setPin(pin);
    setUnlocked(true);
    refresh();
    setError("");
  };

  const handleUnlock = async () => {
    try {
      if (
        await SecureVault.verifyPin(pin)
      ) {
        setUnlocked(true);
        refresh();
        setError("");
      } else {
        setError(
          `Wrong PIN — ${Math.max(
            0,
            5 -
              SecureVault.getFailedAttempts()
          )} attempts left`
        );
      }
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "";

      setError(
        msg.startsWith("VAULT_LOCKED:")
          ? `Too many attempts. Try again in ${Math.ceil(
              Number(
                msg.split(":")[1] ?? 0
              ) / 1000
            )}s.`
          : "Wrong PIN"
      );
    }
  };

  const handleAdd = async () => {
    if (!newName || !newContent)
      return;

    const {
      encryptedData,
      iv,
    } = await SecureVault.encrypt(
      newContent,
      pin
    );

    await SecureVault.addEntry({
      name: newName,
      kind: "text",
      size: newContent.length,
      encryptedData,
      iv,
    });

    refresh();
    setNewName("");
    setNewContent("");

    store.addToast(
      "Added to vault",
      "success"
    );
  };

  const handlePreview = async (
    entry: VaultEntry
  ) => {
    try {
      setBusyId(entry.id);

      const envelope =
        await SecureVault.decryptEntry(
          entry,
          pin
        );

      let url:
        | string
        | undefined;

      if (
        envelope.kind !== "folder" &&
        envelope.base64
      ) {
        const blob = new Blob(
          [decodeBase64(envelope.base64)],
          {
            type: mimeFor(
              envelope.name
            ),
          }
        );

        url =
          URL.createObjectURL(blob);
      }

      setPreview({
        entry,
        envelope,
        url,
      });
    } catch {
      setError(
        "Failed to decrypt preview"
      );
    } finally {
      setBusyId(null);
    }
  };

  const restoreEnvelope = async (
    envelope: any,
    destination: string,
    root = true
  ): Promise<string> => {
    if (
      envelope.kind === "folder"
    ) {
      const folderRef =
        await nativeFileSystem.createDirectory(
          destination,
          envelope.name
        );

      for (
        const child of
          envelope.entries ?? []
      ) {
        await restoreEnvelope(
          child,
          folderRef,
          false
        );
      }

      return folderRef;
    }

    const parent = destination;
    const safeName =
      envelope.name ||
      "restored-file";

    const target = parent.startsWith(
      "content://"
    )
      ? `${parent.replace(
          /\/$/,
          ""
        )}/${encodeURIComponent(
          safeName
        )}`
      : `${parent.replace(
          /\/$/,
          ""
        )}/${safeName}`;

    const ok =
      await nativeFileSystem.writeBase64(
        target,
        envelope.base64 ?? "",
        mimeFor(safeName)
      );

    if (!ok) {
      throw new Error(
        `Could not restore ${safeName}`
      );
    }

    return target;
  };

  const handleRestore = async (
    entry: VaultEntry
  ) => {
    try {
      setBusyId(entry.id);

      const envelope =
        await SecureVault.decryptEntry(
          entry,
          pin
        );

      if (!isNative()) {
        if (envelope.base64) {
          const blob = new Blob(
            [decodeBase64(envelope.base64)],
            {
              type: mimeFor(
                envelope.name
              ),
            }
          );

          const a =
            document.createElement("a");

          a.href =
            URL.createObjectURL(blob);
          a.download =
            envelope.name;
          a.click();
        }

        return;
      }

      let destination =
        entry.sourceParent ||
        envelope.parentRef ||
        "/storage/emulated/0";

      if (
        !destination ||
        destination === "null"
      ) {
        destination =
          "/storage/emulated/0";
      }

      await restoreEnvelope(
        envelope,
        destination
      );

      SecureVault.removeEntry(
        entry.id
      );

      refresh();
      store.bumpFsVersion();

      store.addToast(
        `تمت استعادة ${entry.name}`,
        "success"
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Restore failed"
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = (
    id: string
  ) => {
    SecureVault.removeEntry(id);
    refresh();
  };

  if (!SecureVault.isPinSet()) {
    return (
      <div className="flex flex-col h-full p-6 gap-4">
        <div className="flex flex-col items-center text-center gap-3 pb-4 border-b">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-lg">
            <Shield className="h-8 w-8" />
          </div>

          <div>
            <div className="font-semibold text-lg">
              {t("secureVault")}
            </div>

            <div className="text-xs text-muted-foreground">
              Set a PIN to protect your sensitive files
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Input
              type={
                showPin
                  ? "text"
                  : "password"
              }
              placeholder="Enter PIN (min 4 digits)"
              value={pin}
              onChange={e =>
                setPin(e.target.value)
              }
              onKeyDown={e =>
                e.key === "Enter" &&
                handleSetPin()
              }
              className="pr-10"
            />

            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              onClick={() =>
                setShowPin(!showPin)
              }
            >
              {showPin ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>

          {error && (
            <div className="text-xs text-destructive">
              {error}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleSetPin}
          >
            <Lock className="h-4 w-4 mr-2" />
            Set PIN & Create Vault
          </Button>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="flex flex-col h-full p-6 gap-4">
        <div className="flex flex-col items-center text-center gap-3 pb-4 border-b">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center text-white shadow-lg">
            <Lock className="h-8 w-8" />
          </div>

          <div>
            <div className="font-semibold text-lg">
              {t("secureVault")}
            </div>

            <div className="text-xs text-muted-foreground">
              Enter your PIN to unlock
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Input
            type={
              showPin
                ? "text"
                : "password"
            }
            placeholder="Enter PIN"
            value={pin}
            onChange={e =>
              setPin(e.target.value)
            }
            onKeyDown={e =>
              e.key === "Enter" &&
              handleUnlock()
            }
            autoFocus
          />

          {error && (
            <div className="text-xs text-destructive">
              {error}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleUnlock}
          >
            <Unlock className="h-4 w-4 mr-2" />
            Unlock
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full overflow-hidden bg-background text-foreground">
      <div className="p-4 border-b bg-background/95 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <Unlock className="h-5 w-5 text-emerald-500" />

          <h2 className="font-semibold flex-1">
            {t("secureVault")}
          </h2>

          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setUnlocked(false)
            }
          >
            <Lock className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
          <Input
            placeholder="Entry name"
            value={newName}
            onChange={e =>
              setNewName(e.target.value)
            }
            className="h-8 text-sm"
          />

          <textarea
            placeholder="Secret content"
            value={newContent}
            onChange={e =>
              setNewContent(e.target.value)
            }
            className="w-full min-h-[60px] p-2 text-sm rounded border bg-background"
          />

          <Button
            size="sm"
            className="w-full"
            onClick={handleAdd}
            disabled={
              !newName ||
              !newContent
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Entry
          </Button>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs text-destructive border-b">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-2">
          {entries.map(entry => (
            <div
              key={entry.id}
              className="flex items-center gap-2 p-2 rounded border bg-card text-card-foreground hover:bg-accent/50"
            >
              <Lock className="h-4 w-4 text-orange-500 shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {entry.name}
                </div>

                <div className="text-[10px] text-muted-foreground">
                  {entry.size} bytes · encrypted
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  handlePreview(entry)
                }
                disabled={
                  busyId === entry.id
                }
              >
                <Eye className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-emerald-600"
                onClick={() =>
                  handleRestore(entry)
                }
                disabled={
                  busyId === entry.id
                }
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() =>
                  handleRemove(entry.id)
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>

        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
            <Shield className="h-12 w-12 opacity-30" />
            <div className="text-sm">
              No entries yet
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div className="absolute inset-0 z-20 bg-background flex flex-col">
          <div className="flex items-center gap-2 border-b p-3">
            <Shield className="h-4 w-4 text-orange-500" />

            <div className="font-medium flex-1 truncate">
              {preview.entry.name}
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (preview.url) {
                  URL.revokeObjectURL(
                    preview.url
                  );
                }

                setPreview(null);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-4">
            {preview.envelope.kind ===
            "folder" ? (
              <div className="space-y-1">
                {collectFiles(
                  preview.envelope
                ).map(file => (
                  <div
                    key={file.path}
                    className="flex items-center gap-2 p-2 rounded border bg-card"
                  >
                    <File className="h-4 w-4" />

                    <span className="text-sm truncate">
                      {file.path}
                    </span>

                    <span className="ml-auto text-xs text-muted-foreground">
                      {file.size} B
                    </span>
                  </div>
                ))}
              </div>
            ) : preview.url &&
              mimeFor(
                preview.envelope.name
              ).startsWith("image/") ? (
              <img
                src={preview.url}
                className="max-w-full max-h-full mx-auto object-contain"
                alt={
                  preview.envelope.name
                }
              />
            ) : preview.url &&
              mimeFor(
                preview.envelope.name
              ).startsWith("video/") ? (
              <video
                src={preview.url}
                controls
                className="w-full max-h-full"
              />
            ) : preview.url &&
              mimeFor(
                preview.envelope.name
              ).startsWith("audio/") ? (
              <audio
                src={preview.url}
                controls
                className="w-full"
              />
            ) : preview.envelope
                .base64 ? (
              <pre className="whitespace-pre-wrap break-words text-sm">
                {new TextDecoder().decode(
                  decodeBase64(
                    preview.envelope
                      .base64
                  )
                )}
              </pre>
            ) : (
              <div className="text-sm text-muted-foreground">
                لا توجد معاينة لهذا النوع.
              </div>
            )}
          </div>

          <div className="border-t p-3 flex justify-end">
            <Button
              onClick={() =>
                handleRestore(
                  preview.entry
                )
              }
              disabled={
                busyId ===
                preview.entry.id
              }
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              استعادة
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}