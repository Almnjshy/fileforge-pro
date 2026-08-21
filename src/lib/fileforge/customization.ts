// FileForge Pro — Customization store (backgrounds, accent colors, icon sizes)
"use client";

import { create } from "zustand";
import { logger } from "./logger";

export type AccentColor = "orange" | "blue" | "green" | "purple" | "pink" | "teal" | "red";
export type BackgroundType = "default" | "gradient" | "pattern";

interface CustomizationState {
  accent: AccentColor;
  background: BackgroundType;
  customIconSize: number | null;
  highContrast: boolean;
  reducedMotion: boolean;
  setAccent: (c: AccentColor) => void;
  setBackground: (b: BackgroundType) => void;
  setCustomIconSize: (s: number | null) => void;
  setHighContrast: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

// Map accent colors to CSS values for primary, ring, accent
const ACCENT_CSS: Record<AccentColor, { primary: string; primaryForeground: string; ring: string; accentBg: string; accentFg: string }> = {
  orange: {
    primary: "#f97316",
    primaryForeground: "#ffffff",
    ring: "#f97316",
    accentBg: "#fff7ed",
    accentFg: "#1a1a1a",
  },
  blue: {
    primary: "#3b82f6",
    primaryForeground: "#ffffff",
    ring: "#3b82f6",
    accentBg: "#eff6ff",
    accentFg: "#1a1a1a",
  },
  green: {
    primary: "#10b981",
    primaryForeground: "#ffffff",
    ring: "#10b981",
    accentBg: "#ecfdf5",
    accentFg: "#1a1a1a",
  },
  purple: {
    primary: "#8b5cf6",
    primaryForeground: "#ffffff",
    ring: "#8b5cf6",
    accentBg: "#f5f3ff",
    accentFg: "#1a1a1a",
  },
  pink: {
    primary: "#ec4899",
    primaryForeground: "#ffffff",
    ring: "#ec4899",
    accentBg: "#fdf2f8",
    accentFg: "#1a1a1a",
  },
  teal: {
    primary: "#14b8a6",
    primaryForeground: "#ffffff",
    ring: "#14b8a6",
    accentBg: "#f0fdfa",
    accentFg: "#1a1a1a",
  },
  red: {
    primary: "#ef4444",
    primaryForeground: "#ffffff",
    ring: "#ef4444",
    accentBg: "#fef2f2",
    accentFg: "#1a1a1a",
  },
};

// Apply accent color to CSS variables
function applyAccent(accent: AccentColor) {
  if (typeof document === "undefined") return;
  const colors = ACCENT_CSS[accent];
  if (!colors) {
    logger.warn("customization", `Unknown accent: ${accent}, falling back to orange`);
    return;
  }
  const root = document.documentElement;
  root.style.setProperty("--primary", colors.primary);
  root.style.setProperty("--primary-foreground", colors.primaryForeground);
  root.style.setProperty("--ring", colors.ring);
  root.style.setProperty("--accent", colors.accentBg);
  root.style.setProperty("--accent-foreground", colors.accentFg);
  root.style.setProperty("--sidebar-primary", colors.primary);
  root.style.setProperty("--sidebar-primary-foreground", colors.primaryForeground);
  root.style.setProperty("--sidebar-ring", colors.ring);
}

const ACCENT_CLASSES: Record<AccentColor, { from: string; to: string; ring: string; text: string }> = {
  orange: { from: "from-orange-500", to: "to-amber-600", ring: "ring-orange-500", text: "text-orange-500" },
  blue: { from: "from-blue-500", to: "to-cyan-600", ring: "ring-blue-500", text: "text-blue-500" },
  green: { from: "from-emerald-500", to: "to-teal-600", ring: "ring-emerald-500", text: "text-emerald-500" },
  purple: { from: "from-violet-500", to: "to-purple-600", ring: "ring-violet-500", text: "text-violet-500" },
  pink: { from: "from-pink-500", to: "to-rose-600", ring: "ring-pink-500", text: "text-pink-500" },
  teal: { from: "from-teal-500", to: "to-cyan-600", ring: "ring-teal-500", text: "text-teal-500" },
  red: { from: "from-red-500", to: "to-orange-600", ring: "ring-red-500", text: "text-red-500" },
};

export function getAccentClasses(accent: AccentColor) {
  return ACCENT_CLASSES[accent];
}

function isValidAccent(v: unknown): v is AccentColor {
  return typeof v === "string" && v in ACCENT_CSS;
}

export const useCustomization = create<CustomizationState>((set, get) => ({
  accent: "orange",
  background: "default",
  customIconSize: null,
  highContrast: false,
  reducedMotion: false,
  setAccent: (accent) => {
    set({ accent });
    applyAccent(accent);
    get().saveToStorage();
  },
  setBackground: (background) => { set({ background }); get().saveToStorage(); },
  setCustomIconSize: (customIconSize) => { set({ customIconSize }); get().saveToStorage(); },
  setHighContrast: (highContrast) => { set({ highContrast }); get().saveToStorage(); },
  setReducedMotion: (reducedMotion) => { set({ reducedMotion }); get().saveToStorage(); },
  loadFromStorage: () => {
    try {
      const saved = localStorage.getItem("fileforge-customization");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Validate accent before applying — bad localStorage shouldn't crash the app
        if (isValidAccent(parsed.accent)) {
          set({ accent: parsed.accent });
          applyAccent(parsed.accent);
        }
        if (parsed.background === "default" || parsed.background === "gradient" || parsed.background === "pattern") {
          set({ background: parsed.background });
        }
        if (typeof parsed.customIconSize === "number" || parsed.customIconSize === null) {
          set({ customIconSize: parsed.customIconSize });
        }
        if (typeof parsed.highContrast === "boolean") set({ highContrast: parsed.highContrast });
        if (typeof parsed.reducedMotion === "boolean") set({ reducedMotion: parsed.reducedMotion });
      }
      // Only force-enable reducedMotion from OS preference if the user hasn't
      // made an explicit choice yet (i.e., no saved value exists).
      if (saved == null && typeof window !== "undefined" &&
          window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        set({ reducedMotion: true });
      }
    } catch (e) {
      logger.warn("customization", "Failed to load saved customization settings", e);
    }
  },
  saveToStorage: () => {
    try {
      const state = get();
      localStorage.setItem("fileforge-customization", JSON.stringify({
        accent: state.accent,
        background: state.background,
        customIconSize: state.customIconSize,
        highContrast: state.highContrast,
        reducedMotion: state.reducedMotion,
      }));
    } catch (e) {
      logger.warn("customization", "Failed to save customization settings", e);
    }
  },
}));
