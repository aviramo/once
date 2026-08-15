import Link from "next/link";
import { ArrowRight, Circle, Monitor, Smartphone, Apple } from "lucide-react";
import type { Locale } from "@/i18n/locales";
import type { Tone } from "@/lib/humanize";
import type { InsightParty, InsightRow, InsightShape } from "@/lib/insight";
import { relativeTime, dateTime, duration } from "@/lib/relativeTime";
import { cn } from "@/lib/utils";
import { Avatar, StatusBadge } from "../../_components/ui";

/**
 * THE ROWS BEHIND ONE TILE. Three renderers, because a drill-down has only
 * three things to draw — a person, two parties and what passed between them,
 * or an anonymous device — and every one of the dashboard's tiles resolves to
 * one of them.
 *
 * All server components: nothing here is interactive beyond a link to a
 * person's page, and a list of three hundred rows should not ship a bundle to
 * say so.
 *
 * The row is deliberately NOT a `UserCard`. That card answers "what is this
 * person doing right now", which is the users list's question; this one
 * answers "why is this row in the number I pressed", so what it puts on the
 * meta line is the moment it was counted under and the one measurement the
 * metric has — how long an invitation stood, how many messages a conversation
 * holds, how many credits a wallet does.
 */

/** Only what a ROW says. The empty state and the truncation line belong to the
 * page around this list, not to a row, so they are not here. */
export type InsightDict = {
  unknownUser: string;
  goneUser: string;
  archiveNote: string;
  purgedNote: string;
  goneNote: string;
  photos: string;
  messages: string;
  credits: string;
  hits: string;
  air: string;
  span: string;
  joinedAt: string;
  tags: Record<string, string>;
  pressed: Record<string, string>;
};

/** A tag's tone. The outcome vocabulary is small and closed, so this is a map
 * rather than a per-metric decision — "declined" is an ending wherever it is
 * drawn, and a row must not paint it one colour on one screen and another on
 * the next. */
const TAG_TONE: Record<string, Tone> = {
  declined: "ended",
  cancelled: "ended",
  expired: "ended",
  ended: "ended",
  block: "ended",
  report: "ended",
  gone: "ended",
  purged: "ended",
  pending: "busy",
  archived: "busy",
  accepted: "chat",
  messages: "chat",
  joined: "ok",
  credits: "idle",
};

function toneFor(tag: string | null | undefined): Tone {
  if (!tag) return "idle";
  return TAG_TONE[tag] ?? "idle";
}

/* ----------------------------------------------------------------- party -- */

const PLATFORM_ICON: Record<string, typeof Circle> = {
  android: Smartphone,
  ios: Apple,
  desktop: Monitor,
};

/**
 * One party's face and name. The three cases it has to hold are the whole
 * reason a party is an object rather than a name: a LIVE person opens their
 * page; an ARCHIVED one has no page to open and carries a signed URL into the
 * private archive bucket instead of a filename; a GONE one is an id and
 * nothing else, which every list about a pair will always have some of.
 */
function Party({
  party,
  photo,
  dict,
  size = "sm",
}: {
  party: InsightParty;
  photo: string | null;
  dict: InsightDict;
  size?: "sm" | "md";
}) {
  const label =
    party.name ?? (party.gone ? dict.goneUser : dict.unknownUser);
  const inner = (
    <>
      {party.circle ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Circle className="size-4" strokeWidth={2.5} />
        </span>
      ) : (
        <Avatar src={photo} name={party.name} size={size} />
      )}
      <span className="min-w-0">
        <span
          className={cn(
            "block truncate text-sm font-semibold leading-tight",
            (party.gone || !party.name) && "text-muted-foreground",
          )}
        >
          {label}
          {party.age ? (
            <span className="font-normal text-muted-foreground">
              {", "}
              {party.age}
            </span>
          ) : null}
        </span>
      </span>
    </>
  );

  // Only a live account has somewhere to go. An archived one is the point of
  // the list it is in — there is no page behind it, and a link to one would be
  // a promise the panel cannot keep.
  if (party.gone || party.archived || party.circle || party.device) {
    return <span className="flex min-w-0 items-center gap-2.5">{inner}</span>;
  }
  return (
    <Link
      href={`/users/${party.id}`}
      className="flex min-w-0 items-center gap-2.5 rounded-lg outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary"
    >
      {inner}
    </Link>
  );
}

/* ------------------------------------------------------------------- row -- */

function Meta({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-tight text-muted-foreground">
      {children}
    </p>
  );
}

function Dot() {
  return <span aria-hidden className="text-muted-foreground/50">·</span>;
}

function PersonRow({
  row,
  photo,
  dict,
  locale,
}: {
  row: InsightRow;
  photo: string | null;
  dict: InsightDict;
  locale: Locale;
}) {
  const p = row.a;
  // What the archive still holds of this person, said plainly: the profile is
  // there until the purge, or the purge has been and only the record is left,
  // or the account predates the archive entirely.
  const archiveNote =
    row.tag === "archived"
      ? dict.archiveNote
      : row.tag === "purged"
        ? dict.purgedNote
        : row.tag === "gone"
          ? dict.goneNote
          : null;

  return (
    <div className="rounded-xl border border-border bg-background p-3.5 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Party party={p} photo={photo} dict={dict} size="md" />
        </div>
        {row.tag ? (
          <StatusBadge tone={toneFor(row.tag)}>
            {dict.tags[row.tag] ?? row.tag}
          </StatusBadge>
        ) : null}
      </div>
      <Meta>
        <span title={dateTime(row.at, locale)}>
          {relativeTime(row.at, locale)}
        </span>
        {row.n != null && row.tag === "credits" ? (
          <>
            <Dot />
            <span>{dict.credits.replace("{n}", String(row.n))}</span>
          </>
        ) : null}
        {p.archived && p.photos ? (
          <>
            <Dot />
            <span>{dict.photos.replace("{n}", String(p.photos))}</span>
          </>
        ) : null}
        {p.joined ? (
          <>
            <Dot />
            <span>{dict.joinedAt.replace("{t}", dateTime(p.joined, locale))}</span>
          </>
        ) : null}
      </Meta>
      {archiveNote ? (
        <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground/80">
          {archiveNote}
        </p>
      ) : null}
    </div>
  );
}

