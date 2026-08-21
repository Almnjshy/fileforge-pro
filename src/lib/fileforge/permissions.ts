// FileForge Pro — Dynamic Android Permissions Manager
"use client";

import { useState, useEffect, useCallback } from "react";
import { isNative, getNativePlugin } from "./native-bridge";

export type PermissionStatus = "granted" | "denied" | "prompt" | "blocked";

export interface PermissionInfo {
  name: string;
  label: string;
  labelAr: string;
  description: string;
  descriptionAr: string;
  icon: string;
  required: boolean;
  status: PermissionStatus;
  androidPermission?: string;
  requestAction?: string; // For special permissions like MANAGE_EXTERNAL_STORAGE
}

// All permissions the app needs
export const PERMISSIONS: PermissionInfo[] = [
  {
    name: "storage",
    label: "Storage Access",
    labelAr: "الوصول للتخزين",
    description: "Required to read, write, and manage your files",
    descriptionAr: "مطلوب لقراءة وكتابة وإدارة ملفاتك",
    icon: "hard-drive",
    required: true,
    status: "prompt",
    androidPermission: "android.permission.MANAGE_EXTERNAL_STORAGE",
    requestAction: "MANAGE_ALL_FILES",
  },
  {
    name: "media_images",
    label: "Photos & Images",
    labelAr: "الصور",
    description: "Access to view and manage your photos (Android 13+)",
    descriptionAr: "الوصول لعرض وإدارة صورك (أندرويد 13+)",
    icon: "image",
    required: false,
    status: "prompt",
    androidPermission: "android.permission.READ_MEDIA_IMAGES",
  },
  {
    name: "media_video",
    label: "Videos",
    labelAr: "الفيديو",
    description: "Access to view and manage your videos (Android 13+)",
    descriptionAr: "الوصول لعرض وإدارة مقاطع الفيديو (أندرويد 13+)",
    icon: "video",
    required: false,
    status: "prompt",
    androidPermission: "android.permission.READ_MEDIA_VIDEO",
  },
  {
    name: "media_audio",
    label: "Music & Audio",
    labelAr: "الموسيقى والصوت",
    description: "Access to view and manage your audio files (Android 13+)",
    descriptionAr: "الوصول لعرض وإدارة ملفاتك الصوتية (أندرويد 13+)",
    icon: "music",
    required: false,
    status: "prompt",
    androidPermission: "android.permission.READ_MEDIA_AUDIO",
  },
  {
    name: "camera",
    label: "Camera",
    labelAr: "الكاميرا",
    description: "For scanning documents and QR codes",
    descriptionAr: "لمسح المستندات وأكواد QR",
    icon: "camera",
    required: false,
    status: "prompt",
    androidPermission: "android.permission.CAMERA",
  },
  {
    name: "microphone",
    label: "Microphone",
    labelAr: "الميكروفون",
    description: "For voice search functionality",
    descriptionAr: "لوظيفة البحث الصوتي",
    icon: "mic",
    required: false,
    status: "prompt",
    androidPermission: "android.permission.RECORD_AUDIO",
  },
  {
    name: "biometric",
    label: "Biometric Authentication",
    labelAr: "المصادقة البيومترية",
    description: "For unlocking Secure Vault with fingerprint/face",
    descriptionAr: "لفتح الخزنة الآمنة بالبصمة/الوجه",
    icon: "fingerprint",
    required: false,
    status: "prompt",
    androidPermission: "android.permission.USE_BIOMETRIC",
  },
  {
    name: "notifications",
    label: "Notifications",
    labelAr: "الإشعارات",
    description: "Show operation progress and status (Android 13+)",
    descriptionAr: "إظهار تقدم العمليات وحالتها (أندرويد 13+)",
    icon: "bell",
    required: false,
    status: "prompt",
    androidPermission: "android.permission.POST_NOTIFICATIONS",
  },
  {
    name: "location",
    label: "Location",
    labelAr: "الموقع",
    description: "For discovering local network devices (SMB/FTP)",
    descriptionAr: "لاكتشاف أجهزة الشبكة المحلية (SMB/FTP)",
    icon: "map-pin",
    required: false,
    status: "prompt",
    androidPermission: "android.permission.ACCESS_FINE_LOCATION",
  },
];

// Note: permission checks for real file access go through the custom
// FileForgeFileAccess native plugin (see native-bridge.ts), which exposes
// `checkPermission`, `requestPermission`, `hasManageAllFilesPermission`,
// `requestManageAllFilesPermission` for all permission kinds.

export async function checkPermission(permissionName: string): Promise<PermissionStatus> {
  // Web environment
  if (typeof window === "undefined") {
    if (permissionName === "camera" || permissionName === "microphone") {
      try {
        const result = await navigator.permissions.query({
          name: permissionName === "camera" ? "camera" as any : "microphone" as any,
        });
        return result.state as PermissionStatus;
      } catch {
        return "prompt";
      }
    }
    return "prompt";
  }

  // Native app: use the FileForgeFileAccess plugin (NOT Capacitor's generic Permissions)
  try {
    const plugin = getNativePlugin();
    if (!plugin) return "prompt";

    if (permissionName === "storage") {
      const result = await plugin.hasManageAllFilesPermission();
      return result.granted ? "granted" : "prompt";
    }
    if (permissionName === "biometric") {
      // biometric is granted implicitly if USE_BIOMETRIC is in manifest; we treat it as prompt for the dialog
      return "granted";
    }
    const result = await plugin.checkPermission({ permission: permissionName });
    return result.granted ? "granted" : "prompt";
  } catch {
    return "prompt";
  }
}

export async function requestPermission(permissionName: string): Promise<PermissionStatus> {
  if (typeof window === "undefined") return "denied";

  // Web fallback - no real permissions in browser
  if (!isNative()) {
    if (permissionName === "camera" || permissionName === "microphone") {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: permissionName === "camera",
          audio: permissionName === "microphone",
        });
        stream.getTracks().forEach(t => t.stop());
        return "granted";
      } catch {
        return "denied";
      }
    }
    if (permissionName === "notifications") {
      try {
        const result = await Notification.requestPermission();
        return result === "granted" ? "granted" : "denied";
      } catch {
        return "denied";
      }
    }
    // For storage and other permissions in web, return "granted" so the dialog closes
    return "granted";
  }

  // Native app - use FileForgeFileAccessPlugin
  try {
    const plugin = getNativePlugin();
    if (!plugin) {
      console.error("FileForgeFileAccess plugin not found");
      return "denied";
    }

    const permission = PERMISSIONS.find(p => p.name === permissionName);
    if (!permission) return "granted";

    // Special: storage permission uses MANAGE_ALL_FILES
    if (permissionName === "storage") {
      const result = await plugin.requestManageAllFilesPermission();
      return result.granted ? "granted" : "denied";
    }

    // Use the plugin's requestPermission method
    const result = await plugin.requestPermission({ permission: permissionName });
    return result.granted ? "granted" : "denied";
  } catch (e) {
    console.error("Permission request failed:", e);
    return "denied";
  }
}

export async function requestAllRequiredPermissions(): Promise<Record<string, PermissionStatus>> {
  const results: Record<string, PermissionStatus> = {};
  for (const perm of PERMISSIONS) {
    if (perm.required) {
      results[perm.name] = await requestPermission(perm.name);
    }
  }
  return results;
}

export async function checkAllPermissions(): Promise<Record<string, PermissionStatus>> {
  const entries = await Promise.all(
    PERMISSIONS.map(async p => [p.name, await checkPermission(p.name)] as const)
  );
  return Object.fromEntries(entries);
}
