import type { Dictionary } from "@/i18n/dictionaries";

/**
 * Turns raw server vocabulary — RPC keys, restriction keys, outcome codes,
 * HTTP status — into the plain business-language sentences the admin panel
 * shows. The admin should never have to decode any of it; every mapping lives
 * here and is sourced from the i18n dictionary (single source).
 *
 * What a PERSON is doing is no longer here: that is one status read off
 * `watch`, in `lib/watchStatus.ts`.
 */

export type AdminDict = Dictionary["admin"];

/** Semantic tone → drives the single StatusBadge colour map (no raw colours
 * anywhere else). */
export type Tone = "ok" | "busy" | "chat" | "idle" | "ended";

/**
 * What the panel still reads out of `users.relations`.
 *
 * The two BOARDS are gone from here: what a person is doing is one status read
 * off `watch` (see `lib/watchStatus.ts`), because page1 and page2 are two
 * independent mailboxes that nothing makes agree and the panel was painting
 * both and leaving the reader to reconcile them. What stays is the part of
 * `relations` that was never about a pair — the availability gate, which is a
 * fact about an ACCOUNT.
 */
export type Relations =
  | {
      /** Availability gate (group-membership / notification-presence).
       * Written by user_availability(); `reason` is set only when gated. */
      availability?: {
        state?: string;
        reason?: string | null;
      } | null;
    }
  | null
  | undefined;

/** The slice of `users.data` the matchability gate reads. */
export type ProfileData = { images?: unknown[] | null } | null | undefined;

export type Narrative = { text: string; tone: Tone };

/** Server action key (`find`, `invite`, `approve`, …) → business phrase.
 * If the key isn't mapped, return the raw key so an admin sees `report` /
 * `join_request` etc. instead of an opaque generic "פעולה" — that hid the
 * actual event identity and made unmapped rows indistinguishable. */
export function eventLabel(d: AdminDict, key: string): string {
  const map = d.events as Record<string, string>;
  return map[key] ?? key;
}

/**
 * The same action, said from the OTHER side. `log` records the actor's verb —
 * "invited a user to chat" — which on the recipient's page is the wrong
 * subject: what happened to THEM is that they received an invitation. Only
 * reachable once the row's target is known to be this person (see
 * `targetsOf` in eventCards), so the passive sentence is a fact and not a
 * guess. Falls back to the active label for a key with no passive form.
 */
export function eventLabelByOther(d: AdminDict, key: string): string {
  const map = d.eventsByOther as Record<string, string>;
  return map?.[key] ?? eventLabel(d, key);
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

/**
 * The availability gate, as one sentence + tone — or `null` when the user is
 * NOT gated (available, or no gate computed yet so we genuinely don't know).
 *
 * A gated user is out of the matching pool entirely: not in any enabled group,
 * or notifications off. Their seed `page1.state` stays `'free'`, so without
 * this the list would claim "free, waiting for a match" for someone who can't
 * be matched at all. The reason is read straight from
 * `relations.availability.reason` (`'group'` / `'push'`), with a generic
 * fallback when the reason is absent.
 */
export function availabilityNarrative(
  d: AdminDict,
  rel: Relations,
): Narrative | null {
  const av = rel?.availability;
  const state = av?.state;
  if (!state || state === "available") return null;
  const g = d.narrative.gate as Record<string, string>;
  if (state === "unavailable") {
    const reason = av?.reason ?? "";
    return { text: g[reason] ?? g.unavailable, tone: "idle" };
  }
  return null;
}

/**
 * The onboarding-completeness gate, as one sentence + tone, or `null` when the
 * profile is displayable.
 *
 * This gate does NOT live in `relations` like the availability one: it is a
 * clause inside `others(only_available)` requiring `data.images` to hold at
 * least one entry, so a photo-less user can never be surfaced as a candidate to
 * anyone. Their boards still sit at `state='free'`, which is why the panel used
 * to badge them "available for matches" while the server would never match
 * them. Bio is deliberately NOT consulted here, matching the SQL clause: an
 * empty bio is still displayable.
 */
export function profileCompleteNarrative(
  d: AdminDict,
  data: ProfileData,
): Narrative | null {
  const images = data?.images;
  if (Array.isArray(images) && images.length > 0) return null;
  return { text: d.narrative.gate.noPhoto, tone: "idle" };
}
