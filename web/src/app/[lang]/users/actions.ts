"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// The middleware rewrites /users -> /[lang]/users, so this is
// the route segment to revalidate after the reset so the users list
// reflects the freshly-reset rows.
const ADMIN_USERS_PATH = "/[lang]/users";
const USER_PATH = "/[lang]/users/[userId]";

export type ResetResult =
  | { ok: true; users: number }
  | { ok: false };

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
  if (cleanupError) {
    console.error("[deleteUser] app_delete_cleanup failed:", cleanupError.message);
    return { ok: false };
  }

  await admin.from("log").delete().eq("user_id", userId);
  await admin
    .from("restrictions")
    .delete()
    .or(`user_id.eq.${userId},other_id.eq.${userId}`);

  // The auth delete is the step that used to fail silently: it runs as
  // supabase_auth_admin, so anything the cascade fires (the comm_* triggers)
  // must not need grants of its own. Log the reason — the UI only has one
  // generic failure string.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[deleteUser] auth delete failed:", error.message);
    return { ok: false };
  }

  revalidatePath(ADMIN_USERS_PATH, "page");
  return { ok: true };
}

/**
 * Release ONE page of a single user to its default state via the
 * app_admin_release_page1 / app_admin_release_page2 RPCs — a state-aware
 * teardown that also repairs the counterparty so no related user is left
 * orphaned. The sibling page, credits, availability and visibility are
 * untouched.
 */
export async function releaseUserPage(
  userId: string,
  page: 1 | 2,
): Promise<{ ok: boolean }> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  if (!userId) throw new Error("missing_args");
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc(
    page === 1 ? "app_admin_release_page1" : "app_admin_release_page2",
    { p_user_id: userId },
  );
  if (error) return { ok: false };
  revalidatePath(USER_PATH, "page");
  revalidatePath(ADMIN_USERS_PATH, "page");
  return { ok: (data as { ok?: boolean } | null)?.ok === true };
}

/**
 * Admin-only direct override of a user's hearts wallet. Routes to
 * `app_admin_set_credits(p_user_id, p_balance, p_extra)` which validates
 * non-negative ints under FOR UPDATE and preserves the other credits
 * fields (held / granted_on / next_grant_at / bought_on). Used by the
 * user-detail page's hearts editor — group managers don't see it.
 */
export async function setUserHearts(
  userId: string,
  balance: number,
  extra: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  if (!userId) throw new Error("missing_args");
  if (!Number.isInteger(balance) || balance < 0) return { ok: false, error: "bad_balance" };
  if (!Number.isInteger(extra)   || extra   < 0) return { ok: false, error: "bad_extra" };
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("app_admin_set_credits", {
    p_user_id: userId,
    p_balance: balance,
    p_extra:   extra,
  });
  if (error) return { ok: false, error: error.message };
  const result = data as { ok?: boolean; error?: string } | null;
  if (result?.error) return { ok: false, error: result.error };
  revalidatePath(USER_PATH, "page");
  return { ok: result?.ok === true };
}

/**
 * Move users between the two matching environments.
 *
 * `users.is_test` partitions the matching pool: a test user is matchable ONLY
 * with other test users and a normal user ONLY with normal users, enforced by
 * a single unconditional clause in public.others() (the sole candidacy
 * chokepoint). The flag is one set-based UPDATE for the whole selection — no
 * RPC and no per-user loop.
 *
 * Flipping it moves the user across the boundary, so any live link they hold
 * may now straddle the two pools. Both pages are released afterwards:
 * app_admin_release_page1/2 are state-aware and repair the counterparty
 * (detach from the watched user's viewer array, close a pending invite, end a
 * chat, kick viewers, refund held hearts), so nothing dangles. A failed
 * teardown is non-fatal — the flag itself is already committed and is what
 * governs future matching.
 *
 * Groups they OWN move with them. Since 20260727120000 the partition also
 * covers communities, and a group carries its own `groups.is_test` (stamped
 * from its creator) because it cannot be derived from the owner — five legacy
 * groups have none. Leaving the groups behind would strand them on the far side
 * of the boundary from their owner: the owner could no longer find their own
 * group in search, and members on the new side could not redeem its code.
 * Membership rows need no fixing — they are edges, and both endpoints are now
 * partition-checked on every future write.
 */
