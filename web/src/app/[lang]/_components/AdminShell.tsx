import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireViewerScope } from "@/lib/admin-auth";
import { readAdminEnv, envIsTest } from "@/lib/adminEnv";
import { AdminNav, AdminBottomBar } from "./AdminNav";
import { RealtimeRefresh } from "./RealtimeRefresh";
import { EnvSwitch } from "./EnvSwitch";

/**
 * Async server shell wrapping every authenticated admin screen — logo header,
 * nav (with a live pending-reports badge fetched once here, so every screen
 * carries it), and the main content area. Lives in its own file (not ui.tsx)
 * because the server-only Supabase admin client must never be reachable from a
 * file that client components import — ui.tsx is one of those.
 */

type Active = "dashboard" | "users" | "groups" | "reports";

type ShellProps = {
  dict: Dictionary["admin"];
  active: Active;
  children: ReactNode;
  /** Sub-page back link target (omitted on the top-level pages). */
  backHref?: string;
  userLabel?: string;
};

export async function AdminShell({
  dict,
  active,
  children,
  backHref,
  userLabel,
}: ShellProps) {
  // Resolve viewer scope so the nav can hide tabs a manager can't reach AND
  // scope the badge counts. Admins see every tab; managers see only users +
  // roles (the two screens that are scope-aware). The per-page guards still
  // apply — this is a UX affordance, not the security gate.
  const scope = await requireViewerScope();
  const isAdmin = scope.kind === "admin";
  // Manager scope: only the users in groups they manage, and only those
  // groups themselves. Empty user list is legitimate (a manager can manage a
  // group with zero members) and must collapse to a `0` badge rather than a
  // misleading global count.
  const managerUserIds = scope.kind === "manager" ? scope.userIds : null;
  const managerGroupIds = scope.kind === "manager" ? scope.groupIds : null;
  // Per-tab badges in the nav. Fetched here (not per-page) so every admin
  // screen carries them. All four counts belong to the selected environment, and two of them
  // (reports / bugs) carry no `is_test` of their own — they are scoped through
  // the user at their end, which PostgREST cannot express without an FK those
  // tables deliberately do not have. So it is one RPC rather than four
  // queries, and the manager scope rides in as its two id arrays.
  const env = await readAdminEnv();
  const admin = createSupabaseAdmin();
  const { data: countsData } = await admin.rpc("admin_env_counts", {
    p_is_test: envIsTest(env),
    p_user_ids: managerUserIds,
    p_group_ids: managerGroupIds,
  });
  const counts = (countsData ?? {}) as {
    users?: number;
    groups?: number;
    reports_pending?: number;
  };
  const usersTotal = counts.users ?? 0;
  const groupsTotal = counts.groups ?? 0;
  // The moderation queues are an admin metric; their tabs are hidden from
  // managers, so a manager simply never sees the number.
  const pendingReports = isAdmin ? (counts.reports_pending ?? 0) : 0;

  // Stated once and handed to both renderings: the header pills and the mobile
  // bottom bar are the same set of destinations carrying the same counts, and
  // they are two components only because a `fixed` bar may not be a child of a
  // `backdrop-blur` header (see AdminNav).
  const nav = {
    active,
    visibleKeys: (isAdmin
      ? ["dashboard", "users", "groups", "reports"]
      : ["dashboard", "users", "groups"]) as Active[],
    labels: {
      dashboard: dict.nav.dashboard,
      users: dict.nav.users,
      groups: dict.nav.groups,
      reports: dict.nav.reports,
      signOut: dict.signOut,
    },
    badges: {
      reports: pendingReports,
      users: { count: usersTotal, tone: "info" as const },
      groups: { count: groupsTotal, tone: "info" as const },
    },
  };

  return (
    // overflow-x-clip guards against a child momentarily wider than the
    // viewport without introducing a scroll container (the sticky header and
    // the fixed bottom bar keep working).
    <div className="min-h-screen overflow-x-clip bg-canvas">
      {/* Live nav-badges: re-fetch when any of the source tables change so the
          indicators never lie, regardless of which admin page is open. Users
          are intentionally NOT subscribed here — last_seen churn would force a
          router refresh constantly; the users count re-reads on every nav
          anyway (server component) which is fresh enough. */}
      <RealtimeRefresh
        tables="reports,groups"
        channel="admin-shell-counts"
      />
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
          {/* THE HEADER GIVES AT THE WORDMARK, NEVER AT THE SWITCH. This row
              does not wrap and the shell clips its overflow, so on a narrow
              phone something has to yield: the branding is the one thing here
              that says nothing an operator needs, so the link shrinks and its
              text truncates while EnvSwitch stays `shrink-0`. The mark itself
              never shrinks — it is the way home. */}
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              O
            </span>
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate text-base font-bold tracking-tight">
                Once
              </span>
              <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                {dict.dashboardTitle}
              </span>
            </span>
          </Link>
          <EnvSwitch env={env} labels={dict.env} />
          <AdminNav {...nav} userLabel={userLabel} />
        </div>
      </header>
      {/* pb-28 clears the fixed mobile bottom bar; the reveal runs once a load. */}
      <main className="admin-rise mx-auto max-w-6xl px-4 pb-28 pt-5 sm:px-6 sm:pb-12 sm:pt-7">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {dict.back}
          </Link>
        ) : null}
        {children}
      </main>
      {/* Outside the header AND outside <main>: it is `fixed`, and both of
          those would become its containing block (backdrop-filter / a
          transform). */}
      <AdminBottomBar {...nav} />
    </div>
  );
}
