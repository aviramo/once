import { eventLabel, statusResult, type AdminDict } from "@/lib/humanize";
import type {
  AffectedUser,
  DataChange,
  LocationDetail,
  ProfileChange,
  UnifiedEntry,
} from "@/app/[lang]/admin/users/[userId]/_components/UnifiedActivity";

/**
 * Server-side helpers that turn raw `log` rows into rich `UnifiedEntry` cards.
 * Two outputs per event: a focused list of "affected users" (only the
 * counterparts the event actually touched — never random snapshot members)
 * and "data changes" pulled from the request body (location / profile /
 * account preferences). The post-event page1 / page2 state narratives are
 * deliberately NOT computed: the iconography of the partner chips (each
 * tagged with its current page) communicates the relations impact in one
 * place.
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
  imagesCount: string;
  bio: string;
  bioCleared: string;
  bioPreview: string;
  family: string;
  familyCleared: string;
  familyHas: string;
  familyNo: string;
  familyKidsCount: string;
  familyForKidsYes: string;
  familyForKidsNo: string;
  isForKids: string;
  yes: string;
  no: string;
};

/** Hebrew labels for account / preference fields that ride on the body of
 * account / age / range / preferred_gender / start / focus / location / etc.
 * Only meaningful for an admin — push_token, location_custom-without-context,
 * etc. are intentionally absent. */
