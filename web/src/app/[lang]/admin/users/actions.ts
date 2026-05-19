"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerResync } from "@/lib/resync";

// The middleware rewrites /admin/users -> /[lang]/admin/users, so this is
// the route segment to revalidate after the reset so the users list
// reflects the freshly-reset rows.
const ADMIN_USERS_PATH = "/[lang]/admin/users";
const USER_PATH = "/[lang]/admin/users/[userId]";

export type ResetResult =
  | { ok: true; users: number }
  | { ok: false };

/**
 * Role-scoped admin reset. The users-list control opens a role checklist;
 * ONLY users holding at least one of the selected roles are reset. Delegates
 * to the `app_admin_reset(p_group_ids uuid[])` overload, which clears those
 * users' chat/log/restrictions and rebuilds their relations WHILE recomputing
 * relations.availability via user_availability(user_id, location) — so the geo
 * + role-disable gate stays correct immediately after the reset.
 *
 * Empty selection is a no-op (returns 0); it never falls through to a global
 * reset (the RPC guards this too).
 */
export async function resetUsersByRoles(
  roleIds: string[],
): Promise<ResetResult> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const ids = (roleIds ?? []).filter(Boolean);
  if (ids.length === 0) return { ok: true, users: 0 };
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("app_admin_reset", {
    p_group_ids: ids,
  });
  if (error) return { ok: false };
  revalidatePath(ADMIN_USERS_PATH, "page");
  const users = Number((data as { users?: number } | null)?.users ?? 0);
  return { ok: true, users };
}

/**
 * Remove a user's pending join request without approving them. Clears
 * relations.join_request and recomputes relations.availability via the
 * app_admin_clear_join_request RPC, so the user drops out of the
 * ?seg=join_requested queue and — since they stay gated (not in any enabled
 * group) — their app reverts to the "request to join" CTA (pre-request state).
 *
 * triggerResync mirrors the rest of the admin mutations (Realtime + push
 * reconcile); the cron resync is the safety net if the edge call is slow.
 */
export async function clearJoinRequest(userId: string): Promise<void> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  if (!userId) throw new Error("missing_args");
  const admin = createSupabaseAdmin();
  const { error } = await admin.rpc("app_admin_clear_join_request", {
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(USER_PATH, "page");
  revalidatePath(ADMIN_USERS_PATH, "page");
  await triggerResync();
}
