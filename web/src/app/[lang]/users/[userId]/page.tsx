import { notFound } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireViewerScope } from "@/lib/admin-auth";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { relativeTime, dateTime } from "@/lib/relativeTime";
import { userImageUrl } from "@/lib/userImage";
import {
  page1Narrative,
  page2Narrative,
  availabilityNarrative,
} from "@/lib/humanize";
import { buildEventCards } from "@/lib/eventCards";
import { AdminShell } from "../../_components/AdminShell";
import {
  Section,
  Card,
  Avatar,
  StatusBadge,
  KeyValue,
} from "../../_components/ui";
import { RealtimeRefresh } from "../../_components/RealtimeRefresh";
import { Disclosure } from "../../_components/Disclosure";
import { PageReleaseBadge } from "../../_components/PageReleaseBadge";
import { type EditorGroup } from "./_components/UserGroupsEditor";
import { UserGroupsChips } from "./_components/UserGroupsChips";
import { UserDangerZone } from "./_components/UserDangerZone";
import { UserPhotos } from "./_components/UserPhotos";
import {
  UnifiedActivity,
  type UnifiedPartner,
} from "./_components/UnifiedActivity";
import { setUserGroupAssignment } from "../../groups/actions";
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
  user_id: string | null;
  key: string;
  status: number;
  log: unknown;
  user: unknown;
};

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  const ageDate = new Date(Date.now() - dob.getTime());
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