export type AccountChangeDict = {
  ageRange: string; // "טווח גילאים"
  ageFrom: string;
  ageTo: string;
  distance: string; // "טווח מרחק"
  distanceUnit: string; // "ק״מ"
  preferMale: string; // "כולל גברים"
  preferFemale: string; // "כולל נשים"
  preferYes: string;
  preferNo: string;
  weekStart: string;
  lang: string;
  locationLabel: string;
  locationType: string;
  locationCustomOn: string; // "מיקום ידני הופעל"
  locationCustomOff: string; // "מיקום ידני בוטל"
  notifGranted: string;
  notifDenied: string;
  notifUndetermined: string;
  pushTokenChanged: string; // "טוקן נוטיפיקציות עודכן"
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

function buildAccountChanges(
  body: AnyRecord | null,
  d: AccountChangeDict,
): DataChange[] | undefined {
  if (!body) return undefined;
  const out: DataChange[] = [];

  const hasAgeFrom = "age_from" in body;
  const hasAgeTo = "age_to" in body;
  if (hasAgeFrom || hasAgeTo) {
    if (hasAgeFrom && hasAgeTo) {
      out.push({
        label: d.ageRange,
        detail: `${body.age_from}–${body.age_to}`,
      });
    } else if (hasAgeFrom) {
      out.push({ label: d.ageFrom, detail: String(body.age_from) });
    } else if (hasAgeTo) {
      out.push({ label: d.ageTo, detail: String(body.age_to) });
    }
  }
  if ("range" in body) {
    out.push({
      label: d.distance,
      detail: `${body.range} ${d.distanceUnit}`,
    });
  }
  if ("is_for_male" in body) {
    out.push({
      label: d.preferMale,
      detail: body.is_for_male ? d.preferYes : d.preferNo,
    });
  }
  if ("is_for_female" in body) {
    out.push({
      label: d.preferFemale,
      detail: body.is_for_female ? d.preferYes : d.preferNo,
    });
  }
  if ("weekStart" in body) {
    out.push({ label: d.weekStart, detail: String(body.weekStart) });
  }
  if ("lang" in body) {
    out.push({ label: d.lang, detail: String(body.lang) });
  }
  if ("location_label" in body && body.location_label) {
    out.push({ label: d.locationLabel, detail: String(body.location_label) });
  }
  if ("location_type" in body && body.location_type) {
    out.push({ label: d.locationType, detail: String(body.location_type) });
  } else if ("location_custom" in body) {
    out.push({
      label: body.location_custom ? d.locationCustomOn : d.locationCustomOff,
    });
  }
  if ("notif_perm" in body) {
    const v = body.notif_perm;
    const label =
      v === "granted"
        ? d.notifGranted
        : v === "denied"
          ? d.notifDenied
          : d.notifUndetermined;
    out.push({ label });
  }
  if ("push_token" in body) {
    out.push({ label: d.pushTokenChanged });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Per-event partner list — only counterparts the action ACTUALLY touched.
 * Snapshot-fishing (the previous "everyone who appears in the post-event
 * relations" model) wrongly attached every viewer to events like `ignore`,
 * which mostly act on the page1 candidate. This switch encodes each event's
 * real surface so a skip / ignore card shows only the new page1 candidate,
 * not the unrelated page2 viewers.
 */
function buildAffected(
  rawKey: string,
  body: AnyRecord | null,
  user: unknown,
  byOther: boolean,
): AffectedUser[] {
  if (byOther) return [];
  const rel = (user as { relations?: SnapshotRelations } | null | undefined)
    ?.relations;
  const bodyTarget =
    typeof body?.user_id === "string" ? body.user_id.toLowerCase() : null;
  const p1 = rel?.page1?.profile?.user_id?.toLowerCase() ?? null;

  switch (rawKey) {
    case "find":
    case "ignore":
    case "extend":
      // Single new (or current) page1 candidate.
      return p1 ? [{ id: p1, page: 1 }] : [];

    case "invite":
    case "approve":
      // Body target — currently on page1 if the action succeeded.
      if (bodyTarget) {
        return [{ id: bodyTarget, page: bodyTarget === p1 ? 1 : null }];
      }
      return p1 ? [{ id: p1, page: 1 }] : [];

    case "chat":
      // Chat message recipient — the active page1 chat partner.
      if (bodyTarget) {
        return [{ id: bodyTarget, page: bodyTarget === p1 ? 1 : null }];
      }
      return p1 ? [{ id: p1, page: 1 }] : [];

    case "decline":
    case "cancel":
    case "remove":
    case "leave":
    case "block":
      // Body target — the action removed them from this user's relations.
      return bodyTarget ? [{ id: bodyTarget, page: null }] : [];

    case "add": {
      // The viewers seeded onto page2.profiles by the broadcast.
      const viewers = rel?.page2?.profiles ?? [];
      return viewers
        .map((v) => v.user_id?.toLowerCase())
        .filter((id): id is string => !!id)
        .map((id) => ({ id, page: 2 as const }));
    }

    default:
      // pause / resume / free2 / lock2 / clear1 / clear2 / cancel_add /
      // start / location / focus / profile / account / etc. — no partner is
      // semantically tied to the action.
      return [];
  }
}

/**
 * Build one card per raw log row. `selfId` is the user being viewed; `actorId`
 * is taken from `row.user_id` (the user who triggered the row). Rows where
 * the actor is someone else (`byOther`) carry only the "Initiated by" chip —
 * the data-impact / partner-on-page-X breakdown is from the actor's snapshot
 * and would be misleading under this user's identity.
 */
export function buildEventCards(
  rows: LogRow[],
  selfId: string,
  dict: AdminDict,
  profileDict: ProfileChangeDict,
  accountDict: AccountChangeDict,
): UnifiedEntry[] {
  const selfLower = selfId.toLowerCase();
  return rows.map((row) => {
    const actorId = row.user_id ? row.user_id.toLowerCase() : null;
    const byOther = !!actorId && actorId !== selfLower;
    const body = readBody(row.log);
    const affected = buildAffected(row.key, body, row.user, byOther);

    const ok = row.status < 400;
    const res = statusResult(dict, row.status);

    // Data-impact blocks. Computed only when the actor IS the user we're
    // viewing — for a by-other row, body fields describe the OTHER user.
    const location =
      !byOther &&
      (row.key === "location" || row.key === "start" || row.key === "focus")
        ? buildLocationDetail(body)
        : undefined;
    const profileChanges =
      !byOther && row.key === "profile"
        ? buildProfileChanges(body, profileDict)
        : undefined;
    const accountChanges = !byOther
      ? buildAccountChanges(body, accountDict)
      : undefined;

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
      location,
      profileChanges,
      accountChanges,
    };
  });
}
