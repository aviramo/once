"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreVertical, Check } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { relativeTime } from "@/lib/relativeTime";
import { profileCompleteNarrative, type Relations } from "@/lib/humanize";
import {
  watchStatusNarrative,
  watchInvitedTag,
  watchersLine,
  type WatchState,
} from "@/lib/watchStatus";
import { userImageUrl } from "@/lib/userImage";
import {
  parseUserLocation,
  haversineKm,
  formatDistance,
  type LngLat,
} from "@/lib/userLocation";
import { cn } from "@/lib/utils";
import { Avatar, StatusBadge } from "./ui";
import { UserActionMenu } from "./UserActionMenu";
import { PageReleaseBadge } from "./PageReleaseBadge";

export type UserRow = {
  user_id: string;
  name: string | null;
  created_at: string;
  last_seen: string | null;
  data: { images?: Array<{ normal?: string; hash?: string }> } | null;
  relations: Relations;
  /** Raw PostGIS geography (EWKB hex / EWKT / GeoJSON); decoded for distance. */
  location?: unknown;
  /** Test-environment flag. Never painted on the card — the whole list is one
   * environment, stated once in the header — but kept on the row because the
   * realtime merge carries it and the action menu acts on it. */
  is_test?: boolean | null;
  /** This person's one status, from `admin_watch_states`. Joined server-side
   * like `groups`, and preserved across realtime merges for the same reason:
   * a `users` payload cannot carry it. */
  watch?: WatchState;
};

type Group = { id: string; name: string };

type Props = {
  row: UserRow;
  email: string | null;
  dict: Dictionary["admin"];
  locale: Locale;
  /** The admin's own location — distance is shown only when both are known. */
  adminLoc: LngLat | null;
  /** In selection mode the whole card toggles selection instead of opening. */
  selectionMode: boolean;
  selected: boolean;
  onToggle: () => void;
  /** Groups catalog — passed through to the per-card action menu. */
  groups: Group[];
  /** Admin viewers see the status badges, last-seen/distance and the per-card
   * action menu. Group managers see identity only — no activity, no location,
   * no status. Default true (admin). */
  isAdmin?: boolean;
};

/**
 * One compact, dense user row-card: identity, the single "what are they doing
 * now" status, and a meta line. The group chips are gone (user, 2026-08-02) —
 * a card carried up to four of them, they wrapped to a second and third line,
 * and which circles someone is in is a fact you go to their page for, not one
 * you scan a list by. In browse mode the card opens the
 * detail page and the ⋯ button opens a small action menu anchored right next
 * to it; in selection mode the whole card is a checkbox.
 */
