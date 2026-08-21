"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppWindow, Archive, MoreVertical, Package, RefreshCw, Search, Share2, Trash2, Copy, Smartphone, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { nativeFileSystem, isNative } from "@/lib/fileforge/native-bridge";
import { useI18n } from "@/lib/i18n/i18n-store";
import { useFileForge } from "@/store/fileforge-store";

interface InstalledApp {
  packageName: string;
  label: string;
  versionName?: string;
  versionCode?: number;
  isSystem: boolean;
  isEnabled: boolean;
  apkPath: string;
  icon?: string;
  size?: number;
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
}

export function AppsPanel() {
  const { t, lang } = useI18n();
  const store = useFileForge();
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [includeSystem, setIncludeSystem] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isNative()) { setApps([]); return; }
    setBusy("loading");
    try {
      const result = await nativeFileSystem.listInstalledApps(includeSystem);
      setApps((result.apps ?? []) as InstalledApp[]);
    } finally {
      setBusy(null);
    }
  }, [includeSystem]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(lang === "ar" ? "ar" : "en");
    if (!q) return apps;
    return apps.filter(a =>
      a.label.toLocaleLowerCase(lang === "ar" ? "ar" : "en").includes(q) ||
      a.packageName.toLowerCase().includes(q)
    );
  }, [apps, query, lang]);

  const backup = async (app: InstalledApp) => {
    setBusy(app.packageName);
    const result = await nativeFileSystem.backupInstalledApp(app.packageName);
    setBusy(null);
    setMenu(null);
    store.addToast(
      result.success
        ? `${app.label}: ${t("backupCreated")}`
        : (result.error || t("backupFailed")),
      result.success ? "success" : "error"
    );
  };

  const shareBackup = async (app: InstalledApp) => {
    setBusy(app.packageName);
    const backup = await nativeFileSystem.backupInstalledApp(app.packageName);

    if (!backup.success || !backup.path) {
      setBusy(null);
      setMenu(null);
      store.addToast(backup.error || t("backupFailed"), "error");
      return;
    }

    const shared = await nativeFileSystem.shareFiles([backup.path]);
    setBusy(null);
    setMenu(null);

    store.addToast(
      shared.success ? t("sharing") : (shared.error || t("shareFailed")),
      shared.success ? "success" : "error"
    );
  };

  const uninstall = async (app: InstalledApp) => {
    setMenu(null);
    const result = await nativeFileSystem.uninstallApp(app.packageName);

    if (result.started) {
      store.addToast(`${t("uninstallStarted")}: ${app.label}`, "info");
    } else {
      store.addToast(result.error || t("uninstallFailed"), "error");
    }
  };

  if (!isNative()) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-sm text-muted-foreground">
        {t("appsNativeOnly")}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="p-3 border-b space-y-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <AppWindow className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t("apps")}</h2>
            <p className="text-[11px] text-muted-foreground">
              {filtered.length} / {apps.length}
            </p>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => void load()}
            disabled={busy === "loading"}
            title={t("refresh")}
          >
            <RefreshCw
              className={`h-4 w-4 ${
                busy === "loading" ? "animate-spin" : ""
              }`}
            />
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("searchApps")}
            className="pl-9"
          />
        </div>

        <Button
          variant={includeSystem ? "secondary" : "outline"}
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => setIncludeSystem(v => !v)}
        >
          <ShieldCheck className="h-4 w-4" />
          {includeSystem ? t("showUserApps") : t("showAllApps")}
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {filtered.map(app => (
            <div
              key={app.packageName}
              className="relative rounded-xl border bg-card/70 p-3 hover:bg-accent/40 transition-colors select-none"
              onContextMenu={e => {
                e.preventDefault();
                setMenu(app.packageName);
              }}
              onPointerDown={e => {
                if (e.button !== 0) return;

                const timer = window.setTimeout(
                  () => setMenu(app.packageName),
                  500
                );

                const clear = () => {
                  window.clearTimeout(timer);
                  window.removeEventListener("pointerup", clear);
                  window.removeEventListener("pointercancel", clear);
                };

                window.addEventListener("pointerup", clear, { once: true });
                window.addEventListener("pointercancel", clear, { once: true });
              }}
            >
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl overflow-hidden bg-muted flex items-center justify-center shrink-0">
                  {app.icon ? (
                    <img
                      src={app.icon}
                      alt=""
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{app.label}</div>

                  <div className="text-[10px] text-muted-foreground truncate">
                    {app.packageName}
                  </div>

                  <div className="text-[10px] text-muted-foreground flex gap-2 mt-0.5">
                    <span>{app.versionName || "—"}</span>
                    <span>{formatBytes(app.size)}</span>
                    {app.isSystem && <span>{t("systemApp")}</span>}
                  </div>
                </div>

                <button
                  className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
                  onClick={e => {
                    e.stopPropagation();
                    setMenu(v =>
                      v === app.packageName ? null : app.packageName
                    );
                  }}
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>

              {menu === app.packageName && (
                <div
                  className="absolute z-50 right-2 top-12 w-48 rounded-xl border bg-popover text-popover-foreground shadow-2xl p-1"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-sm"
                    onClick={() => void backup(app)}
                    disabled={busy === app.packageName}
                  >
                    <Copy className="h-4 w-4" />
                    {t("backup")}
                  </button>

                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-sm"
                    onClick={() => void shareBackup(app)}
                    disabled={busy === app.packageName}
                  >
                    <Share2 className="h-4 w-4" />
                    {t("share")}
                  </button>

                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent text-sm text-destructive"
                    onClick={() => void uninstall(app)}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("uninstall")}
                  </button>
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
              <Smartphone className="h-8 w-8 mx-auto mb-2 opacity-40" />
              {t("noAppsFound")}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}