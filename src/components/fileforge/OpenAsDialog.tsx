// FileForge Pro — "Open As..." Dialog
//
// Lets the user choose which viewer to open a file in, overriding the
// auto-detected type. Shows all available ViewerType options.
// Calls fileOpenManager.openFile(node, store, chosenViewerType).

"use client";

import {
  FileText, Image, Video, Music, File as FileIcon, Archive,
  Globe, Code, FileCode, ExternalLink, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { fileOpenManager, type ViewerType } from "@/lib/fileforge/file-open-manager";
import type { FileNode } from "@/lib/fileforge/types";
import { cn } from "@/lib/utils";

const ICONS: Record<string, typeof FileText> = {
  "file-text": FileText,
  "image": Image,
  "video": Video,
  "music": Music,
  "file": FileIcon,
  "archive": Archive,
  "globe": Globe,
  "code": Code,
  "file-code": FileCode,
  "external-link": ExternalLink,
};

interface OpenAsDialogProps {
  node: FileNode;
  onClose: () => void;
}

export function OpenAsDialog({ node, onClose }: OpenAsDialogProps) {
  const store = useFileForge();
  const { t, lang } = useI18n();
  const detected = fileOpenManager.detectViewer(node.name);

  const options = [
    { type: "text" as ViewerType, label: "Text", labelAr: "نص", icon: "file-text" },
    { type: "image" as ViewerType, label: "Image", labelAr: "صورة", icon: "image" },
    { type: "video" as ViewerType, label: "Video", labelAr: "فيديو", icon: "video" },
    { type: "audio" as ViewerType, label: "Audio", labelAr: "صوت", icon: "music" },
    { type: "pdf" as ViewerType, label: "PDF", labelAr: "PDF", icon: "file" },
    { type: "archive" as ViewerType, label: "Archive", labelAr: "أرشيف", icon: "archive" },
    { type: "html" as ViewerType, label: "Web / HTML", labelAr: "ويب / HTML", icon: "globe" },
    { type: "json" as ViewerType, label: "JSON", labelAr: "JSON", icon: "code" },
    { type: "xml" as ViewerType, label: "XML", labelAr: "XML", icon: "code" },
    { type: "markdown" as ViewerType, label: "Markdown", labelAr: "ماركداون", icon: "file-text" },
    { type: "hex" as ViewerType, label: "Hex / Binary", labelAr: "Hex / ثنائي", icon: "file-code" },
    { type: "external" as ViewerType, label: "External App", labelAr: "تطبيق خارجي", icon: "external-link" },
  ];

  const handleChoose = (viewerType: ViewerType) => {
    fileOpenManager.openFile(node, store, viewerType);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl shadow-2xl border max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <FileIcon className="h-5 w-5 text-orange-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{node.name}</div>
            <div className="text-xs text-muted-foreground">
              {lang === "ar" ? "افتح كـ" : "Open as..."}
              {detected !== "properties" && (
                <span className="ml-1">
                  ({lang === "ar" ? "مُكتشف: " : "detected: "}{detected})
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Options grid */}
        <div className="p-3 grid grid-cols-2 gap-1.5 max-h-[60vh] overflow-y-auto">
          {options.map((opt) => {
            const Icon = ICONS[opt.icon] ?? FileIcon;
            const isDetected = opt.type === detected;
            return (
              <button
                key={opt.type}
                onClick={() => handleChoose(opt.type)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-sm transition-colors text-left",
                  isDetected
                    ? "border-orange-500/40 bg-orange-50/50 dark:bg-orange-950/20"
                    : "border-border hover:bg-accent hover:border-orange-400/30",
                )}
              >
                <Icon className={cn("h-4 w-4 flex-shrink-0", isDetected ? "text-orange-500" : "text-muted-foreground")} />
                <span className="flex-1 truncate">{lang === "ar" ? opt.labelAr : opt.label}</span>
                {isDetected && (
                  <span className="text-[9px] text-orange-500 font-medium">
                    {lang === "ar" ? "تلقائي" : "auto"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t text-[10px] text-muted-foreground text-center">
          {lang === "ar"
            ? "اختر طريقة فتح الملف. الاختيار الافتراضي محدد."
            : "Choose how to open this file. The default is highlighted."}
        </div>
      </div>
    </div>
  );
}
