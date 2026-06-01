import { requireViewerScope } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "./_components/AdminShell";
import { Section, CardGrid, Stat } from "./_components/ui";
import { RealtimeRefresh } from "./_components/RealtimeRefresh";

/**
 * The admin home screen: a hub that links to every other admin tab plus a
 * real-time product/business KPI snapshot for managers and the board. Every
 * card is a deep link to the **filtered list** that owns the number — the
 * quick-nav tiles to each tab, and every stat to the exact subset
 * (`/users?p1=…|p2=…|role=…|avail=…|seg=…`, `/areas?mode=`,
 * `/groups?status=`). All figures come from one RPC
 * (admin_dashboard_metrics), same service-role + SECURITY DEFINER pattern as
 * admin_user_facet_counts.
 */

type Metrics = {
  demographics: {
    men: number;
    women: number;
    avg_age: number;
    os_ios: number;
    os_android: number;
  };
  users: {
    total: number;
    new_today: number;
    new_7d: number;
    new_30d: number;
    online_5m: number;
    active_today: number;
    active_7d: number;
    active_30d: number;
    with_location: number;
  };
  engagement: {
    chat: number;
    waiting: number;
    watching: number;
    pending: number;
    broadcasting: number;
  };
  availability: {
    available: number;
    unavailable: number;
    not_yet: number;
    unknown: number;
    no_notif: number;
  };
  credits: {
    balance_total: number;
    held_total: number;
    extra_total: number;
    with_extra: number;
  };
  areas: {
    total: number;
    active: number;
    scheduled: number;
    disabled: number;
  };
  groups: { total: number };
  funnel_7d: {
    signups: number;
    invites: number;
    approves: number;
    messages: number;
    logouts: number;
    deletes: number;
  };
};

const EMPTY: Metrics = {
  demographics: { men: 0, women: 0, avg_age: 0, os_ios: 0, os_android: 0 },
  users: {
    total: 0,
    new_today: 0,
    new_7d: 0,
    new_30d: 0,
    online_5m: 0,
    active_today: 0,
    active_7d: 0,
    active_30d: 0,
    with_location: 0,
  },
  engagement: { chat: 0, waiting: 0, watching: 0, pending: 0, broadcasting: 0 },
  availability: {
    available: 0,
    unavailable: 0,
    not_yet: 0,
    unknown: 0,
    no_notif: 0,
  },
  credits: { balance_total: 0, held_total: 0, extra_total: 0, with_extra: 0 },
  areas: { total: 0, active: 0, scheduled: 0, disabled: 0 },
  groups: { total: 0 },
  funnel_7d: {
    signups: 0,
    invites: 0,
    approves: 0,
    messages: 0,
    logouts: 0,
    deletes: 0,
  },
};

/**
 * Coerce the RPC payload onto the EMPTY shape: any top-level group that's
 * missing or not an object (e.g. the contract drifts under a rename) falls
 * back to zeros instead of hard-crashing the whole admin home. Numbers stay
 * as-is; only the structural skeleton is guaranteed.
 */
function normalize(raw: unknown): Metrics {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Record<keyof Metrics, unknown>;
  for (const key of Object.keys(EMPTY) as (keyof Metrics)[]) {
    const part = src[key];
    out[key] =
      part && typeof part === "object"
        ? { ...EMPTY[key], ...(part as object) }
        : EMPTY[key];
  }
  return out as Metrics;
}

// Deep-link builders — every tile resolves to a filtered list of exactly the
// users/areas/roles the number counts.
const usersUrl = "/users";
const u = (qs: string) => `/users?${qs}`;
const aMode = (m: string) => `/areas?mode=${m}`;
const groupsUrl = "/groups";

