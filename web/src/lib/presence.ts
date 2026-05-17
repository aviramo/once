// User freshness for the live admin map. Single source of the thresholds,
// the tick cadence and the colours so the ring, the legend and the
// re-evaluation timer can never disagree.
import { MAP_EMERALD, MAP_ZINC } from "./mapColors";

/** Seen within this window → "live" (green ring). */
export const PRESENCE_LIVE_MS = 60_000;
/** Seen within this window (but not "live") → "idle" (gray ring). At or
 *  beyond it the user is not shown on the map at all. */
export const PRESENCE_IDLE_MS = 24 * 60 * 60 * 1000;
/** How often the map re-evaluates freshness when no realtime event arrives
 *  (so a green marker fades to gray, and a stale one drops off, on its own).
 *  Well under the 60s live window so the green→gray flip stays crisp. */
export const PRESENCE_TICK_MS = 10_000;

export type Presence = "live" | "idle";

export const PRESENCE_COLOR: Record<Presence, string> = {
  live: MAP_EMERALD,
  idle: MAP_ZINC,
};

// ISO cutoff for the server seed query: only users seen within the idle
// window can be shown (the client tick later drops them the same way). Kept
// here so the threshold and the cutoff can never diverge. (Wrapping the time
// read in a plain lib function also keeps it out of a component's render.)
export function presenceCutoffIso(): string {
  return new Date(Date.now() - PRESENCE_IDLE_MS).toISOString();
}

// null → not placeable on the map (no/!valid last_seen, or older than a day).
export function presenceOf(
  lastSeenIso: string | null | undefined,
  nowMs: number,
): Presence | null {
  if (!lastSeenIso) return null;
  const t = new Date(lastSeenIso).getTime();
  if (!Number.isFinite(t)) return null;
  const age = nowMs - t;
  if (age < PRESENCE_LIVE_MS) return "live"; // also covers minor clock skew
  if (age < PRESENCE_IDLE_MS) return "idle";
  return null;
}
