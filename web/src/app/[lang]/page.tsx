import { requireViewerScope } from "@/lib/admin-auth";
import { readAdminEnv, envIsTest } from "@/lib/adminEnv";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "./_components/AdminShell";
import { Section, CardGrid, Stat } from "./_components/ui";
import { RealtimeRefresh } from "./_components/RealtimeRefresh";
import { parseRange, rangeSince } from "@/lib/range";
import { insightHref, insightSpec, type InsightMetric } from "@/lib/insight";

/**
 * The admin home screen: a hub that links to every other admin tab plus a
 * real-time product/business KPI snapshot for managers and the board.
 *
 * EVERY TILE IS A WINDOW, AND EVERY TILE IS A DOOR (user directive
 * 2026-08-15).
 *
 * The period picker moved out of the activity section's heading and into the
 * HEADER beside the environment switch, so it is no longer that section's
 * filter — it bounds every figure on the screen. ONE RULE, and it is what
 * makes a demographic split and an event count legible under one picker: a
 * tile counts what CAME INTO BEING inside the window. An account is dated by
 * when it was opened, a wallet by the account that holds it, a device by the
 * first time it was seen, an invitation by when it was sent, an ending by when
 * it ended. "All time" is therefore the state of the world today, which is
 * what the three snapshot sections used to show unconditionally.
 *
 * And every figure now opens the rows it counted (`/insight/<metric>`, one
 * screen for all of them — see `lib/insight.ts`). That reverses "NO TILE IS A
 * LINK" of 2026-08-02, and it is safe to reverse because the DESTINATION
 * changed: a tile used to deep-link into a working list with filters of its
 * own, which made a screen you read into one you could fall out of by brushing
 * a number. It now opens exactly what it counted, with one way back.
 *
 * Three RPCs feed it — `admin_dashboard_metrics` for the population and its
 * wallets, `admin_activity_metrics` for what happened, `admin_scan_metrics`
 * for the visitors — and all three take the same `p_since` and are bounded by
 * the environment the header switch is on.
 */