function PairRow({
  row,
  photoA,
  photoB,
  dict,
  locale,
}: {
  row: InsightRow;
  photoA: string | null;
  photoB: string | null;
  dict: InsightDict;
  locale: Locale;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3.5 shadow-sm">
      {/* WHO DID IT TO WHOM, in that order and with the arrow between them:
          the whole reason to open an invitation count is that a number cannot
          say which way round it went. The arrow mirrors under RTL like every
          other directional glyph in the panel. */}
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5">
          <Party party={row.a} photo={photoA} dict={dict} />
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/60 rtl:-scale-x-100" />
          {row.b ? <Party party={row.b} photo={photoB} dict={dict} /> : null}
        </div>
        {row.tag ? (
          <StatusBadge tone={toneFor(row.tag)}>
            {dict.tags[row.tag] ?? row.tag}
          </StatusBadge>
        ) : null}
      </div>
      <Meta>
        <span title={dateTime(row.at, locale)}>
          {relativeTime(row.at, locale)}
        </span>
        {/* THE ONE THING THE NUMBER COULD NOT SAY. An invitation's time in the
            air is the answer to "four were declined — how quickly?", and a
            conversation's is how long it ran. */}
        {row.ms != null ? (
          <>
            <Dot />
            <span className="font-medium text-foreground/70">
              {(row.tag === "messages" ? dict.span : dict.air).replace(
                "{t}",
                duration(row.ms, locale),
              )}
            </span>
          </>
        ) : null}
        {row.n != null ? (
          <>
            <Dot />
            <span>{dict.messages.replace("{n}", String(row.n))}</span>
          </>
        ) : null}
      </Meta>
      {/* A report's own words. `note` is free text a person wrote and nothing
          else — the only such field in any of these lists, and the one thing a
          moderator opened this tile to read. */}
      {row.note ? (
        <p className="mt-1.5 border-s-2 border-border ps-2 text-[11px] leading-snug text-muted-foreground">
          {row.note}
        </p>
      ) : null}
    </div>
  );
}

function DeviceRow({
  row,
  dict,
  locale,
}: {
  row: InsightRow;
  dict: InsightDict;
  locale: Locale;
}) {
  const Icon = PLATFORM_ICON[row.tag ?? ""] ?? Circle;
  const pressed = (row.note ?? "").split(",").filter(Boolean);
  return (
    <div className="rounded-xl border border-border bg-background p-3.5 shadow-sm">
      <div className="flex items-start gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">
            {dict.tags[row.tag ?? ""] ?? row.tag}
          </span>
          {/* Nobody's account, so the identity IS the device id — shortened,
              since it is only ever there to tell two rows apart. */}
          <span className="block truncate font-mono text-[11px] text-muted-foreground">
            {row.a.id.slice(0, 8)}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {pressed.map((k) => (
            <StatusBadge key={k} tone={k === "download" ? "ok" : "busy"} dot={false}>
              {dict.pressed[k] ?? k}
            </StatusBadge>
          ))}
        </div>
      </div>
      <Meta>
        <span title={dateTime(row.at, locale)}>
          {relativeTime(row.at, locale)}
        </span>
        {row.n != null ? (
          <>
            <Dot />
            <span>{dict.hits.replace("{n}", String(row.n))}</span>
          </>
        ) : null}
        {row.ms != null && row.ms > 0 ? (
          <>
            <Dot />
            <span>{dict.span.replace("{t}", duration(row.ms, locale))}</span>
          </>
        ) : null}
      </Meta>
    </div>
  );
}

/* ------------------------------------------------------------------ list -- */

export function InsightList({
  shape,
  rows,
  photos,
  dict,
  locale,
}: {
  shape: InsightShape;
  rows: InsightRow[];
  /** Party id → the URL to draw. Resolved on the server: a live person's is
   * composed from their filename, an archived one's is a signed link into the
   * private bucket, and neither is something a row should know how to build. */
  photos: Record<string, string | null>;
  dict: InsightDict;
  locale: Locale;
}) {
  return (
    <div className="space-y-2.5">
      {rows.map((row, i) => {
        const key = `${row.a.id}-${row.b?.id ?? ""}-${row.at ?? i}`;
        if (shape === "device") {
          return <DeviceRow key={key} row={row} dict={dict} locale={locale} />;
        }
        if (shape === "pair") {
          return (
            <PairRow
              key={key}
              row={row}
              photoA={photos[row.a.id] ?? null}
              photoB={row.b ? (photos[row.b.id] ?? null) : null}
              dict={dict}
              locale={locale}
            />
          );
        }
        return (
          <PersonRow
            key={key}
            row={row}
            photo={photos[row.a.id] ?? null}
            dict={dict}
            locale={locale}
          />
        );
      })}
    </div>
  );
}
