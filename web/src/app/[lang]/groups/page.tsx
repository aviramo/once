import { requireViewerScope } from "@/lib/admin-auth";
import { readAdminEnv, envIsTest } from "@/lib/adminEnv";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "../_components/AdminShell";
import { Section, Card, EmptyState } from "../_components/ui";
import { RealtimeRefresh } from "../_components/RealtimeRefresh";
import { Disclosure } from "../_components/Disclosure";
import {
  GroupsCards,
  GroupAddForm,
  type GroupRow,
} from "./_components/GroupsCards";
import { createGroup } from "./actions";

type GroupQueryRow = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string | null;
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

  const env = await readAdminEnv();
  const admin = createSupabaseAdmin();
  // A circle carries its own `is_test`, stamped from its creator — it cannot be
  // derived from the owner (five legacy circles have none), which is why the
  // partition covers circles with a column of their own.
  let rolesQ = admin
    .from("groups")
    .select("id, name, invite_code, owner_id, user_groups(count)")
    .eq("is_test", envIsTest(env))
    .order("created_at", { ascending: true });
  // Circle managers only see circles they manage.
  if (scope.kind === "manager") {
    rolesQ = rolesQ.in(
      "id",
      scope.groupIds.length
        ? scope.groupIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  }
  const { data } = await rolesQ;
  const raw = (data ?? []) as GroupQueryRow[];

  // Two facts the table states that the old tile grid did not carry at all:
  // who owns each circle, and who else may approve joins for it. Both are
  // names, so both resolve through one `users` lookup over the union of ids.
  const groupIds = raw.map((g) => g.id);
  const { data: approverRows } = groupIds.length
    ? await admin
        .from("group_managers")
        .select("group_id, user_id")
        .in("group_id", groupIds)
    : { data: [] };
  const approvers = (approverRows ?? []) as {
    group_id: string;
    user_id: string;
  }[];

  const ownerByGroup = new Map(raw.map((g) => [g.id, g.owner_id]));
  const nameIds = [
    ...new Set([
      ...raw.map((g) => g.owner_id).filter((id): id is string => !!id),
      ...approvers.map((a) => a.user_id),
    ]),
  ];
  const { data: people } = nameIds.length
    ? await admin.from("users").select("user_id, name").in("user_id", nameIds)
    : { data: [] };
  const nameById = new Map(
    ((people ?? []) as { user_id: string; name: string | null }[]).map((p) => [
      p.user_id,
      p.name,
    ]),
  );

  const approversByGroup = new Map<string, string[]>();
  for (const a of approvers) {
    // The owner approves for their own circle by definition, so listing them
    // here would say the same thing twice on one row.
    if (a.user_id === ownerByGroup.get(a.group_id)) continue;
    const name = nameById.get(a.user_id);
    if (!name) continue;
    const arr = approversByGroup.get(a.group_id) ?? [];
    arr.push(name);
    approversByGroup.set(a.group_id, arr);
  }

  const groups: GroupRow[] = raw.map((row) => ({
    id: row.id,
    name: row.name,
    inviteCode: row.invite_code,
    ownerName: row.owner_id ? (nameById.get(row.owner_id) ?? null) : null,
    approvers: approversByGroup.get(row.id) ?? [],
    members: row.user_groups?.[0]?.count ?? 0,
  }));

  return (
    <AdminShell dict={dict.admin} active="groups">
      <RealtimeRefresh
        tables="groups,user_groups,group_managers"
        channel="admin-groups"
      />
      <Section title={r.title} count={groups.length} hint={r.subtitle}>
        <div className="space-y-6">
          {isAdmin ? (
            <Card>
              <Disclosure label={r.add} tone="button">
                <GroupAddForm
                  action={createGroup}
                  dict={{
                    namePlaceholder: r.namePlaceholder,
                    save: r.save,
                    duplicate: r.duplicate,
                  }}
                />
              </Disclosure>
            </Card>
          ) : null}

          {groups.length === 0 ? (
            <EmptyState>{r.none}</EmptyState>
          ) : (
            <GroupsCards
              groups={groups}
              dict={{
                searchPlaceholder: r.searchPlaceholder,
                owner: r.cols.owner,
                approvers: r.cols.approvers,
                members: r.cols.members,
                empty: r.cols.empty,
                noSearchResults: r.noSearchResults,
              }}
            />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
