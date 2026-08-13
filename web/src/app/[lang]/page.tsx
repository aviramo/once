import { requireViewerScope } from "@/lib/admin-auth";
import { readAdminEnv, envIsTest } from "@/lib/adminEnv";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "./_components/AdminShell";
import { Section, CardGrid, Stat } from "./_components/ui";
import { RealtimeRefresh } from "./_components/RealtimeRefresh";
import { RangePicker } from "./_components/RangePicker";
import { parseRange, rangeSince } from "@/lib/range";

/**
 * The admin home screen: a hub that links to every other admin tab plus a
 * real-time product/business KPI snapshot for managers and the board. Nothing
 * on it is pressable: it is a page you read, and the lists that own each
 * number are one tab away with filters of their own.
 *
 * Two RPCs feed it — `admin_dashboard_metrics` for the snapshot figures and
 * `admin_activity_metrics` for everything the period picker moves — and both
 * are bounded by the environment the header switch is on.
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
  credits: {
    balance_total: number;
    held_total: number;
    extra_total: number;
    with_extra: number;
  };
};

/** Everything that HAPPENED inside the selected window, from
 * `admin_activity_metrics`. Kept separate from {@link Metrics} because these
 * are the only figures the period picker moves — the demographics and the
 * wallet totals are a snapshot of right now, whatever period is chosen. */
type Activity = {
  active: number;
  accounts: number;
  profiles: number;
  friendships: number;
  memberships: number;
  invites_sent: number;
  invites_declined: number;
  invites_cancelled: number;
  invites_expired: number;
  chats: number;
  avg_messages: number;
  blocks: number;
  reports: number;
  logouts: number;
  deletes: number;
};

const EMPTY_ACTIVITY: Activity = {
  active: 0,
  accounts: 0,
  profiles: 0,
  friendships: 0,
  memberships: 0,
  invites_sent: 0,
  invites_declined: 0,
  invites_cancelled: 0,
  invites_expired: 0,
  chats: 0,
  avg_messages: 0,
  blocks: 0,
  reports: 0,
  logouts: 0,
  deletes: 0,
};

/** The business card's counter, from `admin_scan_metrics`. One row per DEVICE
 * that opened /scan, and every figure beside it is a count of DEVICES too —
 * how many of the people who scanned went on to press this, never how many
 * presses there were. It is NOT part of {@link Metrics}: an anonymous visitor
 * to a printed address has no account and no environment, so this is the one
 * block on the screen the header's environment switch does not move and a
 * manager's scope does not narrow. */
type ScanRow = {
  devices: number;
  /** Pressed the store button. */
  download: number;
  /** Pressed "tell me when there is an iPhone version" — what stands in the
   * store button's place on an iPhone, and the only thing an iPhone scan can
   * press towards the app. */
  notify: number;
  /** Followed the link out to the site. */
  more: number;
};
type Scan = { android: ScanRow; ios: ScanRow };

const EMPTY_ROW: ScanRow = { devices: 0, download: 0, notify: 0, more: 0 };

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
  credits: { balance_total: 0, held_total: 0, extra_total: 0, with_extra: 0 },
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

// NO TILE IS A LINK (user, 2026-08-02). Every stat used to deep-link into the
// filtered list that owned it, which made a screen you READ into a screen you
// could fall out of by brushing a number. The lists are one tab away and carry
// their own filters; this page is a snapshot to look at.

