"use client";

import { useMemo, useState } from "react";
import { Archive, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getNode } from "@/lib/fileforge/filesystem";
import { archiveService } from "@/lib/fileforge/archive-service";
import { useFileForge } from "@/store/fileforge-store";
import { isNative } from "@/lib/fileforge/native-bridge";

export type CompressionFormat = "zip" | "tar" | "tar.gz" | "tar.bz2" | "tar.xz" | "gz" | "bz2" | "xz" | "rar" | "7z";

const OPTIONS: Array<{ value: CompressionFormat; label: string; native: boolean; singleOnly?: boolean }> = [
  { value: "zip", label: "ZIP", native: true },
  { value: "tar", label: "TAR", native: true },
  { value: "tar.gz", label: "TAR.GZ", native: true },
  { value: "tar.bz2", label: "TAR.BZ2", native: true },
  { value: "tar.xz", label: "TAR.XZ", native: true },
  { value: "gz", label: "GZ", native: true, singleOnly: true },
  { value: "bz2", label: "BZIP2 (.BZ2)", native: true, singleOnly: true },
  { value: "xz", label: "XZ", native: true, singleOnly: true },
  { value: "rar", label: "RAR", native: false },
  { value: "7z", label: "7Z", native: true },
];

export function CompressionDialog({ sourceIds, onClose }: { sourceIds: string[]; onClose: () => void }) {
  const store = useFileForge();
  const [format, setFormat] = useState<CompressionFormat>("zip");
  const [busy, setBusy] = useState(false);

  const nodes = useMemo(() => sourceIds.map(getNode).filter(Boolean), [sourceIds]);
  const parent = nodes[0]?.parentId ?? "";
  const hasFolder = nodes.some((n) => n?.kind === "folder");
  const selected = OPTIONS.find((o) => o.value === format)!;
  const allowed = isNative() ? selected.native && format !== "rar" && (!selected.singleOnly || (sourceIds.length === 1 && !hasFolder)) : format === "zip";

  const start = async () => {
    if (!allowed || busy || sourceIds.length === 0) return;
    setBusy(true);
    try {
      const base = sourceIds.length === 1
        ? (nodes[0]?.name ?? "archive").replace(/\.[^.]+$/, "")
        : "archive";
      const target = `${parent ? parent.replace(/\/$/, "") + "/" : ""}${base}.${format}`;
      await archiveService.compress(sourceIds, target, format);
      store.addToast(`تم إنشاء ${base}.${format} بنجاح`, "success");
      store.bumpFsVersion();
      onClose();
    } catch (e) {
      store.addToast(`فشل الضغط: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-xl border bg-popover shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Archive className="h-4 w-4 text-orange-500" />
          <div className="flex-1 font-medium">اختيار نوع الضغط</div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} disabled={busy}><X className="h-4 w-4" /></Button>
        </div>
        <div className="space-y-2 p-4">
          {OPTIONS.map((option) => {
            const canUse = isNative() ? option.native && (!option.singleOnly || (sourceIds.length === 1 && !hasFolder)) && option.value !== "rar" : option.value === "zip";
            return (
              <button
                key={option.value}
                type="button"
                disabled={!canUse || busy}
                onClick={() => setFormat(option.value)}
                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${format === option.value ? "border-orange-500 bg-orange-500/10" : "border-border hover:bg-accent"} ${!canUse ? "cursor-not-allowed opacity-40" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{option.label}</span>
                  {!canUse && <span className="text-[10px] text-muted-foreground">غير مدعوم للإنشاء</span>}
                </div>
              </button>
            );
          })}
          {!isNative() && <div className="text-[11px] text-muted-foreground">في نسخة الويب، إنشاء الأرشيف مدعوم بصيغة ZIP فقط.</div>}
          {isNative() && format === "rar" && <div className="text-[11px] text-muted-foreground">RAR creation is not available with the bundled native libraries.</div>}
          {isNative() && hasFolder && ["gz", "bz2", "xz"].includes(format) && <div className="text-[11px] text-muted-foreground">هذه الصيغة تضغط ملفًا واحدًا فقط. استخدم ZIP أو TAR للمجلدات.</div>}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="ghost" onClick={onClose} disabled={busy}>إلغاء</Button>
          <Button onClick={start} disabled={!allowed || busy}>{busy ? "جارٍ الضغط…" : "بدء الضغط"}</Button>
        </div>
      </div>
    </div>
  );
}
