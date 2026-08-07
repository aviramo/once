import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireViewerScope } from "@/lib/admin-auth";
import { readAdminEnv, envIsTest } from "@/lib/adminEnv";
import {
  WATCH_FILTERS,
  matchesWatchFilter,
  watchBucket,
  type WatchFilter,
  type WatchState,
} from "@/lib/watchStatus";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "../_components/AdminShell";
import { Section, EmptyState } from "../_components/ui";
import { SearchControls } from "../_components/SearchControls";
import type { UserRow } from "../_components/UserCard";
import { UsersRealtime } from "../_components/UsersRealtime";
import { parseUserLocation, haversineKm } from "@/lib/userLocation";

const AVAIL_VALUES = ["available", "unavailable", "unknown"] as const;
const GENDER_VALUES = ["male", "female"] as const;
const OS_VALUES = ["ios", "android"] as const;
// Single multi-purpose "segment" param: recency windows + boolean-ish
// subsets that don't fit a simple state enum. Every dashboard tile that
// isn't a page1/page2/role/availability/gender/os subset deep-links
// via ?seg=. `extra` covers "users with extra-hearts > 0" (added when the
// tier model retired 2026-06-01 in favour of purchasable extra hearts).
const SEG_VALUES = [
  "online",
  "active_today",
  "active_7d",
  "active_30d",
  "new_today",
  "new_7d",
  "new_30d",
  "located",
  "broadcasting",
  "held",
  "extra",
  "no_notif",
  // `test` / `not_test` used to live here. The matching environment is a
  // PRIMARY selector in the header now — it bounds every query on every screen
  // — so as an option inside this dropdown it could only ever have equalled
  // the whole list or nothing.
] as const;
// Sort modes for the users list. `recent` = the server's last_seen order;
// `distance` / `relevance` re-sort in JS relative to the admin's own location.
// That re-sort is only honest because the WHOLE filtered set is fetched (see
// FETCH_PAGE): sorting a screenful by distance answers "the closest of the 100
// most recently seen", which is not the question the dropdown asks.
const SORT_VALUES = ["recent", "distance", "relevance"] as const;
// Rows per round trip when paging a result set. PostgREST caps a response at
// 1000 rows whatever `limit` says, so that is the page size.
const FETCH_PAGE = 1000;
// The one bound left on a list. The screen is no longer cut to a screenful —
// an operator must be able to reach every user in the environment — but the
// whole set is serialised into the RSC payload, so it is bounded rather than
// unbounded, and when the bound bites the count line SAYS so (`resultsCapped`).
// A silent cut is exactly what this replaced.
const MAX_ROWS = 5000;
// The list's order, stated once: it is the default sort AND what makes a paged
// read stable across round trips (an unordered range is not a page of anything).
const LAST_SEEN_DESC = { ascending: false, nullsFirst: false } as const;
// `relations` is still selected for the availability gate and the credits /
// push segments. What a person is DOING no longer comes from it: that is one
// status per user, read off `watch` via admin_watch_states.
const SELECT =
  "user_id, name, created_at, last_seen, data, relations, location, is_test";
// No row will ever carry this user_id — used to force an empty result when a
// computed-id filter resolves to zero candidates.
const NO_MATCH_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Auth lives in Supabase Auth, not the `users` table, so email search and the
 * per-card email both need the auth directory. We page through it once per
 * dashboard load (cap: 10k accounts — comfortably above the current base; a
 * larger directory would need a server-side email index instead).
 */
async function loadEmailMap(
  admin: SupabaseClient,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (u.email) map.set(u.id, u.email);
    }
    if (data.users.length < perPage) break;
  }
  return map;
}

function lastSeenSort(a: UserRow, b: UserRow): number {
  return (b.last_seen ?? "").localeCompare(a.last_seen ?? "");
}