export default async function AdminDashboard({
  params,
  searchParams,
}: PageProps<"/[lang]">) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const d = dict.admin;
  const t = d.dashboard;
  const sp = await searchParams;
  const range = parseRange(typeof sp.range === "string" ? sp.range : null);

  // Admins see global metrics; group managers see the same dashboard scoped
  // to the users in groups they manage. Scoping is enforced at the RPC level:
  // `p_user_ids` filters every users-related subquery (chat / log too); when
  // null the RPC computes the global picture.
  const scope = await requireViewerScope();
  const user = scope.user;
  const scopedUserIds = scope.kind === "manager" ? scope.userIds : null;
  // Every figure on this screen belongs to the selected environment — the two
  // matching pools never meet, so one number covering both describes nobody.
  const env = await readAdminEnv();

  const admin = createSupabaseAdmin();
  const [{ data: metricsData }, { data: activityData }, { data: scanData }, meRes] =
    await Promise.all([
      admin.rpc("admin_dashboard_metrics", {
        p_user_ids: scopedUserIds,
        p_is_test: envIsTest(env),
      }),
      admin.rpc("admin_activity_metrics", {
        p_since: rangeSince(range),
        p_is_test: envIsTest(env),
        p_user_ids: scopedUserIds,
      }),
      admin.rpc("admin_scan_metrics"),
      admin.from("users").select("name").eq("user_id", user.id).maybeSingle(),
    ]);
  const m = normalize(metricsData);
  const a: Activity = {
    ...EMPTY_ACTIVITY,
    ...((activityData ?? {}) as Partial<Activity>),
  };
  // Every platform is read through the same fallback, so a payload from an
  // older RPC (or none at all, before the table exists) draws zeros instead of
  // crashing the whole admin home.
  const scanRaw = (scanData ?? {}) as Record<string, Partial<ScanRow>>;
  const scan: Scan = {
    android: { ...EMPTY_ROW, ...(scanRaw.android ?? {}) },
    ios: { ...EMPTY_ROW, ...(scanRaw.ios ?? {}) },
  };

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
        tables="users,groups,user_groups"
        channel="admin-dashboard"
      />
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.updated.replace("{time}", updatedTime)}
        </p>
      </div>

      {/* The printed card, above everything the app itself reports: this is
          the step BEFORE an account exists, so it leads. Two numbers and no
          total — an Android scan can install today and an iPhone scan is shown
          the "not yet on iPhone" state instead, so summing them would hide the
          one thing worth knowing. Admins only: it is a business figure about
          the cards being handed out, not about anybody's circle. */}
      {scope.kind === "admin" ? (
        <Section title={t.sections.scan} hint={t.hints.scan}>
          <CardGrid min="8.5rem">
            {/* Under each number, what those same devices went on to press.
                The pair differs by platform because the PAGE differs: an
                Android scan is offered the store, an iPhone scan is offered
                "tell me when" in its place, and both are offered the site. */}
            <Stat
              label={t.metrics.scanAndroid}
              value={fmt(scan.android.devices)}
              hint={t.hints.scanAndroid
                .replace("{download}", fmt(scan.android.download))
                .replace("{more}", fmt(scan.android.more))}
            />
            <Stat
              label={t.metrics.scanIos}
              value={fmt(scan.ios.devices)}
              hint={t.hints.scanIos
                .replace("{notify}", fmt(scan.ios.notify))
                .replace("{more}", fmt(scan.ios.more))}
            />
          </CardGrid>
        </Section>
      ) : null}

      <Section title={t.sections.demographics}>
        <CardGrid min="8.5rem">
          {/* The whole first, then how it splits — every tile beside it is a
              share of this one, so it leads. */}
          <Stat
            label={t.metrics.total}
            value={fmt(m.users.total)}
          />
          <Stat
            label={t.metrics.men}
            value={fmt(m.demographics.men)}
          />
          <Stat
            label={t.metrics.women}
            value={fmt(m.demographics.women)}
          />
          <Stat
            label={t.metrics.avgAge}
            value={fmt(m.demographics.avg_age)}
          />
          <Stat
            label={t.metrics.osIos}
            value={fmt(m.demographics.os_ios)}
          />
          <Stat
            label={t.metrics.osAndroid}
            value={fmt(m.demographics.os_android)}
          />
        </CardGrid>
      </Section>

      {/* Everything that HAPPENED, over the period the picker is on. The tiles
          read as one story in order: accounts arrive, some of them build a
          profile, invitations go out and are answered three ways, the ones
          that land become chats with a depth, and then what went wrong and who
          left. The old fixed "7-day funnel" and the "live engagement" block
          were merged into this: the live counts (in a chat / waiting /
          watching right now) are the users list's own `?state=` filter, which
          is where you go to act on them, not a number to stare at. */}
      <Section
        title={t.sections.activity}
        hint={t.range.hint[range]}
        action={<RangePicker range={range} labels={t.range.options} />}
      >
        <CardGrid min="8.5rem">
          {/* Who showed up at all. Every tile beside it is something a subset
              of these people did, so it leads. */}
          <Stat
            label={t.metrics.aActive}
            value={fmt(a.active)}
            accent="ok"
          />
          <Stat
            label={t.metrics.aAccounts}
            value={fmt(a.accounts)}
            accent="ok"
          />
          <Stat label={t.metrics.aProfiles} value={fmt(a.profiles)} accent="ok" />
          {/* The social graph, before the game: `friend_links` is already one
              row per pair, so a friendship counts once by construction. A
              circle join counts per person, which is the question being asked
              — how many joinings happened, not how many circles grew. */}
          <Stat
            label={t.metrics.aFriendships}
            value={fmt(a.friendships)}
            accent="ok"
          />
          <Stat
            label={t.metrics.aMemberships}
            value={fmt(a.memberships)}
            accent="ok"
          />
          <Stat
            label={t.metrics.aInvites}
            value={fmt(a.invites_sent)}
          />
          <Stat
            label={t.metrics.aDeclined}
            value={fmt(a.invites_declined)}
            accent="ended"
          />
          <Stat
            label={t.metrics.aCancelled}
            value={fmt(a.invites_cancelled)}
            accent="ended"
          />
          <Stat
            label={t.metrics.aExpired}
            value={fmt(a.invites_expired)}
            accent="ended"
          />
          <Stat
            label={t.metrics.aChats}
            value={fmt(a.chats)}
            accent="chat"
          />
          <Stat
            label={t.metrics.aAvgMessages}
            value={nf.format(a.avg_messages)}
            accent="chat"
          />
          <Stat label={t.metrics.aBlocks} value={fmt(a.blocks)} accent="ended" />
          <Stat
            label={t.metrics.aReports}
            value={fmt(a.reports)}
            accent="ended"
          />
          {/* The tail of the section is what went wrong or who left, and it
              reads as one block: blocks, reports, sign-outs and deletions all
              carry the same accent. */}
          <Stat
            label={t.metrics.aLogouts}
            value={fmt(a.logouts)}
            accent="ended"
          />
          <Stat
            label={t.metrics.aDeletes}
            value={fmt(a.deletes)}
            accent="ended"
          />
        </CardGrid>
      </Section>

      {/* "Quick nav" tiles were removed at the user's request: the same counts
          now ride as info-tone chips on the AdminNav tabs themselves, which
          beats a dedicated dashboard section since the numbers are then one
          glance away from every admin screen, not only this one. */}

      {/* "Signups" section was removed at the user's request — the 7-day
          signup count already lives in the Funnel section's first tile
          (`fSignups`), so a dedicated today/7d/30d trio was redundant. The
          drill-downs (`seg=new_today|new_7d|new_30d`) are still reachable
          from the users-list filter dropdown. */}

      {/* "Active users" (online_5m / active_today / active_7d) was removed at
          the user's request — the recency segs are still reachable from the
          users-list filter dropdown (?seg=online|active_today|active_7d). */}

      {/* "Availability" (available / unavailable / no-location / no-notif) and
          "Groups" (one total) were removed at the user's request. Availability
          is still a users-list filter (?avail=) and the groups total rides the
          nav tab's own chip, which is one glance away from every screen — a
          dashboard section for a single number was the weakest tile here. */}

      <Section title={t.sections.credits}>
        <CardGrid min="8.5rem">
          <Stat
            label={t.metrics.balanceTotal}
            value={fmt(m.credits.balance_total)}
          />
          <Stat
            label={t.metrics.heldTotal}
            value={fmt(m.credits.held_total)}
            accent="busy"
          />
          <Stat
            label={t.metrics.extraTotal}
            value={fmt(m.credits.extra_total)}
            accent="ok"
          />
          <Stat
            label={t.metrics.withExtra}
            value={fmt(m.credits.with_extra)}
            hint={t.hints.extraShare.replace("{pct}", String(extraShare))}
          />
        </CardGrid>
      </Section>
    </AdminShell>
  );
}
