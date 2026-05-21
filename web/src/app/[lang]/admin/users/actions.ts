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
 * Single-user reset. The user-detail "danger zone" exposes this alongside
 * deleteUser. Delegates to the app_admin_reset_user(p_user_id) RPC — the
 * per-user counterpart of resetUsersByRoles' role-scoped reset: it wipes the
 * user's chat/log/restrictions and rebuilds relations to a clean slate while
 * recomputing availability + credits. The user keeps existing (only their
 * state is wiped), so partners' snapshots stay fresh on their own — no
 * teardown / resync needed.
 */
export async function resetUser(userId: string): Promise<ResetResult> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  if (!userId) throw new Error("missing_args");
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("app_admin_reset_user", {
    p_user_id: userId,
  });
  if (error) return { ok: false };
  revalidatePath(USER_PATH, "page");
  revalidatePath(ADMIN_USERS_PATH, "page");
  const users = Number((data as { users?: number } | null)?.users ?? 0);
  return { ok: true, users };
}

/**
 * Permanently delete a user. This is irreversible.
 *
 *  1. app_delete_cleanup tears down every live link partners hold on this
 *     user (kicks their page1/page2-pending, drops them from viewer arrays) —
 *     mandatory before the row vanishes, otherwise partners point at a
 *     non-existent user and app_refresh_snapshots can never refresh them.
 *  2. log rows are removed explicitly — log.user_id has an ON DELETE NO ACTION
 *     FK, so they would otherwise block the users-row delete.
 *  3. restrictions (no FK) are cleared both directions so no stale cooldown
 *     lingers against a deleted account.
 *  4. Deleting the auth user cascades public.users -> chat + user_groups
 *     (both ON DELETE CASCADE). reports are intentionally kept (no FK) so the
 *     moderation record survives account deletion.
 *
 * Refuses to delete the acting admin's own account.
 */
export async function deleteUser(
  userId: string,
): Promise<{ ok: boolean }> {
  const admin0 = await getAdminUser();
  if (!admin0) throw new Error("Unauthorized");
  if (!userId) throw new Error("missing_args");
  if (admin0.id === userId) throw new Error("cannot_delete_self");

  const admin = createSupabaseAdmin();

  const { error: cleanupError } = await admin.rpc("app_delete_cleanup", {
    me_id: userId,
  });
  if (cleanupError) return { ok: false };

  await admin.from("log").delete().eq("user_id", userId);
  await admin
    .from("restrictions")
    .delete()
    .or(`user_id.eq.${userId},other_id.eq.${userId}`);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false };

  revalidatePath(ADMIN_USERS_PATH, "page");
  return { ok: true };
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
