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
 * Global admin reset, moved here from the mobile app's settings screen.
 * Delegates to the single `app_admin_reset()` RPC which clears chat/log/
 * restrictions and resets every user's relations WHILE recomputing
 * relations.availability (area_state(location)) per row — so the geo gate
 * stays correct immediately after a reset instead of being wiped until each
 * user's next start/location/focus.
 */
export async function resetAllUsers(): Promise<ResetResult> {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("app_admin_reset");
  if (error) return { ok: false };
  revalidatePath(ADMIN_PATH, "page");
  const users = Number((data as { users?: number } | null)?.users ?? 0);
  return { ok: true, users };
}
