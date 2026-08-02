"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Search, X } from "lucide-react";
import { Avatar, EmptyState, StatusBadge } from "../../../_components/ui";
import { relativeTime, dateTime } from "@/lib/relativeTime";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * ONE LIST for a single admin user (user directive 2026-08-02): every event
 * they were part of AND every watch they have been either end of, in one
 * chronological stream under one search box. They were two sections for a few
 * hours — "connections" over "events log" — and that put the same relationship
 * in two places, described twice, sorted twice.
 *
 * A connection is not an event, and the difference is kept: it is a relation
 * with a duration, so it is placed at the moment it last moved and drawn with
 * the counterpart leading rather than an action name. What it is NOT is a
 * second list.
 *
 * Each card carries: the event name, time, a tight Hebrew breakdown of data
 * fields touched in the request
 * body (profile / account / preferences), and the affected counterparts as
 * clickable chips. A chip's `page 1 / page 2` suffix marks where that user
 * sits in the actor's relations right now — null suffix means the event
 * removed them. Events that don't touch a counterpart (location/profile/
 * account/...) show no chip; events that don't touch data don't render a
 * data block — both are silent when there's nothing to say.
 */

export type LocationDetail = {
  cleared: boolean;
  lat?: number;
  lng?: number;
};

export type ProfileChange = {
  label: string;
  detail?: string;
};

/** A generic key / value pair pulled out of an account / preferences body
 * update — same render shape as profile changes but a separate type so the
 * server helper can populate the two independently. */
export type DataChange = {
  label: string;
  detail?: string;
};

export type AffectedUser = { id: string; page: 1 | 2 | null };

/**
 * One `watch` row as this page shows it. Humanised on the SERVER (label, tone,
 * direction word) so this component stays a renderer: the outcome vocabulary
 * is shared with the event rows and belongs in one place, next to them.
 */
export type ConnectionItem = {
  id: string;
  /** When this relation last moved — where it sits in the merged stream. */
  at: string;
  otherId: string | null;
  otherName: string | null;
  /** 'out' = they were watching; 'in' = they were the one being watched. */
  direction: "out" | "in";
  /** What the relation is / how it ended, already in words. */
  label: string;
  tone: "ok" | "busy" | "chat" | "idle" | "ended";
  /** This row is the one their own board is holding right now. */
  onBoard: boolean;
  /** They have dismissed it from their side. */
  cleared: boolean;
};

export type UnifiedEntry = {
  id: string;
  at: string;
  action: string;
  rawKey: string;
  ok: boolean;
  statusLabel: string;
  actorId: string | null;
  byOther: boolean;
  /** This row is ABOUT another person — an invitation, a decline, an approval,
   * or anything they did — rather than a heartbeat that merely happened to
   * name one. Only these carry the counterpart's face. */
  involvesPartner: boolean;
  /** A by-other row whose action actually named this person — the test that
   * decides whether it belongs here at all, and whether it may be phrased
   * from their side. */
  aimedHere: boolean;
  affected: AffectedUser[];
  location?: LocationDetail;
  profileChanges?: ProfileChange[];
  accountChanges?: DataChange[];
  /** Number of consecutive identical events collapsed into this one card
   * (>= 2 when a run was grouped, absent/1 for a standalone event). The
   * representative row is the NEWEST in the run — its details (time,
   * location, data changes) are the ones shown. */
  count?: number;
  /** Earliest `at` in the collapsed run — the run spans `untilAt … at`.
   * Only set when `count > 1`. */
  untilAt?: string;
};

export type UnifiedPartner = {
  name: string | null;
  email: string | null;
  photo: string | null;
};

export type UnifiedDict = {
  searchPlaceholder: string;
  clearSearch: string;
  empty: string;
  noMatches: string;
  showMore: string;
  showLess: string;
  unknownPartner: string;
  page1Tag: string;
  page2Tag: string;
  locationCleared: string;
  /** Direction words for a connection row. */
  watchedOut: string;
  watchedIn: string;
  onBoard: string;
  dismissed: string;
  /** Tooltip on the ×N badge, e.g. "{n} events in a row". Optional — when
   * absent the badge carries no title. `{n}` is substituted with the count. */
  groupedTitle?: string;
};

