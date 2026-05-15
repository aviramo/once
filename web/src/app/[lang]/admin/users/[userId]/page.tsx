import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { relativeTime } from "@/lib/relativeTime";
import { fetchPartnerSummaries } from "@/lib/interactions";

type Image = { normal?: string; hash?: string };

type UserRecord = {
  user_id: string;
  name: string | null;
  is_male: boolean | null;
  birth_date: string | null;
  created_at: string;
  last_seen: string | null;
  data: {
    images?: Image[];
    bio?: string;
    location_label?: string | null;
  } | null;
  relations: {
    page1?: {
      state?: string;
      message?: string;
      profile?: { user_id?: string; name?: string };
    };
    page2?: {
      state?: string;
      message?: string;
      profile?: { user_id?: string; name?: string };
      profiles?: Array<{ user_id?: string; name?: string }>;
    };
  } | null;
};

type PartnerMini = {
  user_id: string;
  name: string | null;
  data: { images?: Image[] } | null;
};

type LogRow = {
  id: string;
  created_at: string;
  key: string;
  status: number;
  run_ms: number;
};

function imageUrl(userId: string, filename: string | undefined): string | null {
  if (!filename) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/users/${userId}/normal/${filename}`;
}

function calcAge(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(birthDate);
  const ageDate = new Date(Date.now() - dob.getTime());
  return Math.abs(ageDate.getUTCFullYear() - 1970);
}

export default async function UserDetailPage({
  params,
}: PageProps<"/[lang]/admin/users/[userId]">) {
  const { lang, userId } = await params;
  const locale = (hasLocale(lang) ? lang : defaultLocale) as Locale;
  const dict = await getDictionary(locale);
  const d = dict.admin;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const isAdmin =
    (user.app_metadata as { role?: string } | undefined)?.role === "admin";
  if (!isAdmin) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_admin");
  }

  const admin = createSupabaseAdmin();
  const [
    { data: target },
    { data: authUser },
    { data: logRows },
    partners,
  ] = await Promise.all([
    admin
      .from("users")
      .select(
        "user_id, name, is_male, birth_date, created_at, last_seen, data, relations",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(userId),
    admin
      .from("log")
      .select("id, created_at, key, status, run_ms")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50),
    fetchPartnerSummaries(admin, userId),
  ]);

  if (!target) notFound();
  const u = target as UserRecord;

  // Look up partner names + images in one query
  const partnerIds = partners.map((p) => p.otherId);
  const { data: partnerProfiles } = partnerIds.length
    ? await admin
        .from("users")
        .select("user_id, name, data")
        .in("user_id", partnerIds)
    : { data: [] };
  const partnerMap = new Map(
    ((partnerProfiles ?? []) as PartnerMini[]).map((p) => [p.user_id, p]),
  );

  const dateFmt = new Intl.DateTimeFormat(
    locale === "he" ? "he-IL" : "en-US",
    { dateStyle: "medium", timeStyle: "short" },
  );

  const photo = imageUrl(u.user_id, u.data?.images?.[0]?.normal);
  const age = calcAge(u.birth_date);
  const p1 = u.relations?.page1;
  const p2 = u.relations?.page2;
  const watchers = p2?.profiles ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <Link
        href="/admin"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {d.back}
      </Link>

      <div className="mt-6 flex gap-6">
        <div className="size-32 shrink-0 overflow-hidden rounded-2xl bg-muted">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-primary/60 text-4xl font-bold text-primary-foreground">
              {(u.name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{u.name ?? "—"}</h1>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {age !== null ? (
              <Row label={d.userDetail.age} value={String(age)} />
            ) : null}
            <Row
              label={d.userDetail.gender}
              value={
                u.is_male === true
                  ? d.userDetail.male
                  : u.is_male === false
                    ? d.userDetail.female
                    : "—"
              }
            />
            <Row
              label={d.userDetail.email}
              value={authUser?.user?.email ?? "—"}
            />
            <Row label={d.userDetail.userId} value={u.user_id} mono />
            <Row
              label={d.userDetail.joinedFull}
              value={`${dateFmt.format(new Date(u.created_at))} · ${relativeTime(u.created_at, locale)}`}
            />
            <Row
              label={d.userDetail.lastSeenFull}
              value={
                u.last_seen
                  ? `${dateFmt.format(new Date(u.last_seen))} · ${relativeTime(u.last_seen, locale)}`
                  : "—"
              }
            />
            {u.data?.location_label ? (
              <Row
                label={d.userDetail.location}
                value={u.data.location_label}
              />
            ) : null}
          </dl>
          {u.data?.bio ? (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {d.userDetail.bio}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{u.data.bio}</p>
            </div>
          ) : null}
        </div>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{d.userDetail.currentState}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <StateCard
            title={d.filterP1}
            state={p1?.state ?? "locked"}
            stateLabel={
              (d.page1States as Record<string, string>)[
                p1?.state ?? "locked"
              ] ?? "—"
            }
            message={p1?.message ?? null}
            extra={
              p1?.profile?.name
                ? `${d.userDetail.page1Profile}: ${p1.profile.name}`
                : null
            }
          />
          <StateCard
            title={d.filterP2}
            state={p2?.state ?? "locked"}
            stateLabel={
              (d.page2States as Record<string, string>)[
                p2?.state ?? "locked"
              ] ?? "—"
            }
            message={p2?.message ?? null}
            extra={
              p2?.profile?.name
                ? `${d.userDetail.page2Profile}: ${p2.profile.name}`
                : watchers.length > 0
                  ? `${d.userDetail.watchers}: ${watchers.length}`
                  : null
            }
          />
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold">{d.userDetail.interactions}</h2>
          <span className="text-sm text-muted-foreground">
            {partners.length}
          </span>
        </div>
        {partners.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {d.userDetail.noInteractions}
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {partners.map((p) => {
              const profile = partnerMap.get(p.otherId);
              const partnerPhoto = imageUrl(
                p.otherId,
                profile?.data?.images?.[0]?.normal,
              );
              const events =
                p.chatCount +
                p.restrictOut.length +
                p.restrictIn.length +
                p.rpcCount;
              return (
                <li key={p.otherId}>
                  <Link
                    href={`/admin/users/${userId}/with/${p.otherId}`}
                    className="flex items-center gap-3 bg-background px-4 py-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="size-10 shrink-0 overflow-hidden rounded-full bg-muted">
                      {partnerPhoto ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={partnerPhoto}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-primary/60 text-sm font-bold text-primary-foreground">
                          {(profile?.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {profile?.name ?? p.otherId.slice(0, 8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relativeTime(p.lastAt, locale)} · {events}{" "}
                        {d.userDetail.interactionEvents}
                        {p.chatCount > 0 ? ` · ${p.chatCount} chat` : ""}
                        {p.restrictOut.length > 0
                          ? ` · out: ${p.restrictOut.join(",")}`
                          : ""}
                        {p.restrictIn.length > 0
                          ? ` · in: ${p.restrictIn.join(",")}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-xs text-primary">
                      {d.userDetail.viewHistory}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">{d.userDetail.activity}</h2>
        {(logRows ?? []).length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {d.userDetail.noActivity}
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {((logRows ?? []) as LogRow[]).map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-4 bg-background px-4 py-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{row.key}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      row.status >= 400
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                    }`}
                  >
                    {row.status}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {row.run_ms}ms
                  </span>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {dateFmt.format(new Date(row.created_at))}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-xs" : "text-sm"}>{value}</dd>
    </>
  );
}

function StateCard({
  title,
  state,
  stateLabel,
  message,
  extra,
}: {
  title: string;
  state: string;
  stateLabel: string;
  message: string | null;
  extra: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="mt-1 text-base font-semibold">{stateLabel}</p>
      <p className="text-xs text-muted-foreground">state: {state}</p>
      {message ? (
        <p className="mt-2 text-xs">
          <span className="text-muted-foreground">message:</span> {message}
        </p>
      ) : null}
      {extra ? <p className="mt-2 text-xs">{extra}</p> : null}
    </div>
  );
}
