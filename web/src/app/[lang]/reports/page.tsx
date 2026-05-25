import Link from "next/link";
import { redirect } from "next/navigation";
import { requireViewerScope } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { AdminShell } from "../_components/AdminShell";
import { Section, EmptyState } from "../_components/ui";
import { RealtimeRefresh } from "../_components/RealtimeRefresh";
import { userImageUrl } from "@/lib/userImage";
import {
  ReportsList,
  type Reporter,
  type ReportItem,
} from "./_components/ReportsList";
import { ReportsFilters } from "./_components/ReportsFilters";
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

const CONTEXT_VALUES = [
  "chat",
  "waiting",
  "pending",
  "watching",
  "unknown",
] as const;
const SORT_VALUES = ["newest", "oldest"] as const;

// Typed manually — see the comment in the previous version: the Next typed-
// routes registry only gains a new route after a dev/build codegen pass, so
// referencing it via PageProps fails in tsc until then. Shapes match the
// App Router contract.
export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{
    status?: string;
    q?: string;
    ctx?: string;
    sort?: string;
  }>;
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
  const q = (sp.q ?? "").trim();
  const ctx = (CONTEXT_VALUES as readonly string[]).includes(sp.ctx ?? "")
    ? (sp.ctx as string)
    : "";
  const sort = (SORT_VALUES as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as string)
    : "newest";

  // Reports moderation is admin-only (managers don't act on UGC reports).
  const scope = await requireViewerScope();
  if (scope.kind !== "admin") redirect("/users");

  const admin = createSupabaseAdmin();
  let query = admin
    .from("reports")
    .select(
      "id, created_at, context, reason, note, handled, reporter_id, reported_id",
    )
    .order("created_at", { ascending: false })
    .limit(300);
  if (status === "unhandled") query = query.eq("handled", false);
  else if (status === "handled") query = query.eq("handled", true);
  if (ctx) query = query.eq("context", ctx);
  const { data } = await query;
  const reports = (data ?? []) as ReportQueryRow[];

  // Resolve names + first profile image for every distinct user touched.
  const ids = Array.from(
    new Set(reports.flatMap((x) => [x.reporter_id, x.reported_id])),
  );
  type UserMini = {
    user_id: string;
    name: string | null;
    data: { images?: Array<{ normal?: string }> } | null;
  };
  const byId = new Map<string, UserMini>();
  if (ids.length > 0) {
    const { data: users } = await admin
      .from("users")
      .select("user_id, name, data")
      .in("user_id", ids);
    for (const u of (users ?? []) as UserMini[]) byId.set(u.user_id, u);
  }

  // Resolve auth emails for the REPORTER ids (subset — the only ones the
  // reporter card shows). Parallel getUserById is fine at this scale (one
  // admin per active session, dozens of reporters at most).
  const reporterIds = Array.from(new Set(reports.map((x) => x.reporter_id)));
  const emailById = new Map<string, string>();
  await Promise.all(
    reporterIds.map(async (id) => {
      const { data: au } = await admin.auth.admin.getUserById(id);
      if (au?.user?.email) emailById.set(id, au.user.email);
    }),
  );

  const photoFor = (id: string): string | null =>
    userImageUrl(id, byId.get(id)?.data?.images?.[0]?.normal);
  const nameFor = (id: string): string => byId.get(id)?.name ?? r.unknownUser;

  // Group reports by reporter, tracking each reporter's latest report time.
  const groups = new Map<string, Reporter>();
  for (const x of reports) {
    let g = groups.get(x.reporter_id);
    if (!g) {
      g = {
        id: x.reporter_id,
        name: nameFor(x.reporter_id),
        email: emailById.get(x.reporter_id) ?? null,
        image: photoFor(x.reporter_id),
        reports: [],
        latest: x.created_at,
      };
      groups.set(x.reporter_id, g);
    }
    const item: ReportItem = {
      id: x.id,
      createdAt: x.created_at,
      context: x.context,
      note: x.note,
      handled: x.handled,
      reportedId: x.reported_id,
      reportedName: nameFor(x.reported_id),
      reportedImage: photoFor(x.reported_id),
    };
    g.reports.push(item);
    if (x.created_at > g.latest) g.latest = x.created_at;
  }
  let reporters = [...groups.values()];

  // Text search on the reporter's name OR email.
  if (q) {
    const ql = q.toLowerCase();
    reporters = reporters.filter(
      (rp) =>
        (rp.name ?? "").toLowerCase().includes(ql) ||
        (rp.email ?? "").toLowerCase().includes(ql),
    );
  }

  // Sort groups by their latest report time.
  reporters.sort((a, b) =>
    sort === "newest"
      ? b.latest.localeCompare(a.latest)
      : a.latest.localeCompare(b.latest),
  );

  // Build a tab href that preserves the current filters / sort, so flipping
  // Pending↔Handled never loses the search bar state.
  const tabHref = (key: "unhandled" | "handled"): string => {
    const p = new URLSearchParams();
    if (key !== "unhandled") p.set("status", key);
    if (q) p.set("q", q);
    if (ctx) p.set("ctx", ctx);
    if (sort && sort !== "newest") p.set("sort", sort);
    const qs = p.toString();
    return qs ? `/reports?${qs}` : "/reports";
  };
  const tab = (key: "unhandled" | "handled", label: string) => {
    const on = status === key;
    return (
      <Link
        href={tabHref(key)}
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

  // Option lists for the filter bar (Hebrew labels come from contextValues).
  const contextOptions = CONTEXT_VALUES.map((v) => ({
    value: v,
    label: r.contextValues?.[v] ?? v,
  }));
  const sortOptions = [
    { value: "newest", label: r.sortNewest },
    { value: "oldest", label: r.sortOldest },
  ];

  return (
    <AdminShell dict={dict.admin} active="reports">
      <RealtimeRefresh tables="reports" channel="admin-reports" />
      <Section title={r.title} count={reporters.length} hint={r.subtitle}>
        <div className="space-y-4">
          <div className="flex items-center gap-1">
            {tab("unhandled", r.unhandled)}
            {tab("handled", r.handledTab)}
          </div>
          <ReportsFilters
            dict={{
              searchPlaceholder: r.searchPlaceholder,
              contextLabel: r.contextLabel,
              contextAny: r.contextAny,
              contextOptions,
              sortLabel: r.sortLabel,
              sortOptions,
            }}
          />
          {reporters.length === 0 ? (
            <EmptyState>{r.none}</EmptyState>
          ) : (
            <ReportsList
              reporters={reporters}
              dict={{
                none: r.none,
                note: r.note,
                markHandled: r.markHandled,
                handled: r.handled,
                unknownUser: r.unknownUser,
                reportCount: r.reportCount,
                contextValues: r.contextValues,
              }}
              action={setReportHandled}
            />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
