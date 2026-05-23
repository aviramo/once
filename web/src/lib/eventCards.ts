import {
  page1Narrative,
  page2Narrative,
  eventLabel,
  statusResult,
  type AdminDict,
  type Relations,
} from "@/lib/humanize";
import type {
  AffectedUser,
  LocationDetail,
  ProfileChange,
  UnifiedEntry,
  Narrative,
} from "@/app/[lang]/admin/users/[userId]/_components/UnifiedActivity";

/**
 * Server-side helpers that turn raw `log` rows into the rich `UnifiedEntry`
 * cards the admin merged-events feed renders. Lives outside the page file so
 * the mapping (event-key → partners, body → location/profile detail) has one
 * home and stays in step with the dictionary's `events` map.
 */

type LogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  key: string;
  status: number;
  log: unknown;
  user: unknown;
};

type AnyRecord = Record<string, unknown>;

/** Events whose semantics involve a counterpart (anything that touches
 * relations.page1 / relations.page2 in a partner-changing way). Everything
 * NOT in this set — location, focus, start, profile, account, chat, ok,
 * logout, delete, options, api, set_tier, report, join_request, notif — has
 * NO "affected users" on its card. Without this filter a `location` event
 * would surface every partner already in the actor's snapshot, which the
 * action did not actually touch. */
const PARTNER_EVENTS = new Set<string>([
  "find",
  "ignore",
  "invite",
  "extend",
  "cancel",
  "approve",
  "decline",
  "remove",
  "add",
  "cancel_add",
  "leave",
  "block",
  "clear1",
  "clear2",
  "free2",
  "lock2",
  "pause",
  "resume",
]);

type ProfileEntry = { user_id?: string; name?: string };
type SnapshotRelations = {
  page1?: { profile?: ProfileEntry | null } | null;
  page2?: {
    profile?: ProfileEntry | null;
    profiles?: ProfileEntry[] | null;
  } | null;
};

export type ProfileChangeDict = {
  images: string;
  imagesCount: string; // "{n} תמונות"
  bio: string;
  bioCleared: string;
  bioPreview: string; // "{text}"
  family: string;
  familyCleared: string;
  familyHas: string;
  familyNo: string;
  familyKidsCount: string; // "{n}"
  familyForKidsYes: string;
  familyForKidsNo: string;
  isForKids: string;
  yes: string;
  no: string;
};