type Metrics = {
  demographics: {
    men: number;
    women: number;
    avg_age: number;
    os_ios: number;
    os_android: number;
  };
  /** What is left of the old fixed-recency block. The today / 7d / 30d trios
   * it used to carry are gone: the period picker asks that question now, and
   * a tile pinned to a week beside a picker set to a day is a second answer
   * nobody asked for. */
  users: {
    total: number;
    online_5m: number;
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
 * `admin_activity_metrics`. Kept separate from {@link Metrics} not because the
 * window treats the two differently — it bounds both now — but because these
 * are EVENTS and those are a POPULATION: an ending is dated by its own moment,
 * an account and the wallet it holds by the day the account was opened. */
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
/** The same three counts for the HOME PAGE, which is where the card's QR sends
 * people now that /scan is gone. `more` is always 0 here: it counted the link
 * OUT to the site, and on the site there is nowhere further to go. */
type SiteScan = { android: ScanRow; ios: ScanRow; desktop: ScanRow };
/** `admin_scan_metrics` still answers with the card's three platform keys at
 * the top level, all zero since the merge folded those devices into the site.
 * They are not read here and are not modelled; the RPC keeps them only so the
 * panel that is live until the next deploy goes on working. */
type Scan = { site: SiteScan };

const EMPTY_ROW: ScanRow = { devices: 0, download: 0, notify: 0, more: 0 };

const EMPTY: Metrics = {
  demographics: { men: 0, women: 0, avg_age: 0, os_ios: 0, os_android: 0 },
  users: { total: 0, online_5m: 0, with_location: 0 },
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

// EVERY TILE IS A LINK AGAIN (user directive 2026-08-15), reversing "no tile
// is a link" of 2026-08-02 — see the header for why the reversal is safe and
// `lib/insight.ts` for where each one goes. What the old rule was protecting
// against still stands and is not to be undone: a tile may not deep-link into
// a working LIST with filters of its own. It opens the rows it counted.

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

  // ONE WINDOW, HANDED TO ALL THREE. The picker used to move the middle RPC
  // alone, which is why the demographics and the wallet totals stood on the
  // same screen describing a different population from the one beside them.
  const since = rangeSince(range);
  const admin = createSupabaseAdmin();
  const [{ data: metricsData }, { data: activityData }, { data: scanData }, meRes] =
    await Promise.all([
      admin.rpc("admin_dashboard_metrics", {
        p_user_ids: scopedUserIds,
        p_is_test: envIsTest(env),
        p_since: since,
      }),
      admin.rpc("admin_activity_metrics", {
        p_since: since,
        p_is_test: envIsTest(env),
        p_user_ids: scopedUserIds,
      }),
      admin.rpc("admin_scan_metrics", { p_since: since }),
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
  const scanRaw = (scanData ?? {}) as Record<string, Partial<ScanRow>> & {
    site?: Record<string, Partial<ScanRow>>;
  };
  const siteRaw = scanRaw.site ?? {};
  const scan: Scan = {
    site: {
      android: { ...EMPTY_ROW, ...(siteRaw.android ?? {}) },
      ios: { ...EMPTY_ROW, ...(siteRaw.ios ?? {}) },
      desktop: { ...EMPTY_ROW, ...(siteRaw.desktop ?? {}) },
    },
  };
  // A device is counted once per platform, so the three add up to the unique
  // total without any risk of counting a visitor twice.
  const SITE_PLATFORMS = ["android", "ios", "desktop"] as const;
  const siteTotal = SITE_PLATFORMS.reduce(
    (acc, k) => ({
      devices: acc.devices + scan.site[k].devices,
      download: acc.download + scan.site[k].download,
      notify: acc.notify + scan.site[k].notify,
      more: 0,
    }),
    { ...EMPTY_ROW },
  );

  const nf = new Intl.NumberFormat(locale);
  const fmt = (n: number) => nf.format(n ?? 0);
  /** The per-platform line under a site tile. One template, one accessor, so
   * the visit split and the download split can never be written differently. */
  const splitHint = (template: string, pick: (row: ScanRow) => number) =>
    SITE_PLATFORMS.reduce(
      (line, k) => line.replace(`{${k}}`, fmt(pick(scan.site[k]))),
      template,
    );
  const extraShare =
    m.users.total > 0
      ? Math.round((m.credits.with_extra / m.users.total) * 100)
      : 0;

  /**
   * ONE TILE, STATED ONCE. Everything that is the same for all of them lives
   * here — the label is the dictionary entry under the metric's own key, the
   * accent and the destination come out of the registry — so a tile is a
   * metric key and a number, and no call site can give a figure a colour its
   * drill-down does not share or a door that goes somewhere else.
   */
  const tile = (metric: InsightMetric, value: string, hint?: string) => (
    <Stat
      key={metric}
      label={t.metrics[metric]}
      value={value}
      hint={hint}
      href={insightHref(metric, range)}
      accent={insightSpec(metric).tone}
    />
  );
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
    <AdminShell dict={d} active="dashboard" userLabel={userLabel} range={range}>
      <RealtimeRefresh
        tables="users,groups,user_groups"
        channel="admin-dashboard"
      />
      <div>
        <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.subtitle}</p>
        {/* THE WINDOW IS STATED ONCE, HERE, and no section repeats it. It used
            to be the activity section's own hint, which is where it belonged
            while it was that section's filter; it governs the whole screen
            now, so it stands under the screen's title, next to the picker that
            sets it. */}
        <p className="mt-1 text-xs font-medium text-foreground/70">
          {t.range.hint[range]}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.updated.replace("{time}", updatedTime)}
        </p>
      </div>

      {/* The home page, above everything the app itself reports: this is the
          step BEFORE an account exists, so it leads. It is where the printed
          card's QR sends people now that /scan is gone, and where every
          forwarded link lands, so it is the widest mouth the product has — and
          the devices the cards brought in through /scan were folded into it
          rather than left as a bucket that can never move again.

          THREE NUMBERS, EACH ITS OWN TILE. What a device DID is the question
          worth asking, so pressing download is a figure in its own right and
          not a footnote under the visit count; the platform split moved into
          the hints, where a breakdown belongs. ("How many opened the site" is
          gone with /scan — the site cannot ask that about itself.)

          PRODUCTION ONLY (user directive 2026-08-13). Every other block on this
          screen is drawn twice, once per world, because the same question has a
          different answer in each. This one does not: these are real visitors
          to one public page, so the same figure standing in the test view would
          be the real world's number wearing the test world's frame. The switch
          therefore does not scope this block — it decides whether it is on the
          screen at all. */}
      {scope.kind === "admin" && !envIsTest(env) ? (
        <Section title={t.sections.site} hint={t.hints.site}>
          <CardGrid min="8.5rem">
            {tile(
              "siteTotal",
              fmt(siteTotal.devices),
              splitHint(t.hints.siteTotal, (row) => row.devices),
            )}
            {tile(
              "siteDownload",
              fmt(siteTotal.download),
              splitHint(t.hints.siteDownload, (row) => row.download),
            )}
            {/* Only an iPhone is ever offered this, so it needs no split — what
                it needs is the denominator it is a share of. */}
            {tile(
              "siteNotify",
              fmt(siteTotal.notify),
              t.hints.siteNotify.replace("{ios}", fmt(scan.site.ios.devices)),
            )}
          </CardGrid>
        </Section>
      ) : null}

      {/* WHO IS HERE — and under a window, who ARRIVED. Every tile is a fact
          about the accounts opened inside the period, so the section is the
          same split it always was, asked of a smaller set of people. At "all
          time" it is the population itself, which is what this block used to
          be unconditionally. */}
      <Section title={t.sections.demographics}>
        <CardGrid min="8.5rem">
          {/* The whole first, then how it splits — every tile beside it is a
              share of this one, so it leads. */}
          {tile("total", fmt(m.users.total))}
          {tile("men", fmt(m.demographics.men))}
          {tile("women", fmt(m.demographics.women))}
          {/* An average has rows behind it too: the door opens the people it
              was averaged over, each with their own age on the row. */}
          {tile("avgAge", fmt(m.demographics.avg_age))}
          {tile("osIos", fmt(m.demographics.os_ios))}
          {tile("osAndroid", fmt(m.demographics.os_android))}
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
      <Section title={t.sections.activity}>
        <CardGrid min="8.5rem">
          {/* Who showed up at all. Every tile beside it is something a subset
              of these people did, so it leads. */}
          {tile("aActive", fmt(a.active))}
          {tile("aAccounts", fmt(a.accounts))}
          {tile("aProfiles", fmt(a.profiles))}
          {/* The social graph, before the game: `friend_links` is already one
              row per pair, so a friendship counts once by construction. A
              circle join counts per person, which is the question being asked
              — how many joinings happened, not how many circles grew. */}
          {tile("aFriendships", fmt(a.friendships))}
          {tile("aMemberships", fmt(a.memberships))}
          {/* THE FOUR INVITATION TILES OPEN ONE LIST under four filters, which
              is what makes the drill-down worth having here more than
              anywhere: a count cannot say who invited whom, and it certainly
              cannot say how long the thing stood before it was answered. */}
          {tile("aInvites", fmt(a.invites_sent))}
          {tile("aDeclined", fmt(a.invites_declined))}
          {tile("aCancelled", fmt(a.invites_cancelled))}
          {tile("aExpired", fmt(a.invites_expired))}
          {tile("aChats", fmt(a.chats))}
          {tile("aAvgMessages", nf.format(a.avg_messages))}
          {tile("aBlocks", fmt(a.blocks))}
          {tile("aReports", fmt(a.reports))}
          {/* The tail of the section is what went wrong or who left, and it
              reads as one block: blocks, reports, sign-outs and deletions all
              carry the same accent. The last of them opens the ARCHIVE — the
              profile that stood behind each deleted account, for as long as
              the archive still holds it. */}
          {tile("aLogouts", fmt(a.logouts))}
          {tile("aDeletes", fmt(a.deletes))}
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

      {/* THE WALLETS OF THOSE SAME ACCOUNTS. A wallet has no birthday of its
          own — it is the account's — which is what lets one window rule cover
          both this section and the split above it. Each tile opens the people
          holding that money, with the amount on the row. */}
      <Section title={t.sections.credits}>
        <CardGrid min="8.5rem">
          {tile("balanceTotal", fmt(m.credits.balance_total))}
          {tile("heldTotal", fmt(m.credits.held_total))}
          {tile("extraTotal", fmt(m.credits.extra_total))}
          {tile(
            "withExtra",
            fmt(m.credits.with_extra),
            t.hints.extraShare.replace("{pct}", String(extraShare)),
          )}
        </CardGrid>
      </Section>
    </AdminShell>
  );
}
