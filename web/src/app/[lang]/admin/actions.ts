"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// The middleware rewrites /admin → /[lang]/admin, so this is the route
// segment to revalidate after the reset so the dashboard reflects the
// freshly-reset rows.
const ADMIN_PATH = "/[lang]/admin";

export type ResetResult =
  | { ok: true; users: number }
  | { ok: false };

/**
 * Role-scoped admin reset. The dashboard control opens a role checklist;
 * ONLY users holding at least one of the selected roles are reset. Delegates
 * to the `app_admin_reset(p_role_ids uuid[])` overload, which clears those
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
    p_role_ids: ids,
  });
  if (error) return { ok: false };
  revalidatePath(ADMIN_PATH, "page");
  const users = Number((data as { users?: number } | null)?.users ?? 0);
  return { ok: true, users };
}
