import { notFound } from "next/navigation";
import { requireViewerScope } from "@/lib/admin-auth";
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
  deleteRole,
  promoteGroupManager,
  demoteGroupManager,
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

  // Admin + group-managers of THIS group can see the detail. A manager
  // viewing a group they don't manage gets 404.
  const scope = await requireViewerScope();
  const isAdmin = scope.kind === "admin";
  const canPromote =
    isAdmin || (scope.kind === "manager" && scope.groupIds.includes(groupId));
  if (!canPromote) notFound();

  const admin = createSupabaseAdmin();
  const [
    { data: group },
    { data: memberRows },
    { data: managerRows },
  ] = await Promise.all([
    admin
      .from("groups")
      .select("id, name")
      .eq("id", groupId)
      .maybeSingle(),
    admin
      .from("user_groups")
      .select("user_id, users(user_id, name, data)")
      .eq("group_id", groupId),
    admin
      .from("group_managers")
      .select("user_id, granted_at")
      .eq("group_id", groupId),
  ]);
  if (!group) notFound();
  const g = group as { id: string; name: string };

  type UserMini = {
    user_id: string;
    name: string | null;
    data: { images?: { normal?: string }[] } | null;
  };
  type Row = { user_id: string; users: UserMini | UserMini[] | null };

  // Manager-since map: keyed by user_id, value is the ISO grant timestamp.
  const managerSinceById = new Map<string, string>(
    ((managerRows ?? []) as { user_id: string; granted_at: string }[]).map(
      (m) => [m.user_id, m.granted_at],
    ),
  );

  const members = ((memberRows ?? []) as Row[])
    .map((row) => (Array.isArray(row.users) ? row.users[0] : row.users))
    .filter((u): u is UserMini => !!u)
    .map((u) => ({
      user_id: u.user_id,
      name: u.name,
      image: u.data?.images?.[0]?.normal ?? null,
      managerSince: managerSinceById.get(u.user_id) ?? null,
    }));

  // Sort: managers first by management seniority (oldest grant first), then
  // non-managers by name ascending. Per user 2026-05-25 — managers lead the
  // list, ordered by how long they have been managers.
  members.sort((a, b) => {
    if (a.managerSince && !b.managerSince) return -1;
    if (!a.managerSince && b.managerSince) return 1;
    if (a.managerSince && b.managerSince)
      return a.managerSince.localeCompare(b.managerSince);
    return (a.name ?? "").localeCompare(b.name ?? "");
  });

  const dangerDict = {
    deleteTitle: d.deleteTitle,
    deleteDesc: d.deleteDesc,
    deleteButton: r.delete,
    deleteConfirmTitle: d.deleteConfirmTitle,
    deleteConfirmBody: d.deleteConfirmBody,
    deleteBusy: d.deleteBusy,
    fail: d.fail,
    cancel: r.cancel,
  };

  return (
    <AdminShell dict={dict.admin} active="roles" backHref="/admin/roles">
      <RealtimeRefresh
        tables="user_groups,groups,group_managers"
        channel="admin-group-detail"
      />
      <GroupHeader
        groupId={g.id}
        initialName={g.name}
        members={members.length}
        readOnly={!isAdmin}
        dict={{
          members: r.members,
          rename: r.rename,
          save: r.save,
          cancel: r.cancel,
          duplicate: r.duplicate,
          fail: d.fail,
        }}
        renameAction={renameRole}
        extraActions={
          isAdmin ? (
            <GroupDangerZone
              groupId={g.id}
              groupName={g.name}
              members={members.length}
              dict={dangerDict}
              deleteAction={deleteRole}
              compact
            />
          ) : null
        }
      />

      <Section title={d.members} count={members.length}>
        <GroupMembers
          groupId={g.id}
          members={members}
          canMutate={isAdmin}
          canPromote={canPromote}
          canDemote={isAdmin}
          dict={{
            noMembers: d.noMembers,
            remove: d.remove,
            addTitle: d.addTitle,
            searchPlaceholder: d.searchPlaceholder,
            searching: d.searching,
            noResults: d.noResults,
            add: d.add,
            managerBadge: d.managerBadge,
            promote: d.promote,
            demote: d.demote,
          }}
          assignAction={setUserRoleAssignment}
          searchAction={searchUsersForGroup}
          promoteAction={promoteGroupManager}
          demoteAction={demoteGroupManager}
        />
      </Section>
    </AdminShell>
  );
}
