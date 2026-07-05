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
import { BugsList, type BugItem } from "./_components/BugsList";
import { BugsFilters } from "./_components/BugsFilters";
import { setBugHandled } from "./actions";

const BUG_BUCKET = "bug-attachments";
const SORT_VALUES = ["newest", "oldest"] as const;

type BugQueryRow = {
  id: string;
  created_at: string;
  text: string | null;
  attachment_key: string | null;
  handled: boolean;
  reporter_id: string;
};

// Typed manually (see the note in reports/page.tsx): the Next typed-routes
// registry only gains a new route after a build codegen pass.
export default async function BugsPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ status?: string; q?: string; sort?: string }>;
}) {
  const { lang } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const b = dict.admin.bugs;
  const sp = await searchParams;

  const status =
    sp.status === "handled" || sp.status === "all" ? sp.status : "unhandled";
  const q = (sp.q ?? "").trim();
  const sort = (SORT_VALUES as readonly string[]).includes(sp.sort ?? "")
    ? (sp.sort as string)
    : "newest";

  // Bugs are admin-only (managers don't triage bug reports).
  const scope = await requireViewerScope();
  if (scope.kind !== "admin") redirect("/users");

  const admin = createSupabaseAdmin();
  let query = admin
    .from("bug_reports")
    .select("id, created_at, text, attachment_key, handled, reporter_id")
    .order("created_at", { ascending: false })
    .limit(300);
  if (status === "unhandled") query = query.eq("handled", false);
  else if (status === "handled") query = query.eq("handled", true);
  const { data } = await query;
  const rows = (data ?? []) as BugQueryRow[];

  // Resolve reporter names + first profile image.
  const ids = Array.from(new Set(rows.map((x) => x.reporter_id)));
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

  // Resolve reporter auth emails (one getUserById each — one admin session,
  // dozens of reporters at most).
  const emailById = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      const { data: au } = await admin.auth.admin.getUserById(id);
      if (au?.user?.email) emailById.set(id, au.user.email);
    }),
  );

  // Sign every distinct attachment key (private bucket) for a 1h preview.
  const keys = Array.from(
    new Set(rows.map((x) => x.attachment_key).filter((k): k is string => !!k)),
  );
  const urlByKey = new Map<string, string>();
  if (keys.length > 0) {
    const { data: signed } = await admin.storage
      .from(BUG_BUCKET)
      .createSignedUrls(keys, 3600);
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urlByKey.set(s.path, s.signedUrl);
    }
  }

  const nameFor = (id: string): string => byId.get(id)?.name ?? b.unknownUser;
  const photoFor = (id: string): string | null =>
    userImageUrl(id, byId.get(id)?.data?.images?.[0]?.normal);

  let bugs: BugItem[] = rows.map((x) => ({
    id: x.id,
    createdAt: x.created_at,
    text: x.text ?? "",
    attachmentUrl: x.attachment_key ? urlByKey.get(x.attachment_key) ?? null : null,
    handled: x.handled,
    reporterId: x.reporter_id,
    reporterName: nameFor(x.reporter_id),
    reporterEmail: emailById.get(x.reporter_id) ?? null,
    reporterImage: photoFor(x.reporter_id),
  }));

  // Text search on the reporter's name OR email.
  if (q) {
    const ql = q.toLowerCase();
    bugs = bugs.filter(
      (x) =>
        x.reporterName.toLowerCase().includes(ql) ||
        (x.reporterEmail ?? "").toLowerCase().includes(ql),
    );
  }

  bugs.sort((a, c) =>
    sort === "newest"
      ? c.createdAt.localeCompare(a.createdAt)
      : a.createdAt.localeCompare(c.createdAt),
  );

  const tabHref = (key: "unhandled" | "handled"): string => {
    const p = new URLSearchParams();
    if (key !== "unhandled") p.set("status", key);
    if (q) p.set("q", q);
    if (sort && sort !== "newest") p.set("sort", sort);
    const qs = p.toString();
    return qs ? `/bugs?${qs}` : "/bugs";
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

  const sortOptions = [
    { value: "newest", label: b.sortNewest },
    { value: "oldest", label: b.sortOldest },
  ];

  return (
    <AdminShell dict={dict.admin} active="bugs">
      <RealtimeRefresh tables="bug_reports" channel="admin-bugs" />
      <Section title={b.title} count={bugs.length} hint={b.subtitle}>
        <div className="space-y-4">
          <div className="flex items-center gap-1">
            {tab("unhandled", b.unhandled)}
            {tab("handled", b.handledTab)}
          </div>
          <BugsFilters
            dict={{
              searchPlaceholder: b.searchPlaceholder,
              sortLabel: b.sortLabel,
              sortOptions,
            }}
          />
          {bugs.length === 0 ? (
            <EmptyState>{b.none}</EmptyState>
          ) : (
            <BugsList
              bugs={bugs}
              dict={{
                when: b.when,
                markHandled: b.markHandled,
                handled: b.handled,
                attachment: b.attachment,
                openAttachment: b.openAttachment,
                noText: b.noText,
              }}
              action={setBugHandled}
            />
          )}
        </div>
      </Section>
    </AdminShell>
  );
}
