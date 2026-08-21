// FileForge Pro — Welcome / Onboarding overlay (bilingual)
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { registerOverlay } from "@/lib/fileforge/back-handler";
import {
  X, Columns2, Layers, MousePointer2, FileText, Eye, Search, BarChart3,
  Sparkles, ArrowRight, ArrowLeft,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n/translations";

const SLIDES: { icon: typeof Sparkles; titleKey: TranslationKey; subtitleKey: TranslationKey; descKey: TranslationKey; color: string }[] = [
  { icon: Sparkles, titleKey: "welcomeTitle", subtitleKey: "appTagline", descKey: "welcomeDesc", color: "from-orange-500 to-amber-500" },
  { icon: Columns2, titleKey: "dualPaneTitle", subtitleKey: "dualPaneSubtitle", descKey: "dualPaneDesc", color: "from-emerald-500 to-teal-500" },
  { icon: Layers, titleKey: "floatingWindowsTitle", subtitleKey: "floatingWindowsSubtitle", descKey: "floatingWindowsDesc", color: "from-violet-500 to-purple-500" },
  { icon: MousePointer2, titleKey: "contextMenuTitle", subtitleKey: "contextMenuSubtitle", descKey: "contextMenuDesc", color: "from-sky-500 to-blue-500" },
  { icon: FileText, titleKey: "textEditorTitle", subtitleKey: "textEditorSubtitle", descKey: "textEditorDesc", color: "from-pink-500 to-rose-500" },
  { icon: Eye, titleKey: "quickPreviewTitle", subtitleKey: "quickPreviewSubtitle", descKey: "quickPreviewDesc", color: "from-amber-500 to-yellow-500" },
  { icon: Search, titleKey: "searchTitle", subtitleKey: "searchSubtitle", descKey: "searchDesc", color: "from-indigo-500 to-violet-500" },
  { icon: BarChart3, titleKey: "storageAnalyzerTitle", subtitleKey: "storageAnalyzerSubtitle", descKey: "storageAnalyzerDesc", color: "from-red-500 to-orange-500" },
];

export function WelcomeOverlay({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const [slide, setSlide] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Track all tabbable buttons so we can focus the first one on mount and
  // implement a simple Tab trap.
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const current = SLIDES[slide];
  const Icon = current.icon;
  const isLast = slide === SLIDES.length - 1;
  const isRTL = lang === "ar";
  const NextIcon = isRTL ? ArrowLeft : ArrowRight;

  const goNext = useCallback(() => {
    setSlide(s => (s < SLIDES.length - 1 ? s + 1 : s));
  }, []);
  const goPrev = useCallback(() => {
    setSlide(s => (s > 0 ? s - 1 : s));
  }, []);

  // Keyboard navigation: arrow keys move between slides, Esc closes,
  // Tab is trapped within the overlay.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (isRTL) goPrev(); else goNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (isRTL) goNext(); else goPrev();
        return;
      }
      if (e.key === "Tab") {
        // Simple focus trap: keep Tab inside the dialog
        const root = dialogRef.current;
        if (!root) return;
        const focusable = root.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, goNext, goPrev, isRTL]);

  // Focus the close button on mount so screen readers announce the dialog.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Register as a back-button overlay so Android Back closes this instead of exiting.
  useEffect(() => {
    const unregister = registerOverlay();
    const handler = () => onClose();
    window.addEventListener("fileforge-close-overlay", handler);
    return () => {
      unregister();
      window.removeEventListener("fileforge-close-overlay", handler);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("welcomeTitle")}
        className="relative w-full max-w-2xl rounded-2xl border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          ref={closeButtonRef}
          variant="ghost" size="icon"
          className="absolute top-3 right-3 z-10 h-8 w-8"
          onClick={onClose}
          aria-label={t("close")}
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="p-6 sm:p-8 overflow-y-auto">
          <div className={cn(
            "h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-br flex items-center justify-center text-white shadow-lg mb-4 sm:mb-5",
            current.color
          )}>
            <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mb-1">{t(current.titleKey)}</h2>
          <div className="text-sm text-muted-foreground mb-4">{t(current.subtitleKey)}</div>
          <p className="text-sm leading-relaxed text-foreground/90">{t(current.descKey)}</p>
        </div>

        <div className="flex items-center justify-between px-6 sm:px-8 py-4 border-t bg-muted/30">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === slide ? "w-6 bg-orange-500" : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/60"
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {slide > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSlide(slide - 1)}>
                {t("previous")}
              </Button>
            )}
            {!isLast ? (
              <Button size="sm" onClick={() => setSlide(slide + 1)} className="gap-1.5">
                {t("next")} <NextIcon className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={onClose} className="gap-1.5 bg-gradient-to-r from-orange-500 to-amber-500">
                <Sparkles className="h-3.5 w-3.5" /> {t("startUsing")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
