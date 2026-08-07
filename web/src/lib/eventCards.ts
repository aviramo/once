import {
  eventLabel,
  eventLabelByOther,
  statusResult,
  type AdminDict,
} from "@/lib/humanize";
import type {
  AffectedUser,
  DataChange,
  LocationDetail,
  ProfileChange,
  UnifiedEntry,
} from "@/app/[lang]/users/[userId]/_components/UnifiedActivity";

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

/**
 * SOMEBODY ELSE'S ACTION BELONGS ON THIS PAGE ONLY IF IT WAS DIRECTED AT THIS
 * PERSON (user directive 2026-08-02).
 *
 * `admin_log_for_user` returns rows where this user's id appears ANYWHERE in
 * the payload — and the payload carries the actor's whole post-event snapshot,
 * so as long as A is sitting on B's board, every `start` / `location` /
 * `focus` heartbeat A makes lands on B's page. Live, one user's feed was
 * ninety rows and not one of them was something anybody had done TO her: true
 * rows, correctly matched, all of them somebody else's own business.
 *
 * The test is not "does this row mention them" but "was this action aimed at
 * them", and only these keys are. A heartbeat, a settings edit, a profile
 * change, a skip of somebody ELSE — all of those belong on the actor's own
 * page, which is one click away through the "initiated by" chip.
 */
/**
 * THE LOG HAS TWO KINDS OF ROW, AND ONLY ONE OF THEM IS ABOUT A PERSON (user
 * directive 2026-08-02).
 *
 * (1) an action that involves the other user — an invitation, a decline, an
 *     approval — or one the other user performed. Those name somebody, and the
 *     row carries their FACE in its strip.
 * (2) everything else: a heartbeat, a location, a settings or profile edit.
 *     Those get no portrait, even when the snapshot diff happens to hang a
 *     counterpart chip on them (a `location` row can name whoever moved on the
 *     actor's board at that instant, which is not what the row is about).
 *
 * This set is what separates them, and it does double duty: it is also the
 * test for whether SOMEBODY ELSE's row belongs on this page at all. Both
 * questions are "is this action aimed at a person", asked once.
 */
const PERSON_DIRECTED = new Set<string>([
  // Watching is kind (1) too (user directive 2026-08-02): being handed
  // somebody's card, and dropping it, are the two ends of a relation between
  // two people even though neither names a person in the request — the server
  // picks the counterpart, and the pair is what changed.
  "find", // was given somebody to watch
  "ignore", // skipped them, which ends the watch
  "invite", // sent them an invitation
  "approve", // accepted theirs
  "decline", // refused theirs
  "cancel", // took back the invitation to them
  "extend", // gave their invitation more time
  "leave", // ended the chat with them
  "remove", // dropped them as a viewer
  "block", // blocked them
  "report", // reported them
  "chat", // messaged them
]);

/**
 * THE BOARD THE ROW LEFT BEHIND — the last `page1` any of its RPC steps
 * reported. `with` is whoever is standing on it and `state` is whether the
 * board is actually HOLDING them; both are needed, because the field survives
 * the person (see `targetsOf`).
 */
type BoardAfter = { state: string | null; who: string | null };

function page1After(rawLog: unknown): BoardAfter | null {
  if (!Array.isArray(rawLog)) return null;
  let out: BoardAfter | null = null;
  for (const step of rawLog) {
    const task = (step as { task?: unknown })?.task;
    if (typeof task !== "string" || !task.startsWith("rpc:")) continue;
    const p1 = ((step as { data?: unknown })?.data as
      | { page1?: { with?: unknown; state?: unknown } | null }
      | undefined)?.page1;
    if (!p1 || typeof p1 !== "object") continue;
    out = {
      state: typeof p1.state === "string" ? p1.state : null,
      who: typeof p1.with === "string" ? p1.with.toLowerCase() : null,
    };
  }
  return out;
}

/** page1 states in which the board is genuinely HOLDING the person it names.
 * `locked` is the trap: it is a shut board that still carries the id of
 * whoever was last on it, so a `find` that came back empty reads exactly like
 * a `find` that handed somebody over. */
const PAGE1_LIVE = new Set<string>(["watching", "waiting", "chat"]);

