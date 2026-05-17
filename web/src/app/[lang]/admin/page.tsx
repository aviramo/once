import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell, Section, EmptyState } from "./_components/ui";
import { SearchControls } from "./_components/SearchControls";
import type { UserRow } from "./_components/UserCard";
import { UsersRealtime } from "./_components/UsersRealtime";
import { ResetAllButton } from "./_components/ResetAllButton";
import { resetUsersByRoles } from "./actions";

const P1_VALUES = ["free", "watching", "waiting", "chat", "locked"] as const;
const P2_VALUES = ["free", "pending", "chat", "locked"] as const;
const SELECT = "user_id, name, created_at, last_seen, data, relations";
// Sentinel role-filter value (can't collide with a uuid) = "users with no role".
const ROLE_NONE = "__none__";

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

export default async function AdminDashboard({
  params,
  searchParams,
}: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const d = dict.admin;
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const p1Raw = typeof sp.p1 === "string" ? sp.p1 : "";
  const p2Raw = typeof sp.p2 === "string" ? sp.p2 : "";
  const p1 = (P1_VALUES as readonly string[]).includes(p1Raw) ? p1Raw : "";
  const p2 = (P2_VALUES as readonly string[]).includes(p2Raw) ? p2Raw : "";
  const roleRaw = typeof sp.role === "string" ? sp.role : "";

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const isAdmin =
    (user.app_metadata as { role?: string } | undefined)?.role === "admin";
  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_admin");
  }

  const admin = createSupabaseAdmin();

  const [emailMap, meRes, { data: roleCatalogData }, { data: facetsData }] =
    await Promise.all([
      loadEmailMap(admin),
      admin.from("users").select("name").eq("user_id", user.id).maybeSingle(),
      admin
        .from("roles")
        .select("id, name, enabled")
        .order("created_at", { ascending: true }),
      admin.rpc("admin_user_facet_counts"),
    ]);
  const roleCatalog = (roleCatalogData ?? []) as {
    id: string;
    name: string;
    enabled: boolean;
  }[];
  type Facets = {
    total?: number;
    roles_none?: number;
    p1?: Record<string, number>;
    p2?: Record<string, number>;
    roles?: Record<string, number>;
  };
  const facets = (facetsData ?? {}) as Facets;

  // ?role= is "" (any) | a role uuid | ROLE_NONE (users with no role at all).
  const role =
    roleRaw === ROLE_NONE
      ? ROLE_NONE
      : roleCatalog.some((r) => r.id === roleRaw)
        ? roleRaw
        : "";
  // A specific role restricts to its members (.in); ROLE_NONE excludes anyone
  // who holds any role (.not in). null = no role filter. An empty members
  // array for a specific role intentionally yields zero results; an empty
  // "has-any-role" set means nobody has roles, so no exclusion is applied.
  let roleInIds: string[] | null = null;
  let roleNotInIds: string[] | null = null;
  if (role === ROLE_NONE) {
    const { data: rl } = await admin.from("user_roles").select("user_id");
    roleNotInIds = [
      ...new Set(((rl ?? []) as { user_id: string }[]).map((x) => x.user_id)),
    ];
  } else if (role) {
    const { data: rl } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role_id", role);
    roleInIds = ((rl ?? []) as { user_id: string }[]).map((x) => x.user_id);
  }

  let rows: UserRow[];
  if (q) {
    const ql = q.toLowerCase();
    const emailIds = [...emailMap.entries()]
      .filter(([, email]) => email.toLowerCase().includes(ql))
      .map(([id]) => id);

    let nameQ = admin
      .from("users")
      .select(SELECT)
      .ilike("name", `%${q}%`)
      .limit(100);
    if (p1) nameQ = nameQ.eq("relations->page1->>state", p1);
    if (p2) nameQ = nameQ.eq("relations->page2->>state", p2);
    if (roleInIds) nameQ = nameQ.in("user_id", roleInIds);
    else if (roleNotInIds && roleNotInIds.length)
      nameQ = nameQ.not("user_id", "in", `(${roleNotInIds.join(",")})`);

    const byEmail = emailIds.length
      ? await (() => {
          let eq = admin
            .from("users")
            .select(SELECT)
            .in("user_id", emailIds)
            .limit(100);
          if (p1) eq = eq.eq("relations->page1->>state", p1);
          if (p2) eq = eq.eq("relations->page2->>state", p2);
          if (roleInIds) eq = eq.in("user_id", roleInIds);
          else if (roleNotInIds && roleNotInIds.length)
            eq = eq.not("user_id", "in", `(${roleNotInIds.join(",")})`);
          return eq;
        })()
      : { data: [] as UserRow[] };
    const byName = await nameQ;

    const merged = new Map<string, UserRow>();
    for (const r of (byName.data ?? []) as UserRow[]) merged.set(r.user_id, r);
    for (const r of (byEmail.data ?? []) as UserRow[]) merged.set(r.user_id, r);
    rows = [...merged.values()].sort(lastSeenSort).slice(0, 100);
  } else {
    let base = admin
      .from("users")
      .select(SELECT)
      .order("last_seen", { ascending: false, nullsFirst: false })
      .limit(100);
    if (p1) base = base.eq("relations->page1->>state", p1);
    if (p2) base = base.eq("relations->page2->>state", p2);
    if (roleInIds) base = base.in("user_id", roleInIds);
    else if (roleNotInIds && roleNotInIds.length)
      base = base.not("user_id", "in", `(${roleNotInIds.join(",")})`);
    const { data } = await base;
    rows = (data ?? []) as UserRow[];
  }

  // At-a-glance role badges on each card. One extra round trip for the shown
  // page only; joined here (not in SELECT) since `users` realtime payloads
  // can't carry it — UsersRealtime preserves it across ticks instead.
  const userIds = rows.map((r) => r.user_id);
  const { data: roleLinks } = userIds.length
    ? await admin
        .from("user_roles")
        .select("user_id, roles(name, enabled)")
        .in("user_id", userIds)
    : { data: [] };
  type RoleLink = {
    user_id: string;
    roles: { name: string; enabled: boolean } | { name: string; enabled: boolean }[] | null;
  };
  const rolesByUser = new Map<string, { name: string; enabled: boolean }[]>();
  for (const link of (roleLinks ?? []) as RoleLink[]) {
    if (!link.roles) continue;
    const roleObj = Array.isArray(link.roles) ? link.roles[0] : link.roles;
    if (!roleObj) continue;
    const arr = rolesByUser.get(link.user_id) ?? [];
    arr.push(roleObj);
    rolesByUser.set(link.user_id, arr);
  }
  rows = rows.map((r) => ({ ...r, roles: rolesByUser.get(r.user_id) ?? [] }));

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
    ...roleCatalog.map((r) => ({
      value: r.id,
      label: r.name,
      count: facets.roles?.[r.id] ?? 0,
    })),
    { value: ROLE_NONE, label: d.filterRoleNone, count: facets.roles_none ?? 0 },
  ].sort(byCountDesc);

  const meName = (meRes.data as { name?: string } | null)?.name;
  const userLabel = `${d.loggedInAs}: ${meName ?? user.email ?? ""}`;

  return (
    <AdminShell dict={d} active="users" userLabel={userLabel}>
      <Section
        title={d.users}
        hint={d.resultsCount.replace("{count}", String(rows.length))}
        action={
          <ResetAllButton
            action={resetUsersByRoles}
            roles={roleCatalog}
            dict={{
              label: d.resetAll,
              confirm: d.resetAllConfirm,
              busy: d.resetAllBusy,
              done: d.resetAllDone,
              fail: d.resetAllFail,
              title: d.resetAllTitle,
              hint: d.resetAllHint,
              selectAll: d.resetSelectAll,
              deselectAll: d.resetDeselectAll,
              noRoles: d.resetNoRoles,
              noneSelected: d.resetNoneSelected,
              apply: d.resetApply,
              cancel: d.resetCancel,
              disabledTag: d.roles.statusDisabled,
            }}
          />
        }
      >
        <div className="space-y-6">
          <SearchControls
            searchPlaceholder={d.searchNameEmail}
            advancedLabel={d.advancedFilters}
            clearLabel={d.clearFilters}
            p1Label={d.filterP1}
            p2Label={d.filterP2}
            roleLabel={d.filterRole}
            anyLabel={d.filterAny}
            anyCount={facets.total ?? 0}
            p1States={p1Options}
            p2States={p2Options}
            roleOptions={roleOptions}
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
            />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
