import { notFound, redirect } from "next/navigation";
import { requireViewerScope } from "@/lib/admin-auth";
import { readAdminEnv, envIsTest } from "@/lib/adminEnv";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { parseRange, rangeSince } from "@/lib/range";
import {
  insightSpec,
  INSIGHT_LIMIT,
  isInsightMetric,
  type InsightRow,
} from "@/lib/insight";
import { userImageUrl } from "@/lib/userImage";
import { AdminShell } from "../../_components/AdminShell";
import { Section, EmptyState } from "../../_components/ui";
import { InsightList, type InsightDict } from "../_components/InsightList";

/**
 * THE ROWS BEHIND ONE TILE — the one screen every tile on the admin home
 * opens (user directive 2026-08-15).
 *
 * There is one of these and not thirty because a drill-down has only three
 * things to draw (see `lib/insight.ts`): a person, two parties and what passed
 * between them, or an anonymous device. Four declined invitations and two
 * expired ones are the same page under a different filter — which is the whole
 * point, because they are the same question asked twice.
 *
 * It reads the SAME source the tile counted from, through one RPC keyed on the
 * metric, so the number on the tile and the length of this list are the same
 * fact and cannot drift apart under a later edit to one of them.
 *
 * The window travels in the URL, because the window is what the tile was
 * counting under: a drill-down that lost it would be answering a different
 * question from the one that was pressed. The header's picker is live here
 * too, so an operator who lands on "four declined this week" can widen to the
 * month without going back for the tile.
 *
 * Params typed by hand rather than through `PageProps`: the Next typed-routes
 * registry only learns a new route after a codegen pass, so referencing it
 * before the first dev/build run fails in `tsc`. Same reason, same shape, as
 * the reports page.
 */

/** Storage bucket holding a deleted account's photographs until the archive
 * TTL takes them. PRIVATE — nothing about a deleted person may be reachable
 * by URL — so the panel signs a short-lived link per row instead of composing
 * a public one. */
const ARCHIVE_BUCKET = "users-archive";
const ARCHIVE_SIGN_TTL = 60 * 10;

export default async function InsightPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string; metric: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { lang, metric } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const d = dict.admin;
  const t = d.dashboard;
  const ins = d.insight;

  if (!isInsightMetric(metric)) notFound();
  const spec = insightSpec(metric);

  const sp = await searchParams;
  const range = parseRange(typeof sp.range === "string" ? sp.range : null);

  const scope = await requireViewerScope();
  const scopedUserIds = scope.kind === "manager" ? scope.userIds : null;
  // The device blocks are admin-only and production-only on the dashboard, so
  // their doors are too — a manager has no tile to press here, and in the test
  // view the block is not on the screen at all.
  const env = await readAdminEnv();
  if (spec.shape === "device" && (scope.kind !== "admin" || envIsTest(env))) {
    redirect("/");
  }

  const admin = createSupabaseAdmin();
  const { data } = await admin.rpc("admin_insight_rows", {
    p_metric: metric,
    p_since: rangeSince(range),
    p_is_test: envIsTest(env),
    p_user_ids: scopedUserIds,
    p_limit: INSIGHT_LIMIT,
  });
  // `null` is "no such metric" from the RPC's own side — a key this build
  // knows and the database does not, which is a 404 rather than an empty list
  // claiming the window holds nothing.
  if (data == null) notFound();
  const rows = (data ?? []) as InsightRow[];

  // ONE MAP OF FACES for the whole list, resolved here because the two kinds
  // of photograph are built completely differently and a row must not have to
  // know which it is holding: a live account's is a bare filename composed
  // into a public URL, and an archived one's is a full path inside the private
  // bucket that has to be signed.
  const photos: Record<string, string | null> = {};
  const archived: Array<{ id: string; path: string }> = [];
  for (const row of rows) {
    for (const party of [row.a, row.b]) {
      if (!party?.image || photos[party.id] !== undefined) continue;
      if (party.archived) {
        photos[party.id] = null;
        archived.push({ id: party.id, path: party.image });
      } else {
        photos[party.id] = userImageUrl(party.id, party.image);
      }
    }
  }
  if (archived.length > 0) {
    const { data: signed } = await admin.storage
      .from(ARCHIVE_BUCKET)
      .createSignedUrls(
        archived.map((x) => x.path),
        ARCHIVE_SIGN_TTL,
      );
    // Positional: `createSignedUrls` answers in the order it was asked, and a
    // path that no longer exists (the purge has been) comes back with an error
    // and no URL, which is exactly the blank avatar the row should draw.
    (signed ?? []).forEach((res, i) => {
      const key = archived[i]?.id;
      if (key) photos[key] = res.signedUrl ?? null;
    });
  }

  // The tile's own label, under the tile's own key — the page a number opens
  // is titled with that number's name and cannot be titled anything else.
  const label = t.metrics[metric];
  const listDict: InsightDict = {
    unknownUser: ins.unknownUser,
    goneUser: ins.goneUser,
    archiveNote: ins.archiveNote,
    purgedNote: ins.purgedNote,
    goneNote: ins.goneNote,
    photos: ins.photos,
    messages: ins.messages,
    credits: ins.credits,
    hits: ins.hits,
    air: ins.air,
    span: ins.span,
    joinedAt: ins.joinedAt,
    tags: ins.tags,
    pressed: ins.pressed,
  };

  return (
    // `backHref` is the way out and the only one: this is a page you were sent
    // to by a number, so what it owes you is the number's own screen back.
    // The picker rides the header here exactly as it does there, so the window
    // is one control on both sides of the door.
    <AdminShell dict={d} active="dashboard" backHref="/" range={range}>
      {/* The hint says what a ROW is and nothing about the window: the window
          is the picker in the header, which is on the screen and settable from
          it, and the rule behind it is stated once, on the dashboard. */}
      <Section title={label} count={rows.length} hint={ins.shapes[spec.shape]}>
        {rows.length === 0 ? (
          <EmptyState>{ins.none}</EmptyState>
        ) : (
          <>
            <InsightList
              shape={spec.shape}
              rows={rows}
              photos={photos}
              dict={listDict}
              locale={locale}
            />
            {/* A LIST THAT WAS CUT SAYS SO. The tile's number is the truth and
                this page draws at most `INSIGHT_LIMIT` of it, so a silently
                truncated list would read as the whole of a smaller number. */}
            {rows.length >= INSIGHT_LIMIT ? (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                {ins.capped.replace("{n}", String(INSIGHT_LIMIT))}
              </p>
            ) : null}
          </>
        )}
      </Section>
    </AdminShell>
  );
}