/**
 * Keys for which the page1 OCCUPANT is the person the action was about.
 *
 * `page1.with` is not "the target" — it is "who is on the actor's board when
 * the RPC returned", and only these actions put the target there or act on
 * whoever already is: `find` is handed them, `invite` / `extend` are aimed at
 * the occupant, `chat` is a message to them, `approve` turns the board into
 * the chat with them.
 *
 * Every OTHER action empties the board or leaves it untouched, and reading
 * `with` there names an innocent third party (measured 2026-08-07): an
 * `ignore` re-seeds page1, so it named the person handed over NEXT and said
 * he had been skipped; a `decline` answers an invitation on page2 and never
 * touches page1, so it landed on whoever the decliner happened to be watching.
 * For those, the target is what the server PUSHED, and nothing else.
 */
const PAGE1_OCCUPANT_IS_TARGET = new Set<string>([
  "find",
  "invite",
  "extend",
  "chat",
  "approve",
]);

/**
 * WHO AN ACTION WAS AIMED AT, read off the RPC's own result.
 *
 * The request body does not carry it — the server picks the counterpart from
 * the actor's board — but the result does, in two places: everyone it pushed
 * (`data.notify[].user_id`), which is always the action's own doing, and the
 * board it landed on (`data.page1.with`), which is the target only under the
 * two conditions above. Both are taken, because `approve` notifies the new
 * partner AND whoever was cancelled by the match, and either of them is a
 * person this action happened to.
 *
 * This is what the action's NAME cannot tell you, and the difference is not
 * academic: live, one user's page carried four of another user's approvals and
 * only ONE of them was hers — the other three were him approving other people,
 * on her page because she sat in his snapshot. Same for his invitations: three
 * in the window, none to her, so "received an invitation" was nowhere to be
 * seen while three rows said he had invited someone.
 */
function targetsOf(rawLog: unknown, key: string): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(rawLog)) return out;
  for (const step of rawLog) {
    const task = (step as { task?: unknown })?.task;
    if (typeof task !== "string" || !task.startsWith("rpc:")) continue;
    const data = (step as { data?: unknown })?.data as
      | { notify?: unknown[] }
      | undefined;
    if (!data || typeof data !== "object") continue;
    for (const n of Array.isArray(data.notify) ? data.notify : []) {
      const to = (n as { user_id?: unknown })?.user_id;
      if (typeof to === "string") out.add(to.toLowerCase());
    }
  }
  if (PAGE1_OCCUPANT_IS_TARGET.has(key)) {
    const board = page1After(rawLog);
    if (board?.who && board.state && PAGE1_LIVE.has(board.state))
      out.add(board.who);
  }
  return out;
}

/**
 * A `find` THAT CAME BACK WITH NOBODY IS NOT A WATCH (user report 2026-08-07).
 *
 * `app_find` answers a dry pool by returning the board as it stands —
 * `page1: {with: <the last occupant>, state: 'locked'}` — so the row looked
 * identical to a successful one and the panel printed "started watching him"
 * on the page of a person the actor had just been REFUSED by. The state is
 * what tells the two apart, and it also gives the row its own sentence: the
 * news is that the search found nobody, which is worth a line of its own on
 * the actor's page (18 such finds in three days, every one of them empty).
 */
function foundNobody(key: string, rawLog: unknown): boolean {
  if (key !== "find") return false;
  const board = page1After(rawLog);
  if (!board) return false;
  return !(board.state && PAGE1_LIVE.has(board.state));
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
    // For somebody else's row: did this action actually name THIS person?
    const aimedHere = byOther && targetsOf(row.log, row.key).has(selfLower);
    // A search that was handed nobody: its own sentence, and never a person's.
    const empty = foundNobody(row.key, row.log);

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
      // Their action, said from this person's side once it is known to be
      // about them.
      action: empty
        ? eventLabel(dict, "find_empty")
        : aimedHere
          ? eventLabelByOther(dict, row.key)
          : eventLabel(dict, row.key),
      rawKey: row.key,
      ok,
      statusLabel: res.label,
      actorId,
      byOther,
      // Kind (1): the row is about a person, so its chips carry a face. An
      // empty search is about nobody, whoever ran it.
      involvesPartner: !empty && (PERSON_DIRECTED.has(row.key) || byOther),
      aimedHere,
      foundNobody: empty,
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
  const display = built
    .filter((e) => {
      // Somebody else's row survives only when the action was aimed at THIS
      // person — the name of the action is not enough, because "he invited
      // somebody" and "he invited her" are the same key. A failed attempt
      // still counts: it is something they tried to do to them.
      if (e.byOther) return e.aimedHere && PERSON_DIRECTED.has(e.rawKey);
      if (!e.ok) return true; // this user's own failures are always interesting
      // A search that found nobody changes nothing, and that IS what it says.
      if (e.foundNobody) return true;
      if (e.affected.length > 0) return true;
      if (e.location) return true;
      if (e.profileChanges && e.profileChanges.length > 0) return true;
      if (e.accountChanges && e.accountChanges.length > 0) return true;
      return false;
    })
    .reverse();

  return collapseRuns(display);
}

