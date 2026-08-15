import type { Locale } from "@/i18n/locales";

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
];

function intlLocale(locale: Locale): string {
  return locale === "he" ? "he-IL" : "en-US";
}

export function relativeTime(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  const diff = Date.now() - new Date(iso).getTime();
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms) {
      return rtf.format(-Math.round(diff / ms), unit);
    }
  }
  return rtf.format(0, "minute");
}

/**
 * HOW LONG SOMETHING STOOD, in the two largest units it needs and no more.
 *
 * The one thing a drill-down adds over the number that opened it: an
 * invitation declined after nine minutes and one declined after four are two
 * different things, and neither reads off a timestamp. Two units because an
 * invitation lives ten minutes — "9 min 12 sec" is the answer, and a third
 * unit would only ever be noise on a figure this short — while a conversation
 * running over days still reads as "3 days 4 hr".
 *
 * Built on `Intl.NumberFormat`'s unit style rather than a table of words, so
 * Hebrew and English both come out of the platform and neither is a string
 * anybody has to keep in step in the dictionary.
 */
const DURATION_UNITS: Array<[Intl.NumberFormatOptions["unit"], number]> = [
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
  ["second", 1000],
];

export function duration(ms: number | null | undefined, locale: Locale): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const abs = Math.max(0, Math.round(ms));
  const fmt = (n: number, unit: Intl.NumberFormatOptions["unit"]) =>
    new Intl.NumberFormat(intlLocale(locale), {
      style: "unit",
      unit,
      unitDisplay: "short",
    }).format(n);

  // The lead is the largest unit that has anything in it; the remainder is
  // spent on the unit DIRECTLY below it and no further, so "3 days 4 hr" is
  // possible and "3 days 12 min" — which would silently drop the hours — is
  // not. Nothing at all is zero seconds, the honest answer for an invitation
  // answered inside the same second it arrived.
  const lead = DURATION_UNITS.findIndex(([, size]) => abs >= size);
  if (lead === -1) return fmt(0, "second");

  const [unit, size] = DURATION_UNITS[lead];
  const whole = Math.floor(abs / size);
  const next = DURATION_UNITS[lead + 1];
  if (!next) return fmt(whole, unit);
  const rest = Math.floor((abs - whole * size) / next[1]);
  return rest > 0 ? `${fmt(whole, unit)} ${fmt(rest, next[0])}` : fmt(whole, unit);
}

/** Absolute date + time, formatted for the locale. Single source for the
 * admin pages that show an exact timestamp next to a relative one. */
export function dateTime(iso: string | null, locale: Locale): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}