export default async function AdminDashboard({
  params,
}: PageProps<"/[lang]">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const d = dict.admin;
  const t = d.dashboard;

  // Admins see global metrics; group managers see the same dashboard scoped
  // to the users in groups they manage. Scoping is enforced at the RPC level:
  // `p_user_ids` filters every users-related subquery (chat / log too); when
  // null the RPC computes the global picture.
  const scope = await requireViewerScope();
  const isAdmin = scope.kind === "admin";
  const user = scope.user;
  const scopedUserIds = scope.kind === "manager" ? scope.userIds : null;

  const admin = createSupabaseAdmin();
  const [{ data: metricsData }, meRes] = await Promise.all([
    admin.rpc("admin_dashboard_metrics", { p_user_ids: scopedUserIds }),
    admin.from("users").select("name").eq("user_id", user.id).maybeSingle(),
  ]);
  const m = normalize(metricsData);
  // A manager's "groups" count is the groups THEY manage, not the global
  // total returned by the RPC (which they should not see).
  if (scope.kind === "manager") {
    m.groups = { total: scope.groupIds.length };
  }

  const nf = new Intl.NumberFormat(locale);
  const fmt = (n: number) => nf.format(n ?? 0);
  const extraShare =
    m.users.total > 0
      ? Math.round((m.credits.with_extra / m.users.total) * 100)
      : 0;
  const updatedTime = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  }).format(new Date());

  const meName = (meRes.data as { name?: string } | null)?.name;
  const userLabel = `${d.loggedInAs}: ${meName ?? user.email ?? ""}`;

  return (
    <AdminShell dict={d} active="dashboard" userLabel={userLabel}>
      <RealtimeRefresh
        tables="users,areas,groups,user_groups"
        channel="admin-dashboard"
      />
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.updated.replace("{time}", updatedTime)}
        </p>
      </div>

      <Section title={t.sections.demographics}>
        <CardGrid min="8.5rem">
          <Stat
            label={t.metrics.men}
            value={fmt(m.demographics.men)}
            href={u("gender=male")}
          />
          <Stat
            label={t.metrics.women}
            value={fmt(m.demographics.women)}
            href={u("gender=female")}
          />
          <Stat
            label={t.metrics.avgAge}
            value={fmt(m.demographics.avg_age)}
          />
          <Stat
            label={t.metrics.osIos}
            value={fmt(m.demographics.os_ios)}
            href={u("os=ios")}
          />
          <Stat
            label={t.metrics.osAndroid}
            value={fmt(m.demographics.os_android)}
            href={u("os=android")}
          />
        </CardGrid>
      </Section>

      <Section title={t.sections.funnel} hint={t.hints.funnel}>
        <CardGrid min="8.5rem">
          <Stat
            label={t.metrics.fSignups}
            value={fmt(m.funnel_7d.signups)}
            accent="ok"
            href={u("seg=new_7d")}
          />
          <Stat
            label={t.metrics.fInvites}
            value={fmt(m.funnel_7d.invites)}
            href={u("p1=waiting")}
          />
          <Stat
            label={t.metrics.fApproves}
            value={fmt(m.funnel_7d.approves)}
            accent="chat"
            href={u("p1=chat")}
          />
          <Stat
            label={t.metrics.fMessages}
            value={fmt(m.funnel_7d.messages)}
            accent="chat"
            href={u("p1=chat")}
          />
          <Stat
            label={t.metrics.fLogouts}
            value={fmt(m.funnel_7d.logouts)}
          />
          <Stat
            label={t.metrics.fDeletes}
            value={fmt(m.funnel_7d.deletes)}
            accent="ended"
          />
        </CardGrid>
      </Section>

      <Section title={t.sections.engagement}>
        <CardGrid min="8.5rem">
          <Stat
            label={t.metrics.chat}
            value={fmt(m.engagement.chat)}
            accent="chat"
            href={u("p1=chat")}
          />
          <Stat
            label={t.metrics.waiting}
            value={fmt(m.engagement.waiting)}
            accent="busy"
            href={u("p1=waiting")}
          />
          <Stat
            label={t.metrics.watching}
            value={fmt(m.engagement.watching)}
            accent="busy"
            href={u("p1=watching")}
          />
          <Stat
            label={t.metrics.pending}
            value={fmt(m.engagement.pending)}
            accent="busy"
            href={u("p2=pending")}
          />
          <Stat
            label={t.metrics.broadcasting}
            value={fmt(m.engagement.broadcasting)}
            accent="busy"
            href={u("seg=broadcasting")}
          />
        </CardGrid>
      </Section>

      {/* "Quick nav" tiles were removed at the user's request: the same counts
          now ride as info-tone chips on the AdminNav tabs themselves, which
          beats a dedicated dashboard section since the numbers are then one
          glance away from every admin screen, not only this one. */}

      <Section title={t.sections.availability}>
        <CardGrid min="8.5rem">
          <Stat
            label={t.metrics.available}
            value={fmt(m.availability.available)}
            accent="ok"
            href={u("avail=available")}
          />
          <Stat
            label={t.metrics.unavailable}
            value={fmt(m.availability.unavailable)}
            accent="ended"
            href={u("avail=unavailable")}
          />
          <Stat
            label={t.metrics.notYet}
            value={fmt(m.availability.not_yet)}
            accent="busy"
            href={u("avail=not_yet")}
          />
          <Stat
            label={t.metrics.unknownAvail}
            value={fmt(m.availability.unknown)}
            href={u("avail=unknown")}
          />
          <Stat
            label={t.metrics.noNotif}
            value={fmt(m.availability.no_notif)}
            accent="ended"
            href={u("seg=no_notif")}
          />
        </CardGrid>
      </Section>

      {/* "Signups" section was removed at the user's request — the 7-day
          signup count already lives in the Funnel section's first tile
          (`fSignups`), so a dedicated today/7d/30d trio was redundant. The
          drill-downs (`seg=new_today|new_7d|new_30d`) are still reachable
          from the users-list filter dropdown. */}

      {/* "Active users" (online_5m / active_today / active_7d) was removed at
          the user's request — the recency segs are still reachable from the
          users-list filter dropdown (?seg=online|active_today|active_7d). */}

      {/* Areas catalog — admin-only. Managers don't manage availability
          areas (it's a global config), so the section is hidden for them. */}
      {isAdmin ? (
        <Section title={t.sections.areas}>
          <CardGrid min="8.5rem">
            <Stat
              label={t.metrics.areasActive}
              value={fmt(m.areas.active)}
              accent="ok"
              href={aMode("active")}
            />
            <Stat
              label={t.metrics.areasScheduled}
              value={fmt(m.areas.scheduled)}
              accent="busy"
              href={aMode("scheduled")}
            />
            <Stat
              label={t.metrics.areasDisabled}
              value={fmt(m.areas.disabled)}
              href={aMode("disabled")}
            />
          </CardGrid>
        </Section>
      ) : null}

      <Section title={t.sections.groups}>
        <CardGrid min="8.5rem">
          <Stat
            label={t.metrics.rolesTotal}
            value={fmt(m.groups.total)}
            href={groupsUrl}
          />
        </CardGrid>
      </Section>

      <Section title={t.sections.credits}>
        <CardGrid min="8.5rem">
          <Stat
            label={t.metrics.balanceTotal}
            value={fmt(m.credits.balance_total)}
            href={usersUrl}
          />
          <Stat
            label={t.metrics.heldTotal}
            value={fmt(m.credits.held_total)}
            accent="busy"
            href={u("seg=held")}
          />
          <Stat
            label={t.metrics.extraTotal}
            value={fmt(m.credits.extra_total)}
            accent="ok"
            href={u("seg=extra")}
          />
          <Stat
            label={t.metrics.withExtra}
            value={fmt(m.credits.with_extra)}
            hint={t.hints.extraShare.replace("{pct}", String(extraShare))}
            href={u("seg=extra")}
          />
        </CardGrid>
      </Section>
    </AdminShell>
  );
}
