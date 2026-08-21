// FileForge Pro — Settings panel (bilingual + accent colors + backgrounds)
"use client";

import { useFileForge } from "@/store/fileforge-store";
import { useI18n } from "@/lib/i18n/i18n-store";
import { useCustomization, type AccentColor, type BackgroundType } from "@/lib/fileforge/customization";
import type { Lang } from "@/lib/i18n/translations";
import {
  Sun, Moon, Monitor, Folder, Shield, Bell, Info, Languages, Palette, ImageIcon, Accessibility, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { ThemeMode } from "@/lib/fileforge/types";
import { useEffect, useMemo, useState } from "react";
import { getAllFiles, formatBytes } from "@/lib/fileforge/filesystem";
import { getStorageInfoHybrid } from "@/lib/fileforge/filesystem";
import { fileRepository } from "@/lib/fileforge/file-repository";
import { isNative } from "@/lib/fileforge/native-bridge";
import { useFileForge as _useFileForge } from "@/store/fileforge-store";

const ACCENTS: { value: AccentColor; label: string; classes: string }[] = [
  { value: "orange", label: "Orange", classes: "bg-gradient-to-br from-orange-500 to-amber-600" },
  { value: "blue", label: "Blue", classes: "bg-gradient-to-br from-blue-500 to-cyan-600" },
  { value: "green", label: "Green", classes: "bg-gradient-to-br from-emerald-500 to-teal-600" },
  { value: "purple", label: "Purple", classes: "bg-gradient-to-br from-violet-500 to-purple-600" },
  { value: "pink", label: "Pink", classes: "bg-gradient-to-br from-pink-500 to-rose-600" },
  { value: "teal", label: "Teal", classes: "bg-gradient-to-br from-teal-500 to-cyan-600" },
  { value: "red", label: "Red", classes: "bg-gradient-to-br from-red-500 to-orange-600" },
];

const BACKGROUNDS: { value: BackgroundType; label: string; preview: string }[] = [
  { value: "default", label: "Default", preview: "bg-background" },
  { value: "gradient", label: "Gradient", preview: "bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20" },
  { value: "pattern", label: "Pattern", preview: "bg-muted" },
];

export function SettingsPanel() {
  const store = useFileForge();
  const { t, lang, setLang } = useI18n();
  const cust = useCustomization();

  // Real about-section stats: storage usage from native plugin.
  // File count is NOT shown on native (would require scanning entire FS).
  // On web, we show the mock count as a demo.
  const fsVersion = useFileForge((s) => s._fsVersion);
  const [storageUsed, setStorageUsed] = useState<number | null>(null);
  const [fileCount, setFileCount] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    // Get real storage info
    getStorageInfoHybrid().then((info) => {
      if (!cancelled && info) setStorageUsed(info.used);
    }).catch(() => { /* leave as null */ });
    // File count: on native, get a real folder summary of the root
    if (isNative()) {
      fileRepository.getFolderSummary("/storage/emulated/0").then(summary => {
        if (!cancelled) setFileCount(summary.fileCount);
      }).catch(() => { if (!cancelled) setFileCount(null); });
    } else {
      // Web fallback: use mock count
      import("@/lib/fileforge/filesystem").then(({ getAllFiles }) => {
        if (!cancelled) setFileCount(getAllFiles().length);
      });
    }
    return () => { cancelled = true; };
  }, [fsVersion]);

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 gap-5">
      <div>
        <h2 className="text-lg font-semibold">{t("settings")}</h2>
        <p className="text-xs text-muted-foreground">{t("customize")}</p>
      </div>

      {/* Appearance */}
      <SettingsSection icon={Sun} title={t("appearance")}>
        <div>
          <div className="text-sm font-medium mb-2">{t("theme")}</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "light" as ThemeMode, label: t("light"), icon: Sun },
              { value: "dark" as ThemeMode, label: t("dark"), icon: Moon },
              { value: "system" as ThemeMode, label: t("system"), icon: Monitor },
            ].map(opt => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-3 rounded-lg border-2 transition-colors",
                    store.theme === opt.value
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                      : "border-border hover:bg-accent"
                  )}
                  onClick={() => store.setTheme(opt.value)}
                >
                  <Icon className="h-5 w-5" />
                  <span className="text-xs font-medium">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <Separator className="my-3" />

        {/* Accent Color */}
        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <Palette className="h-4 w-4 text-orange-500" />
            {t("accentColor") || "Accent Color"}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {ACCENTS.map(a => (
              <button
                key={a.value}
                onClick={() => cust.setAccent(a.value)}
                className={cn(
                  "h-10 rounded-lg transition-all",
                  a.classes,
                  cust.accent === a.value ? "ring-2 ring-offset-2 ring-foreground scale-105" : "hover:scale-105"
                )}
                title={a.label}
                aria-label={a.label}
              />
            ))}
          </div>
        </div>

        <Separator className="my-3" />

        {/* Background */}
        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <ImageIcon className="h-4 w-4 text-orange-500" />
            {t("background") || "Background"}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {BACKGROUNDS.map(bg => (
              <button
                key={bg.value}
                onClick={() => cust.setBackground(bg.value)}
                className={cn(
                  "h-14 rounded-lg border-2 transition-all overflow-hidden flex items-center justify-center",
                  cust.background === bg.value ? "border-orange-500" : "border-border",
                  bg.preview
                )}
              >
                <span className="text-xs font-medium">{bg.label}</span>
              </button>
            ))}
          </div>
        </div>

        <Separator className="my-3" />

        {/* Language */}
        <div>
          <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
            <Languages className="h-4 w-4 text-orange-500" />
            {t("language")}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: "ar" as Lang, label: "العربية" },
              { value: "en" as Lang, label: "English" },
            ].map(opt => (
              <button
                key={opt.value}
                className={cn(
                  "flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-colors",
                  lang === opt.value
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30"
                    : "border-border hover:bg-accent"
                )}
                onClick={() => setLang(opt.value)}
              >
                <Languages className="h-4 w-4" />
                <span className="text-sm font-medium">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </SettingsSection>

      {/* Accessibility */}
      <SettingsSection icon={Accessibility} title={t("accessibility") || "Accessibility"}>
        <ToggleRow
          label={t("highContrast") || "High Contrast Mode"}
          description={t("highContrastDesc") || "Increase contrast for better visibility"}
          checked={cust.highContrast}
          onChange={cust.setHighContrast}
        />
        <ToggleRow
          label={t("reducedMotion") || "Reduced Motion"}
          description={t("reducedMotionDesc") || "Minimize animations and transitions"}
          checked={cust.reducedMotion}
          onChange={cust.setReducedMotion}
        />
      </SettingsSection>

      {/* File Browser */}
      <SettingsSection icon={Folder} title={t("fileBrowser")}>
        <ToggleRow label={t("showHiddenFiles")} description={t("showHiddenDesc")}
          checked={store.showHidden}
          onChange={(v) => _useFileForge.setState({ showHidden: v })}
        />
      </SettingsSection>

      {/* Privacy */}
      <SettingsSection icon={Shield} title={t("privacySecurity")}>
        <ToggleRow label={t("secureVault")} description={t("vaultDesc")} />
        <ToggleRow label={t("hideRecent")} description={t("hideRecentDesc")} />
        <ToggleRow label={t("confirmDelete")} description={t("confirmDeleteDesc")} defaultOn />
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-2"
          onClick={() => {
            localStorage.removeItem("fileforge-permissions-seen");
            window.location.reload();
          }}
        >
          <Lock className="h-4 w-4 mr-2" />
          {t("managePermissions") || "Manage Permissions"}
        </Button>
      </SettingsSection>

      {/* Notifications */}
      <SettingsSection icon={Bell} title={t("notifications")}>
        <ToggleRow label={t("opCompletion")} description={t("opCompletionDesc")} defaultOn />
        <ToggleRow label={t("lowStorage")} description={t("lowStorageDesc")} defaultOn />
        <ToggleRow label={t("syncStatus")} description={t("syncStatusDesc")} />
      </SettingsSection>

      {/* About */}
      <SettingsSection icon={Info} title={t("about")}>
        <div className="text-xs space-y-1.5 text-muted-foreground">
          <div className="flex justify-between"><span>{t("versionLabel")}</span><span className="font-medium text-foreground">2.4.1</span></div>
          <div className="flex justify-between"><span>{t("build")}</span><span className="font-medium text-foreground">2410</span></div>
          <div className="flex justify-between"><span>{t("storageUsed")}</span><span className="font-medium text-foreground">{storageUsed !== null ? formatBytes(storageUsed) : "—"}</span></div>
          <div className="flex justify-between"><span>{t("filesIndexed")}</span><span className="font-medium text-foreground">{fileCount !== null ? fileCount.toLocaleString() : "—"}</span></div>
        </div>
        <Button variant="outline" size="sm" className="w-full mt-2"
          onClick={() => store.addToast("No updates available", "info")}
        >{t("checkUpdates")}</Button>
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, children }: { icon: typeof Sun; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-orange-500" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="space-y-2 pl-6">
        {children}
      </div>
      <Separator />
    </div>
  );
}

function ToggleRow({ label, description, defaultOn, checked, onChange }: { label: string; description: string; defaultOn?: boolean; checked?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch
        defaultChecked={checked !== undefined ? undefined : defaultOn}
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}
