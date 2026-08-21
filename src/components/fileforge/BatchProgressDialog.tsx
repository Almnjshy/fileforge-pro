// FileForge Pro — Batch Progress Dialog
"use client";

import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export function BatchProgressDialog() {
  const store = useFileForge();
  const { t } = useI18n();
  const progress = store.batchProgress;
  if (!progress) return null;

  const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;
  const isDone = progress.completed >= progress.total && !progress.cancelled;
  const isCancelled = progress.cancelled;

  return (
    <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          {isDone ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          ) : isCancelled ? (
            <AlertCircle className="h-5 w-5 text-orange-500" />
          ) : (
            <Loader2 className="h-5 w-5 text-orange-500 animate-spin" />
          )}
          <h2 className="font-semibold flex-1">
            {isDone ? "Completed" : isCancelled ? "Cancelled" : "Processing..."}
          </h2>
          {!isDone && (
            <Button variant="ghost" size="sm" onClick={() => store.cancelBatch()}>
              {t("close")}
            </Button>
          )}
        </div>
        <div className="p-4 space-y-3">
          <div className="text-sm">
            {progress.completed} / {progress.total} {t("items")}
          </div>
          {progress.current && (
            <div className="text-xs text-muted-foreground truncate font-mono">
              {progress.current}
            </div>
          )}
          <Progress value={pct} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{Math.round(pct)}%</span>
            {!isDone && !isCancelled && (
              <Button variant="outline" size="sm" onClick={() => store.cancelBatch()}>
                {t("close")}
              </Button>
            )}
            {(isDone || isCancelled) && (
              <Button size="sm" onClick={() => store.setBatchProgress(null)}>
                {t("close")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
