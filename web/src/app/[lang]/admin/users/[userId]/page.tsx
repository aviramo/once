import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { relativeTime, dateTime } from "@/lib/relativeTime";
import { userImageUrl } from "@/lib/userImage";
import { fetchPartnerSummaries } from "@/lib/interactions";
import {
  page1Narrative,
  page2Narrative,
  eventLabel,
  restrictionLabel,
  statusResult,
} from "@/lib/humanize";
import {
  AdminShell,
  Section,
  Card,
  Avatar,
  StatusBadge,
  EmptyState,
  KeyValue,
} from "../../_components/ui";
import { Disclosure, RevealList } from "../../_components/Disclosure";
import { UserRolesEditor, type EditorRole } from "./_components/UserGroupsEditor";
import { setUserRoleAssignment } from "../../roles/actions";

type Image = { normal?: string; hash?: string };

type UserRecord = {
  user_id: string;
  name: string | null;
  is_male: boolean | null;
  birth_date: string | null;
  created_at: string;
  last_seen: string | null;
  data: {
    images?: Image[];
    bio?: string;
    location_label?: string | null;
  } | null;
  relations: {
    page1?: {
      state?: string;
      message?: string;
      profile?: { user_id?: string; name?: string };
    };
    page2?: {
      state?: string;
      message?: string;
      profile?: { user_id?: string; name?: string };
      profiles?: Array<{ user_id?: string; name?: string }>;
    };
  } | null;
};

type PartnerMini = {
  user_id: string;
  name: string | null;
  data: { images?: Image[] } | null;
};

type LogRow = {
  id: string;
  created_at: string;
  key: string;
  status: number;
  run_ms: number;
};

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  const ageDate = new Date(Date.now() - dob.getTime());
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

