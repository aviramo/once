"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// The middleware rewrites /admin/users -> /[lang]/admin/users, so this is
// the route segment to revalidate after the reset so the users list
// reflects the freshly-reset rows.
const ADMIN_USERS_PATH = "/[lang]/admin/users";

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
