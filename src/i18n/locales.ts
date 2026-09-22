/**
 * The shipped locale set — pure data, with no imports and no side effects.
 *
 * This lives apart from `./index` on purpose. `index.ts` is a runtime module:
 * it statically imports the English pack, calls `import.meta.glob` and touches
 * storage, all of which are Vite/browser constructs. Anything that merely needs
 * to know which locales ship — the menu's language list, the i18n e2e specs and
 * the visual-locale coverage check — can import this instead, and then it runs
 * under plain Node without a bundler (Node 22+ refuses a JSON import that has no
 * `with { type: "json" }` attribute, and `import.meta.glob` does not exist
 * there at all).
 *
 * Locale set, ordered and grouped the way the Poki localization guide
 * recommends (LOC-04): EFIGS + Turkish first, CJK second (zh-CN, ja, ko), then
 * Brazilian Portuguese and Russian. The remaining Poki locales — Arabic (RTL),
 * Dutch, Polish, Swedish, Hindi, Indonesian, Vietnamese and Thai — follow, with
 * Maltese last so the two long-tail scripts close the list.
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
  | "ko"
  | "nl"
  | "pl"
  | "sv"
  | "hi"
  | "id"
  | "vi"
  | "th"
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
  { code: "ko", name: "한국어", flag: "🇰🇷" },
  { code: "nl", name: "Nederlands", flag: "🇳🇱" },
  { code: "pl", name: "Polski", flag: "🇵🇱" },
  { code: "sv", name: "Svenska", flag: "🇸🇪" },
  { code: "hi", name: "हिन्दी", flag: "🇮🇳" },
  { code: "id", name: "Indonesia", flag: "🇮🇩" },
  { code: "vi", name: "Tiếng Việt", flag: "🇻🇳" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "mt", name: "Malti", flag: "🇲🇹" },
];
