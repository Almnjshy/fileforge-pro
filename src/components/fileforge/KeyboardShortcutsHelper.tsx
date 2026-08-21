// FileForge Pro — Keyboard Shortcuts Helper dialog (bilingual)
"use client";

import { Keyboard, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/i18n-store";
import type { TranslationKey } from "@/lib/i18n/translations";
import { Button } from "@/components/ui/button";

const SHORTCUTS: { categoryKey: TranslationKey; items: { keys: string; labelKey?: TranslationKey; label?: string }[] }[] = [
  {
    categoryKey: "navigation",
    items: [
      // Alt + ←/→/↑ for back/forward/up are not implemented in the app's
      // keyboard handler, so the helper no longer lists them (was misleading).
      { keys: "Ctrl + F", labelKey: "search" },
    ],
  },
  {
    categoryKey: "view",
    items: [
      { keys: "Alt + 1", labelKey: "viewModeLargeGrid" },
      { keys: "Alt + 2", labelKey: "viewModeMediumGrid" },
      { keys: "Alt + 3", labelKey: "viewModeSmallGrid" },
      { keys: "Alt + 4", labelKey: "viewModeList" },
      { keys: "Alt + 5", labelKey: "viewModeCompactList" },
      { keys: "Alt + 6", labelKey: "viewModeDetails" },
    ],
  },
  {
    categoryKey: "selection",
    items: [
      { keys: "Ctrl + A", labelKey: "selectAll" },
      // Ctrl + Click toggles selection (was mislabeled "Add to Favorites");
      // Shift + Click selects a range (was mislabeled "Select All"). These
      // are kept as literal strings to avoid adding new translation keys.
      { keys: "Ctrl + Click", label: "Toggle Selection" },
      { keys: "Shift + Click", label: "Select Range" },
      { keys: "Esc", labelKey: "close" },
    ],
  },
  {
    categoryKey: "filesOps",
    items: [
      { keys: "Ctrl + C", labelKey: "copy" },
      { keys: "Ctrl + X", labelKey: "cut" },
      { keys: "Ctrl + V", labelKey: "paste" },
      { keys: "F2", labelKey: "rename" },
      { keys: "Delete", labelKey: "delete" },
    ],
  },
  {
    categoryKey: "windowsOps",
    items: [
      // Ctrl + N opens a new floating window (not a folder), so the label
      // is corrected to "New Window".
      { keys: "Ctrl + N", label: "New Window" },
      { keys: "Ctrl + Shift + W", labelKey: "closeAll" },
      { keys: "Alt + D", labelKey: "toggleDualPane" },
    ],
  },
];

export function KeyboardShortcutsHelper({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b">
          <Keyboard className="h-5 w-5 text-orange-500" />
          <h2 className="font-semibold flex-1">{t("keyboardShortcuts")}</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
          {SHORTCUTS.map(group => (
            <div key={group.categoryKey}>
              <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">{t(group.categoryKey)}</h3>
              <div className="space-y-1">
                {group.items.map(item => (
                  <div key={item.keys} className="flex items-center justify-between text-sm py-1">
                    <span>{item.label ?? (item.labelKey ? t(item.labelKey) : item.keys)}</span>
                    <kbd className="px-2 py-0.5 text-[11px] font-mono bg-muted border rounded">{item.keys}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
