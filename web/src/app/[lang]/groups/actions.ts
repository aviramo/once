"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser, getViewerScope } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerResync } from "@/lib/resync";
import type { ResetResult } from "../users/actions";

// The middleware rewrites /groups → /[lang]/groups, so this is the
// route segment to revalidate after a mutation. User-detail revalidation uses
// the parameterised users segment (same convention as the rest of admin).
const GROUPS_PATH = "/[lang]/groups";
const GROUP_DETAIL_PATH = "/[lang]/groups/[groupId]";
const USER_PATH = "/[lang]/users/[userId]";

// Postgres unique_violation — surfaced to the client as a typed reason so the
// form can show "name already taken" instead of a raw error.
const UNIQUE_VIOLATION = "23505";

function name(fd: FormData): string {
  return String(fd.get("name") ?? "").trim();
}

export async function createGroup(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const n = name(fd);
  if (!n) throw new Error("missing_name");
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("groups").insert({ name: n });
  if (error) {
    throw new Error(error.code === UNIQUE_VIOLATION ? "duplicate_name" : error.message);
  }
  revalidatePath(GROUPS_PATH, "page");
}

// Allowed for admins (anywhere) AND for a manager of THIS group. The user
// asked for managers to be able to rename groups they manage; everything else
// (delete, member toggles outside of promote, etc.) stays admin-only.
export async function renameGroup(fd: FormData) {
  const scope = await getViewerScope();
  if (!scope) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  const n = name(fd);
  if (!id) throw new Error("missing_id");
  if (!n) throw new Error("missing_name");
  if (scope.kind === "manager" && !scope.groupIds.includes(id)) {
    throw new Error("forbidden_group");
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("groups").update({ name: n }).eq("id", id);
  if (error) {
    throw new Error(error.code === UNIQUE_VIOLATION ? "duplicate_name" : error.message);
  }
  revalidatePath(GROUPS_PATH, "page");
  revalidatePath(GROUP_DETAIL_PATH, "page");
}

// Deleting a group also detaches every member (no destructive cascade to the
// users themselves). The user_groups rows go first — the FK on user_groups is
// ON DELETE RESTRICT, so the group row only drops once nobody points at it.
// Membership IS a gate input (disabled-only groups → unavailable), so a
// detach can flip a user from unavailable back to available (their only
// disabled group is gone) — triggerResync propagates that.
export async function deleteGroup(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("missing_id");
  const admin = createSupabaseAdmin();
  const { error: clearErr } = await admin
    .from("user_groups")
    .delete()
    .eq("group_id", id);
  if (clearErr) throw new Error(clearErr.message);
  const { error } = await admin.from("groups").delete().eq("id", id);
  if (error) throw new Error(error.message);
  void triggerResync();
  revalidatePath(GROUPS_PATH, "page");
  revalidatePath(USER_PATH, "page");
}

// Flip a group's enabled flag. Disabling means its members become
// `unavailable` UNLESS they also hold ≥1 other enabled group (the
// `group_blocked` SQL predicate). A user with no group memberships at all is
// unaffected. Fires triggerResync so every affected user's
// `relations.availability` is recomputed immediately (Realtime → open apps;
// per-minute cron is the safety net).
export async function setGroupEnabled(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  const enabled = String(fd.get("enabled") ?? "") === "true";
  if (!id) throw new Error("missing_id");
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("groups").update({ enabled }).eq("id", id);
  if (error) throw new Error(error.message);
  // Fire-and-forget — same pattern as area mutations. The web action returns
  // immediately; the edge call propagates the gate change in the background.
  void triggerResync();
  revalidatePath(GROUPS_PATH, "page");
  revalidatePath(GROUP_DETAIL_PATH, "page");
  revalidatePath(USER_PATH, "page");
}

// Per-user checklist toggle. Membership IS now a gate input (a user in
// disabled-only groups becomes unavailable), so changing assignments fires
// triggerResync — Realtime delivers any flip to the affected user instantly.
// Idempotent: assign uses upsert (ignore-dup), unassign deletes.
export async function setUserGroupAssignment(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const userId = String(fd.get("userId") ?? "");
  const groupId = String(fd.get("groupId") ?? "");
  const assigned = String(fd.get("assigned") ?? "") === "true";
  if (!userId || !groupId) throw new Error("missing_args");
  const admin = createSupabaseAdmin();
  if (assigned) {
    const { error } = await admin
      .from("user_groups")
      .upsert({ user_id: userId, group_id: groupId }, { onConflict: "user_id,group_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from("user_groups")
      .delete()
      .eq("user_id", userId)
      .eq("group_id", groupId);
    if (error) throw new Error(error.message);
  }
  void triggerResync();
  revalidatePath(USER_PATH, "page");
  revalidatePath(GROUPS_PATH, "page");
  revalidatePath(GROUP_DETAIL_PATH, "page");
}

/**
 * Reset every user that belongs to any of the selected groups. Resolves
 * member ids server-side, dedupes (a user in two selected groups is reset
 * once), then loops app_admin_reset_user per id — the per-user RPC the
 * user-detail "danger zone" uses (wipes chat/log/restrictions + relations
 * to a clean slate, recomputes availability + credits). One failure is
 * skipped, never fatal; `users` reports how many actually succeeded.
 */
export async function resetGroupMembers(
  groupIds: string[],
): Promise<ResetResult> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const ids = [...new Set((groupIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: true, users: 0 };
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("user_groups")
    .select("user_id")
    .in("group_id", ids);
  if (error) return { ok: false };
  const userIds = [
    ...new Set(((data ?? []) as { user_id: string }[]).map((r) => r.user_id)),
  ];
  let users = 0;
  for (const uid of userIds) {
    const { error: rpcError } = await admin.rpc("app_admin_reset_user", {
      p_user_id: uid,
    });
    if (!rpcError) users++;
  }
  revalidatePath(GROUPS_PATH, "page");
  revalidatePath(USER_PATH, "page");
  return { ok: true, users };
}

/**
 * Bulk move members from one group to another. `fromGroupId` (optional) bounds
 * the removal so only assignments in that specific group are dropped — if the
 * user holds other groups, those stay. When `fromGroupId` is null we only add
 * to the target (no removal step). One UPSERT for adds + one DELETE for the
 * source removals; both honour the same idempotency the per-user toggle uses.
 */
export async function moveUsersToGroup(
  userIds: string[],
  targetGroupId: string,
  fromGroupId: string | null,
): Promise<{ ok: boolean; moved: number }> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const ids = [...new Set((userIds ?? []).filter(Boolean))];
  if (ids.length === 0 || !targetGroupId)
    return { ok: true, moved: 0 };
  const admin = createSupabaseAdmin();

  // 1. Add to the target group (idempotent — a user already there is fine).
  const insertRows = ids.map((uid) => ({
    user_id: uid,
    group_id: targetGroupId,
  }));
  const { error: insertErr } = await admin
    .from("user_groups")
    .upsert(insertRows, {
      onConflict: "user_id,group_id",
      ignoreDuplicates: true,
    });
  if (insertErr) return { ok: false, moved: 0 };

  // 2. Remove from the source group (when one was given AND it's not the
  // target — moving onto themselves is a no-op for step 2). Bounded to the
  // selected user set so unrelated members aren't touched.
  if (fromGroupId && fromGroupId !== targetGroupId) {
    const { error: deleteErr } = await admin
      .from("user_groups")
      .delete()
      .eq("group_id", fromGroupId)
      .in("user_id", ids);
    if (deleteErr) return { ok: false, moved: 0 };
  }

  revalidatePath(GROUPS_PATH, "page");
  revalidatePath(GROUP_DETAIL_PATH, "page");
  revalidatePath(USER_PATH, "page");
  return { ok: true, moved: ids.length };
}

/**
 * Promote a fellow group member to group_manager. Allowed by admins
 * (anywhere) and by an existing manager of the SAME group (they can grow
 * their managing team). The group_managers row carries a `granted_at`
 * timestamp that drives the management-seniority ordering on the member
 * list. Idempotent: a re-promotion of an existing manager is a no-op (the
 * granted_at stays — never reset, so seniority is stable).
 *
 * The BEFORE-INSERT trigger on group_managers also enforces "must be a
 * member first", so a forged form submission for a non-member fails
 * server-side.
 */
export async function promoteGroupManager(fd: FormData) {
  const scope = await getViewerScope();
  if (!scope) throw new Error("Unauthorized");
  const groupId = String(fd.get("groupId") ?? "");
  const userId = String(fd.get("userId") ?? "");
  if (!groupId || !userId) throw new Error("missing_args");
  // Managers may only act within groups they themselves manage.
  if (
    scope.kind === "manager" &&
    !scope.groupIds.includes(groupId)
  ) {
    throw new Error("forbidden_group");
  }
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("group_managers")
    .upsert(
      { user_id: userId, group_id: groupId },
      { onConflict: "user_id,group_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
  revalidatePath(GROUP_DETAIL_PATH, "page");
}

/**
 * Demote a group_manager back to plain member. Admin-only by design — the
 * user explicitly excluded peer demotion to avoid power struggles inside a
 * group ("מנהל קבוצה יכול לגרום…" only grants promote, never demote).
 */
export async function demoteGroupManager(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const groupId = String(fd.get("groupId") ?? "");
  const userId = String(fd.get("userId") ?? "");
  if (!groupId || !userId) throw new Error("missing_args");
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("group_managers")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath(GROUP_DETAIL_PATH, "page");
}

/**
 * Regenerate a group's 6-digit invite code, invalidating the old one. Allowed
 * for admins (anywhere) and group managers of the target group. The DB RPC is
 * service-role only; this action is the auth gate before it.
 */
export async function regenerateInviteCode(
  fd: FormData,
): Promise<{ ok: true; code: string } | { ok: false; reason: string }> {
  const scope = await getViewerScope();
  if (!scope) return { ok: false, reason: "unauthorized" };
  const groupId = String(fd.get("groupId") ?? "");
  if (!groupId) return { ok: false, reason: "missing_args" };
  if (
    scope.kind === "manager" &&
    !scope.groupIds.includes(groupId)
  ) {
    return { ok: false, reason: "forbidden_group" };
  }
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("app_regenerate_invite_code", {
    p_group_id: groupId,
  });
  if (error) return { ok: false, reason: error.message };
  const result = data as { invite_code?: string; error?: string } | null;
  if (!result || result.error || !result.invite_code) {
    return { ok: false, reason: result?.error ?? "unknown" };
  }
  revalidatePath(GROUP_DETAIL_PATH, "page");
  return { ok: true, code: result.invite_code };
}

/**
 * Find users matching `q` who are NOT already in the given group — feeds the
 * "add members" search on the group detail page. Returns lightweight rows.
 */
export async function searchUsersForGroup(
  groupId: string,
  q: string,
): Promise<
  {
    user_id: string;
    name: string | null;
    image: string | null;
    /** Search results are non-members of the target group, so they cannot be
     * managers yet — always null. Present in the type so `Member` consumers
     * have a uniform shape. */
    managerSince: null;
  }[]
> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const query = q.trim();
  if (!query || !groupId) return [];
  const admin = createSupabaseAdmin();
  const [{ data: memberRows }, { data: users }] = await Promise.all([
    admin.from("user_groups").select("user_id").eq("group_id", groupId),
    admin
      .from("users")
      .select("user_id, name, data")
      .ilike("name", `%${query}%`)
      .limit(30),
  ]);
  const members = new Set(
    ((memberRows ?? []) as { user_id: string }[]).map((r) => r.user_id),
  );
  return (
    (users ?? []) as {
      user_id: string;
      name: string | null;
      data: { images?: { normal?: string }[] } | null;
    }[]
  )
    .filter((u) => !members.has(u.user_id))
    .slice(0, 20)
    .map((u) => ({
      user_id: u.user_id,
      name: u.name,
      image: u.data?.images?.[0]?.normal ?? null,
      managerSince: null,
    }));
}
