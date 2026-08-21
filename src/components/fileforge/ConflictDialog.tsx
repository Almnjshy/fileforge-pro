// FileForge Pro — Conflict Resolution Dialog
//
// Shows when a file operation would overwrite an existing file.
// Options: Overwrite, Skip, Keep Both, Cancel.

"use client";

import { AlertTriangle, FileText, Replace, SkipForward, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-store";

export type ConflictChoice = "overwrite" | "skip" | "keep_both" | "cancel";

interface ConflictDialogProps {
  fileName: string;
  onResolve: (choice: ConflictChoice) => void;
}

export function ConflictDialog({ fileName, onResolve }: ConflictDialogProps) {
  const { lang } = useI18n();
  const tr = (en: string, ar: string) => lang === "ar" ? ar : en;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => onResolve("cancel")}
    >
      <div className="bg-background rounded-xl shadow-2xl border max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{tr("File Exists", "الملف موجود")}</div>
            <div className="text-xs text-muted-foreground truncate">"{fileName}"</div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
            onClick={() => onResolve("cancel")}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-3 space-y-1.5">
          <ConflictOption
            icon={Replace}
            label={tr("Overwrite", "استبدال")}
            description={tr("Replace the existing file", "استبدال الملف الموجود")}
            onClick={() => onResolve("overwrite")}
          />
          <ConflictOption
            icon={SkipForward}
            label={tr("Skip", "تخطي")}
            description={tr("Don't copy this file", "لا تنسخ هذا الملف")}
            onClick={() => onResolve("skip")}
          />
          <ConflictOption
            icon={Copy}
            label={tr("Keep Both", "الاحتفاظ بكليهما")}
            description={tr("Rename the new file", "إعادة تسمية الملف الجديد")}
            onClick={() => onResolve("keep_both")}
          />
        </div>
      </div>
    </div>
  );
}

function ConflictOption({ icon: Icon, label, description, onClick }: {
  icon: typeof FileText;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border border-border hover:bg-accent hover:border-orange-400/30 text-left transition-colors"
    >
      <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}
