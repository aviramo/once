import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireViewerScope } from "@/lib/admin-auth";
import { AdminNav } from "./AdminNav";
import { RealtimeRefresh } from "./RealtimeRefresh";

/**
 * Async server shell wrapping every authenticated admin screen — logo header,
 * nav (with a live pending-reports badge fetched once here, so every screen
 * carries it), and the main content area. Lives in its own file (not ui.tsx)
 * because the server-only Supabase admin client must never be reachable from a
 * file that client components import — ui.tsx is one of those.
 */

type Active = "dashboard" | "users" | "groups" | "reports" | "bugs";

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
  // screen carries them. `users` / `roles` badges are scoped to the manager
  // when applicable; `reports` is an admin-only metric (its tab is hidden
  // from managers via `visibleKeys`, so skipping the query is both correct
  // and saves the round trip).
  const admin = createSupabaseAdmin();
  const usersQuery = managerUserIds === null
    ? admin.from("users").select("user_id", { count: "exact", head: true })
    : managerUserIds.length === 0
      ? null
      : admin
          .from("users")
          .select("user_id", { count: "exact", head: true })
          .in("user_id", managerUserIds);
  const groupsQuery = managerGroupIds === null
    ? admin.from("groups").select("id", { count: "exact", head: true })
    : admin
        .from("groups")
        .select("id", { count: "exact", head: true })
        .in("id", managerGroupIds);
  const [
    usersResult,
    groupsResult,
    pendingReportsResult,
    pendingBugsResult,
  ] = await Promise.all([
    usersQuery ?? Promise.resolve({ count: 0 }),
    groupsQuery,
    isAdmin
      ? admin
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("handled", false)
      : Promise.resolve({ count: 0 }),
    isAdmin
      ? admin
          .from("bug_reports")
          .select("id", { count: "exact", head: true })
          .eq("handled", false)
      : Promise.resolve({ count: 0 }),
  ]);
  const usersTotal = usersResult.count ?? 0;
  const groupsTotal = groupsResult.count ?? 0;
  const pendingReports = pendingReportsResult.count ?? 0;
  const pendingBugs = pendingBugsResult.count ?? 0;

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
        tables="reports,bug_reports,groups"
        channel="admin-shell-counts"
      />
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2">
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
            visibleKeys={
              isAdmin
                ? ["dashboard", "users", "groups", "reports", "bugs"]
                : ["dashboard", "users", "groups"]
            }
            labels={{
              dashboard: dict.nav.dashboard,
              users: dict.nav.users,
              groups: dict.nav.groups,
              reports: dict.nav.reports,
              bugs: dict.nav.bugs,
              signOut: dict.signOut,
            }}
            userLabel={userLabel}
            badges={{
              reports: pendingReports,
              bugs: pendingBugs,
              users: { count: usersTotal, tone: "info" },
              groups: { count: groupsTotal, tone: "info" },
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
