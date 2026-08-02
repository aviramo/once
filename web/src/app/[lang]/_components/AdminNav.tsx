"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  Users,
  Flag,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { CirclesIcon } from "./AppIcons";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { SignOutButton } from "./SignOutButton";

/**
 * Admin chrome navigation, mobile-first. One declared link set (NAV_ITEMS),
 * two renderings:
 * - sm and up: inline icon+label pills inside the header bar, plus the
 *   account cluster (who's signed in + sign out).
 * - below sm: a fixed bottom tab bar — four thumb-reachable destinations —
 *   while the header keeps only the logo + a compact sign-out. A bottom bar
 *   beats a hamburger for a tool operated one-handed all day: every screen is
 *   one tap, nothing is hidden behind a menu.
 *
 * Adding a tab is a single NAV_ITEMS entry.
 */

type NavKey = "dashboard" | "users" | "groups" | "reports";

type Labels = Record<NavKey, string> & { signOut: string };

/** A nav-tab badge: either an "alert" (rose; reports queue) or an "info"
 * (muted; catalog counts — users / groups — surfaced here instead of
 * the former dashboard "quick nav" section). Plain number = alert (legacy). */
export type BadgeSpec = number | { count: number; tone?: "alert" | "info" };

type Props = {
  active: NavKey;
  /** Which tabs to render. Admins see them all; group managers only see the
   * tabs that are scope-aware (users + roles). Defaults to "all" for older
   * callers. */
  visibleKeys?: readonly NavKey[];
  labels: Labels;
  userLabel?: string;
  /** Per-tab live counts. A positive count paints a small badge on that tab
   * so the operator sees the queue/totals from any admin screen. */
  badges?: Partial<Record<NavKey, BadgeSpec>>;
};

function normalizeSpec(
  b: BadgeSpec | undefined,
): { count: number; tone: "alert" | "info" } | null {
  if (b == null) return null;
  if (typeof b === "number") return b > 0 ? { count: b, tone: "alert" } : null;
  return b.count > 0 ? { count: b.count, tone: b.tone ?? "alert" } : null;
}

/** Small numeric badge for a nav tab — appears only when the count is
 * positive, so a quiet board paints zero chrome. Tabular nums keeps 1- and
 * 2-digit pills the same height. `99+` caps the worst case. The `tone`
 * distinguishes "you have moderation pending" (alert / rose) from "this tab
 * lists N things" (info / muted) so a catalog count doesn't read as an alarm. */
function NavBadge({
  spec,
  active,
  variant,
}: {
  spec: { count: number; tone: "alert" | "info" } | null;
  active: boolean;
  variant: "inline" | "corner";
}) {
  if (!spec) return null;
  const label = spec.count > 99 ? "99+" : String(spec.count);
  const palette =
    spec.tone === "alert"
      ? active
        ? "bg-primary text-primary-foreground"
        : "bg-rose-500 text-white"
      : active
        ? "bg-primary/15 text-primary"
        : "bg-muted text-muted-foreground";
  const base =
    "inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none tabular-nums";
  if (variant === "corner") {
    return (
      <span
        aria-label={`(${label})`}
        className={cn("pointer-events-none absolute -end-1.5 -top-0.5", base, palette)}
      >
        {label}
      </span>
    );
  }
  return (
    <span aria-label={`(${label})`} className={cn("ms-1", base, palette)}>
      {label}
    </span>
  );
}

/** A bottom-bar cell shaped like a nav tab but it signs out instead of
 * navigating. Lives next to the nav tabs so it's reachable by the same thumb
 * grip as everything else on the bar — operators kept missing the small
 * sign-out icon up in the header. The leading border + rose tone keep it
 * visually distinct from a navigation destination. */
function BottomSignOut({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function onClick() {
    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.replace("/");
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="flex flex-1 flex-col items-center gap-1 border-s border-border pb-1.5 pt-2 text-[10px] font-medium text-rose-600 transition-opacity disabled:opacity-50 dark:text-rose-400"
    >
      <span className="flex h-7 w-14 items-center justify-center rounded-full">
        <LogOut className="size-[18px]" />
      </span>
      {label}
    </button>
  );
}

/** Lucide for the generic destinations; the app's own mark where the app has
 * one, so the panel and the product point at circles with the same drawing. */
type NavIcon = LucideIcon | ((p: { className?: string }) => React.ReactElement);

const NAV_ITEMS: { key: NavKey; href: string; icon: NavIcon }[] = [
  { key: "dashboard", href: "/", icon: LayoutGrid },
  { key: "users", href: "/users", icon: Users },
  { key: "groups", href: "/groups", icon: CirclesIcon },
  { key: "reports", href: "/reports", icon: Flag },
];

export function AdminNav({ active, visibleKeys, labels, userLabel, badges }: Props) {
  const visible = visibleKeys ? new Set(visibleKeys) : null;
  const items = NAV_ITEMS.filter((i) => !visible || visible.has(i.key));
  return (
    <>
      {/* Desktop: inline icon+label pills */}
      <nav className="hidden items-center gap-0.5 sm:flex">
        {items.map(({ key, href, icon: Icon }) => (
          <Link
            key={key}
            href={href}
            aria-current={active === key ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              active === key
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {labels[key]}
            <NavBadge
              spec={normalizeSpec(badges?.[key])}
              active={active === key}
              variant="inline"
            />
          </Link>
        ))}
      </nav>

      {/* Desktop: account cluster */}
      <div className="ms-auto hidden items-center gap-3 sm:flex">
        {userLabel ? (
          <span className="max-w-[16rem] truncate text-xs text-muted-foreground">
            {userLabel}
          </span>
        ) : null}
        <SignOutButton label={labels.signOut} />
      </div>

      {/* Mobile: labelled sign-out in the header so it's discoverable (nav
          lives in the bottom bar). An icon-only square blends into the chrome
          and operators couldn't find it. */}
      <div className="ms-auto sm:hidden">
        <SignOutButton label={labels.signOut} />
      </div>

      {/* Mobile: fixed bottom tab bar.
          Last cell is a sign-out action (not a navigation link), styled with a
          leading border separator and rose accent so it never reads as another
          tab. Operators reported the header sign-out was too easy to miss on
          mobile, so the action is duplicated here within thumb reach. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-lg items-stretch">
          {items.map(({ key, href, icon: Icon }) => (
            <Link
              key={key}
              href={href}
              aria-current={active === key ? "page" : undefined}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 pb-1.5 pt-2 text-[10px] font-medium transition-colors",
                active === key ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-14 items-center justify-center rounded-full transition-colors",
                  active === key ? "bg-primary/10" : "bg-transparent",
                )}
              >
                <Icon className="size-[18px]" />
                <NavBadge
                  spec={normalizeSpec(badges?.[key])}
                  active={active === key}
                  variant="corner"
                />
              </span>
              {labels[key]}
            </Link>
          ))}
          <BottomSignOut label={labels.signOut} />
        </div>
      </nav>
    </>
  );
}
