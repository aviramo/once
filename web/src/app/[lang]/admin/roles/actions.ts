"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerResync } from "@/lib/resync";
import type { ResetResult } from "../users/actions";

// The middleware rewrites /admin/roles → /[lang]/admin/roles, so this is the
// route segment to revalidate after a mutation. User-detail revalidation uses
// the parameterised users segment (same convention as the rest of admin).
const ROLES_PATH = "/[lang]/admin/roles";
const GROUP_DETAIL_PATH = "/[lang]/admin/roles/[groupId]";
const USER_PATH = "/[lang]/admin/users/[userId]";

// Postgres unique_violation — surfaced to the client as a typed reason so the
// form can show "name already taken" instead of a raw error.
const UNIQUE_VIOLATION = "23505";

function name(fd: FormData): string {
  return String(fd.get("name") ?? "").trim();
}

export async function createRole(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const n = name(fd);
  if (!n) throw new Error("missing_name");
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("groups").insert({ name: n });
  if (error) {
    throw new Error(error.code === UNIQUE_VIOLATION ? "duplicate_name" : error.message);
  }
  revalidatePath(ROLES_PATH, "page");
  // A brand-new role is enabled and has no members yet → nobody's
  // availability changes → no resync needed.
}

export async function renameRole(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  const n = name(fd);
  if (!id) throw new Error("missing_id");
  if (!n) throw new Error("missing_name");
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("groups").update({ name: n }).eq("id", id);
  if (error) {
    throw new Error(error.code === UNIQUE_VIOLATION ? "duplicate_name" : error.message);
  }
  revalidatePath(ROLES_PATH, "page");
  // Rename doesn't touch `enabled` or membership → availability unchanged.
}

// Active ↔ disabled. Disabling a role makes EVERY member 'unavailable' (same
// gate as being outside all areas); enabling it lifts that. Both directions
// must resync so open apps flip via Realtime and closed apps get the push.
export async function setRoleEnabled(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("missing_id");
  const enabled = String(fd.get("enabled") ?? "") === "true";
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("groups").update({ enabled }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(ROLES_PATH, "page");
  await triggerResync();
}

// Delete is allowed ONLY when the role has zero members (the UI also disables
// the button then). The user_groups.group_id FK is ON DELETE RESTRICT, so the
// DB is the real backstop; this pre-check just yields a friendly reason.
export async function deleteRole(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("missing_id");
  const admin = createSupabaseAdmin();
  const { count, error: cErr } = await admin
    .from("user_groups")
    .select("user_id", { count: "exact", head: true })
    .eq("group_id", id);
  if (cErr) throw new Error(cErr.message);
  if ((count ?? 0) > 0) throw new Error("role_in_use");
  const { error } = await admin.from("groups").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(ROLES_PATH, "page");
  // No members → nobody's availability changed.
}

// Per-user checklist toggle. Assigning a DISABLED role gates that user
// immediately; unassigning the last disabled role lifts the gate — so this
// must resync. Idempotent: assign uses upsert (ignore-dup), unassign deletes.
export async function setUserRoleAssignment(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const userId = String(fd.get("userId") ?? "");
  const roleId = String(fd.get("roleId") ?? "");
  const assigned = String(fd.get("assigned") ?? "") === "true";
  if (!userId || !roleId) throw new Error("missing_args");
  const admin = createSupabaseAdmin();
  if (assigned) {
    const { error } = await admin
      .from("user_groups")
      .upsert({ user_id: userId, group_id: roleId }, { onConflict: "user_id,group_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin
      .from("user_groups")
      .delete()
      .eq("user_id", userId)
      .eq("group_id", roleId);
    if (error) throw new Error(error.message);
  }
  revalidatePath(USER_PATH, "page");
  revalidatePath(ROLES_PATH, "page");
  revalidatePath(GROUP_DETAIL_PATH, "page");
  await triggerResync();
}

/**
 * Bulk enable/disable for a set of groups, triggered from the groups list
 * multi-selection. Collapsed to one UPDATE so a 10-group flip is one round
 * trip. Resync runs once at the end (any enable/disable can change member
 * availability — same reason single-group setRoleEnabled resyncs).
 */
export async function setGroupsEnabled(
  groupIds: string[],
  enabled: boolean,
): Promise<{ ok: boolean; count: number }> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const ids = [...new Set((groupIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: true, count: 0 };
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("groups")
    .update({ enabled })
    .in("id", ids);
  if (error) return { ok: false, count: 0 };
  revalidatePath(ROLES_PATH, "page");
  await triggerResync();
  return { ok: true, count: ids.length };
}

/**
 * Reset every user that belongs to any of the selected groups. Resolves
 * member ids server-side, dedupes (a user in two selected groups is reset
 * once), then loops app_admin_reset_user per id — the per-user RPC the
 * user-detail "danger zone" uses (wipes chat/log/restrictions + relations
 * to a clean slate, recomputes availability + credits). One failure is
 * skipped, never fatal; `users` reports how many actually succeeded.
 * No resync needed: a reset rebuilds availability from scratch.
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
  revalidatePath(ROLES_PATH, "page");
  revalidatePath(USER_PATH, "page");
  return { ok: true, users };
}

/**
 * Find users matching `q` who are NOT already in the given group — feeds the
 * "add members" search on the group detail page. Returns lightweight rows.
 */
export async function searchUsersForGroup(
  groupId: string,
  q: string,
): Promise<{ user_id: string; name: string | null; image: string | null }[]> {
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
    }));
}