function fill(t: string, vars: Record<string, string | number>): string {
  return t.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

function readBody(rawLog: unknown): AnyRecord | null {
  if (!Array.isArray(rawLog)) return null;
  const first = rawLog[0] as { task?: string; body?: unknown } | undefined;
  if (!first || first.task !== "body") return null;
  return (first.body ?? null) as AnyRecord | null;
}

function buildLocationDetail(body: AnyRecord | null): LocationDetail | undefined {
  if (!body || !("location" in body)) return undefined;
  const loc = body.location;
  if (loc === null) return { cleared: true };
  if (loc && typeof loc === "object") {
    const o = loc as { latitude?: unknown; longitude?: unknown };
    const lat = Number(o.latitude);
    const lng = Number(o.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { cleared: false, lat, lng };
    }
  }
  return undefined;
}

function buildProfileChanges(
  body: AnyRecord | null,
  d: ProfileChangeDict,
): ProfileChange[] | undefined {
  if (!body) return undefined;
  const out: ProfileChange[] = [];
  if ("images" in body) {
    const arr = Array.isArray(body.images) ? body.images : [];
    out.push({ label: d.images, detail: fill(d.imagesCount, { n: arr.length }) });
  }
  if ("bio" in body) {
    const v = body.bio;
    if (v === null || v === "") {
      out.push({ label: d.bio, detail: d.bioCleared });
    } else if (typeof v === "string") {
      const preview = v.length > 80 ? `${v.slice(0, 80)}…` : v;
      out.push({ label: d.bio, detail: fill(d.bioPreview, { text: preview }) });
    }
  }
  if ("family" in body) {
    const f = body.family as
      | {
          hasKids?: boolean;
          kids?: unknown[];
          isForKids?: boolean;
        }
      | null
      | undefined;
    if (f === null) {
      out.push({ label: d.family, detail: d.familyCleared });
    } else if (f) {
      const parts: string[] = [];
      if (typeof f.hasKids === "boolean") {
        parts.push(f.hasKids ? d.familyHas : d.familyNo);
      }
      if (Array.isArray(f.kids) && f.kids.length > 0) {
        parts.push(fill(d.familyKidsCount, { n: f.kids.length }));
      }
      if (typeof f.isForKids === "boolean") {
        parts.push(f.isForKids ? d.familyForKidsYes : d.familyForKidsNo);
      }
      out.push({
        label: d.family,
        detail: parts.length > 0 ? parts.join(", ") : undefined,
      });
    }
  }
  if ("is_for_kids" in body) {
    out.push({
      label: d.isForKids,
      detail: body.is_for_kids ? d.yes : d.no,
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Per-affected-user page placement, derived from the actor's post-event
 * snapshot: which slot of the actor's relations does this counterpart sit in
 * right now? Drives the "page 1 / page 2" tag rendered next to each chip.
 *
 *   - page1.profile.user_id      → page 1 (the single watched / waiting / chat target)
 *   - page2.profile.user_id      → page 2 (an inviter pending on page2)
 *   - page2.profiles[].user_id   → page 2 (a viewer in the watcher list)
 *   - none of the above          → null (target of a remove/decline/leave/etc., now gone)
 */
function buildAffected(
  rawKey: string,
  body: AnyRecord | null,
  user: unknown,
  byOther: boolean,
): AffectedUser[] {
  if (byOther) return []; // by-other rows show only the "Initiated by" chip
  if (!PARTNER_EVENTS.has(rawKey)) return [];

  const rel = (user as { relations?: SnapshotRelations } | null | undefined)
    ?.relations;
  const map = new Map<string, 1 | 2 | null>();

  const p1Id = rel?.page1?.profile?.user_id?.toLowerCase();
  if (p1Id) map.set(p1Id, 1);

  const p2Id = rel?.page2?.profile?.user_id?.toLowerCase();
  if (p2Id && !map.has(p2Id)) map.set(p2Id, 2);

  for (const v of rel?.page2?.profiles ?? []) {
    const id = v.user_id?.toLowerCase();
    if (id && !map.has(id)) map.set(id, 2);
  }

  // The explicit target from the body (invite/approve/decline/remove/cancel/
  // leave/block/extend all carry user_id). If a removal event tore them out of
  // the snapshot, they still belong on the card — page null = "no longer in
  // your relations".
  const bodyTarget = typeof body?.user_id === "string"
    ? body.user_id.toLowerCase()
    : null;
  if (bodyTarget && !map.has(bodyTarget)) map.set(bodyTarget, null);

  return [...map].map(([id, page]) => ({ id, page }));
}

/**
 * Build one card per raw log row. `selfId` is the user being viewed; `actorId`
 * is taken from `row.user_id` (the user who triggered the row). Page1/Page2
 * state badges are read from `row.user.relations` — that snapshot is the
 * actor's row, so they're shown ONLY when the actor IS the user being viewed.
 */
export function buildEventCards(
  rows: LogRow[],
  selfId: string,
  dict: AdminDict,
  profileDict: ProfileChangeDict,
): UnifiedEntry[] {
  const selfLower = selfId.toLowerCase();
  return rows.map((row) => {
    const actorId = row.user_id ? row.user_id.toLowerCase() : null;
    const byOther = !!actorId && actorId !== selfLower;
    const body = readBody(row.log);
    const affected = buildAffected(row.key, body, row.user, byOther);

    const ok = row.status < 400;
    const res = statusResult(dict, row.status);

    let page1State: Narrative | null = null;
    let page2State: Narrative | null = null;
    if (!byOther && row.user) {
      const rel = (row.user as { relations?: unknown }).relations as Relations;
      if (rel) {
        page1State = page1Narrative(dict, rel);
        page2State = page2Narrative(dict, rel);
      }
    }

    return {
      id: row.id,
      at: row.created_at,
      action: eventLabel(dict, row.key),
      rawKey: row.key,
      ok,
      statusLabel: res.label,
      actorId,
      byOther,
      affected,
      page1State,
      page2State,
      location:
        row.key === "location" || row.key === "start" || row.key === "focus"
          ? buildLocationDetail(body)
          : undefined,
      profileChanges:
        row.key === "profile" ? buildProfileChanges(body, profileDict) : undefined,
    };
  });
}
