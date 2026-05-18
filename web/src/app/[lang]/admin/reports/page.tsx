import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminUser } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell, Section, EmptyState } from "../_components/ui";
import {
  ReportsList,
  type ReportRow,
} from "./_components/ReportsList";
import { setReportHandled } from "./actions";

type ReportQueryRow = {
  id: string;
  created_at: string;
  context: string | null;
  reason: string | null;
  note: string | null;
  handled: boolean;
  reporter_id: string;
  reported_id: string;
};

// Typed manually rather than via PageProps<"/[lang]/admin/reports">: the
// Next typed-routes registry only gains a new route after a dev/build
// codegen pass, so referencing it in tsc before that fails. params /
// searchParams shapes match the App Router contract.
export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const r = dict.admin.reports;
  const sp = await searchParams;
  // Default view = the moderation queue (unhandled). ?status=handled shows the
  // archive; ?status=all shows everything.
  const status =
    sp.status === "handled" || sp.status === "all" ? sp.status : "unhandled";

  const user = await getAdminUser();
  if (!user) redirect("/admin/login");

  const admin = createSupabaseAdmin();
  let q = admin
    .from("reports")
    .select("id, created_at, context, reason, note, handled, reporter_id, reported_id")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status === "unhandled") q = q.eq("handled", false);
  else if (status === "handled") q = q.eq("handled", true);
  const { data } = await q;
  const reports = (data ?? []) as ReportQueryRow[];

  // reporter_id / reported_id are plain uuids (no FK, mirrors restrictions),
  // so resolve names in one extra query and map them in.
  const ids = Array.from(
    new Set(reports.flatMap((x) => [x.reporter_id, x.reported_id])),
  );
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("user_id, name")
      .in("user_id", ids);
    for (const u of (users ?? []) as { user_id: string; name: string | null }[]) {
      nameById.set(u.user_id, u.name ?? r.unknownUser);
    }
  }

  const rows: ReportRow[] = reports.map((x) => ({
    id: x.id,
    createdAt: x.created_at,
    context: x.context,
    reason: x.reason,
    note: x.note,
    handled: x.handled,
    reporterId: x.reporter_id,
    reportedId: x.reported_id,
    reporterName: nameById.get(x.reporter_id) ?? r.unknownUser,
    reportedName: nameById.get(x.reported_id) ?? r.unknownUser,
  }));

  const tab = (key: "unhandled" | "handled", label: string) => {
    const on = status === key;
    return (
      <Link
        href={key === "unhandled" ? "/admin/reports" : "/admin/reports?status=handled"}
        className={
          "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
          (on
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <AdminShell dict={dict.admin} active="reports">
      <Section title={r.title} count={rows.length} hint={r.subtitle}>
        <div className="space-y-6">
          <div className="flex items-center gap-1">
            {tab("unhandled", r.unhandled)}
            {tab("handled", r.handledTab)}
          </div>

          {rows.length === 0 ? (
            <EmptyState>{r.none}</EmptyState>
          ) : (
            <ReportsList rows={rows} dict={r} action={setReportHandled} />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
