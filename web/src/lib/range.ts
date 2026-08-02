/**
 * The period the dashboard's activity figures are read against.
 *
 * Plain module, deliberately NOT inside the `"use client"` picker that renders
 * it: every export of a client module becomes a client reference in the server
 * graph, so a server component calling `parseRange` from there would be
 * calling a proxy, not a function. The picker imports these; so does the page.
 *
 * It rides the URL rather than a cookie — the opposite choice from the
 * environment switch — because a period is what you were looking at when you
 * noticed something, so it belongs in a link you can send. The environment is
 * a mode you stay in, and a param would have to be threaded through every
 * link in the panel.
 */

export const RANGES = ["1d", "7d", "30d", "all"] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = "7d";

export function parseRange(raw: string | null | undefined): Range {
  return (RANGES as readonly string[]).includes(raw ?? "")
    ? (raw as Range)
    : DEFAULT_RANGE;
}

/** The window's start, or `null` for "all time" — the shape
 * `admin_activity_metrics(p_since)` takes. */
export function rangeSince(range: Range): string | null {
  const DAY = 86_400_000;
  const days =
    range === "1d" ? 1 : range === "7d" ? 7 : range === "30d" ? 30 : 0;
  if (days === 0) return null;
  return new Date(Date.now() - days * DAY).toISOString();
}
