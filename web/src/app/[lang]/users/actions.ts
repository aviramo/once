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
 * Move users between the matching environments.
 *
 * WRITING `is_test` HERE DID NOTHING, SILENTLY. Since the three-world
 * migration (2026-08-13) the world an account lives in is `users.env`, and
 * `is_test` is DERIVED from it: `_users_env_stamp`, a BEFORE trigger on
 * `users`, ends with `NEW.is_test := (NEW.env <> 'il')` on every insert and
 * every update. So this function's old set-based `update({is_test})` was
 * overwritten inside the same statement that made it, returned no error, and
 * left the account exactly where it was - which is why an operator could press
 * the toggle, see it succeed, and watch the user stay in production. The same
 * was true of the owned-group update: `groups.is_test` is stamped from the
 * owner by `_group_stamp_is_test`.
 *
 * `app_admin_set_env` is the one supported way, and it is not a bare UPDATE:
 * it releases both boards through the admin RPCs that repair the counterparty
 * (a live watch, a pending invitation or an open chat may never straddle two
 * worlds - that is what public.others() partitions to prevent), moves the
 * circles the account OWNS with it, and re-stamps `data.env_locked_at` so no
 * later GPS fix can undo the decision. Everything the old body did by hand, in
 * one transaction that cannot half-apply.
 *
 * WHICH world a test user goes to is `dev`: the Hebrew test cast and the
 * developer's own devices. `review` is the App Store reviewers' world and is
 * not something a panel toggle should drop somebody into. Untoggling returns
 * the account to `il`, production.
 *
 * One call per user rather than one statement for the selection: the RPC is
 * per-account by nature (it releases that account's boards), and a failure on
 * one must not silently take the rest of a bulk selection with it.
 */
async function flipTest(
  admin: ReturnType<typeof createSupabaseAdmin>,
  ids: string[],
  value: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const env = value ? "dev" : "il";
  for (const id of ids) {
    const { data, error } = await admin.rpc("app_admin_set_env", {
      p_user_id: id,
      p_env: env,
    });
    if (error) return { ok: false, error: error.message };
    // The RPC answers with its own refusal in the body ('bad_env',
    // 'not_found'); a 200 is not on its own a move.
    const outcome = (data ?? null) as { error?: string } | null;
    if (outcome?.error) return { ok: false, error: outcome.error };
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
