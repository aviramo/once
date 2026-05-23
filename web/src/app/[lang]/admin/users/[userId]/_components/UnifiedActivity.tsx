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
 * Merged server-log + interactions feed for a single user. One chronological
 * list of "event cards" (one per server action) with a name/email search above
 * that filters cards by the partners involved.
 *
 * Each card shows:
 *   - header: event name, time, an "ended" badge ONLY when the call failed
 *     (success is the common case — silence is louder than a green tag)
 *   - "Initiated by" chip for events SOMEONE ELSE did that affected this user
 *   - affected users: one chip per counterpart with a small page-1/page-2
 *     suffix telling which slot of the actor's relations they sit in after
 *     the event (or no suffix when the action removed them)
 *   - post-event page1 / page2 state badges (only when the actor IS this user,
 *     since the log snapshots the actor's row)
 *   - event-specific detail block: location updates show coords + Google Maps
 *     link; profile updates show a Hebrew breakdown of what changed
 */

export type Narrative = { text: string; tone: Tone };

export type LocationDetail = {
  cleared: boolean; // true if location was set to null
  lat?: number;
  lng?: number;
};

export type ProfileChange = {
  label: string; // Hebrew label of the field that changed
  detail?: string; // optional short preview of the new value
};

/** One counterpart involved in an event. `page` is where they currently sit
 * in the actor's relations snapshot — 1 / 2 / null (no longer present, e.g.
 * the target of a `remove` / `decline` / `leave`). */
export type AffectedUser = { id: string; page: 1 | 2 | null };

export type UnifiedEntry = {
  id: string;
  at: string;
  action: string; // humanized event key
  rawKey: string; // raw key (start, find, ...)
  ok: boolean;
  statusLabel: string;
  actorId: string | null; // actor of the row; null on unauthenticated rows
  byOther: boolean; // true if the actor is NOT the user being viewed
  affected: AffectedUser[]; // counterparts with their current page placement
  page1State: Narrative | null;
  page2State: Narrative | null;
  location?: LocationDetail;
  profileChanges?: ProfileChange[];
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
  page1Tag: string; // "page 1" — small suffix on a chip
  page2Tag: string; // "page 2"
  page1StateLabel: string;
  page2StateLabel: string;
  noStateAvailable: string;
  locationUpdated: string;
  locationCleared: string;
  openInMaps: string;
  profileUpdated: string;
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
          <ol className="flex flex-col gap-2.5">
            {shown.map((e) => (
              <li key={e.id}>
                <EventCard
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

function EventCard({
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
  const showStateRow = entry.page1State || entry.page2State;
  const hasParties = !!actor || entry.affected.length > 0;
  const hasDetail =
    !!entry.location ||
    (entry.profileChanges && entry.profileChanges.length > 0);

  return (
    <div className="rounded-xl border border-border bg-background shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-semibold">{entry.action}</h3>
          {!entry.ok ? (
            <StatusBadge tone="ended">{entry.statusLabel}</StatusBadge>
          ) : null}
        </div>
        <span
          className="shrink-0 text-xs text-muted-foreground"
          title={formatExact(entry.at)}
        >
          {formatTime(entry.at)}
        </span>
      </header>

      {hasParties ? (
        <div className="space-y-1.5 border-t border-border px-4 py-2.5">
          {actor && entry.actorId ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">
                {dict.byActorPrefix}
              </span>
              <PartnerChip
                id={entry.actorId}
                partner={actor}
                fallback={dict.unknownPartner}
                selfId={selfId}
              />
            </div>
          ) : null}
          {entry.affected.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
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
            </div>
          ) : null}
        </div>
      ) : null}

      {hasDetail ? (
        <div className="border-t border-border">
          {entry.location ? (
            <LocationBlock detail={entry.location} dict={dict} />
          ) : null}
          {entry.profileChanges && entry.profileChanges.length > 0 ? (
            <ProfileBlock changes={entry.profileChanges} dict={dict} />
          ) : null}
        </div>
      ) : null}

      {showStateRow ? (
        <div className="grid gap-3 border-t border-border px-4 py-2.5 sm:grid-cols-2">
          <StateLine
            label={dict.page1StateLabel}
            narrative={entry.page1State}
            fallback={dict.noStateAvailable}
          />
          <StateLine
            label={dict.page2StateLabel}
            narrative={entry.page2State}
            fallback={dict.noStateAvailable}
          />
        </div>
      ) : null}
    </div>
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
      href={`/admin/users/${selfId}/with/${id}`}
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

function StateLine({
  label,
  narrative,
  fallback,
}: {
  label: string;
  narrative: Narrative | null;
  fallback: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      {narrative ? (
        <StatusBadge tone={narrative.tone}>{narrative.text}</StatusBadge>
      ) : (
        <span className="text-xs text-muted-foreground">{fallback}</span>
      )}
    </div>
  );
}

function LocationBlock({
  detail,
  dict,
}: {
  detail: LocationDetail;
  dict: UnifiedDict;
}) {
  if (detail.cleared) {
    return (
      <div className="px-4 py-2.5 text-xs text-muted-foreground">
        {dict.locationCleared}
      </div>
    );
  }
  if (detail.lat == null || detail.lng == null) return null;
  const coords = `${detail.lat.toFixed(6)}, ${detail.lng.toFixed(6)}`;
  const mapsUrl = `https://www.google.com/maps?q=${detail.lat},${detail.lng}`;
  return (
    <div className="px-4 py-2.5 text-xs">
      <span className="font-medium text-muted-foreground">
        {dict.locationUpdated}
      </span>{" "}
      <span className="tabular-nums">{coords}</span>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noreferrer noopener"
        className="ms-2 inline-flex items-center gap-1 font-medium text-primary hover:underline"
      >
        <MapPin className="size-3.5" aria-hidden />
        {dict.openInMaps}
      </a>
    </div>
  );
}

function ProfileBlock({
  changes,
  dict,
}: {
  changes: ProfileChange[];
  dict: UnifiedDict;
}) {
  return (
    <div className="px-4 py-2.5 text-xs">
      <span className="font-medium text-muted-foreground">
        {dict.profileUpdated}
      </span>
      <ul className="mt-1.5 space-y-1">
        {changes.map((c, i) => (
          <li key={i} className="flex items-start gap-1.5">
            <span className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
            <span>
              <span className="font-medium">{c.label}</span>
              {c.detail ? (
                <span className="text-muted-foreground">: {c.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
