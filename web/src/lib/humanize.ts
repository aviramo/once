import type { Dictionary } from "@/i18n/dictionaries";

/**
 * Turns the raw two-board state machine + server log into the plain,
 * business-language sentences the admin panel shows. The admin should never
 * have to decode `state`, `message`, RPC keys or HTTP status codes — every
 * mapping lives here and is sourced from the i18n dictionary (single source).
 */

export type AdminDict = Dictionary["admin"];

/** Semantic tone → drives the single StatusBadge colour map (no raw colours
 * anywhere else). */
export type Tone = "ok" | "busy" | "chat" | "idle" | "ended";

type ProfileMini = { name?: string | null } | null | undefined;

export type Relations =
  | {
      page1?: {
        state?: string;
        message?: string | null;
        profile?: ProfileMini;
      } | null;
      page2?: {
        state?: string;
        message?: string | null;
        profile?: ProfileMini;
        profiles?: unknown[] | null;
      } | null;
      /** Availability gate (group-membership / notification-presence / area).
       * Written by user_availability(); `reason` is set only when gated. */
      availability?: {
        state?: string;
        reason?: string | null;
      } | null;
    }
  | null
  | undefined;

export type Narrative = { text: string; tone: Tone };

function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    String(vars[k] ?? ""),
  );
}

/** Server action key (`find`, `invite`, `approve`, …) → business phrase.
 * If the key isn't mapped, return the raw key so an admin sees `report` /
 * `join_request` etc. instead of an opaque generic "פעולה" — that hid the
 * actual event identity and made unmapped rows indistinguishable. */
export function eventLabel(d: AdminDict, key: string): string {
  const map = d.events as Record<string, string>;
  return map[key] ?? key;
}

/** Restriction key (`ignore`, `block`, …) → business phrase. */
export function restrictionLabel(d: AdminDict, key: string): string {
  const map = d.restrictionsMap as Record<string, string>;
  return map[key] ?? key;
}

/** `message` / outcome code → "what happened" phrase (null if no message). */
export function outcomeLabel(
  d: AdminDict,
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  const map = d.outcomes as Record<string, string>;
  return map[code] ?? null;
}

/** HTTP status → success / failure word (number stays in technical detail). */
export function statusResult(
  d: AdminDict,
  status: number,
): { label: string; ok: boolean } {
  const ok = status < 400;
  return { label: ok ? d.result.ok : d.result.fail, ok };
}

function name(p: ProfileMini): string | null {
  const n = p?.name?.trim();
  return n ? n : null;
}

/** The user's main board, as one sentence + tone. */
export function page1Narrative(d: AdminDict, rel: Relations): Narrative {
  const p1 = rel?.page1;
  const n = d.narrative.page1;
  const state = p1?.state ?? "locked";
  const who = name(p1?.profile);
  switch (state) {
    case "free":
      return { text: n.free, tone: "ok" };
    case "watching":
      return {
        text: who ? fill(n.watching, { name: who }) : n.watchingNoName,
        tone: "busy",
      };
    case "waiting":
      return {
        text: who ? fill(n.waiting, { name: who }) : n.waitingNoName,
        tone: "busy",
      };
    case "chat":
      return {
        text: who ? fill(n.chat, { name: who }) : n.chatNoName,
        tone: "chat",
      };
    default: {
      const outcome = outcomeLabel(d, p1?.message);
      if (outcome) return { text: outcome, tone: "ended" };
      return { text: n.locked, tone: "idle" };
    }
  }
}

/**
 * The availability gate, as one sentence + tone — or `null` when the user is
 * NOT gated (available, or no gate computed yet so we genuinely don't know).
 *
 * A gated user is out of the matching pool entirely: not in any enabled group,
 * notifications off, or the covering area hasn't opened. Their seed
 * `page1.state` stays `'free'`, so without this the list would claim "free,
 * waiting for a match" for someone who can't be matched at all. The reason is
 * read straight from `relations.availability.reason` (`'group'` / `'push'`),
 * with a generic fallback when the reason is absent.
 */
export function availabilityNarrative(
  d: AdminDict,
  rel: Relations,
): Narrative | null {
  const av = rel?.availability;
  const state = av?.state;
  if (!state || state === "available") return null;
  const g = d.narrative.gate as Record<string, string>;
  if (state === "not_yet") return { text: g.not_yet, tone: "idle" };
  if (state === "unavailable") {
    const reason = av?.reason ?? "";
    return { text: g[reason] ?? g.unavailable, tone: "idle" };
  }
  return null;
}

/** The user's side board (incoming invites / viewers), as one sentence. */
export function page2Narrative(d: AdminDict, rel: Relations): Narrative {
  const p2 = rel?.page2;
  const n = d.narrative.page2;
  const state = p2?.state ?? "locked";
  const who = name(p2?.profile);
  const watchers = Array.isArray(p2?.profiles) ? p2.profiles.length : 0;
  switch (state) {
    case "free":
      return watchers > 0
        ? { text: fill(n.watchers, { count: watchers }), tone: "busy" }
        : { text: n.free, tone: "ok" };
    case "pending":
      return {
        text: who ? fill(n.pending, { name: who }) : n.pendingNoName,
        tone: "busy",
      };
    case "chat":
      return {
        text: who ? fill(n.chat, { name: who }) : n.chatNoName,
        tone: "chat",
      };
    default: {
      const outcome = outcomeLabel(d, p2?.message);
      if (outcome) return { text: outcome, tone: "ended" };
      return { text: n.locked, tone: "idle" };
    }
  }
}

/** The user-list activity line, plus which board it was sourced from
 * (`page` is `null` for facts that belong to neither board — the availability
 * gate, "free", or a fully-empty locked state). */
export type Activity = Narrative & { page: 1 | 2 | null };

/**
 * The single "what is this person doing right now" line for the user list.
 * Collapses both boards into the one most informative sentence, and reports
 * which board (`page`) that sentence came from so the card can label it.
 */
export function userActivity(d: AdminDict, rel: Relations): Activity {
  const p1 = rel?.page1;
  const p2 = rel?.page2;
  const s1 = p1?.state ?? "locked";
  const s2 = p2?.state ?? "locked";

  if (s1 === "chat") return { ...page1Narrative(d, rel), page: 1 };
  if (s2 === "chat") return { ...page2Narrative(d, rel), page: 2 };
  // The availability gate is a top-level fact: a gated user is out of the pool
  // entirely, so "free, waiting for a match" would be a lie. It outranks every
  // non-chat board state. `waiting`/`pending` are teardown-exempt in-flight
  // interactions (the gate never tears them down) so they still show.
  const gate = availabilityNarrative(d, rel);
  if (gate && s1 !== "waiting" && s2 !== "pending") {
    return { ...gate, page: null };
  }
  if (s1 === "waiting") return { ...page1Narrative(d, rel), page: 1 };
  if (s2 === "pending") return { ...page2Narrative(d, rel), page: 2 };
  if (s1 === "watching") return { ...page1Narrative(d, rel), page: 1 };
  if (s2 === "free" && Array.isArray(p2?.profiles) && p2.profiles.length > 0) {
    return { ...page2Narrative(d, rel), page: 2 };
  }
  if (s1 === "locked" && p1?.message) {
    return { text: outcomeLabel(d, p1.message)!, tone: "ended", page: 1 };
  }
  if (s2 === "locked" && p2?.message) {
    return { text: outcomeLabel(d, p2.message)!, tone: "ended", page: 2 };
  }
  if (s1 === "free") {
    return { text: d.narrative.page1.free, tone: "ok", page: null };
  }
  return { text: d.narrative.page1.locked, tone: "idle", page: null };
}
