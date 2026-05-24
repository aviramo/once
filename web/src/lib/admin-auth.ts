import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Single source of truth for the admin gate. Returns the signed-in user iff
 * they carry the `admin` role in app_metadata, otherwise null. Used by the
 * dashboard, the areas page, the area Server Actions, and the /api/places
 * proxy so the same check can never drift between surfaces.
 */
export async function getAdminUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  return role === "admin" ? user : null;
}

/**
 * Owner gate: returns the signed-in user iff they belong to a group that
 * carries the `owner` permission, otherwise null. Permission-checks ride on
 * group membership (public.user_groups → group_permissions); see the
 * "permissions module" in CLAUDE.md.
 *
 * Used by surfaces that grant/revoke permissions themselves — only owners
 * may add or remove a permission from any group (so an admin can't promote
 * themselves to owner). All other admin surfaces continue to use the JWT
 * admin gate above; this is strictly stricter, not a replacement.
 *
 * Goes through the service-role admin client because RLS blocks
 * `user_has_permission` for the authenticated role (the function is admin-
 * only by design).
 */
export async function getOwnerUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("user_has_permission", {
    p_user_id: user.id,
    p_key: "owner",
  });
  if (error) return null;
  return data === true ? user : null;
}

/**
 * Convenience: just the boolean for a given permission. Same path as
 * getOwnerUser but lets callers branch on permission state without throwing
 * away the surrounding user object.
 */
export async function userHasPermission(
  userId: string,
  key: string,
): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("user_has_permission", {
    p_user_id: userId,
    p_key: key,
  });
  if (error) return false;
  return data === true;
}
