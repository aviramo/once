"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// The middleware rewrites /bugs → /[lang]/bugs.
const BUGS_PATH = "/[lang]/bugs";

// Bug queue: flip a bug report's `handled` flag (+ timestamp). Pure
// bookkeeping — triage only. Admin-only.
export async function setBugHandled(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("missing_id");
  const handled = String(fd.get("handled") ?? "") === "true";
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("bug_reports")
    .update({ handled, handled_at: handled ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(BUGS_PATH, "page");
}
