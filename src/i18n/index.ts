import type { BarrelEntry, BarrelRoot } from "./barrel.types";
import translationsBarrel from "./translations.barrel.json";
import { storage } from "../game/Storage";

export type SupportedLocale = "en" | "mt" | "it" | "fr" | "de" | "es" | "pt-BR" | "ar" | "zh-CN" | "ja";

export const SUPPORTED_LOCALES: { code: SupportedLocale; name: string; flag: string; rtl?: boolean }[] = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "pt-BR", name: "Português (Brasil)", flag: "🇧🇷" },
  { code: "ar", name: "العربية", flag: "🇸🇦", rtl: true },
  { code: "zh-CN", name: "简体中文", flag: "🇨🇳" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "mt", name: "Malti", flag: "🇲🇹" },
];

const LOCALE_STORAGE_KEY = "sunbird.i18n.locale";

let currentLocale: SupportedLocale = "en";

function initLocale(): SupportedLocale {
  try {
    const saved = storage.getItem(LOCALE_STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.some((l) => l.code === saved)) {
      return saved as SupportedLocale;
    }
    // Fallback to browser language if available
    const navLang = typeof navigator !== "undefined" ? navigator.language : "";
    if (navLang) {
      const match = SUPPORTED_LOCALES.find((l) => navLang.startsWith(l.code));
      if (match) return match.code;
    }
  } catch {
    /* private mode */
  }
  return "en";
}

currentLocale = initLocale();

export function isRTL(locale = currentLocale): boolean {
  return SUPPORTED_LOCALES.find((l) => l.code === locale)?.rtl === true;
}

export function updateDocumentDirection(): void {
  if (typeof document === "undefined") return;
  const rtl = isRTL(currentLocale);
  document.documentElement.dir = rtl ? "rtl" : "ltr";
  document.documentElement.lang = currentLocale;
}

export function getLocale(): SupportedLocale {
  return currentLocale;
}

export function setLocale(locale: SupportedLocale): void {
  if (SUPPORTED_LOCALES.some((l) => l.code === locale)) {
    currentLocale = locale;
    try {
      storage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* private mode */
    }
    updateDocumentDirection();
  }
}

// Initial document direction set
if (typeof window !== "undefined") {
  updateDocumentDirection();
}

export function getBarrel(): BarrelRoot {
  return translationsBarrel as BarrelRoot;
}

/**
 * Enterprise-grade universal translation function.
 * Translates a key into currentLocale using the barrel source of truth.
 * Supports token substitution for {{var}} or {var}.
 */
export function t(key: string, params?: Record<string, string | number>, defaultText?: string): string {
  try {
    const barrel = (translationsBarrel as BarrelRoot).barrel;
    const entry: BarrelEntry | undefined = barrel[key];

    let rawText = defaultText;
    if (entry) {
      rawText = entry.translations[currentLocale] || entry.translations["en"] || entry.sourceText;
    }

    if (!rawText) {
      return defaultText ?? key;
    }

    if (!params) return rawText;

    let result = rawText;
    for (const [k, v] of Object.entries(params)) {
      const strVal = String(v);
      result = result.split(`{{${k}}}`).join(strVal).split(`{${k}}`).join(strVal);
    }

    return result;
  } catch {
    return defaultText ?? key;
  }
}

/**
 * International Number Formatting
 */
export function formatNumberLocalized(num: number, locale = currentLocale): string {
  try {
    return new Intl.NumberFormat(locale).format(num);
  } catch {
    return String(Math.round(num));
  }
}

/**
 * International Distance Formatting (meters / kilometers)
 */
export function formatDistanceLocalized(meters: number, locale = currentLocale): string {
  const rounded = Math.max(0, Math.round(meters));
  if (rounded >= 1000) {
    const km = (rounded / 1000).toFixed(1);
    return `${formatNumberLocalized(Number(km), locale)} km`;
  }
  return `${formatNumberLocalized(rounded, locale)} m`;
}
