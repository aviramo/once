import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { AdminNav } from "./AdminNav";
import { RealtimeRefresh } from "./RealtimeRefresh";

/**
 * Async server shell wrapping every authenticated admin screen — logo header,
 * nav (with a live pending-reports badge fetched once here, so every screen
 * carries it), and the main content area. Lives in its own file (not ui.tsx)
 * because the server-only Supabase admin client must never be reachable from a
 * file that client components import — ui.tsx is one of those.
 */

type Active = "dashboard" | "users" | "roles" | "reports" | "areas";

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
  // Per-tab badges in the nav. Fetched here (not per-page) so every admin
  // screen carries them.
  //   - `reports` (alert / rose): how many reports need handling — user
  //     research goal is to catch a fresh report within 24h without having to
  //     open the reports tab.
  //   - `users` / `roles` / `areas` (info / muted): catalog totals — these
  //     replace the former dashboard "quick nav" tiles. Showing the count
  //     next to the destination tab itself makes the tiles redundant and
  //     keeps the count one glance away from any admin screen.
  // Areas use `active` count (matches the dashboard's earlier nav tile, which
  // surfaced the same number). Groups use `total` (disabled groups are rare
  // and still relevant to "how many groups exist").
  // All four are cheap head-count queries; parallelised.
  const admin = createSupabaseAdmin();
  const [
    { count: pendingReportsCount },
    { count: usersTotalCount },
    { count: groupsTotalCount },
    { count: areasActiveCount },
  ] = await Promise.all([
    admin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("handled", false),
    admin.from("users").select("user_id", { count: "exact", head: true }),
    admin.from("groups").select("id", { count: "exact", head: true }),
    admin
      .from("areas")
      .select("id", { count: "exact", head: true })
      .eq("mode", "active"),
  ]);
  const pendingReports = pendingReportsCount ?? 0;
  const usersTotal = usersTotalCount ?? 0;
  const groupsTotal = groupsTotalCount ?? 0;
  const areasActive = areasActiveCount ?? 0;

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
        tables="reports,groups,areas"
        channel="admin-shell-counts"
      />
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
              O
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-base font-bold tracking-tight">Once</span>
              <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
                {dict.dashboardTitle}
              </span>
            </span>
          </Link>
          <AdminNav
            active={active}
            labels={{
              dashboard: dict.nav.dashboard,
              users: dict.nav.users,
              roles: dict.nav.roles,
              reports: dict.nav.reports,
              areas: dict.nav.areas,
              signOut: dict.signOut,
            }}
            userLabel={userLabel}
            badges={{
              reports: pendingReports,
              users: { count: usersTotal, tone: "info" },
              roles: { count: groupsTotal, tone: "info" },
              areas: { count: areasActive, tone: "info" },
            }}
          />
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
    </div>
  );
}