export default async function UserDetailPage({
  params,
}: PageProps<"/[lang]/users/[userId]">) {
  const { lang, userId } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const a = dict.admin;
  const d = a.userDetail;

  // Admin sees every user; group managers only the union of their managed
  // groups' members. 404 (not redirect) when a manager opens an out-of-scope
  // deep-link so the URL stays canonical for the admin who shared it.
  const scope = await requireViewerScope();
  const user = scope.user;
  const isAdmin = scope.kind === "admin";
  if (scope.kind === "manager" && !scope.userIds.includes(userId)) notFound();

  const admin = createSupabaseAdmin();
  // The activity feed + the partner-profile fetch (which feeds it) are
  // admin-only — skip the queries entirely for managers so we don't leak
  // user activity to a non-admin role.
  const [
    { data: target },
    { data: authUser },
    logRowsRes,
    { data: allRoles },
    { data: myGroupRows },
    { data: storageFiles },
    { data: authListing },
  ] = await Promise.all([
    admin
      .from("users")
      .select(
        "user_id, name, is_male, birth_date, created_at, last_seen, data, relations",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
    isAdmin
      ? admin.rpc("admin_log_for_user", { p_user_id: userId, p_limit: 300 })
      : Promise.resolve({ data: [] as LogRow[] }),
    admin
      .from("groups")
      .select("id, name")
      .order("created_at", { ascending: true }),
    admin.from("user_groups").select("group_id").eq("user_id", userId),
    admin.storage.from("users").list(`${userId}/normal`, { limit: 100 }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const logRows = (logRowsRes as { data: LogRow[] | null }).data;

  const groupCatalog = (allRoles ?? []) as EditorGroup[];
  const assignedGroupIds = ((myGroupRows ?? []) as { group_id: string }[]).map(
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

  // Build merged event-card feed: one card per log row, enriched with the
  // partners involved. The RPC also returns rows from OTHER users where this
  // user's id appears in the payload — so "X invited you", "X removed you"
  // surface here, not just things this user initiated.
  const rawLog = (logRows ?? []) as LogRow[];
  const entries = buildEventCards(
    rawLog,
    u.user_id,
    a,
    a.profileChanges,
    a.accountChanges,
  );

  // All partner IDs referenced anywhere in the feed → fetch profiles + emails
  // in one batch for the affected-users chips and the search filter. Drop any
  // UUIDs in the payload that don't actually correspond to a user row.
  const partnerIdSet = new Set<string>();
  for (const e of entries) {
    for (const a of e.affected) partnerIdSet.add(a.id);
    if (e.byOther && e.actorId) partnerIdSet.add(e.actorId);
  }
  const partnerIds = [...partnerIdSet];

  const { data: partnerProfiles } = partnerIds.length
    ? await admin
        .from("users")
        .select("user_id, name, data")
        .in("user_id", partnerIds)
    : { data: [] };

  const partnerMap: Record<string, UnifiedPartner> = {};
  const emailByLower = new Map<string, string>();
  for (const au of authListing?.users ?? []) {
    if (au.id && au.email) emailByLower.set(au.id.toLowerCase(), au.email);
  }
  for (const p of (partnerProfiles ?? []) as PartnerMini[]) {
    const key = p.user_id.toLowerCase();
    partnerMap[key] = {
      name: p.name,
      email: emailByLower.get(key) ?? null,
      photo: userImageUrl(p.user_id, p.data?.images?.[0]?.normal),
    };
  }

  const photo = userImageUrl(u.user_id, u.data?.images?.[0]?.normal);
  const age = calcAge(u.birth_date);
  const email = authUser?.user?.email ?? null;
  const n1 = page1Narrative(a, u.relations);
  const n2 = page2Narrative(a, u.relations);
  const gate = availabilityNarrative(a, u.relations);
  const gender =
    u.is_male === true ? d.male : u.is_male === false ? d.female : "—";

  return (
    <AdminShell dict={a} active="users" backHref="/users">
      <RealtimeRefresh
        tables="users"
        channel="admin-user-detail-users"
        filter={`user_id=eq.${u.user_id}`}
      />
      {/* Live events feed: subscribe to log inserts where this user was the
          actor. The substring-search side ("things others did to me") still
          surfaces via the users-table subscription above — those rows mutate
          relations through the same RPC transaction, which fires a users
          UPDATE that this page already refreshes on.
          A 10s polling fallback catches any Realtime delivery hiccup
          (publication just added, WebSocket dropped, etc.) so the events
          log stays fresh end-to-end. */}
      <RealtimeRefresh
        tables="log"
        channel="admin-user-detail-log"
        filter={`user_id=eq.${u.user_id}`}
        pollMs={10000}
      />
      {/* Identity card — photo + name/email + state badges + (compact)
          danger zone. The irreversible per-user controls are two small buttons
          next to the identity so they're reachable without scrolling, without
          dominating the layout. */}
      <Card className="p-4">
        <div className="flex items-start gap-4">
          <Avatar src={photo} name={u.name} size="md" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h1 className="text-lg font-bold leading-tight">
                  {u.name ?? "—"}
                </h1>
                <span className="min-w-0 truncate text-sm text-muted-foreground">
                  {email ?? a.noEmail}
                </span>
              </div>
              {isAdmin ? (
                <UserDangerZone
                  userId={u.user_id}
                  userName={u.name ?? ""}
                  dict={d.danger}
                  resetAction={resetUser}
                  deleteAction={deleteUser}
                  compact
                />
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {/* Availability + page-state badges and the release affordance
                  are admin-only. Group managers see identity + group chips
                  only — no page state, no activity, no location. */}
              {isAdmin && gate ? (
                <StatusBadge tone={gate.tone}>{gate.text}</StatusBadge>
              ) : null}
              {isAdmin ? (
                <PageReleaseBadge
                  userId={u.user_id}
                  page={1}
                  tone={n1.tone}
                  text={n1.text}
                  dict={{
                    release: a.actions.release,
                    busy: a.actions.busy,
                    done: a.actions.done,
                    fail: a.actions.fail,
                  }}
                />
              ) : null}
              {isAdmin ? (
                <PageReleaseBadge
                  userId={u.user_id}
                  page={2}
                  tone={n2.tone}
                  text={n2.text}
                  dict={{
                    release: a.actions.release,
                    busy: a.actions.busy,
                    done: a.actions.done,
                    fail: a.actions.fail,
                  }}
                />
              ) : null}
              <UserGroupsChips
                userId={u.user_id}
                groups={groupCatalog}
                assigned={assignedGroupIds}
                emptyLabel={d.groupsEmpty}
                manageLabel={d.groupsManage}
                readOnly={!isAdmin}
                dict={{
                  groups: d.groups,
                  groupsHint: d.groupsHint,
                  noGroups: d.noGroups,
                }}
                action={setUserGroupAssignment}
              />
            </div>
            {/* Joined date is identity; last-seen is activity (admin only). */}
            <p className="mt-2 text-xs text-muted-foreground">
              {d.joinedFull}: {relativeTime(u.created_at, locale)}
              {isAdmin ? (
                <>
                  {" · "}
                  {d.lastSeenFull}: {relativeTime(u.last_seen, locale)}
                </>
              ) : null}
            </p>
          </div>
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
            {isAdmin && u.data?.location_label ? (
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

      {/* Merged event log — admin only. Group managers do not see user
          activity history. */}
      {isAdmin ? (
        <Section title={d.eventsLog.title} hint={d.eventsLog.hint}>
          <UnifiedActivity
            selfId={u.user_id}
            entries={entries}
            partners={partnerMap}
            dict={d.eventsLog.feed}
            locale={locale}
          />
        </Section>
      ) : null}
    </AdminShell>
  );
}
