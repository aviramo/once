"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, MapPin, Search, X } from "lucide-react";
import { Avatar, EmptyState, StatusBadge } from "../../../_components/ui";
import type { Tone } from "@/lib/humanize";
import { relativeTime, dateTime } from "@/lib/relativeTime";
import type { Locale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/**
 * Merged events log for a single admin user. One chronological list of focused
 * "event cards" with a name/email search above that filters by counterpart.
 *
 * Each card carries: the event name, time, a `Maps` link when the row updated
 * location, a tight Hebrew breakdown of data fields touched in the request
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

export type UnifiedEntry = {
  id: string;
  at: string;
  action: string;
  rawKey: string;
  ok: boolean;
  statusLabel: string;
  actorId: string | null;
  byOther: boolean;
  affected: AffectedUser[];
  location?: LocationDetail;
  profileChanges?: ProfileChange[];
  accountChanges?: DataChange[];
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
  byActorPrefix: string;
  page1Tag: string;
  page2Tag: string;
  locationCleared: string;
  openInMaps: string;
};

export function UnifiedActivity({
  selfId,
  entries,
  partners,
  initial = 8,
  dict,
  locale,
}: {
  selfId: string;
  entries: UnifiedEntry[];
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

  const filtered = useMemo(() => {
    if (!norm) return entries;
    return entries.filter((e) => {
      const ids = new Set(e.affected.map((a) => a.id));
      if (e.byOther && e.actorId) ids.add(e.actorId);
      if (ids.size === 0) return false;
      for (const id of ids) {
        const p = partners[id];
        if (!p) continue;
        if (p.name && p.name.toLowerCase().includes(norm)) return true;
        if (p.email && p.email.toLowerCase().includes(norm)) return true;
      }
      return false;
    });
  }, [entries, partners, norm]);

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

      {entries.length === 0 ? (
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
            {shown.map((e) => (
              <li key={e.id} className="bg-background">
                <EventRow
                  entry={e}
                  selfId={selfId}
                  partners={partners}
                  dict={dict}
                  formatTime={formatTime}
                  formatExact={formatExact}
                />
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

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
      <span className="shrink-0 font-medium">{entry.action}</span>
      {!entry.ok ? (
        <StatusBadge tone="ended">{entry.statusLabel}</StatusBadge>
      ) : null}
      {entry.location ? (
        <LocationInline detail={entry.location} dict={dict} />
      ) : null}
      {actor && entry.actorId ? (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">{dict.byActorPrefix}</span>
          <PartnerChip
            id={entry.actorId}
            partner={actor}
            fallback={dict.unknownPartner}
            selfId={selfId}
          />
        </span>
      ) : null}
      {entry.affected.map((a) => (
        <PartnerChip
          key={a.id}
          id={a.id}
          partner={partners[a.id] ?? null}
          fallback={dict.unknownPartner}
          selfId={selfId}
          pageTag={
            a.page === 1
              ? dict.page1Tag
              : a.page === 2
                ? dict.page2Tag
                : null
          }
        />
      ))}
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
        title={formatExact(entry.at)}
      >
        {formatTime(entry.at)}
      </time>
    </div>
  );
}

/** Compact location indicator in the card header — a single pin icon link
 * to Google Maps (no coordinates, no label text). Hover/title carries the
 * "open in maps" hint for discoverability. `cleared` shows muted text. */
function LocationInline({
  detail,
  dict,
}: {
  detail: LocationDetail;
  dict: UnifiedDict;
}) {
  if (detail.cleared) {
    return (
      <span className="text-xs text-muted-foreground">{dict.locationCleared}</span>
    );
  }
  if (detail.lat == null || detail.lng == null) return null;
  const url = `https://www.google.com/maps?q=${detail.lat},${detail.lng}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      title={dict.openInMaps}
      aria-label={dict.openInMaps}
      className="inline-flex items-center rounded p-0.5 text-primary transition-colors hover:bg-primary/10"
    >
      <MapPin className="size-4" aria-hidden />
    </a>
  );
}

function PartnerChip({
  id,
  partner,
  fallback,
  selfId,
  pageTag,
}: {
  id: string;
  partner: UnifiedPartner | null;
  fallback: string;
  selfId: string;
  pageTag?: string | null;
}) {
  return (
    <Link
      href={`/users/${selfId}/with/${id}`}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-1.5 py-0.5 transition-colors hover:border-primary/40 hover:bg-muted"
    >
      <Avatar
        src={partner?.photo ?? null}
        name={partner?.name ?? null}
        size="sm"
      />
      <span className="ps-0.5 pe-1 text-xs font-medium">
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
