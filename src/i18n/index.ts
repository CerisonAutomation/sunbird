import type { BarrelEntry, BarrelRoot } from "./barrel.types";
import translationsBarrel from "./translations.barrel.json";
import { storage } from "../game/Storage";

/**
 * Locale set, ordered and grouped the way the Poki localization guide
 * recommends (LOC-04): EFIGS + Turkish first, CJK second, then Brazilian
 * Portuguese and Russian; plus Arabic (RTL) and Maltese.
 */
export type SupportedLocale =
  | "en"
  | "es"
  | "de"
  | "fr"
  | "it"
  | "tr"
  | "pt-BR"
  | "ru"
  | "ar"
  | "zh-CN"
  | "ja"
  | "mt";

export const SUPPORTED_LOCALES: { code: SupportedLocale; name: string; flag: string; rtl?: boolean }[] = [
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "es", name: "Español", flag: "🇪🇸" },
  { code: "de", name: "Deutsch", flag: "🇩🇪" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
  { code: "tr", name: "Türkçe", flag: "🇹🇷" },
  { code: "pt-BR", name: "Português (Brasil)", flag: "🇧🇷" },
  { code: "ru", name: "Русский", flag: "🇷🇺" },
  { code: "ar", name: "العربية", flag: "🇸🇦", rtl: true },
  { code: "zh-CN", name: "简体中文", flag: "🇨🇳" },
  { code: "ja", name: "日本語", flag: "🇯🇵" },
  { code: "mt", name: "Malti", flag: "🇲🇹" },
];

const LOCALE_STORAGE_KEY = "sunbird.i18n.locale";

/**
 * Match a BCP-47 browser tag against the shipped set (LOC-05: "ideally detect
 * the player's browser language and serve the content accordingly").
 *
 * Exact tag → same-language region variant → base language, so a Brazilian
 * player sending `pt` or `pt-PT` still lands on `pt-BR`, `zh-Hant` lands on
 * `zh-CN` rather than English, and `ru-RU` lands on `ru`. Returns null when
 * nothing matches (the caller falls back to English).
 */
export function matchLocale(tag: string | null | undefined): SupportedLocale | null {
  if (!tag) return null;
  const normalized = tag.trim().replace(/_/g, "-").toLowerCase();
  if (!normalized) return null;
  const exact = SUPPORTED_LOCALES.find((l) => l.code.toLowerCase() === normalized);
  if (exact) return exact.code;
  const prefix = SUPPORTED_LOCALES.find((l) => normalized.startsWith(`${l.code.toLowerCase()}-`));
  if (prefix) return prefix.code;
  const base = normalized.split("-")[0];
  const sameLanguage = SUPPORTED_LOCALES.find((l) => l.code.toLowerCase().split("-")[0] === base);
  if (sameLanguage) return sameLanguage.code;
  // Regional spellings the base tag does not cover directly.
  if (base === "nb" || base === "nn" || base === "no") return null;
  return null;
}

let currentLocale: SupportedLocale = "en";

function initLocale(): SupportedLocale {
  try {
    const saved = storage.getItem(LOCALE_STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.some((l) => l.code === saved)) {
      return saved as SupportedLocale;
    }
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    const candidates = [nav?.language, ...(nav?.languages ?? [])].filter(Boolean) as string[];
    for (const candidate of candidates) {
      const match = matchLocale(candidate);
      if (match) return match;
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
