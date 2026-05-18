"use server";

import { revalidatePath } from "next/cache";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

// The middleware rewrites /admin/reports → /[lang]/admin/reports.
const REPORTS_PATH = "/[lang]/admin/reports";

// Moderation queue: flip a report's `handled` flag (+ timestamp). Pure
// bookkeeping — it does NOT change the reported user's state (the in-app
// app_report already recorded the report and permanently blocked the pair).
// To eject a reported user globally, the operator disables them via Groups
// (or the role/group gate); reports is the evidence/triage list.
export async function setReportHandled(fd: FormData) {
  if (!(await getAdminUser())) throw new Error("Unauthorized");
  const id = String(fd.get("id") ?? "");
  if (!id) throw new Error("missing_id");
  const handled = String(fd.get("handled") ?? "") === "true";
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("reports")
    .update({ handled, handled_at: handled ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(REPORTS_PATH, "page");
}