/**
 * Every row a filtered query matches, paged to the ceiling. `build` is handed
 * the range because the filter chain is the caller's — this only owns how far
 * the reading goes. `truncated` is true when the ceiling stopped the read, i.e.
 * the one case where the list on screen is not the whole answer; nothing else
 * in the panel may cut a list without saying which.
 */
async function fetchAllRows(
  build: (from: number, to: number) => PromiseLike<{ data: unknown }>,
): Promise<{ rows: UserRow[]; truncated: boolean }> {
  const rows: UserRow[] = [];
  for (let from = 0; from < MAX_ROWS; from += FETCH_PAGE) {
    const to = Math.min(from + FETCH_PAGE, MAX_ROWS) - 1;
    const { data } = await build(from, to);
    const page = (data ?? []) as UserRow[];
    rows.push(...page);
    if (page.length < to - from + 1) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

/**
 * Re-order the whole result set by distance / relevance to the admin's location.
 * `recent` keeps the server's last_seen order. Relevance combines distance and
 * last-login only (lower score = more relevant) — the two signals others()
 * ranks on. Module-level so the impure Date.now() is not called in the page
 * component body.
 */
function sortByMode(
  rows: UserRow[],
  sort: string,
  adminLoc: ReturnType<typeof parseUserLocation>,
): UserRow[] {
  if (sort === "recent" || !adminLoc) return rows;
  const now = Date.now();
  const scoreOf = (r: UserRow): number => {
    const loc = parseUserLocation(r.location);
    const distKm = loc
      ? haversineKm(adminLoc, loc)
      : Number.POSITIVE_INFINITY;
    if (sort === "distance") return distKm;
    const proximity = Number.isFinite(distKm) ? Math.min(distKm / 100, 1) : 1;
    const ageH = r.last_seen
      ? (now - Date.parse(r.last_seen)) / 3_600_000
      : Number.POSITIVE_INFINITY;
    const staleness = Number.isFinite(ageH)
      ? Math.min(ageH / (30 * 24), 1)
      : 1;
    return proximity * 0.5 + staleness * 0.5;
  };
  return [...rows].sort((a, b) => scoreOf(a) - scoreOf(b));
}

/** ISO instant for 00:00 today in Asia/Jerusalem (the product home tz, the
 * same boundary admin_dashboard_metrics uses), DST-correct: the offset is
 * derived from the live tz formatting, not hard-coded. */
function startOfTodayJerusalemISO(): string {
  const tz = "Asia/Jerusalem";
  const now = new Date();
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  const localAsUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const offsetMs = localAsUTC - now.getTime();
  const startLocalAsUTC = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    0,
    0,
    0,
  );
  return new Date(startLocalAsUTC - offsetMs).toISOString();
}

const agoISO = (ms: number) => new Date(Date.now() - ms).toISOString();
const MIN = 60_000;
const DAY = 86_400_000;

/** The structural slice of a PostgREST builder the secondary filters use.
 * Self-referential so each call returns the same builder type — lets the
 * filter chain be applied ONCE to every query variant (base / name / email)
 * instead of being copy-pasted per branch. */
type Filterable<T> = {
  eq(column: string, value: string): T;
  neq(column: string, value: string): T;
  gte(column: string, value: string): T;
  is(column: string, value: null): T;
  or(filters: string): T;
  in(column: string, values: readonly string[]): T;
  not(column: string, operator: string, value: string | null): T;
};

type Secondary = {
  /** The matching environment every screen is bound to. */
  isTest: boolean;
  /** User ids whose watch status matches `?state=`, or null for no filter.
   * The status lives in `watch`, not on the `users` row, so it can only be
   * applied as a set — resolved once from admin_watch_states. */
  statusIds: string[] | null;
  avail: string;
  gender: string;
  os: string;
  seg: string;
  /** Group-manager scope: when set, every query is intersected with this
   * set of user_ids. Empty set => no rows. Admin viewers pass null. */
  scopeUserIds: string[] | null;
};

function applySecondary<T extends Filterable<T>>(q: T, f: Secondary): T {
  // Manager scope is the FIRST gate: it strictly bounds the visible user
  // set regardless of any other filter (admin pass-through is null). An
  // empty managed set returns zero rows by passing NO_MATCH_ID so a search
  // still returns "no users" rather than degenerating into "everyone".
  if (f.scopeUserIds)
    q = q.in(
      "user_id",
      f.scopeUserIds.length ? f.scopeUserIds : [NO_MATCH_ID],
    );
  // The environment is the first hard bound after the manager scope: the two
  // matching pools never meet, so a list mixing them describes nobody.
  q = q.eq("is_test", String(f.isTest));
  if (f.statusIds)
    q = q.in("user_id", f.statusIds.length ? f.statusIds : [NO_MATCH_ID]);

  if (f.avail === "unknown")
    q = q.is("relations->availability->>state", null);
  else if (f.avail) q = q.eq("relations->availability->>state", f.avail);

  if (f.gender === "male") q = q.eq("is_male", "true");
  else if (f.gender === "female") q = q.eq("is_male", "false");

  if (f.os) q = q.eq("data->>os", f.os);

  switch (f.seg) {
    case "online":
      q = q.gte("last_seen", agoISO(5 * MIN));
      break;
    case "active_today":
      q = q.gte("last_seen", startOfTodayJerusalemISO());
      break;
    case "active_7d":
      q = q.gte("last_seen", agoISO(7 * DAY));
      break;
    case "active_30d":
      q = q.gte("last_seen", agoISO(30 * DAY));
      break;
    case "new_today":
      q = q.gte("created_at", startOfTodayJerusalemISO());
      break;
    case "new_7d":
      q = q.gte("created_at", agoISO(7 * DAY));
      break;
    case "new_30d":
      q = q.gte("created_at", agoISO(30 * DAY));
      break;
    case "located":
      q = q.not("location", "is", null);
      break;
    case "broadcasting":
      // last_add_at is stored as an ISO-8601 UTC string; lexicographic >=
      // is a correct chronological compare for that fixed format.
      q = q.gte("relations->>last_add_at", agoISO(30 * MIN));
      break;
    case "held":
      q = q
        .not("relations->credits->>held", "is", null)
        .neq("relations->credits->>held", "0");
      break;
    case "extra":
      // Users holding purchased extra hearts (relations.credits.extra > 0).
      // Replaces the dropped `tier=pro` filter as the "paying / engaged"
      // proxy after the tier model retired 2026-06-01.
      q = q
        .not("relations->credits->>extra", "is", null)
        .neq("relations->credits->>extra", "0");
      break;
    case "no_notif":
      // Mirror of public.push_blocked(uid): a located user with the
      // notification gate signalling positively-known non-delivery.
      q = q
        .not("location", "is", null)
        .or(
          "relations->push->>perm.eq.denied,relations->push->>dead.eq.true",
        );
      break;
  }
  return q;
}

export default async function AdminUsers({
  params,
  searchParams,
}: PageProps<"/[lang]/users">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const d = dict.admin;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const pick = (raw: unknown, allowed: readonly string[]) =>
    typeof raw === "string" && allowed.includes(raw) ? raw : "";
  const state = pick(sp.state, WATCH_FILTERS) as WatchFilter | "";
  const avail = pick(sp.avail, AVAIL_VALUES);
  const gender = pick(sp.gender, GENDER_VALUES);
  const os = pick(sp.os, OS_VALUES);
  const seg = pick(sp.seg, SEG_VALUES);
  const sort = pick(sp.sort, SORT_VALUES) || "recent";

  // Admin sees everyone. Group managers see only the union of members across
  // the groups they manage — every query below is intersected with that set
  // via `secondary.scopeUserIds` (built further down).
  const scope = await requireViewerScope();
  const user = scope.user;
  const isAdmin = scope.kind === "admin";
  const env = await readAdminEnv();
  const isTest = envIsTest(env);

  const admin = createSupabaseAdmin();

  const [
    emailMap,
    meRes,
    { data: groupCatalogData },
    { data: facetsData },
    { data: watchData },
  ] = await Promise.all([
    loadEmailMap(admin),
    admin
      .from("users")
      .select("name, location")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("groups")
      .select("id, name")
      .order("created_at", { ascending: true }),
    admin.rpc("admin_user_facet_counts", { p_is_test: isTest }),
    admin.rpc("admin_watch_states", {
      p_is_test: isTest,
      p_user_ids: scope.kind === "manager" ? scope.userIds : null,
    }),
  ]);
  let groupCatalog = (groupCatalogData ?? []) as {
    id: string;
    name: string;
  }[];
  // Group managers only see the groups they manage — both as filter options
  // and as catalog input for the userIds intersection below.
  if (scope.kind === "manager") {
    const managed = new Set(scope.groupIds);
    groupCatalog = groupCatalog.filter((g) => managed.has(g.id));
  }
  type Facets = {
    total?: number;
    avail?: Record<string, number>;
    gender?: Record<string, number>;
    os?: Record<string, number>;
    seg?: Record<string, number>;
  };
  const facets = (facetsData ?? {}) as Facets;

  // ONE STATUS PER PERSON, and one call for the whole environment. The same
  // rows answer three questions the panel used to answer from three places:
  // what each card says, which users `?state=` keeps, and what each option in
  // that dropdown counts. Anything derived here instead of in SQL would be a
  // second copy of the rule in admin_watch_states.
  const watchStates = (watchData ?? []) as WatchState[];
  const watchById = new Map(watchStates.map((w) => [w.user_id, w]));
  const statusCounts = new Map<WatchFilter, number>();
  for (const w of watchStates) {
    const b = watchBucket(w);
    statusCounts.set(b, (statusCounts.get(b) ?? 0) + 1);
    // `invited_in` is a tag, not a bucket: it is true ALONGSIDE whatever the
    // person's own status is, so it is counted separately rather than instead.
    if (w.invited_by)
      statusCounts.set("invited_in", (statusCounts.get("invited_in") ?? 0) + 1);
  }
  const statusIds = state
    ? watchStates.filter((w) => matchesWatchFilter(w, state)).map((w) => w.user_id)
    : null;

  const secondary: Secondary = {
    isTest,
    statusIds,
    avail,
    gender,
    os,
    seg,
    scopeUserIds: scope.kind === "manager" ? scope.userIds : null,
  };

  let rows: UserRow[];
  let truncated: boolean;
  if (q) {
    const ql = q.toLowerCase();
    const emailIds = [...emailMap.entries()]
      .filter(([, email]) => email.toLowerCase().includes(ql))
      .map(([id]) => id);

    const byNameP = fetchAllRows((from, to) =>
      applySecondary(
        admin
          .from("users")
          .select(SELECT)
          .ilike("name", `%${q}%`)
          .order("last_seen", LAST_SEEN_DESC)
          .range(from, to),
        secondary,
      ),
    );
    const byEmail = emailIds.length
      ? await fetchAllRows((from, to) =>
          applySecondary(
            admin
              .from("users")
              .select(SELECT)
              .in("user_id", emailIds)
              .order("last_seen", LAST_SEEN_DESC)
              .range(from, to),
            secondary,
          ),
        )
      : { rows: [] as UserRow[], truncated: false };
    const byName = await byNameP;

    const merged = new Map<string, UserRow>();
    for (const r of byName.rows) merged.set(r.user_id, r);
    for (const r of byEmail.rows) merged.set(r.user_id, r);
    rows = [...merged.values()].sort(lastSeenSort);
    truncated = byName.truncated || byEmail.truncated;
  } else {
    const all = await fetchAllRows((from, to) =>
      applySecondary(
        admin
          .from("users")
          .select(SELECT)
          .order("last_seen", LAST_SEEN_DESC)
          .range(from, to),
        secondary,
      ),
    );
    rows = all.rows;
    truncated = all.truncated;
  }

  // The shown page's watch status is the only thing joined onto a row here.
  // The group chips this block also used to fetch (one extra `user_groups`
  // round trip per load, plus a preserve-across-realtime dance in
  // UsersRealtime) were removed with them.
  rows = rows.map((r) => ({ ...r, watch: watchById.get(r.user_id) }));

  // Distance / relevance sorting is relative to the admin's own location (the
  // person operating the panel); the fetched page is re-sorted in JS.
  const adminLoc = parseUserLocation(
    (meRes.data as { location?: unknown } | null)?.location,
  );
  rows = sortByMode(rows, sort, adminLoc);

  // Filter options carry the global "(n)" count and are ordered by it
  // descending (the "any" sentinel stays pinned first inside SearchControls).
  const byCountDesc = <T extends { count: number }>(a: T, b: T) =>
    b.count - a.count;
  const stateOptions = WATCH_FILTERS.map((v) => ({
    value: v,
    label: (d.statusStates as Record<string, string>)[v],
    count: statusCounts.get(v) ?? 0,
  })).sort(byCountDesc);
  // avail / seg now carry global "(n)" facet counts too (every
  // dropdown + every option shows a count). Unlike p1/p2/groups these keep
  // their declared order — the seg recency buckets (online → 30d) read
  // better chronologically than count-sorted, and avail is tiny.
  const availOptions = AVAIL_VALUES.map((v) => ({
    value: v,
    label: (d.availStates as Record<string, string>)[v],
    count: facets.avail?.[v] ?? 0,
  }));
  const genderOptions = GENDER_VALUES.map((v) => ({
    value: v,
    label: (d.genderStates as Record<string, string>)[v],
    count: facets.gender?.[v] ?? 0,
  }));
  const osOptions = OS_VALUES.map((v) => ({
    value: v,
    label: (d.osStates as Record<string, string>)[v],
    count: facets.os?.[v] ?? 0,
  }));
  const segOptions = SEG_VALUES.map((v) => ({
    value: v,
    label: (d.segStates as Record<string, string>)[v],
    count: facets.seg?.[v] ?? 0,
  }));
  const sortOptions = [
    { value: "recent", label: d.sortRecent },
    { value: "distance", label: d.sortDistance },
    { value: "relevance", label: d.sortRelevance },
  ];

  const meName = (meRes.data as { name?: string } | null)?.name;
  const userLabel = `${d.loggedInAs}: ${meName ?? user.email ?? ""}`;

  return (
    <AdminShell dict={d} active="users" userLabel={userLabel} backHref="/">
      <Section
        title={d.users}
        hint={
          d.resultsCount.replace("{count}", String(rows.length)) +
          (truncated ? ` ${d.resultsCapped}` : "")
        }
      >
        <div className="space-y-6">
          <SearchControls
            searchPlaceholder={d.searchNameEmail}
            advancedLabel={d.advancedFilters}
            clearLabel={d.clearFilters}
            stateLabel={d.filterStatus}
            availLabel={d.filterAvail}
            genderLabel={d.filterGender}
            osLabel={d.filterOs}
            segLabel={d.filterSeg}
            anyLabel={d.filterAny}
            anyCount={facets.total ?? 0}
            sortLabel={d.sortLabel}
            sortOptions={sortOptions}
            stateOptions={stateOptions}
            availOptions={availOptions}
            genderOptions={genderOptions}
            osOptions={osOptions}
            segOptions={segOptions}
          />
          {rows.length === 0 ? (
            <EmptyState>{d.noResults}</EmptyState>
          ) : (
            <UsersRealtime
              initial={rows.map((r) => ({
                row: r,
                email: emailMap.get(r.user_id) ?? null,
              }))}
              dict={d}
              locale={locale}
              adminLoc={adminLoc}
              groups={groupCatalog}
              isAdmin={isAdmin}
            />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
