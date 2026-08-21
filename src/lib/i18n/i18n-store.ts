// FileForge Pro — i18n store (bilingual Arabic + English)
"use client";

import { create } from "zustand";
import { translations, type Lang, type TranslationKey, formatString } from "./translations";

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggleLang: () => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  isRTL: () => boolean;
}

const getInitialLang = (): Lang => {
  if (typeof window === "undefined") return "ar"; // Default to Arabic
  try {
    const saved = localStorage.getItem("fileforge-lang");
    if (saved === "en" || saved === "ar") return saved;
  } catch { /* storage disabled */ }
  return "ar";
};

export const useI18n = create<I18nState>((set, get) => ({
  lang: "ar", // will be overridden on client
  setLang: (lang) => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("fileforge-lang", lang);
      } catch { /* storage disabled or quota exceeded */ }
      try {
        document.documentElement.lang = lang;
        document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
      } catch { /* SSR safety */ }
    }
    set({ lang });
  },
  toggleLang: () => {
    const newLang = get().lang === "ar" ? "en" : "ar";
    get().setLang(newLang);
  },
  t: (key, params) => {
    const entry = translations[key];
    if (!entry) return key;
    const lang = get().lang;
    const template = entry[lang] ?? entry.en;
    return params ? formatString(template, params) : template;
  },
  isRTL: () => get().lang === "ar",
}));

// Initialize on client side
if (typeof window !== "undefined") {
  const initial = getInitialLang();
  useI18n.setState({ lang: initial });
  try {
    document.documentElement.lang = initial;
    document.documentElement.dir = initial === "ar" ? "rtl" : "ltr";
  } catch { /* SSR safety */ }
}

// Helper hook for components that don't need re-renders
export function useT() {
  return useI18n((s) => s.t);
}

export function useLang() {
  return useI18n((s) => s.lang);
}
