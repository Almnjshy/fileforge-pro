// FileForge Pro — Operations Panel (real progress bars)
//
// Subscribes to the FileOperationEngine and renders a real progress bar
// for each active operation. Progress is calculated from actual bytes/files
// processed — no fake animations.

"use client";

import { useState, useEffect } from "react";
import {
  Copy, Move, Trash2, Archive, FileArchive, Pencil, FolderPlus, FilePlus,
  X, Check, AlertCircle, Loader2, Pause, Play,
} from "lucide-react";
import { fileOperationEngine, type FileOperation, type OperationType } from "@/lib/fileforge/file-operation-engine";
import { useI18n } from "@/lib/i18n/i18n-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ICONS: Record<OperationType, typeof Copy> = {
  copy: Copy,
  move: Move,
  delete: Trash2,
  extract: Archive,
  compress: FileArchive,
  rename: Pencil,
  createFolder: FolderPlus,
  createFile: FilePlus,
};

export function OperationsPanel() {
  const { t } = useI18n();
  const [ops, setOps] = useState<FileOperation[]>([]);

  useEffect(() => {
    return fileOperationEngine.subscribe((operations) => {
      setOps(operations);
    });
  }, []);

  // Auto-remove completed ops after 5 seconds (keep failed ones for review)
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const op of ops) {
      if (op.status === "completed" && op.finishedAt && Date.now() - op.finishedAt > 5000) {
        const id = setTimeout(() => fileOperationEngine.removeOperation(op.id), 1000);
        timers.push(id);
      }
    }
    return () => timers.forEach(clearTimeout);
  }, [ops]);

  if (ops.length === 0) return null;

  const active = ops.filter(op => ["pending", "running", "paused"].includes(op.status));
  const finished = ops.filter(op => ["completed", "failed", "cancelled"].includes(op.status));

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-[min(420px,92vw)] max-h-[75vh] overflow-y-auto pointer-events-auto">
      <div className="rounded-lg border bg-background/95 shadow-lg backdrop-blur-sm px-3 py-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold">File Operations</span>
          <span className="text-muted-foreground">{active.length} active{finished.length ? ` · ${finished.length} finished` : ""}</span>
        </div>
      </div>
      {ops.map(op => <OperationCard key={op.id} op={op} />)}
    </div>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2)} ${units[i]}`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatProgress(op: FileOperation): string {
  if (op.progressBasis === "bytes" || op.type === "copy" || op.type === "move" || op.type === "compress") {
    return `${formatBytes(op.current)} / ${formatBytes(op.total)}`;
  }
  if (op.type === "extract") return `${Math.round(op.current)} / ${Math.round(op.total)} files`;
  return `${Math.round(op.current)} / ${Math.round(op.total)}`;
}

function OperationCard({ op }: { op: FileOperation }) {
  const Icon = ICONS[op.type] ?? Loader2;
  const pct = Math.round(op.progress * 100);

  const statusColor =
    op.status === "completed" ? "border-green-500/40 bg-green-50/80 dark:bg-green-950/20" :
    op.status === "failed" ? "border-red-500/40 bg-red-50/80 dark:bg-red-950/20" :
    op.status === "cancelled" ? "border-yellow-500/40 bg-yellow-50/80 dark:bg-yellow-950/20" :
    "border-border bg-background/95";

  return (
    <div className={cn("rounded-lg border shadow-lg p-3 backdrop-blur-sm", statusColor)}>
      <div className="flex items-center gap-2 mb-2">
        {op.status === "running" ? (
          <Loader2 className="h-4 w-4 animate-spin text-orange-500 flex-shrink-0" />
        ) : op.status === "completed" ? (
          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
        ) : op.status === "failed" ? (
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        ) : (
          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-sm font-medium flex-1 truncate">{op.description}</span>
        {op.cancellable && (op.status === "running" || op.status === "paused") && (
          <Button
            variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0"
            onClick={() => op.status === "running" ? fileOperationEngine.pauseOperation(op.id) : fileOperationEngine.resumeOperation(op.id)}
            aria-label={op.status === "running" ? "Pause" : "Resume"}
          >
            {op.status === "running" ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
        )}
        {op.cancellable && (op.status === "running" || op.status === "paused") && (
          <Button
            variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0"
            onClick={() => fileOperationEngine.cancelOperation(op.id)}
            aria-label="Cancel"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
        {(op.status === "completed" || op.status === "failed" || op.status === "cancelled") && (
          <Button
            variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0"
            onClick={() => fileOperationEngine.removeOperation(op.id)}
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Real progress bar */}
      {(op.status === "running" || op.status === "paused") && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-500 transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground gap-2">
            <span>{op.status === "paused" ? "Paused" : `${pct}%`}</span>
            {op.total > 0 && (
              <span className="truncate text-right">
                {formatProgress(op)}
              </span>
            )}
          </div>
          {(op.speed || op.etaSeconds !== undefined || op.currentPath) && (
            <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
              <div className="flex justify-between gap-2">
                <span>{op.speed ? `${formatBytes(op.speed)}/s` : ""}</span>
                <span>{op.etaSeconds !== undefined && op.status !== "paused" ? `ETA ${formatDuration(op.etaSeconds)}` : ""}</span>
              </div>
              {op.currentPath && <div className="truncate" title={op.currentPath}>{op.currentPath}</div>}
            </div>
          )}
        </div>
      )}

      {op.status === "failed" && op.error && (
        <div className="text-xs text-red-600 dark:text-red-400 mt-1">{op.error}</div>
      )}
      {op.status === "cancelled" && (
        <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">Cancelled</div>
      )}
    </div>
  );
}
