import { requireViewerScope } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "../_components/AdminShell";
import { Section, Card, EmptyState } from "../_components/ui";
import { RealtimeRefresh } from "../_components/RealtimeRefresh";
import { Disclosure } from "../_components/Disclosure";
import { GroupsManager, GroupAddForm, type GroupRow } from "./_components/GroupsManager";
import { createGroup, resetGroupMembers } from "./actions";

type GroupQueryRow = {
  id: string;
  name: string;
  user_groups: { count: number }[];
};

export default async function RolesPage({
  params,
}: PageProps<"/[lang]/groups">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const r = dict.admin.groups;

  const scope = await requireViewerScope();
  const isAdmin = scope.kind === "admin";

  const admin = createSupabaseAdmin();
  let rolesQ = admin
    .from("groups")
    .select("id, name, user_groups(count)")
    .order("created_at", { ascending: true });
  // Group managers only see groups they manage.
  if (scope.kind === "manager") {
    rolesQ = rolesQ.in(
      "id",
      scope.groupIds.length ? scope.groupIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  const { data } = await rolesQ;

  const groups: GroupRow[] = ((data ?? []) as GroupQueryRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    members: row.user_groups?.[0]?.count ?? 0,
  }));

  // Virtual "ללא קבוצה" tile (admin-only) — surfaces the count of users with
  // zero group memberships and links to the existing users-list filter
  // `?group=__none__`. Computed via `admin_user_facet_counts.groups_none` so
  // the page reuses the single facet RPC instead of duplicating the COUNT
  // query. Managers don't see this tile (they only see their managed groups
  // and have no "uncategorised" view to drill into).
  let noGroupCount: number | undefined;
  if (isAdmin) {
    const { data: facets } = await admin.rpc("admin_user_facet_counts");
    noGroupCount = Number(
      (facets as { groups_none?: number | string } | null)?.groups_none ?? 0,
    );
  }

  return (
    <AdminShell dict={dict.admin} active="groups">
      <RealtimeRefresh tables="groups,user_groups" channel="admin-groups" />
      <Section title={r.title} count={groups.length} hint={r.subtitle}>
        <div className="space-y-6">
          {isAdmin ? (
            <Card>
              <Disclosure label={r.add} tone="button">
                <GroupAddForm action={createGroup} dict={r} />
              </Disclosure>
            </Card>
          ) : null}

          {groups.length === 0 && noGroupCount === undefined ? (
            <EmptyState>{r.none}</EmptyState>
          ) : (
            <GroupsManager
              groups={groups}
              dict={r}
              readOnly={!isAdmin}
              resetGroupMembersAction={resetGroupMembers}
              noGroup={
                noGroupCount !== undefined
                  ? {
                      count: noGroupCount,
                      label: dict.admin.filterGroupNone,
                      href: "/users?group=__none__",
                    }
                  : undefined
              }
            />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
