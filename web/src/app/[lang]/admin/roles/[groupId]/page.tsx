import { notFound, redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "../../_components/AdminShell";
import { Section } from "../../_components/ui";
import { RealtimeRefresh } from "../../_components/RealtimeRefresh";
import { GroupMembers } from "./_components/GroupMembers";
import { GroupHeader } from "./_components/GroupHeader";
import { GroupDangerZone } from "./_components/GroupDangerZone";
import {
  setUserRoleAssignment,
  searchUsersForGroup,
  renameRole,
  setRoleEnabled,
  deleteRole,
} from "../actions";

// Typed manually rather than via PageProps<…>: the Next typed-routes registry
// only gains a new route after a dev/build codegen pass, so referencing it in
// tsc before that fails. The shapes match the App Router contract.
export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ lang: string; groupId: string }>;
}) {
  const { lang, groupId } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const r = dict.admin.roles;
  const d = r.detail;

  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  const admin = createSupabaseAdmin();
  const [{ data: group }, { data: memberRows }] = await Promise.all([
    admin
      .from("groups")
      .select("id, name, enabled")
      .eq("id", groupId)
      .maybeSingle(),
    admin
      .from("user_groups")
      .select("user_id, users(user_id, name, data)")
      .eq("group_id", groupId),
  ]);
  if (!group) notFound();
  const g = group as { id: string; name: string; enabled: boolean };

  type UserMini = {
    user_id: string;
    name: string | null;
    data: { images?: { normal?: string }[] } | null;
  };
  type Row = { user_id: string; users: UserMini | UserMini[] | null };
  const members = ((memberRows ?? []) as Row[])
    .map((row) => (Array.isArray(row.users) ? row.users[0] : row.users))
    .filter((u): u is UserMini => !!u)
    .map((u) => ({
      user_id: u.user_id,
      name: u.name,
      image: u.data?.images?.[0]?.normal ?? null,
    }));

  return (
    <AdminShell dict={dict.admin} active="roles" backHref="/admin/roles">
      <RealtimeRefresh
        tables="user_groups,groups"
        channel="admin-group-detail"
      />
      <GroupHeader
        groupId={g.id}
        initialName={g.name}
        enabled={g.enabled}
        members={members.length}
        dict={{
          members: r.members,
          statusActive: r.statusActive,
          statusDisabled: r.statusDisabled,
          enable: r.enable,
          disable: r.disable,
          rename: r.rename,
          save: r.save,
          cancel: r.cancel,
          duplicate: r.duplicate,
          fail: d.fail,
        }}
        renameAction={renameRole}
        setEnabledAction={setRoleEnabled}
      />

      <Section title={d.members} count={members.length}>
        <GroupMembers
          groupId={g.id}
          members={members}
          dict={{
            noMembers: d.noMembers,
            remove: d.remove,
            addTitle: d.addTitle,
            searchPlaceholder: d.searchPlaceholder,
            searching: d.searching,
            noResults: d.noResults,
            add: d.add,
          }}
          assignAction={setUserRoleAssignment}
          searchAction={searchUsersForGroup}
        />
      </Section>

      <Section title={d.dangerSection}>
        <GroupDangerZone
          groupId={g.id}
          groupName={g.name}
          members={members.length}
          dict={{
            deleteTitle: d.deleteTitle,
            deleteDesc: d.deleteDesc,
            deleteButton: r.delete,
            deleteBlocked: d.deleteBlocked,
            deleteConfirmTitle: d.deleteConfirmTitle,
            deleteConfirmBody: d.deleteConfirmBody,
            deleteBusy: d.deleteBusy,
            fail: d.fail,
            cancel: r.cancel,
          }}
          deleteAction={deleteRole}
        />
      </Section>
    </AdminShell>
  );
}
