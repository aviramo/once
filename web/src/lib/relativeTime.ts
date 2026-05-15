import type { Locale } from "@/i18n/locales";

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

export function relativeTime(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const rtf = new Intl.RelativeTimeFormat(
    locale === "he" ? "he-IL" : "en-US",
    { numeric: "auto" },
  );
  const diff = Date.now() - new Date(iso).getTime();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) {
      return rtf.format(-Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, "minute");
}
