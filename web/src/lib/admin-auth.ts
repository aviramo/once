import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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
