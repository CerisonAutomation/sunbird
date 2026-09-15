import { useMemo } from "react";
import type { BarrelRoot } from "./barrel.types";
import { getBarrel, getLocale } from "./index";

export function useTranslations(locale?: string, barrel?: BarrelRoot["barrel"]) {
  const currentLocale = locale ?? getLocale();
  const b = barrel ?? getBarrel().barrel;

  return useMemo(() => {
    const t = (key: string, params?: Record<string, string | number>, defaultText?: string) => {
      const entry = b[key];
      if (!entry) return defaultText ?? key;
      const text = entry.translations[currentLocale] ?? entry.translations["en"] ?? entry.sourceText;
      if (!params) return text;
      return Object.entries(params).reduce((acc, [k, v]) => {
        const token = `{{${k}}}`;
        const altToken = `{${k}}`;
        return acc.split(token).join(String(v)).split(altToken).join(String(v));
      }, text);
    };
    return { t };
  }, [currentLocale, b]);
}
