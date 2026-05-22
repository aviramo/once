import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getDictionary } from "@/i18n/dictionaries";
import { hasLocale, defaultLocale, type Locale } from "@/i18n/locales";
import { relativeTime, dateTime } from "@/lib/relativeTime";
import { extractOtherIds } from "@/lib/interactions";
import {
  eventLabel,
  restrictionLabel,
  statusResult,
  type Tone,
} from "@/lib/humanize";
import { AdminShell } from "../../../../_components/AdminShell";
import {
  Section,
  Card,
  Avatar,
  ToneDot,
  EmptyState,
} from "../../../../_components/ui";
import { RevealList } from "../../../../_components/Disclosure";

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
  const a = dict.admin;
  const d = a.userDetail;

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
  ].sort((x, y) => y.at.localeCompare(x.at));

  const selfPhoto = imageUrl(self.user_id, self.data?.images?.[0]?.normal);
  const otherPhoto = imageUrl(other.user_id, other.data?.images?.[0]?.normal);
  const selfName = self.name ?? d.you;
  const otherName = other.name ?? d.other;

  function attachmentLabel(item: Extract<TimelineItem, { kind: "chat" }>) {
    if (item.isEvent) return d.systemEvent;
    if (item.text) return item.text;
    if (item.image) return d.attachmentImage;
    if (item.audio) return d.attachmentAudio;
    if (item.location) return d.attachmentLocation;
    if (item.schedule) return d.attachmentSchedule;
    return d.noText;
  }

  const items = timeline.map((item, i) => {
    let actor: string;
    let body: string;
    let tone: Tone;
    if (item.kind === "chat") {
      actor = item.from === "self" ? selfName : otherName;
      body = attachmentLabel(item);
      tone = "chat";
    } else if (item.kind === "restriction") {
      actor = item.direction === "out" ? selfName : otherName;
      body = restrictionLabel(a, item.key);
      tone = "ended";
    } else {
      actor = item.actor === "self" ? selfName : otherName;
      const res = statusResult(a, item.status);
      body = res.ok
        ? eventLabel(a, item.action)
        : `${eventLabel(a, item.action)} (${res.label})`;
      tone = res.ok ? "ok" : "ended";
    }
    return (
      <div
        key={`${item.kind}-${i}`}
        className="flex items-center justify-between gap-4 px-4 py-3 text-sm"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ToneDot tone={tone} />
          <span className="shrink-0 font-medium">{actor}</span>
          <span className="truncate text-muted-foreground">{body}</span>
        </div>
        <span
          className="shrink-0 text-xs text-muted-foreground"
          title={dateTime(item.at, locale)}
        >
          {relativeTime(item.at, locale)}
        </span>
      </div>
    );
  });

  return (
    <AdminShell dict={a} active="users" backHref={`/admin/users/${userId}`}>
      <Section title={d.interactionWith}>
        <Card className="flex items-center gap-3">
          <UserPill
            name={self.name}
            photo={selfPhoto}
            subtitle={d.you}
            link={`/admin/users/${self.user_id}`}
          />
          <span className="text-muted-foreground" aria-hidden>
            ↔
          </span>
          <UserPill
            name={other.name}
            photo={otherPhoto}
            subtitle={d.other}
            link={`/admin/users/${other.user_id}`}
          />
        </Card>
      </Section>

      <Section title={d.activity} count={timeline.length}>
        {timeline.length === 0 ? (
          <EmptyState>{d.noInteractions}</EmptyState>
        ) : (
          <RevealList
            initial={12}
            moreLabel={a.showMore}
            lessLabel={a.showLess}
            items={items}
          />
        )}
      </Section>
    </AdminShell>
  );
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
      <Avatar src={photo} name={name} size="sm" />
      <div className="min-w-0">
        <p className="truncate font-medium">{name ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </Link>
  );
}
