// FileForge Pro — Permissions Request Dialog
"use client";

import { useState, useEffect, useCallback } from "react";
import { registerOverlay } from "@/lib/fileforge/back-handler";
import {
  HardDrive, Image, Video, Music, Camera, Mic, Fingerprint, Bell, MapPin,
  Shield, Check, X, ChevronRight, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PERMISSIONS, checkAllPermissions, requestPermission,
  type PermissionInfo, type PermissionStatus,
} from "@/lib/fileforge/permissions";
import { useI18n } from "@/lib/i18n/i18n-store";

const ICONS: Record<string, typeof HardDrive> = {
  "hard-drive": HardDrive,
  "image": Image,
  "video": Video,
  "music": Music,
  "camera": Camera,
  "mic": Mic,
  "fingerprint": Fingerprint,
  "bell": Bell,
  "map-pin": MapPin,
};

interface PermissionsDialogProps {
  onClose: () => void;
  onAllGranted?: () => void;
  forceShow?: boolean;
}

export function PermissionsDialog({ onClose, onAllGranted, forceShow }: PermissionsDialogProps) {
  const { lang } = useI18n();
  const [permissions, setPermissions] = useState<PermissionInfo[]>(PERMISSIONS);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);

  const loadStatuses = useCallback(async () => {
    setLoading(true);
    const statuses = await checkAllPermissions();
    setPermissions(PERMISSIONS.map(p => ({ ...p, status: statuses[p.name] ?? "prompt" })));
    setLoading(false);
  }, []);

  useEffect(() => {
    // Deferred via microtask so the async call isn't invoked synchronously
    // within the effect body (avoids cascading-render lint error) — same
    // timing as before in practice, since loadStatuses itself is async.
    queueMicrotask(() => { loadStatuses(); });
  }, [loadStatuses]);

  const handleRequest = useCallback(async (name: string) => {
    setRequesting(name);
    const status = await requestPermission(name);
    setPermissions(prev => prev.map(p => p.name === name ? { ...p, status } : p));
    setRequesting(null);
  }, []);

  const handleRequestAll = useCallback(async () => {
    setRequesting("all");
    // Walk the latest permissions array via setPermissions updater so we
    // always read fresh state after each request (previously read from the
    // closure-captured `permissions`, which was stale by the time the final
    // allRequiredGranted check ran).
    let latest: PermissionInfo[] = [];
    setPermissions(prev => {
      latest = prev;
      return prev;
    });
    // Use a snapshot of the current state for iteration
    const snapshot = latest.length > 0 ? latest : PERMISSIONS;
    for (const perm of snapshot) {
      if (perm.status !== "granted") {
        const status = await requestPermission(perm.name);
        setPermissions(prev => {
          const next = prev.map(p => p.name === perm.name ? { ...p, status } : p);
          latest = next;
          return next;
        });
      }
    }
    setRequesting(null);
    const allRequiredGranted = latest
      .filter(p => p.required)
      .every(p => p.status === "granted");
    if (allRequiredGranted && onAllGranted) {
      onAllGranted();
    }
  }, [onAllGranted]);

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

  const requiredCount = permissions.filter(p => p.required).length;
  const grantedCount = permissions.filter(p => p.status === "granted").length;
  const requiredGrantedCount = permissions.filter(p => p.required && p.status === "granted").length;
  const allRequiredGranted = requiredGrantedCount === requiredCount;

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-lg max-h-[90vh] rounded-2xl border bg-card shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95">
        {/* Header */}
        <div className="p-5 border-b bg-gradient-to-br from-orange-500 to-amber-600 text-white">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Shield className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold">
                {lang === "ar" ? "أذونات التطبيق" : "App Permissions"}
              </h2>
              <p className="text-xs text-white/80">
                {lang === "ar"
                  ? `${grantedCount} من ${permissions.length} مُمنوحة`
                  : `${grantedCount} of ${permissions.length} granted`}
              </p>
            </div>
            {!forceShow && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-white hover:bg-white/20"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-500"
              style={{ width: `${(grantedCount / permissions.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Permissions list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {lang === "ar" ? "جاري التحقق..." : "Checking..."}
            </div>
          ) : (
            permissions.map(perm => {
              const Icon = ICONS[perm.icon] ?? HardDrive;
              const isGranted = perm.status === "granted";
              const isDenied = perm.status === "denied" || perm.status === "blocked";
              return (
                <div
                  key={perm.name}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                    isGranted && "border-emerald-500/30 bg-emerald-500/5",
                    isDenied && perm.required && "border-red-500/30 bg-red-500/5",
                    !isGranted && !isDenied && "border-border"
                  )}
                >
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                    isGranted ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {lang === "ar" ? perm.labelAr : perm.label}
                      </span>
                      {perm.required && (
                        <span className="text-[10px] font-bold text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded bg-orange-500/10">
                          {lang === "ar" ? "مطلوب" : "Required"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {lang === "ar" ? perm.descriptionAr : perm.description}
                    </div>
                  </div>
                  {isGranted ? (
                    <div className="h-8 w-8 rounded-full bg-emerald-500 flex items-center justify-center text-white flex-shrink-0">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </div>
                  ) : (
                    <Button
                      variant={perm.required ? "default" : "outline"}
                      size="sm"
                      className="h-8 flex-shrink-0"
                      disabled={requesting !== null}
                      onClick={() => handleRequest(perm.name)}
                    >
                      {requesting === perm.name
                        ? (lang === "ar" ? "..." : "...")
                        : isDenied
                        ? (lang === "ar" ? "إعادة" : "Retry")
                        : (lang === "ar" ? "سماح" : "Allow")}
                    </Button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30 space-y-2">
          {!allRequiredGranted && (
            <div className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                {lang === "ar"
                  ? "بعض الأذونات المطلوبة غير مُمنوحة. التطبيق قد لا يعمل بشكل صحيح."
                  : "Some required permissions are not granted. The app may not work properly."}
              </span>
            </div>
          )}
          <div className="flex gap-2">
            {!forceShow && (
              <Button variant="outline" className="flex-1" onClick={onClose}>
                {lang === "ar" ? "تخطي" : "Skip"}
              </Button>
            )}
            <Button
              className="flex-1 bg-gradient-to-r from-orange-500 to-amber-600"
              disabled={requesting !== null || loading}
              onClick={handleRequestAll}
            >
              {requesting === "all"
                ? (lang === "ar" ? "جاري الطلب..." : "Requesting...")
                : allRequiredGranted
                ? (lang === "ar" ? "تم" : "Done")
                : (lang === "ar" ? "السماح للكل" : "Allow All")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