async function flipTest(
  admin: ReturnType<typeof createSupabaseAdmin>,
  ids: string[],
  value: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin
    .from("users")
    .update({ is_test: value })
    .in("user_id", ids);
  if (error) return { ok: false, error: error.message };
  // Owned groups follow the owner across the boundary. Non-fatal on failure for
  // the same reason as the page teardown below: the user flag is already
  // committed and is what governs matching.
  const { error: groupError } = await admin
    .from("groups")
    .update({ is_test: value })
    .in("owner_id", ids);
  if (groupError) console.warn("[flipTest] owned-group partition flip failed:", groupError.message);
  for (const id of ids) {
    try {
      await admin.rpc("app_admin_release_page1", { p_user_id: id });
      await admin.rpc("app_admin_release_page2", { p_user_id: id });
    } catch {
      /* non-fatal: the partition is already in effect for future matching */
    }
  }
  return { ok: true };
}

/** Admin-only per-user test-environment flag. See flipTest. */
export async function setUserTest(
  userId: string,
  value: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  if (!userId) throw new Error("missing_args");
  const result = await flipTest(createSupabaseAdmin(), [userId], value);
  if (!result.ok) return result;
  revalidatePath(USER_PATH, "page");
  revalidatePath(ADMIN_USERS_PATH, "page");
  return { ok: true };
}

/** A bulk operation requested from the users-list multi-selection. */
export type BulkAction =
  | { kind: "reset" }
  | { kind: "delete" }
  | { kind: "release"; page: 1 | 2 }
  | { kind: "assignGroup"; groupId: string }
  | { kind: "removeGroup"; groupId: string }
  | { kind: "expandFilters" }
  | { kind: "setTest"; value: boolean };

/**
 * Apply one action to every selected user. Each user is processed
 * independently — one failure is skipped, never fatal — and `count` reports
 * how many succeeded. The acting admin is never removed by a bulk delete. The
 * users path is revalidated once at the end. Group membership is purely
 * organisational (it no longer gates availability), so it needs no resync.
 */
export async function bulkUserAction(
  userIds: string[],
  action: BulkAction,
): Promise<{ ok: boolean; count: number }> {
  const admin0 = await getAdminUser();
  if (!admin0) throw new Error("Unauthorized");
  const ids = [...new Set((userIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: true, count: 0 };
  const admin = createSupabaseAdmin();
  let count = 0;

  // "Expand filters" is a single set-based UPDATE for the whole selection
  // (widen distance to unlimited + age range to the per-user app bounds +
  // clear family/kids settings), so it short-circuits the per-user loop.
  if (action.kind === "expandFilters") {
    const { data, error } = await admin.rpc("app_admin_expand_filters", {
      p_user_ids: ids,
    });
    if (error) return { ok: false, count: 0 };
    revalidatePath(ADMIN_USERS_PATH, "page");
    revalidatePath(USER_PATH, "page");
    return {
      ok: true,
      count: Number((data as { users?: number } | null)?.users ?? 0),
    };
  }

  // Moving users between matching environments is likewise set-based.
  if (action.kind === "setTest") {
    const result = await flipTest(admin, ids, action.value);
    if (!result.ok) return { ok: false, count: 0 };
    revalidatePath(ADMIN_USERS_PATH, "page");
    revalidatePath(USER_PATH, "page");
    return { ok: true, count: ids.length };
  }

  for (const id of ids) {
    try {
      if (action.kind === "reset") {
        const { error } = await admin.rpc("app_admin_reset_user", {
          p_user_id: id,
        });
        if (!error) count++;
      } else if (action.kind === "delete") {
        if (id === admin0.id) continue; // never delete the acting admin
        const { error: ce } = await admin.rpc("app_delete_cleanup", {
          me_id: id,
        });
        if (ce) continue;
        await admin.from("log").delete().eq("user_id", id);
        await admin
          .from("restrictions")
          .delete()
          .or(`user_id.eq.${id},other_id.eq.${id}`);
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) console.error("[bulkUserAction] auth delete failed:", id, error.message);
        else count++;
      } else if (action.kind === "release") {
        const { error } = await admin.rpc(
          action.page === 1
            ? "app_admin_release_page1"
            : "app_admin_release_page2",
          { p_user_id: id },
        );
        if (!error) count++;
      } else if (action.kind === "assignGroup") {
        const { error } = await admin.from("user_groups").upsert(
          { user_id: id, group_id: action.groupId },
          { onConflict: "user_id,group_id", ignoreDuplicates: true },
        );
        if (!error) count++;
      } else if (action.kind === "removeGroup") {
        const { error } = await admin
          .from("user_groups")
          .delete()
          .eq("user_id", id)
          .eq("group_id", action.groupId);
        if (!error) count++;
      }
    } catch {
      /* skip this user, continue with the rest */
    }
  }

  revalidatePath(ADMIN_USERS_PATH, "page");
  revalidatePath(USER_PATH, "page");
  return { ok: true, count };
}
