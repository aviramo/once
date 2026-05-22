"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreVertical, Check } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { relativeTime } from "@/lib/relativeTime";
import {
  page1Narrative,
  page2Narrative,
  type Relations,
} from "@/lib/humanize";
import { userImageUrl } from "@/lib/userImage";
import {
  parseUserLocation,
  haversineKm,
  formatDistance,
  type LngLat,
} from "@/lib/userLocation";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";
import { UserActionMenu } from "./UserActionMenu";
import { PageReleaseBadge } from "./PageReleaseBadge";

export type UserRoleBadge = { name: string; enabled: boolean };

export type UserRow = {
  user_id: string;
  name: string | null;
  created_at: string;
  last_seen: string | null;
  data: { images?: Array<{ normal?: string; hash?: string }> } | null;
  relations: Relations;
  /** Raw PostGIS geography (EWKB hex / EWKT / GeoJSON); decoded for distance. */
  location?: unknown;
  /** Joined separately from `users`; preserved across realtime merges since
   * the postgres_changes payload for `users` never carries it. */
  roles?: UserRoleBadge[];
};

type Group = { id: string; name: string; enabled: boolean };

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
};

const roleTag =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium";

/**
 * One compact, dense user row-card: identity, the single "what are they doing
 * now" status, group tags, and a meta line. In browse mode the card opens the
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
}: Props) {
  const photo = userImageUrl(row.user_id, row.data?.images?.[0]?.normal);
  // Both boards shown as two badges, always in order: page 1 then page 2 —
  // the fixed order is what tells them apart, so no per-badge label.
  const n1 = page1Narrative(dict, row.relations);
  const n2 = page2Narrative(dict, row.relations);
  const loc = adminLoc ? parseUserLocation(row.location) : null;
  const distKm = loc && adminLoc ? haversineKm(adminLoc, loc) : null;
  const roles = row.roles ?? [];

  const [menuOpen, setMenuOpen] = useState(false);
  // Tracks whether either page-release badge has its confirm popover open. We
  // need to lift the whole card's z-index in that case so a sibling card's
  // avatar (which lives in its own stacking context) never paints over the
  // popover — same defence the action menu already has via `menuOpen`.
  const [badgePopoverOpen, setBadgePopoverOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
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
        <div className="flex items-start gap-1">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold leading-tight">
            {row.name ?? "—"}
          </h3>
          {!selectionMode ? (
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
                "pointer-events-auto -me-1 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors",
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
          {/* The page badges are interactive: tap to open a small confirm
              popover and release that page. The ⋯ menu no longer carries
              per-page release for a single user (it stays for the BULK sheet). */}
          <PageReleaseBadge
            userId={row.user_id}
            page={1}
            tone={n1.tone}
            text={n1.text}
            onOpenChange={setBadgePopoverOpen}
            dict={{
              confirmText: dict.actions.confirmRelease1.replace(
                "{target}",
                row.name ?? row.user_id.slice(0, 8),
              ),
              cancel: dict.actions.cancel,
              confirm: dict.actions.confirm,
              busy: dict.actions.busy,
              done: dict.actions.done,
              fail: dict.actions.fail,
            }}
          />
          <PageReleaseBadge
            userId={row.user_id}
            page={2}
            tone={n2.tone}
            text={n2.text}
            onOpenChange={setBadgePopoverOpen}
            dict={{
              confirmText: dict.actions.confirmRelease2.replace(
                "{target}",
                row.name ?? row.user_id.slice(0, 8),
              ),
              cancel: dict.actions.cancel,
              confirm: dict.actions.confirm,
              busy: dict.actions.busy,
              done: dict.actions.done,
              fail: dict.actions.fail,
            }}
          />
          {roles.map((r) => (
            <span
              key={r.name}
              className={cn(
                roleTag,
                r.enabled
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground line-through",
              )}
            >
              {r.name}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {relativeTime(row.last_seen, locale)}
          {distKm != null ? (
            <span className="text-muted-foreground/70">
              {" · "}
              {formatDistance(distKm, locale)}
            </span>
          ) : null}
        </p>
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
        href={`/admin/users/${row.user_id}`}
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
