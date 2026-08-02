import type { Dictionary } from "@/i18n/dictionaries";
import { outcomeLabel, type AdminDict, type Narrative } from "./humanize";

/**
 * ONE STATUS PER PERSON, read off `watch`.
 *
 * The panel used to describe someone with two badges — page1's state beside
 * page2's — because that is the shape of `relations`: two independent
 * single-slot mailboxes that nothing makes agree. The reader had to hold both
 * and work out which was the person's actual situation, and on live data they
 * contradicted each other.
 *
 * `watch` is one row per pair, so a person has one situation, and
 * `admin_watch_states` is the only place the rule that picks it is written
 * (SQL, so the badge, the filter and the facet count can never disagree).
 * Everything here is presentation: a status row in, a sentence and a tone out.
 *
 * Two things deliberately do NOT collapse into the status:
 *   - an invitation he RECEIVED — somebody else's action, standing beside his
 *     own situation rather than replacing it (he can be watching C while B
 *     invites him), and the one inbound fact he still owes an answer to. It is
 *     a second, separate tag.
 *   - how many people are watching him — a quantity, not a status. It says
 *     nothing about what HE is doing, so it rides the card's meta line.
 */

export type WatchStatus = "watching" | "invited" | "chat" | "ended";

/** One row of `admin_watch_states`. */
export type WatchState = {
  user_id: string;
  seeking: boolean;
  discoverable: boolean;
  status: WatchStatus | null;
  other_id: string | null;
  other_name: string | null;
  ended_reason: string | null;
  since: string | null;
  expires_at: string | null;
  invited_by: string | null;
  invited_by_name: string | null;
  invited_at: string | null;
  invited_expires_at: string | null;
  watchers: number;
};

export type WatchDict = Dictionary["admin"]["watch"];

/**
 * The users-list filter values. The four live statuses, the two shapes of
 * "nothing is happening", and `invited_in` — which is the TAG rather than a
 * status, and belongs in the same dropdown anyway: the question an operator is
 * asking is "what does this person's card say", and a received invitation is
 * one of the things it can say.
 */
export const WATCH_FILTERS = [
  "watching",
  "invited",
  "chat",
  "ended",
  "invited_in",
  "free",
  "not_seeking",
] as const;

export type WatchFilter = (typeof WATCH_FILTERS)[number];

function fill(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

function trimmed(name: string | null | undefined): string | null {
  const n = name?.trim();
  return n ? n : null;
}

/**
 * Which bucket this person falls in — the one value the filter, the facet
 * count and the badge all agree on. `invited_in` is deliberately absent: a
 * received invitation is not a bucket a person is IN, it is a fact that can be
 * true alongside any of these, and {@link matchesWatchFilter} answers for it
 * separately.
 */
export function watchBucket(w: WatchState | undefined): WatchFilter {
  if (w?.status) return w.status;
  return w && !w.seeking ? "not_seeking" : "free";
}

/** The single status line for a person, plus its tone. */
export function watchStatusNarrative(
  d: WatchDict,
  a: AdminDict,
  w: WatchState | undefined,
): Narrative {
  const who = trimmed(w?.other_name);
  switch (w?.status) {
    case "watching":
      return {
        text: who ? fill(d.status.watching, { name: who }) : d.status.watchingNoName,
        tone: "busy",
      };
    case "invited":
      return {
        text: who ? fill(d.status.invited, { name: who }) : d.status.invitedNoName,
        tone: "busy",
      };
    case "chat":
      return {
        text: who ? fill(d.status.chat, { name: who }) : d.status.chatNoName,
        tone: "chat",
      };
    case "ended": {
      // The outcome vocabulary is shared with the event log — one ending, one
      // word for it, wherever the panel says it.
      const outcome = outcomeLabel(a, w.ended_reason);
      return { text: outcome ?? d.status.ended, tone: "ended" };
    }
    default:
      return w && !w.seeking
        ? { text: d.status.notSeeking, tone: "idle" }
        : { text: d.status.free, tone: "ok" };
  }
}

/** The invitation he received and has not answered — a tag beside the status,
 * never folded into it. `null` when there is none. */
export function watchInvitedTag(
  d: WatchDict,
  w: WatchState | undefined,
): Narrative | null {
  if (!w?.invited_by) return null;
  const who = trimmed(w.invited_by_name);
  return {
    text: who ? fill(d.invitedBy, { name: who }) : d.invitedByNoName,
    tone: "busy",
  };
}

/** How many people are looking at him right now, as a phrase. `null` at zero —
 * "nobody is watching him" is not a fact worth a line on a dense card. */
export function watchersLine(
  d: WatchDict,
  w: WatchState | undefined,
): string | null {
  const n = w?.watchers ?? 0;
  if (n <= 0) return null;
  return n === 1 ? d.watchersOne : fill(d.watchersMany, { count: n });
}

export function matchesWatchFilter(
  w: WatchState | undefined,
  filter: WatchFilter,
): boolean {
  if (filter === "invited_in") return !!w?.invited_by;
  return watchBucket(w) === filter;
}
