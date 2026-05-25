import { requireViewerScope } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "../_components/AdminShell";
import { Section, Card, EmptyState } from "../_components/ui";
import { RealtimeRefresh } from "../_components/RealtimeRefresh";
import { Disclosure } from "../_components/Disclosure";
import { RolesManager, RoleAddForm, type RoleRow } from "./_components/RolesManager";
import {
  createRole,
  setRoleEnabled,
  setGroupsEnabled,
  resetGroupMembers,
} from "./actions";

type RoleQueryRow = {
  id: string;
  name: string;
  enabled: boolean;
  user_groups: { count: number }[];
};

export default async function RolesPage({
  params,
  searchParams,
}: PageProps<"/[lang]/admin/roles">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const r = dict.admin.roles;
  const sp = await searchParams;
  // ?status= deep-link from the dashboard "disabled groups" tile → only the
  // disabled (or enabled) subset; the Groups nav tab returns to the full set.
  const status =
    sp.status === "enabled" || sp.status === "disabled" ? sp.status : "";

  const scope = await requireViewerScope();
  const isAdmin = scope.kind === "admin";

  const admin = createSupabaseAdmin();
  let rolesQ = admin
    .from("groups")
    .select("id, name, enabled, user_groups(count)")
    .order("created_at", { ascending: true });
  if (status) rolesQ = rolesQ.eq("enabled", status === "enabled");
  // Group managers only see groups they manage.
  if (scope.kind === "manager") {
    rolesQ = rolesQ.in(
      "id",
      scope.groupIds.length ? scope.groupIds : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  const { data } = await rolesQ;

  const roles: RoleRow[] = ((data ?? []) as RoleQueryRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    members: row.user_groups?.[0]?.count ?? 0,
  }));

  return (
    <AdminShell dict={dict.admin} active="roles">
      <RealtimeRefresh tables="groups,user_groups" channel="admin-roles" />
      <Section title={r.title} count={roles.length} hint={r.subtitle}>
        <div className="space-y-6">
          {isAdmin ? (
            <Card>
              <Disclosure label={r.add} tone="button">
                <RoleAddForm action={createRole} dict={r} />
              </Disclosure>
            </Card>
          ) : null}

          {roles.length === 0 ? (
            <EmptyState>{r.none}</EmptyState>
          ) : (
            <RolesManager
              roles={roles}
              dict={r}
              readOnly={!isAdmin}
              setEnabledAction={setRoleEnabled}
              setGroupsEnabledAction={setGroupsEnabled}
              resetGroupMembersAction={resetGroupMembers}
            />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
