import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { relativeTime } from "@/lib/relativeTime";
import { extractOtherIds } from "@/lib/interactions";

type Image = { normal?: string };

type MiniUser = {
  user_id: string;
  name: string | null;
  data: { images?: Image[] } | null;
};

type ChatRow = {
  user_id: string;
  other_id: string;
  created_at: string;
  text: string | null;
  image_key: string | null;
  audio_key: string | null;
  location: unknown;
  schedule: unknown;
  is_event: boolean | null;
};

type RestrictionRow = {
  user_id: string;
  other_id: string;
  created_at: string;
  key: string;
};

type LogRow = {
  id: string;
  created_at: string;
  key: string;
  status: number;
  log: unknown;
};

type TimelineItem =
  | {
      kind: "chat";
      at: string;
      from: "self" | "other";
      text: string | null;
      image: boolean;
      audio: boolean;
      location: boolean;
      schedule: boolean;
      isEvent: boolean;
    }
  | {
      kind: "restriction";
      at: string;
      direction: "out" | "in";
      key: string;
    }
  | {
      kind: "log";
      at: string;
      actor: "self" | "other";
      action: string;
      status: number;
    };

function imageUrl(userId: string, filename: string | undefined): string | null {
  if (!filename) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/users/${userId}/normal/${filename}`;
}

export default async function InteractionHistoryPage({
  params,
}: PageProps<"/[lang]/admin/users/[userId]/with/[otherUserId]">) {
  const { lang, userId, otherUserId } = await params;
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
    { data: selfProfile },
    { data: otherProfile },
    { data: chatMsgs },
    { data: restrictionsAll },
    { data: logSelf },
    { data: logOther },
  ] = await Promise.all([
    admin
      .from("users")
      .select("user_id, name, data")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("users")
      .select("user_id, name, data")
      .eq("user_id", otherUserId)
      .maybeSingle(),
    admin
      .from("chat")
      .select(
        "user_id, other_id, created_at, text, image_key, audio_key, location, schedule, is_event",
      )
      .or(
        `and(user_id.eq.${userId},other_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},other_id.eq.${userId})`,
      )
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("restrictions")
      .select("user_id, other_id, created_at, key")
      .or(
        `and(user_id.eq.${userId},other_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},other_id.eq.${userId})`,
      )
      .order("created_at", { ascending: false }),
    admin
      .from("log")
      .select("id, created_at, key, status, log")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("log")
      .select("id, created_at, key, status, log")
      .eq("user_id", otherUserId)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  if (!selfProfile) notFound();
  const self = selfProfile as MiniUser;
  const other = (otherProfile ?? {
    user_id: otherUserId,
    name: null,
    data: null,
  }) as MiniUser;

  // Filter log rows to those that mention the counterpart
  const otherIdLower = otherUserId.toLowerCase();
  const selfIdLower = userId.toLowerCase();
  const filteredLogSelf = ((logSelf ?? []) as LogRow[]).filter((r) =>
    extractOtherIds(r.log, userId).some((id) => id === otherIdLower),
  );
  const filteredLogOther = ((logOther ?? []) as LogRow[]).filter((r) =>
    extractOtherIds(r.log, otherUserId).some((id) => id === selfIdLower),
  );

  const timeline: TimelineItem[] = [
    ...((chatMsgs ?? []) as ChatRow[]).map<TimelineItem>((r) => ({
      kind: "chat",
      at: r.created_at,
      from: r.user_id === userId ? "self" : "other",
      text: r.text,
      image: !!r.image_key,
      audio: !!r.audio_key,
      location: !!r.location,
      schedule: !!r.schedule,
      isEvent: !!r.is_event,
    })),
    ...((restrictionsAll ?? []) as RestrictionRow[]).map<TimelineItem>((r) => ({
      kind: "restriction",
      at: r.created_at,
      direction: r.user_id === userId ? "out" : "in",
      key: r.key,
    })),
    ...filteredLogSelf.map<TimelineItem>((r) => ({
      kind: "log",
      at: r.created_at,
      actor: "self",
      action: r.key,
      status: r.status,
    })),
    ...filteredLogOther.map<TimelineItem>((r) => ({
      kind: "log",
      at: r.created_at,
      actor: "other",
      action: r.key,
      status: r.status,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const dateFmt = new Intl.DateTimeFormat(
    locale === "he" ? "he-IL" : "en-US",
    { dateStyle: "medium", timeStyle: "short" },
  );

  const selfPhoto = imageUrl(self.user_id, self.data?.images?.[0]?.normal);
  const otherPhoto = imageUrl(other.user_id, other.data?.images?.[0]?.normal);

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link
        href={`/admin/users/${userId}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        {d.back}
      </Link>

      <h1 className="mt-6 text-2xl font-bold">
        {d.userDetail.interactionWith}
      </h1>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-background p-4">
        <UserPill
          name={self.name}
          photo={selfPhoto}
          subtitle={d.userDetail.you}
          link={`/admin/users/${self.user_id}`}
        />
        <span className="text-muted-foreground">↔</span>
        <UserPill
          name={other.name}
          photo={otherPhoto}
          subtitle={d.userDetail.other}
          link={`/admin/users/${other.user_id}`}
        />
      </div>

      {timeline.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {d.userDetail.noInteractions}
        </p>
      ) : (
        <ol className="mt-6 divide-y divide-border overflow-hidden rounded-xl border border-border">
          {timeline.map((item, i) => (
            <li
              key={`${item.kind}-${i}`}
              className="flex items-center justify-between gap-4 bg-background px-4 py-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {item.kind === "chat" ? (
                  <>
                    <Dot color={item.from === "self" ? "bg-primary" : "bg-zinc-400"} />
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.from === "self" ? self.name ?? "self" : other.name ?? "other"}
                    </span>
                    <span className="truncate">
                      {item.isEvent
                        ? "(event)"
                        : item.text ??
                          (item.image
                            ? "[image]"
                            : item.audio
                              ? "[audio]"
                              : item.location
                                ? "[location]"
                                : item.schedule
                                  ? "[schedule]"
                                  : "[empty]")}
                    </span>
                  </>
                ) : item.kind === "restriction" ? (
                  <>
                    <Dot color="bg-rose-500" />
                    <span className="font-mono text-xs">
                      {item.direction === "out"
                        ? d.userDetail.restrictionOut
                        : d.userDetail.restrictionIn}
                    </span>
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                      {item.key}
                    </span>
                  </>
                ) : (
                  <>
                    <Dot color="bg-sky-500" />
                    <span className="font-mono text-xs text-muted-foreground">
                      {item.actor === "self" ? self.name ?? "self" : other.name ?? "other"}
                    </span>
                    <span className="font-medium">{item.action}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        item.status >= 400
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      }`}
                    >
                      {item.status}
                    </span>
                  </>
                )}
              </div>
              <span
                className="shrink-0 text-xs text-muted-foreground"
                title={`${relativeTime(item.at, locale)}`}
              >
                {dateFmt.format(new Date(item.at))}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className={`inline-block size-2 shrink-0 rounded-full ${color}`} />;
}

function UserPill({
  name,
  photo,
  subtitle,
  link,
}: {
  name: string | null;
  photo: string | null;
  subtitle: string;
  link: string;
}) {
  return (
    <Link href={link} className="flex min-w-0 flex-1 items-center gap-3">
      <div className="size-10 shrink-0 overflow-hidden rounded-full bg-muted">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-primary/60 text-sm font-bold text-primary-foreground">
            {(name ?? "?").charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium">{name ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Link>
  );
}
