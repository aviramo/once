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

/** System / maintenance keys that surface in `admin_log_for_user` because the
 * cron run touched (or just snapshotted) this user — `ext/cron`, `ext/resync`,
 * the bare `options` / `api` rejection paths, etc. They aren't user actions
 * and surfacing them as generic "פעולה" rows clutters the log. Drop them at
 * the build step so they never reach the UI. */
const SYSTEM_KEYS = new Set<string>(["options", "api", "ok"]);
function isSystemKey(key: string): boolean {
  if (SYSTEM_KEYS.has(key)) return true;
  if (key.startsWith("ext/")) return true;
  return false;
}

type ProfileEntry = { user_id?: string; name?: string };
type Page1Snapshot = {
  state?: string | null;
  message?: string | null;
  profile?: ProfileEntry | null;
} | null;
type Page2Snapshot = {
  state?: string | null;
  message?: string | null;
  profile?: ProfileEntry | null;
  profiles?: ProfileEntry[] | null;
} | null;
type SnapshotRelations = {
  page1?: Page1Snapshot;
  page2?: Page2Snapshot;
};

/** Fingerprint of one counterpart inside the actor's snapshot. Two
 * fingerprints with the same fields collapse to "no change" between rows. */
type PartnerSlot = {
  page: 1 | 2;
  state: string | null;
  message: string | null;
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
  notifDenied: string;
  notifUndetermined: string;
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
    // 'granted' is the default state that the mobile build re-reports on
    // every start/focus heartbeat — surfacing it would mark every heartbeat
    // as a "change". Only 'denied' / 'undetermined' are admin-actionable
    // (the user turned notifications off, or hasn't been prompted yet).
    const v = body.notif_perm;
    if (v === "denied") out.push({ label: d.notifDenied });
    else if (v === "undetermined") out.push({ label: d.notifUndetermined });
  }
  // push_token is intentionally NOT surfaced as a data change — the client
  // re-sends it on every start/focus, which would mark every heartbeat as
  // having a "data change" and defeat the "events that did something"
  // filter. A real token rotation is rare and not admin-actionable.
  return out.length > 0 ? out : undefined;
}

/** Take a snapshot of every counterpart in the actor's relations. The
 * fingerprint per id captures the page placement plus the state/message of
 * that page — the three signals the user explicitly wants treated as
 * "change worth showing". `page2.profiles[]` viewers carry no state/message
 * of their own, so they fingerprint as bare-page entries (presence/absence
 * is the change there). */
function snapshotPartners(
  rel: SnapshotRelations | undefined,
): Map<string, PartnerSlot> {
  const m = new Map<string, PartnerSlot>();
  const p1 = rel?.page1;
  const p1Id = p1?.profile?.user_id?.toLowerCase();
  if (p1Id) {
    m.set(p1Id, {
      page: 1,
      state: p1?.state ?? null,
      message: p1?.message ?? null,
    });
  }
  const p2 = rel?.page2;
  const p2Id = p2?.profile?.user_id?.toLowerCase();
  if (p2Id && !m.has(p2Id)) {
    m.set(p2Id, {
      page: 2,
      state: p2?.state ?? null,
      message: p2?.message ?? null,
    });
  }
  for (const v of p2?.profiles ?? []) {
    const id = v.user_id?.toLowerCase();
    if (id && !m.has(id)) {
      m.set(id, { page: 2, state: null, message: null });
    }
  }
  return m;
}

/** Diff two consecutive snapshots: a partner is "affected" by this row only
 * if they joined, left, switched page, changed state, or changed message
 * since the previous by-self row. Steady-state heartbeats (location/focus
 * with no side-effect) produce an empty diff and no chips. */
function diffPartners(
  prev: Map<string, PartnerSlot>,
  curr: Map<string, PartnerSlot>,
): AffectedUser[] {
  const out: AffectedUser[] = [];
  for (const [id, slot] of curr) {
    const before = prev.get(id);
    if (
      !before ||
      before.page !== slot.page ||
      before.state !== slot.state ||
      before.message !== slot.message
    ) {
      out.push({ id, page: slot.page });
    }
  }
  for (const [id] of prev) {
    if (!curr.has(id)) out.push({ id, page: null });
  }
  return out;
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
  // Walk chronologically (oldest first) so each row can diff against the
  // previous by-self snapshot. We reverse back to DESC at the end for
  // display.
  const chronological = rows
    .filter((row) => !isSystemKey(row.key))
    .slice()
    .reverse();

  let prevPartners = new Map<string, PartnerSlot>();
  let haveBaseline = false;
  const built: UnifiedEntry[] = chronological.map((row) => {
    const actorId = row.user_id ? row.user_id.toLowerCase() : null;
    const byOther = !!actorId && actorId !== selfLower;
    const body = readBody(row.log);

    let affected: AffectedUser[] = [];
    if (!byOther) {
      const rel = (row.user as { relations?: SnapshotRelations } | null | undefined)
        ?.relations;
      const curr = snapshotPartners(rel);
      // Skip the diff for the very first by-self row in the window — without
      // a "before" snapshot every existing counterpart would falsely read as
      // "newly added". The first row sets the baseline only.
      if (haveBaseline) affected = diffPartners(prevPartners, curr);
      prevPartners = curr;
      haveBaseline = true;

      // Explicit body target still surfaces even when the relations diff is
      // empty (e.g. `chat` to the active partner, `extend` re-arming the
      // timer with same state/message). Look up the target's current page
      // from the post-event snapshot — falls to `null` if the action also
      // removed them.
      const bodyTarget =
        typeof body?.user_id === "string" ? body.user_id.toLowerCase() : null;
      if (bodyTarget && !affected.some((a) => a.id === bodyTarget)) {
        const slot = curr.get(bodyTarget);
        affected.push({ id: bodyTarget, page: slot?.page ?? null });
      }
    }

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

  // Drop rows that have NOTHING to say — succeeded with no partners touched,
  // no location update, no profile/account changes, no actor-other note.
  // These are start/focus heartbeats that arrived from the mobile client and
  // are pure no-ops as far as the admin is concerned (the user "did nothing").
  // Reverse back to DESC (newest first) for display — the diff above needed
  // chronological order.
  return built
    .filter((e) => {
      if (!e.ok) return true; // failures are always interesting
      if (e.byOther) return true; // by-other rows are inherently "something happened to you"
      if (e.affected.length > 0) return true;
      if (e.location) return true;
      if (e.profileChanges && e.profileChanges.length > 0) return true;
      if (e.accountChanges && e.accountChanges.length > 0) return true;
      return false;
    })
    .reverse();
}
