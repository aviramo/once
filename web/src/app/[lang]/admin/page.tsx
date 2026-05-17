import { redirect } from "next/navigation";
import { Users, Tags, MapPin, Map } from "lucide-react";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import {
  AdminShell,
  Section,
  CardGrid,
  NavTile,
  Stat,
} from "./_components/ui";

/**
 * The admin home screen: a hub that links to every other admin tab plus a
 * real-time product/business KPI snapshot for managers and the board. Every
 * card is a deep link to the **filtered list** that owns the number — the
 * quick-nav tiles to each tab, and every stat to the exact subset
 * (`/admin/users?p1=…|p2=…|role=…|avail=…|tier=…|seg=…`, `/admin/areas?mode=`,
 * `/admin/roles?status=`). All figures come from one RPC
 * (admin_dashboard_metrics), same service-role + SECURITY DEFINER pattern as
 * admin_user_facet_counts.
 */

type Metrics = {
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
  };
  credits: {
    balance_total: number;
    held_total: number;
    tier_free: number;
    tier_pro: number;
  };
  areas: {
    total: number;
    active: number;
    scheduled: number;
    disabled: number;
  };
  groups: { total: number; disabled: number; gated_users: number };
  funnel_7d: {
    signups: number;
    invites: number;
    approves: number;
    messages: number;
  };
};

const EMPTY: Metrics = {
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
  availability: { available: 0, unavailable: 0, not_yet: 0, unknown: 0 },
  credits: { balance_total: 0, held_total: 0, tier_free: 0, tier_pro: 0 },
  areas: { total: 0, active: 0, scheduled: 0, disabled: 0 },
  groups: { total: 0, disabled: 0, gated_users: 0 },
  funnel_7d: { signups: 0, invites: 0, approves: 0, messages: 0 },
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
const usersUrl = "/admin/users";
const u = (qs: string) => `/admin/users?${qs}`;
const aMode = (m: string) => `/admin/areas?mode=${m}`;
const rolesUrl = "/admin/roles";
const MAP = "/admin/map";

export default async function AdminDashboard({
  params,
}: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const d = dict.admin;
  const t = d.dashboard;

  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  const admin = createSupabaseAdmin();
  const [{ data: metricsData }, meRes] = await Promise.all([
    admin.rpc("admin_dashboard_metrics"),
    admin.from("users").select("name").eq("user_id", user.id).maybeSingle(),
  ]);
  const m = normalize(metricsData);

  const nf = new Intl.NumberFormat(locale);
  const fmt = (n: number) => nf.format(n ?? 0);
  const proShare =
    m.users.total > 0
      ? Math.round((m.credits.tier_pro / m.users.total) * 100)
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
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.updated.replace("{time}", updatedTime)}
        </p>
      </div>

      <Section title={t.navTitle}>
        <CardGrid min="15rem">
          <NavTile
            icon={Users}
            title={t.nav.usersTitle}
            desc={t.nav.usersDesc}
            value={fmt(m.users.total)}
            href={usersUrl}
          />
          <NavTile
            icon={Tags}
            title={t.nav.rolesTitle}
            desc={t.nav.rolesDesc}
            value={fmt(m.groups.total)}
            href={rolesUrl}
          />
          <NavTile
            icon={MapPin}
            title={t.nav.areasTitle}
            desc={t.nav.areasDesc}
            value={fmt(m.areas.active)}
            href={aMode("active")}
          />
          <NavTile
            icon={Map}
            title={t.nav.mapTitle}
            desc={t.nav.mapDesc}
            value={fmt(m.users.online_5m)}
            href={MAP}
          />
        </CardGrid>
      </Section>

      <Section title={t.sections.growth}>
        <CardGrid min="12rem">
          <Stat
            label={t.metrics.total}
            value={fmt(m.users.total)}
            href={usersUrl}
          />
          <Stat
            label={t.metrics.newToday}
            value={fmt(m.users.new_today)}
            accent="ok"
            href={u("seg=new_today")}
          />
          <Stat
            label={t.metrics.new7d}
            value={fmt(m.users.new_7d)}
            href={u("seg=new_7d")}
          />
          <Stat
            label={t.metrics.new30d}
            value={fmt(m.users.new_30d)}
            href={u("seg=new_30d")}
          />
          <Stat
            label={t.metrics.online}
            value={fmt(m.users.online_5m)}
            hint={t.hints.online}
            accent="ok"
            href={u("seg=online")}
          />
          <Stat
            label={t.metrics.activeToday}
            value={fmt(m.users.active_today)}
            href={u("seg=active_today")}
          />
          <Stat
            label={t.metrics.active7d}
            value={fmt(m.users.active_7d)}
            href={u("seg=active_7d")}
          />
          <Stat
            label={t.metrics.withLocation}
            value={fmt(m.users.with_location)}
            href={u("seg=located")}
          />
        </CardGrid>
      </Section>

      <Section title={t.sections.engagement}>
        <CardGrid min="12rem">
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

      <Section title={t.sections.availability}>
        <CardGrid min="12rem">
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
        </CardGrid>
      </Section>

      <Section title={t.sections.credits}>
        <CardGrid min="12rem">
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
            label={t.metrics.tierFree}
            value={fmt(m.credits.tier_free)}
            href={u("tier=free")}
          />
          <Stat
            label={t.metrics.tierPro}
            value={fmt(m.credits.tier_pro)}
            hint={t.hints.proShare.replace("{pct}", String(proShare))}
            accent="ok"
            href={u("tier=pro")}
          />
        </CardGrid>
      </Section>

      <Section title={t.sections.catalog}>
        <CardGrid min="12rem">
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
          <Stat
            label={t.metrics.rolesTotal}
            value={fmt(m.groups.total)}
            href={rolesUrl}
          />
          <Stat
            label={t.metrics.rolesDisabled}
            value={fmt(m.groups.disabled)}
            accent="ended"
            href={`${rolesUrl}?status=disabled`}
          />
          <Stat
            label={t.metrics.rolesGated}
            value={fmt(m.groups.gated_users)}
            accent="ended"
            href={u("seg=role_gated")}
          />
        </CardGrid>
      </Section>

      <Section title={t.sections.funnel} hint={t.hints.funnel}>
        <CardGrid min="12rem">
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
        </CardGrid>
      </Section>
    </AdminShell>
  );
}