/**
 * Collapse a run of consecutive identical events into one card carrying a
 * `count` badge. Two adjacent rows merge when they are the SAME action
 * (`rawKey`), same success status, from the SAME actor (`actorId` — so
 * "location by Ayala" never merges with "location by Dan", and a by-other run
 * stays separate from the viewed user's own run), and their counterpart sets
 * are COMPATIBLE: either identical, or one of them empty.
 *
 * That last clause is the whole change (user, 2026-08-02). It used to require
 * BOTH to be empty, which left two `location` heartbeats a second apart
 * sitting as two rows because the snapshot diff happened to hang a chip on one
 * of them and not the other — the same action, at the same moment, drawn
 * twice. Merging them unions the chips, so nothing is hidden: the surviving
 * card names every counterpart either row named. What still never merges is
 * two rows naming DIFFERENT people (two invitations to two users), which is
 * the case the old rule was really protecting. This covers both the viewed user's own heartbeat
 * families (location / start / focus / my_groups / profile / preference edits)
 * AND the by-other heartbeats that surface in the merged feed because this
 * user sits in the actor's snapshot (Ayala opened the app / moved while
 * watching Yonatan). Anything that touched a counterpart (find / invite /
 * approve / a page-tagged partner) carries a chip, fails the `affected` guard,
 * and stays an individual card — collapsing it would hide which person each
 * row acted on. By-other rows always have empty `affected` (the builder skips
 * the partner diff for them), so they group purely by actor + action.
 *
 * The list arrives newest-first (DESC). The kept representative is the NEWEST
 * row of the run (its time + details are shown); `untilAt` records the oldest
 * row's time so the tooltip can show the span.
 */
/** Two rows may collapse when neither contradicts the other about WHO was
 * touched: identical sets, or one side saying nothing. */
function sameCounterparts(a: AffectedUser[], b: AffectedUser[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  if (a.length !== b.length) return false;
  const ids = new Set(a.map((x) => x.id));
  return b.every((x) => ids.has(x.id));
}

function collapseRuns(list: UnifiedEntry[]): UnifiedEntry[] {
  const out: UnifiedEntry[] = [];
  for (const e of list) {
    const last = out[out.length - 1];
    const mergeable =
      !!last &&
      // A run only ever folds HEARTBEATS. Two approvals, two invitations, two
      // skips are two things that happened to two people minutes apart, and
      // a `×2` badge over them hides one of the few rows on this page worth
      // reading (live: two of one user's approvals collapsed into one row,
      // and neither of them was even about the person whose page it was).
      !last.involvesPartner &&
      !e.involvesPartner &&
      last.rawKey === e.rawKey &&
      last.ok === e.ok &&
      last.byOther === e.byOther &&
      last.actorId === e.actorId &&
      sameCounterparts(last.affected, e.affected);
    if (mergeable) {
      last.count = (last.count ?? 1) + 1;
      last.untilAt = e.at; // e is older (DESC), extends the run backward
      // Union, so a merged card still names everyone either row named. The
      // kept card is the NEWEST, so its own page tag for a shared id wins.
      for (const a of e.affected) {
        if (!last.affected.some((x) => x.id === a.id)) last.affected.push(a);
      }
      continue;
    }
    out.push({ ...e, count: 1 });
  }
  return out;
}