export default async function UserDetailPage({
  params,
}: PageProps<"/[lang]/admin/users/[userId]">) {
  const { lang, userId } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const a = dict.admin;
  const d = a.userDetail;

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
  const [
    { data: target },
    { data: authUser },
    { data: logRows },
    partners,
    { data: allRoles },
    { data: myRoleRows },
  ] = await Promise.all([
    admin
      .from("users")
      .select(
        "user_id, name, is_male, birth_date, created_at, last_seen, data, relations",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
    admin
      .from("log")
      .select("id, created_at, key, status, run_ms")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    fetchPartnerSummaries(admin, userId),
    admin
      .from("groups")
      .select("id, name, enabled")
      .order("created_at", { ascending: true }),
    admin.from("user_groups").select("group_id").eq("user_id", userId),
  ]);

  const roleCatalog = (allRoles ?? []) as EditorRole[];
  const assignedRoleIds = ((myRoleRows ?? []) as { group_id: string }[]).map(
    (r) => r.group_id,
  );

  if (!target) notFound();
  const u = target as UserRecord;

  const partnerIds = partners.map((p) => p.otherId);
  const { data: partnerProfiles } = partnerIds.length
    ? await admin
        .from("users")
        .select("user_id, name, data")
        .in("user_id", partnerIds)
    : { data: [] };
  const partnerMap = new Map(
    ((partnerProfiles ?? []) as PartnerMini[]).map((p) => [p.user_id, p]),
  );

  const photo = userImageUrl(u.user_id, u.data?.images?.[0]?.normal);
  const age = calcAge(u.birth_date);
  const email = authUser?.user?.email ?? null;
  const n1 = page1Narrative(a, u.relations);
  const n2 = page2Narrative(a, u.relations);
  const gender =
    u.is_male === true ? d.male : u.is_male === false ? d.female : "—";

  return (
    <AdminShell dict={a} active="users" backHref="/admin/users">
      {/* Identity — one compact rectangle: photo, name + email on one row */}
      <Card className="flex items-center gap-4 p-4">
        <Avatar src={photo} name={u.name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h1 className="text-lg font-bold leading-tight">
              {u.name ?? "—"}
            </h1>
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {email ?? a.noEmail}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={n1.tone}>{n1.text}</StatusBadge>
            <StatusBadge tone={n2.tone}>{n2.text}</StatusBadge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {d.joinedFull}: {relativeTime(u.created_at, locale)}
            {" · "}
            {d.lastSeenFull}: {relativeTime(u.last_seen, locale)}
          </p>
        </div>
      </Card>

      {/* Profile — only what matters, the rest behind one toggle */}
      <Section title={d.profile}>
        <Card>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {age !== null ? (
              <KeyValue label={d.age} value={String(age)} />
            ) : null}
            <KeyValue label={d.gender} value={gender} />
            {u.data?.location_label ? (
              <KeyValue label={d.location} value={u.data.location_label} />
            ) : null}
          </dl>
          {u.data?.bio ? (
            <div className="mt-5">
              <p className="text-xs font-medium text-muted-foreground">
                {d.bio}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{u.data.bio}</p>
            </div>
          ) : null}
          <div className="mt-5 border-t border-border pt-4">
            <Disclosure label={a.moreInfo}>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <KeyValue label={d.email} value={email ?? "—"} />
                <KeyValue label={d.userId} value={u.user_id} mono />
                <KeyValue
                  label={d.joinedFull}
                  value={dateTime(u.created_at, locale)}
                />
                <KeyValue
                  label={d.lastSeenFull}
                  value={dateTime(u.last_seen, locale)}
                />
              </dl>
            </Disclosure>
          </div>
        </Card>
      </Section>

      {/* Roles — multi-select checklist; a disabled role gates the user */}
      <Section title={d.roles}>
        <Card>
          <UserRolesEditor
            userId={u.user_id}
            roles={roleCatalog}
            assigned={assignedRoleIds}
            dict={{
              roles: d.roles,
              rolesHint: d.rolesHint,
              noRoles: d.noRoles,
              disabledTag: a.roles.statusDisabled,
            }}
            action={setUserRoleAssignment}
          />
        </Card>
      </Section>

      {/* Current state — the two boards side by side, plain language only */}
      <Section title={d.summary}>
        <div className="grid grid-cols-2 gap-3">
          <StateCard title={a.filterP1} narrative={n1.text} tone={n1.tone} />
          <StateCard title={a.filterP2} narrative={n2.text} tone={n2.tone} />
        </div>
      </Section>

      {/* People interacted with */}
      <Section title={d.interactions} count={partners.length}>
        {partners.length === 0 ? (
          <EmptyState>{d.noInteractions}</EmptyState>
        ) : (
          <RevealList
            initial={6}
            moreLabel={a.showMore}
            lessLabel={a.showLess}
            items={partners.map((p) => {
              const profile = partnerMap.get(p.otherId);
              const partnerPhoto = userImageUrl(
                p.otherId,
                profile?.data?.images?.[0]?.normal,
              );
              const bits: string[] = [];
              if (p.chatCount > 0)
                bits.push(`${p.chatCount} ${d.messagesLabel}`);
              for (const k of p.restrictOut)
                bits.push(restrictionLabel(a, k));
              for (const k of p.restrictIn)
                bits.push(`${d.restrictionIn}: ${restrictionLabel(a, k)}`);
              return (
                <Link
                  key={p.otherId}
                  href={`/admin/users/${userId}/with/${p.otherId}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                >
                  <Avatar
                    src={partnerPhoto}
                    name={profile?.name ?? null}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {profile?.name ?? p.otherId.slice(0, 8)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {relativeTime(p.lastAt, locale)}
                      {bits.length ? ` · ${bits.join(" · ")}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-primary">
                    {d.viewHistory}
                  </span>
                </Link>
              );
            })}
          />
        )}
      </Section>

      {/* What the user did — pure business language, no codes */}
      <Section title={d.activity} hint={d.activityHint}>
        {(logRows ?? []).length === 0 ? (
          <EmptyState>{d.noActivity}</EmptyState>
        ) : (
          <RevealList
            initial={8}
            moreLabel={a.showMore}
            lessLabel={a.showLess}
            items={((logRows ?? []) as LogRow[]).map((row) => {
              const res = statusResult(a, row.status);
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <StatusBadge tone={res.ok ? "ok" : "ended"} dot>
                      {res.label}
                    </StatusBadge>
                    <span className="truncate">{eventLabel(a, row.key)}</span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {relativeTime(row.created_at, locale)}
                  </span>
                </div>
              );
            })}
          />
        )}
      </Section>
    </AdminShell>
  );
}

function StateCard({
  title,
  narrative,
  tone,
}: {
  title: string;
  narrative: string;
  tone: Parameters<typeof StatusBadge>[0]["tone"];
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="mt-2">
        <StatusBadge tone={tone} dot>
          {narrative}
        </StatusBadge>
      </div>
    </Card>
  );
}
