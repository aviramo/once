import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireViewerScope } from "@/lib/admin-auth";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "../_components/AdminShell";
import { Section, EmptyState } from "../_components/ui";
import { SearchControls } from "../_components/SearchControls";
import type { UserRow } from "../_components/UserCard";
import { UsersRealtime } from "../_components/UsersRealtime";
import { parseUserLocation, haversineKm } from "@/lib/userLocation";

const P1_VALUES = ["free", "watching", "waiting", "chat", "locked"] as const;
const P2_VALUES = ["free", "pending", "chat", "locked"] as const;
const AVAIL_VALUES = [
  "available",
  "unavailable",
  "not_yet",
  "unknown",
] as const;
const TIER_VALUES = ["free", "pro"] as const;
const GENDER_VALUES = ["male", "female"] as const;
const OS_VALUES = ["ios", "android"] as const;
// Single multi-purpose "segment" param: recency windows + boolean-ish
// subsets that don't fit a simple state enum. Every dashboard tile that
// isn't a page1/page2/role/availability/tier/gender/os subset deep-links
// via ?seg=.
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
  "no_notif",
] as const;
// Sort modes for the users list. `recent` = the server's last_seen order;
// `distance` / `relevance` re-sort in JS relative to the admin's own location.
const SORT_VALUES = ["recent", "distance", "relevance"] as const;
const SELECT =
  "user_id, name, created_at, last_seen, data, relations, location";
