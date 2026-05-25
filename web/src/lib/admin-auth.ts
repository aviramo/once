import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Single source of truth for admin-panel access.
 *
 * Two viewer roles are recognised:
 *
 *   - "admin"   — JWT `app_metadata.role === 'admin'`. Full power, sees
 *                 everything, can mutate everything.
 *   - "manager" — has >=1 row in `public.group_managers`. View-only access,
 *                 scoped to the union of users who belong to any group they
 *                 manage. May promote a fellow member of one of their managed
 *                 groups to group_manager (the only write they can do).
 *
 * Anyone signed in with neither is gated out (the sign-in form re-renders
 * with `error=not_admin`). Mutations require an admin scope; surfaces that
 * exist for both call {@link requireViewerScope} and branch on `scope.kind`.
 *
 * Why the manager checks go through the service-role client:
 * `is_group_manager` / `managed_group_ids` / `managed_user_ids` are
 * `SECURITY DEFINER` with EXECUTE revoked from anon/authenticated by design
 * — they read tables a regular user can't see. The auth check itself
 * (`supabase.auth.getUser()`) still uses the cookie-bound server client to
 * verify the session; only the membership/scope reads run as admin.
 */

export type ViewerScope =
  | { user: User; kind: "admin" }
  | {
      user: User;
      kind: "manager";
      /** Groups this user manages, in seniority order (oldest grant first). */
      groupIds: string[];
      /** Union of every member across `groupIds`. The set of users this
       * manager is allowed to view in any admin screen. */
      userIds: string[];
    };

/** Legacy gate kept for callers that only need the admin path. Returns the
 * signed-in admin user or null; does NOT recognise group managers. New code
 * should prefer {@link getViewerScope} or {@link requireAdminUser}. */
export async function getAdminUser() {
  const scope = await getViewerScope();
  return scope?.kind === "admin" ? scope.user : null;
}

/**
 * Resolve the signed-in user's panel scope. Returns:
 *   - `{kind:'admin', user}` if JWT role = admin;
 *   - `{kind:'manager', user, groupIds, userIds}` if they manage >=1 group;
 *   - `null` otherwise (signed-out or signed-in without either role).
 */
export async function getViewerScope(): Promise<ViewerScope | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  if (role === "admin") return { user, kind: "admin" };

  // Manager check: two RPCs in parallel via the service-role client. The
  // helpers are SECURITY DEFINER + revoked from anon/authenticated by design.
  const admin = createSupabaseAdmin();
  const [{ data: groupIdsData }, { data: userIdsData }] = await Promise.all([
    admin.rpc("managed_group_ids", { p_user_id: user.id }),
    admin.rpc("managed_user_ids", { p_user_id: user.id }),
  ]);
  const groupIds = (groupIdsData ?? []) as string[];
  if (groupIds.length === 0) return null;
  const userIds = (userIdsData ?? []) as string[];
  return { user, kind: "manager", groupIds, userIds };
}

/** Hard-require an admin viewer. Redirects to the login page with the
 * `not_admin` error otherwise. Use at the top of every server action and
 * every screen that managers must not reach. */
export async function requireAdminUser(): Promise<User> {
  const scope = await getViewerScope();
  if (!scope) redirect("/admin/login");
  if (scope.kind !== "admin") redirect("/admin/login?error=not_admin");
  return scope.user;
}

/** Hard-require either an admin OR a manager scope. Redirects to login
 * otherwise. Use at the top of every screen managers are allowed to see. */
export async function requireViewerScope(): Promise<ViewerScope> {
  const scope = await getViewerScope();
  if (!scope) redirect("/admin/login");
  return scope;
}
