// FileForge Pro — Toast notifications container
"use client";

import { useFileForge } from "@/store/fileforge-store";
import { CheckCircle2, Info, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function ToastContainer() {
  const store = useFileForge();

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] flex flex-col gap-2 items-center pointer-events-none"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {store.toasts.map(t => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-center gap-2 rounded-lg px-4 py-2.5 shadow-xl border bg-popover text-popover-foreground animate-in slide-in-from-bottom-4 fade-in",
            t.type === "success" && "border-emerald-500/30",
            t.type === "error" && "border-red-500/30",
            t.type === "info" && "border-orange-500/30"
          )}
        >
          {t.type === "success" && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
          {t.type === "info" && <Info className="h-4 w-4 text-orange-500 flex-shrink-0" />}
          {t.type === "error" && <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
          <span className="text-sm">{t.message}</span>
          <button
            onClick={() => store.dismissToast(t.id)}
            aria-label="Close"
            className="ml-2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
