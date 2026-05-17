"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { triggerResync } from "@/lib/resync";

// The middleware rewrites /admin/roles → /[lang]/admin/roles, so this is the
// route segment to revalidate after a mutation. User-detail revalidation uses
// the parameterised users segment (same convention as the rest of admin).
const ROLES_PATH = "/[lang]/admin/roles";
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
  await triggerResync();
}