// Sentinel role-filter value (can't collide with a uuid) = "users with no role".
const GROUP_NONE = "__none__";
// No row will ever carry this user_id — used to force an empty result when a
// computed-id filter (role) resolves to zero candidates.
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
 * Re-order the fetched page by distance / relevance to the admin's location.
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
  p1: string;
  p2: string;
  groupInIds: string[] | null;
  groupNotInIds: string[] | null;
  avail: string;
  tier: string;
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
  if (f.p1) q = q.eq("relations->page1->>state", f.p1);
  if (f.p2) q = q.eq("relations->page2->>state", f.p2);
  if (f.groupInIds)
    q = q.in("user_id", f.groupInIds.length ? f.groupInIds : [NO_MATCH_ID]);
  else if (f.groupNotInIds && f.groupNotInIds.length)
    q = q.not("user_id", "in", `(${f.groupNotInIds.join(",")})`);

  if (f.avail === "unknown")
    q = q.is("relations->availability->>state", null);
  else if (f.avail) q = q.eq("relations->availability->>state", f.avail);

  if (f.tier === "pro") q = q.eq("relations->credits->>tier", "pro");
  else if (f.tier === "free")
    q = q.or(
      "relations->credits->>tier.is.null,relations->credits->>tier.eq.free",
    );

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
  const p1 = pick(sp.p1, P1_VALUES);
  const p2 = pick(sp.p2, P2_VALUES);
  const avail = pick(sp.avail, AVAIL_VALUES);
  const tier = pick(sp.tier, TIER_VALUES);
  const gender = pick(sp.gender, GENDER_VALUES);
  const os = pick(sp.os, OS_VALUES);
  const seg = pick(sp.seg, SEG_VALUES);
  const sort = pick(sp.sort, SORT_VALUES) || "recent";
  const groupRaw = typeof sp.group === "string" ? sp.group : "";

  // Admin sees everyone. Group managers see only the union of members across
  // the groups they manage — every query below is intersected with that set
  // via `secondary.scopeUserIds` (built further down).
  const scope = await requireViewerScope();
  const user = scope.user;
  const isAdmin = scope.kind === "admin";

  const admin = createSupabaseAdmin();

  const [emailMap, meRes, { data: groupCatalogData }, { data: facetsData }] =
    await Promise.all([
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
      admin.rpc("admin_user_facet_counts"),
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
    groups_none?: number;
    p1?: Record<string, number>;
    p2?: Record<string, number>;
    groups?: Record<string, number>;
    avail?: Record<string, number>;
    tier?: Record<string, number>;
    gender?: Record<string, number>;
    os?: Record<string, number>;
    seg?: Record<string, number>;
  };
  const facets = (facetsData ?? {}) as Facets;

  // ?group= is "" (any) | a role uuid | GROUP_NONE (users with no role at all).
  const role =
    groupRaw === GROUP_NONE
      ? GROUP_NONE
      : groupCatalog.some((r) => r.id === groupRaw)
        ? groupRaw
        : "";
  // A specific role restricts to its members (.in); GROUP_NONE excludes anyone
  // who holds any role (.not in). null = no role filter.
  let groupInIds: string[] | null = null;
  let groupNotInIds: string[] | null = null;
  if (role === GROUP_NONE) {
    const { data: rl } = await admin.from("user_groups").select("user_id");
    groupNotInIds = [
      ...new Set(((rl ?? []) as { user_id: string }[]).map((x) => x.user_id)),
    ];
  } else if (role) {
    const { data: rl } = await admin
      .from("user_groups")
      .select("user_id")
      .eq("group_id", role);
    groupInIds = ((rl ?? []) as { user_id: string }[]).map((x) => x.user_id);
  }

  const secondary: Secondary = {
    p1,
    p2,
    groupInIds,
    groupNotInIds,
    avail,
    tier,
    gender,
    os,
    seg,
    scopeUserIds: scope.kind === "manager" ? scope.userIds : null,
  };

  let rows: UserRow[];
  if (q) {
    const ql = q.toLowerCase();
    const emailIds = [...emailMap.entries()]
      .filter(([, email]) => email.toLowerCase().includes(ql))
      .map(([id]) => id);

    const nameQ = applySecondary(
      admin.from("users").select(SELECT).ilike("name", `%${q}%`).limit(100),
      secondary,
    );
    const byEmail = emailIds.length
      ? await applySecondary(
          admin.from("users").select(SELECT).in("user_id", emailIds).limit(100),
          secondary,
        )
      : { data: [] as UserRow[] };
    const byName = await nameQ;

    const merged = new Map<string, UserRow>();
    for (const r of (byName.data ?? []) as UserRow[]) merged.set(r.user_id, r);
    for (const r of (byEmail.data ?? []) as UserRow[]) merged.set(r.user_id, r);
    rows = [...merged.values()].sort(lastSeenSort).slice(0, 100);
  } else {
    const { data } = await applySecondary(
      admin
        .from("users")
        .select(SELECT)
        .order("last_seen", { ascending: false, nullsFirst: false })
        .limit(100),
      secondary,
    );
    rows = (data ?? []) as UserRow[];
  }

  // At-a-glance role badges on each card. One extra round trip for the shown
  // page only; joined here (not in SELECT) since `users` realtime payloads
  // can't carry it — UsersRealtime preserves it across ticks instead.
  const userIds = rows.map((r) => r.user_id);
  const { data: roleLinks } = userIds.length
    ? await admin
        .from("user_groups")
        .select("user_id, groups(name)")
        .in("user_id", userIds)
    : { data: [] };
  type RoleLink = {
    user_id: string;
    groups: { name: string } | { name: string }[] | null;
  };
  const groupsByUser = new Map<string, { name: string }[]>();
  for (const link of (roleLinks ?? []) as RoleLink[]) {
    if (!link.groups) continue;
    const roleObj = Array.isArray(link.groups) ? link.groups[0] : link.groups;
    if (!roleObj) continue;
    const arr = groupsByUser.get(link.user_id) ?? [];
    arr.push(roleObj);
    groupsByUser.set(link.user_id, arr);
  }
  rows = rows.map((r) => ({ ...r, groups: groupsByUser.get(r.user_id) ?? [] }));

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
  const p1Options = P1_VALUES.map((v) => ({
    value: v,
    label: (d.page1States as Record<string, string>)[v],
    count: facets.p1?.[v] ?? 0,
  })).sort(byCountDesc);
  const p2Options = P2_VALUES.map((v) => ({
    value: v,
    label: (d.page2States as Record<string, string>)[v],
    count: facets.p2?.[v] ?? 0,
  })).sort(byCountDesc);
  const roleOptions = [
    ...groupCatalog.map((r) => ({
      value: r.id,
      label: r.name,
      count: facets.groups?.[r.id] ?? 0,
    })),
    { value: GROUP_NONE, label: d.filterGroupNone, count: facets.groups_none ?? 0 },
  ].sort(byCountDesc);
  // avail / tier / seg now carry global "(n)" facet counts too (every
  // dropdown + every option shows a count). Unlike p1/p2/groups these keep
  // their declared order — the seg recency buckets (online → 30d) read
  // better chronologically than count-sorted, and avail/tier are tiny.
  const availOptions = AVAIL_VALUES.map((v) => ({
    value: v,
    label: (d.availStates as Record<string, string>)[v],
    count: facets.avail?.[v] ?? 0,
  }));
  const tierOptions = TIER_VALUES.map((v) => ({
    value: v,
    label: (d.tierStates as Record<string, string>)[v],
    count: facets.tier?.[v] ?? 0,
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
        hint={d.resultsCount.replace("{count}", String(rows.length))}
      >
        <div className="space-y-6">
          <SearchControls
            searchPlaceholder={d.searchNameEmail}
            advancedLabel={d.advancedFilters}
            clearLabel={d.clearFilters}
            p1Label={d.filterP1}
            p2Label={d.filterP2}
            groupLabel={d.filterGroup}
            availLabel={d.filterAvail}
            tierLabel={d.filterTier}
            genderLabel={d.filterGender}
            osLabel={d.filterOs}
            segLabel={d.filterSeg}
            anyLabel={d.filterAny}
            anyCount={facets.total ?? 0}
            sortLabel={d.sortLabel}
            sortOptions={sortOptions}
            p1States={p1Options}
            p2States={p2Options}
            roleOptions={roleOptions}
            availOptions={availOptions}
            tierOptions={tierOptions}
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