export function UserCard({
  row,
  email,
  dict,
  locale,
  adminLoc,
  selectionMode,
  selected,
  onToggle,
  groups,
  isAdmin = true,
}: Props) {
  const photo = userImageUrl(row.user_id, row.data?.images?.[0]?.normal);
  // ONE status: what this person is doing, read off `watch`. It replaced two
  // badges (page1's state beside page2's) that the reader had to reconcile and
  // that could contradict each other on live data.
  const status = watchStatusNarrative(dict.watch, dict, row.watch);
  // The one thing that does not collapse into that status: an invitation he
  // RECEIVED. Somebody else's action, still unanswered, and true alongside
  // whatever he is doing himself.
  const invited = watchInvitedTag(dict.watch, row.watch);
  const watching = watchersLine(dict.watch, row.watch);
  // The photo gate lives in others(only_available), not in the status, so the
  // status badge alone would read "free, waiting for a match" for a profile
  // the server can never surface. Shown alongside it, not instead.
  const incomplete = profileCompleteNarrative(dict, row.data);
  const loc = isAdmin && adminLoc ? parseUserLocation(row.location) : null;
  const distKm = loc && adminLoc ? haversineKm(adminLoc, loc) : null;

  const [menuOpen, setMenuOpen] = useState(false);
  // Tracks whether either page-release badge has its confirm popover open. We
  // need to lift the whole card's z-index in that case so a sibling card's
  // avatar (which lives in its own stacking context) never paints over the
  // popover — same defence the action menu already has via `menuOpen`.
  const [badgePopoverOpen, setBadgePopoverOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const releaseDict = {
    release: dict.actions.release,
    busy: dict.actions.busy,
    done: dict.actions.done,
    fail: dict.actions.fail,
  };
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Dismiss the action menu on an outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !btnRef.current?.contains(t)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function toggleMenu() {
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    // Open upward when the trigger is near the viewport bottom (decided once,
    // at open time, so the panel never flickers after mount).
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const below = window.innerHeight - r.bottom;
      setDropUp(below < 360 && r.top > below);
    }
    setMenuOpen(true);
  }

  const inner = (
    <div className="flex gap-3">
      {selectionMode ? (
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background",
          )}
        >
          {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      ) : null}
      <Avatar src={photo} name={row.name} size="md" />
      <div className="min-w-0 flex-1">
        {/* The status rides the NAME's row, at the opposite end from the name
            (user, 2026-08-02): one line answers who this is and what they are
            doing, and the row below is left for the exceptions. Both sides may
            shrink — a long status truncates rather than pushing the name off,
            and vice versa. */}
        <div className="flex items-center gap-1.5">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
            {row.name ?? "—"}
          </h3>
          {isAdmin ? (
            <PageReleaseBadge
              userId={row.user_id}
              page={1}
              tone={status.tone}
              text={status.text}
              onOpenChange={setBadgePopoverOpen}
              dict={releaseDict}
            />
          ) : null}
          {!selectionMode && isAdmin ? (
            <button
              ref={btnRef}
              type="button"
              aria-label={dict.actions.menuTitle}
              aria-expanded={menuOpen}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMenu();
              }}
              className={cn(
                "pointer-events-auto -me-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
                menuOpen
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <MoreVertical className="size-4" />
            </button>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {email ?? dict.noEmail}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {/* What is left on this row is the EXCEPTIONS: a profile the server
              can never surface, and an invitation somebody sent this person and
              they have not answered. Both are interactive the same way the
              status is — tap to reveal a one-tap release beside the badge. */}
          {isAdmin && incomplete ? (
            <StatusBadge tone={incomplete.tone}>{incomplete.text}</StatusBadge>
          ) : null}
          {isAdmin && invited ? (
            <PageReleaseBadge
              userId={row.user_id}
              page={2}
              tone={invited.tone}
              text={invited.text}
              onOpenChange={setBadgePopoverOpen}
              dict={releaseDict}
            />
          ) : null}
        </div>
        {isAdmin ? (
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {relativeTime(row.last_seen, locale)}
            {/* How many are looking at him is a QUANTITY, not a status: it says
                nothing about what he is doing, so it rides the meta line with
                the other measurements rather than taking a badge. */}
            {watching ? (
              <span className="text-muted-foreground/70">
                {" · "}
                {watching}
              </span>
            ) : null}
            {distKm != null ? (
              <span className="text-muted-foreground/70">
                {" · "}
                {formatDistance(distKm, locale)}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );

  const base = "rounded-xl border bg-background p-3.5 shadow-sm transition-all";

  if (selectionMode) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className={cn(
          base,
          "block w-full cursor-pointer text-start",
          selected
            ? "border-primary ring-2 ring-primary/50"
            : "border-border hover:border-primary/40",
        )}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className={cn(
        base,
        "relative hover:border-primary/40 hover:shadow-md",
        // Lift above sibling cards while ANY popover is open — the action menu
        // or a page-release badge confirm — so neither ever paints under the
        // next card (a sibling card's avatar lives in its own stacking context
        // and otherwise wins).
        menuOpen || badgePopoverOpen
          ? "z-20 border-primary/40 shadow-md"
          : "border-border",
      )}
    >
      {/* Full-card link painted behind the content (the content is
          pointer-events-none); the ⋯ button re-enables pointer events. */}
      <Link
        href={`/users/${row.user_id}`}
        aria-label={row.name ?? "—"}
        className="absolute inset-0 z-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <div className="pointer-events-none relative z-10">{inner}</div>

      {/* Action menu — a popover anchored right next to the ⋯ button. */}
      {menuOpen ? (
        <div
          ref={panelRef}
          className={cn(
            "absolute end-2 z-30 max-h-[68vh] w-72 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background p-2 shadow-xl",
            dropUp ? "bottom-12" : "top-12",
          )}
        >
          <UserActionMenu
            ids={[row.user_id]}
            targetLabel={row.name ?? row.user_id.slice(0, 8)}
            singleUserId={row.user_id}
            groups={groups}
            dict={dict.actions}
            onClose={() => setMenuOpen(false)}
            onDone={() => setMenuOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}
