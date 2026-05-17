import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell, Section, Card, EmptyState } from "../_components/ui";
import { Disclosure } from "../_components/Disclosure";
import { RolesManager, RoleAddForm, type RoleRow } from "./_components/RolesManager";
import { createRole, renameRole, setRoleEnabled, deleteRole } from "./actions";

type RoleQueryRow = {
  id: string;
  name: string;
  enabled: boolean;
  user_roles: { count: number }[];
};

export default async function RolesPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const r = dict.admin.roles;

  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("roles")
    .select("id, name, enabled, user_roles(count)")
    .order("created_at", { ascending: true });

  const roles: RoleRow[] = ((data ?? []) as RoleQueryRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    members: row.user_roles?.[0]?.count ?? 0,
  }));

  return (
    <AdminShell dict={dict.admin} active="roles">
      <Section title={r.title} count={roles.length} hint={r.subtitle}>
        <div className="space-y-6">
          <Card>
            <Disclosure label={r.add} tone="button">
              <RoleAddForm action={createRole} dict={r} />
            </Disclosure>
          </Card>

          {roles.length === 0 ? (
            <EmptyState>{r.none}</EmptyState>
          ) : (
            <RolesManager
              roles={roles}
              dict={r}
              renameAction={renameRole}
              setEnabledAction={setRoleEnabled}
              deleteAction={deleteRole}
            />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