type FeedItem =
  | { kind: "event"; at: string; key: string; entry: UnifiedEntry }
  | { kind: "connection"; at: string; key: string; conn: ConnectionItem };

export function UnifiedActivity({
  selfId,
  entries,
  connections = [],
  partners,
  initial = 8,
  dict,
  locale,
}: {
  selfId: string;
  entries: UnifiedEntry[];
  /** Every watch this person has been either end of, merged into the same
   * stream as the events rather than listed beside it. */
  connections?: ConnectionItem[];
  partners: Record<string, UnifiedPartner>;
  initial?: number;
  dict: UnifiedDict;
  locale: Locale;
}) {
  const formatTime = (iso: string) => relativeTime(iso, locale);
  const formatExact = (iso: string) => dateTime(iso, locale);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const norm = query.trim().toLowerCase();

  // One stream, newest first. A connection is placed at the moment it last
  // moved, which is the only time it HAS in a chronological list.
  const merged = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [
      ...entries.map<FeedItem>((entry) => ({
        kind: "event",
        at: entry.at,
        key: `e-${entry.id}`,
        entry,
      })),
      ...connections.map<FeedItem>((conn) => ({
        kind: "connection",
        at: conn.at,
        key: `c-${conn.id}`,
        conn,
      })),
    ];
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }, [entries, connections]);

  const filtered = useMemo(() => {
    if (!norm) return merged;
    const hits = (id: string | null | undefined, name?: string | null) => {
      if (name && name.toLowerCase().includes(norm)) return true;
      const p = id ? partners[id] : null;
      if (!p) return false;
      if (p.name && p.name.toLowerCase().includes(norm)) return true;
      if (p.email && p.email.toLowerCase().includes(norm)) return true;
      return false;
    };
    return merged.filter((item) => {
      if (item.kind === "connection") {
        // A connection carries its counterpart's name itself, so it can still
        // be found when that account is gone and has no partner entry.
        return hits(item.conn.otherId, item.conn.otherName);
      }
      const e = item.entry;
      const ids = new Set(e.affected.map((a) => a.id));
      if (e.byOther && e.actorId) ids.add(e.actorId);
      if (ids.size === 0) return false;
      for (const id of ids) if (hits(id)) return true;
      return false;
    });
  }, [merged, partners, norm]);

  const hidden = filtered.length - initial;
  const shown = open ? filtered : filtered.slice(0, initial);

  return (
    <div>
      <div className="relative mb-4">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(false);
          }}
          placeholder={dict.searchPlaceholder}
          className="block w-full rounded-xl border border-border bg-background py-2.5 text-sm shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/15 ltr:pl-10 ltr:pr-9 rtl:pr-10 rtl:pl-9"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setOpen(false);
            }}
            aria-label={dict.clearSearch}
            className="absolute top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground ltr:right-2 rtl:left-2"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      {merged.length === 0 ? (
        <EmptyState>{dict.empty}</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>{dict.noMatches}</EmptyState>
      ) : (
        <>
          {/* One row per event — full width, vertically stacked, with a
              dividing border between rows. Reads like a real log: time on the
              leading edge, event name next, then any inline chips
              (location / partner / data fields). Replaces the earlier
              card-grid / masonry layouts (both produced visual gaps with
              variable-height content). */}
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {shown.map((item) => (
              <li key={item.key} className="bg-background">
                {item.kind === "connection" ? (
                  <ConnectionRow
                    conn={item.conn}
                    selfId={selfId}
                    partners={partners}
                    dict={dict}
                    formatTime={formatTime}
                    formatExact={formatExact}
                  />
                ) : (
                  <EventRow
                    entry={item.entry}
                    selfId={selfId}
                    partners={partners}
                    dict={dict}
                    formatTime={formatTime}
                    formatExact={formatExact}
                  />
                )}
              </li>
            ))}
          </ol>
          {hidden > 0 ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-4 transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
              {open ? dict.showLess : `${dict.showMore} (${hidden})`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * One log row. Single horizontal flex line: event name (lead), inline chips
 * for status / location / partners / data changes (truncated where they'd
 * push the time off), and the relative time on the trailing edge. Long data
 * blocks are joined to a single short text — if an operator needs the full
 * breakdown they hover for the `title`.
 */
function EventRow({
  entry,
  selfId,
  partners,
  dict,
  formatTime,
  formatExact,
}: {
  entry: UnifiedEntry;
  selfId: string;
  partners: Record<string, UnifiedPartner>;
  dict: UnifiedDict;
  formatTime: (iso: string) => string;
  formatExact: (iso: string) => string;
}) {
  const actor = entry.byOther && entry.actorId ? partners[entry.actorId] : null;
  const dataChanges = [
    ...(entry.profileChanges ?? []),
    ...(entry.accountChanges ?? []),
  ];
  const dataSummary = dataChanges
    .map((c) => (c.detail ? `${c.label}: ${c.detail}` : c.label))
    .join(" · ");

  const grouped = (entry.count ?? 1) > 1;

  // KIND (1) READS LIKE A CONNECTION ROW (user directive 2026-08-02: "the same
  // structure as 'watched by', all of kind 1"). One shape for every row that is
  // about a person: the ACT as a small lead-in, then WHO, then whatever is left
  // to say. The action stops being a bold heading and the "by:" label is gone —
  // a chip that follows the act already says who did it, and the label was a
  // word spent saying what the arrangement says.
  const aboutPerson = entry.involvesPartner;
  const lead = aboutPerson
    ? "shrink-0 text-xs text-muted-foreground"
    : "shrink-0 font-medium";

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
      <span className={lead}>{entry.action}</span>
      {/* The actor of a by-other row is always kind (1): the row is on this
          page precisely because THEY did something to this person. */}
      {actor && entry.actorId ? (
        <PartnerChip
          id={entry.actorId}
          partner={actor}
          fallback={dict.unknownPartner}
          selfId={selfId}
          photo
        />
      ) : null}
      {entry.affected.map((a) => (
        <PartnerChip
          key={a.id}
          id={a.id}
          partner={partners[a.id] ?? null}
          fallback={dict.unknownPartner}
          selfId={selfId}
          photo={aboutPerson}
          pageTag={
            a.page === 1
              ? dict.page1Tag
              : a.page === 2
                ? dict.page2Tag
                : null
          }
        />
      ))}
      {grouped ? (
        <span
          className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground tabular-nums"
          title={dict.groupedTitle ? dict.groupedTitle.replace("{n}", String(entry.count)) : undefined}
        >
          ×{entry.count}
        </span>
      ) : null}
      {!entry.ok ? (
        <StatusBadge tone="ended">{entry.statusLabel}</StatusBadge>
      ) : null}
      {entry.location ? (
        <LocationInline detail={entry.location} dict={dict} />
      ) : null}
      {dataSummary ? (
        <span
          className="min-w-0 flex-1 truncate text-xs text-muted-foreground"
          title={dataSummary}
        >
          {dataSummary}
        </span>
      ) : null}
      <time
        className="shrink-0 text-xs text-muted-foreground ms-auto"
        title={
          grouped && entry.untilAt
            ? `${formatExact(entry.untilAt)} – ${formatExact(entry.at)}`
            : formatExact(entry.at)
        }
      >
        {formatTime(entry.at)}
      </time>
    </div>
  );
}

/** Compact location indicator in the card header — a single pin icon link
 * to Google Maps (no coordinates, no label text). Hover/title carries the
 * "open in maps" hint for discoverability. `cleared` shows muted text. */
/**
 * What a location row has to SAY, which is only ever that the location was
 * cleared.
 *
 * The pin is gone (user directive 2026-08-02: remove the location symbol from
 * every list). It rode every `location` / `start` / `focus` row — the most
 * common rows there are — as a coloured mark that named no fact: the row's own
 * action word already said a location was updated, and the pin only repeated
 * it. It carried the Google Maps link for the coordinates, which goes with it;
 * the raw lat/lng are still on the log row for anyone who needs them.
 */
function LocationInline({
  detail,
  dict,
}: {
  detail: LocationDetail;
  dict: UnifiedDict;
}) {
  if (!detail.cleared) return null;
  return (
    <span className="text-xs text-muted-foreground">{dict.locationCleared}</span>
  );
}

/**
 * A counterpart named by an EVENT row. It carries a FACE only when the row is
 * about that person (user directive 2026-08-02) — an invitation, a decline, an
 * approval, anything the other user did. A heartbeat or a settings edit that
 * merely happens to name somebody, because the snapshot diff moved them at
 * that instant, gets the name alone: a portrait there says the row is about a
 * person when it is about a location.
 */
function PartnerChip({
  id,
  partner,
  fallback,
  selfId,
  pageTag,
  photo,
}: {
  id: string;
  partner: UnifiedPartner | null;
  fallback: string;
  selfId: string;
  pageTag?: string | null;
  photo: boolean;
}) {
  return (
    <Link
      href={`/users/${selfId}/with/${id}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 transition-colors hover:border-primary/40 hover:bg-muted",
        photo ? "px-1.5" : "px-2",
      )}
    >
      {photo ? (
        <Avatar
          src={partner?.photo ?? null}
          name={partner?.name ?? null}
          size="sm"
        />
      ) : null}
      <span className={cn("text-xs font-medium", photo && "ps-0.5 pe-1")}>
        {partner?.name ?? fallback}
      </span>
      {pageTag ? (
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
          {pageTag}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * One connection in the merged stream. It reads the other way round from an
 * event row on purpose: an event leads with what was DONE, a connection leads
 * with WHO, because the counterpart is the whole subject of it.
 */
function ConnectionRow({
  conn,
  selfId,
  partners,
  dict,
  formatTime,
  formatExact,
}: {
  conn: ConnectionItem;
  selfId: string;
  partners: Record<string, UnifiedPartner>;
  dict: UnifiedDict;
  formatTime: (iso: string) => string;
  formatExact: (iso: string) => string;
}) {
  const partner = conn.otherId ? partners[conn.otherId] : null;
  const name = conn.otherName?.trim() || partner?.name?.trim() || dict.unknownPartner;
  // THE SAME OBJECT, not a lookalike (user directive 2026-08-02: "these belong
  // to kind 1, they should show the same"). A connection and an invitation are
  // both rows about a person, so the person is drawn by the one component that
  // draws a person here — the same pill, the same face, the same link — rather
  // than by a second arrangement that happens to carry the same two things.
  const who = conn.otherId ? (
    <PartnerChip
      id={conn.otherId}
      partner={partner ?? null}
      fallback={name}
      selfId={selfId}
      photo
    />
  ) : (
    // A counterpart whose account is gone has no page to open — `watch` carries
    // no foreign key precisely so the row keeps working for the person still
    // holding the other end.
    <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium">
      {name}
    </span>
  );
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {conn.direction === "out" ? dict.watchedOut : dict.watchedIn}
        </span>
        {who}
        <StatusBadge tone={conn.tone}>{conn.label}</StatusBadge>
        {conn.onBoard ? (
          <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-border">
            {dict.onBoard}
          </span>
        ) : null}
        {conn.cleared ? (
          <span className="shrink-0 text-[10px] text-muted-foreground/70">
            {dict.dismissed}
          </span>
        ) : null}
      </div>
      <span
        className="shrink-0 text-xs text-muted-foreground"
        title={formatExact(conn.at)}
      >
        {formatTime(conn.at)}
      </span>
    </div>
  );
}
