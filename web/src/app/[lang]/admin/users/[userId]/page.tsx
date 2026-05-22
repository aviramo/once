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
  availabilityNarrative,
  eventLabel,
  restrictionLabel,
  statusResult,
} from "@/lib/humanize";
import { AdminShell } from "../../_components/AdminShell";
import {
  Section,
  Card,
  Avatar,
  StatusBadge,
  EmptyState,
  KeyValue,
} from "../../_components/ui";
import { RealtimeRefresh } from "../../_components/RealtimeRefresh";
import { Disclosure, RevealList } from "../../_components/Disclosure";
import { UserRolesEditor, type EditorRole } from "./_components/UserGroupsEditor";
import { UserDangerZone } from "./_components/UserDangerZone";
import { ReleasePageButton } from "./_components/ReleasePageButton";
import { UserPhotos } from "./_components/UserPhotos";
import { setUserRoleAssignment } from "../../roles/actions";
import { deleteUser, resetUser } from "../actions";

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
    os?: string;
    lang?: string;
    /** Stored as an object `{token, type}` on current builds; truthy is all
     * we need for the notifications-active check. */
    push_token?: unknown;
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
    availability?: { state?: string; reason?: string | null } | null;
    push?: { perm?: string; dead?: boolean; token?: boolean } | null;
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
    { data: storageFiles },
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
    admin.storage.from("users").list(`${userId}/normal`, { limit: 100 }),
  ]);

  const roleCatalog = (allRoles ?? []) as EditorRole[];
  const assignedRoleIds = ((myRoleRows ?? []) as { group_id: string }[]).map(
    (r) => r.group_id,
  );

  if (!target) notFound();
  const u = target as UserRecord;

  // Photos: the images currently on the profile, and earlier uploads still in
  // Storage that are no longer attached to it.
  const profileImages = (u.data?.images ?? [])
    .map((img) => img.normal)
    .filter((n): n is string => !!n);
  const profileSet = new Set(profileImages);
  const pastImages = ((storageFiles ?? []) as { name?: string }[])
    .map((f) => f.name ?? "")
    .filter((n) => !!n && !n.startsWith(".") && !profileSet.has(n));
  // Notifications status — "active" iff we have a token, the device isn't
  // flagged dead, and OS permission isn't denied. Mirrors push_blocked SQL.
  const notifActive =
    !!u.data?.push_token &&
    u.relations?.push?.dead !== true &&
    u.relations?.push?.perm !== "denied";

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
  const gate = availabilityNarrative(a, u.relations);
  const gender =
    u.is_male === true ? d.male : u.is_male === false ? d.female : "—";

  return (
    <AdminShell dict={a} active="users" backHref="/admin/users">
      <RealtimeRefresh
        tables="users"
        channel="admin-user-detail"
        filter={`user_id=eq.${u.user_id}`}
      />
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
          <div className="mt-2 space-y-2">
            {gate ? (
              <StatusBadge tone={gate.tone}>{gate.text}</StatusBadge>
            ) : null}
            {/* Each page tag carries its own release-to-default button right
                under it — the operator sees the state and the action together
                without scrolling to a separate "current state" block. The
                button is suppressed when the tag is already `ok` (green): the
                page is already at the discoverable state release would lead
                to, so the action is a no-op and showing it just adds noise. */}
            <div className="flex flex-wrap gap-3">
              <div className="flex flex-col items-start gap-1.5">
                <StatusBadge tone={n1.tone}>{n1.text}</StatusBadge>
                {n1.tone !== "ok" ? (
                  <ReleasePageButton
                    userId={u.user_id}
                    page={1}
                    label={a.actions.releasePage1}
                    busyLabel={a.actions.busy}
                    confirmText={a.actions.confirmRelease1.replace(
                      "{target}",
                      u.name ?? u.user_id.slice(0, 8),
                    )}
                  />
                ) : null}
              </div>
              <div className="flex flex-col items-start gap-1.5">
                <StatusBadge tone={n2.tone}>{n2.text}</StatusBadge>
                {n2.tone !== "ok" ? (
                  <ReleasePageButton
                    userId={u.user_id}
                    page={2}
                    label={a.actions.releasePage2}
                    busyLabel={a.actions.busy}
                    confirmText={a.actions.confirmRelease2.replace(
                      "{target}",
                      u.name ?? u.user_id.slice(0, 8),
                    )}
                  />
                ) : null}
              </div>
            </div>
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
                <KeyValue label={d.os} value={u.data?.os ?? "—"} />
                <KeyValue label={d.lang} value={u.data?.lang ?? "—"} />
                <KeyValue
                  label={d.notif}
                  value={notifActive ? d.notifActive : d.notifInactive}
                />
              </dl>
            </Disclosure>
          </div>
        </Card>
      </Section>

      {/* Photos — current profile photos + earlier unassociated uploads */}
      <Section title={d.photos}>
        <Card>
          <UserPhotos
            userId={u.user_id}
            profile={profileImages}
            past={pastImages}
            dict={{
              inProfile: d.photosInProfile,
              past: d.photosPast,
              empty: d.photosEmpty,
            }}
          />
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

      {/* Danger zone — irreversible per-user admin controls */}
      <Section title={d.danger.section}>
        <UserDangerZone
          userId={u.user_id}
          userName={u.name ?? ""}
          dict={d.danger}
          resetAction={resetUser}
          deleteAction={deleteUser}
        />
      </Section>
    </AdminShell>
  );
}

