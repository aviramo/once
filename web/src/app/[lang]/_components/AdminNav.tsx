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
 * - sm and up: `AdminNav` — inline icon+label pills inside the header bar,
 *   plus the account cluster (who's signed in + sign out).
 * - below sm: `AdminBottomBar` — a fixed bottom tab bar, four thumb-reachable
 *   destinations, while the header keeps the logo and the environment switch.
 *   A bottom bar beats a hamburger for a tool operated one-handed all day:
 *   every screen is one tap, nothing is hidden behind a menu.
 *
 * THEY ARE TWO COMPONENTS BECAUSE THE BAR MAY NOT BE RENDERED INSIDE THE
 * HEADER. It was, and `position: fixed` does not mean the viewport inside an
 * ancestor that has a filter: the header is `backdrop-blur`, which makes it a
 * containing block for fixed descendants, so `bottom-0` resolved to the
 * HEADER's bottom edge — the bar sat across the top of the screen, at z-40
 * over the header's z-30, painting out the logo and the environment switch.
 * Every mobile screen in the panel was missing its primary control, and the
 * bar looked deliberate enough there that it read as the design. `globals.css`
 * carries the same warning about a transform on <main> for the same reason.
 * Anything `fixed` belongs OUTSIDE both.
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

/** The tabs this viewer may see, in declared order. Both renderings read it,
 * so the desktop pills and the mobile bar can never list different places. */
function visibleItems(visibleKeys?: readonly NavKey[]) {
  const visible = visibleKeys ? new Set(visibleKeys) : null;
  return NAV_ITEMS.filter((i) => !visible || visible.has(i.key));
}

export function AdminNav({ active, visibleKeys, labels, userLabel, badges }: Props) {
  const items = visibleItems(visibleKeys);
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

      {/* No mobile header sign-out: the bottom bar's BottomSignOut is the
          mobile one, and two sign-outs on one row cost the header the ~90px
          the ENVIRONMENT switch stands in (this row does not wrap and the
          shell clips its overflow). */}
    </>
  );
}

/**
 * Mobile: the fixed bottom tab bar. Rendered by AdminShell as a SIBLING of the
 * header and of <main> — see the note at the top of this file for why it may
 * not live inside either.
 *
 * The last cell is a sign-out action, not a navigation link: a leading border
 * and the rose accent keep it from reading as another tab. It is the only
 * sign-out on a phone.
 */
export function AdminBottomBar({
  active,
  visibleKeys,
  labels,
  badges,
}: Omit<Props, "userLabel">) {
  const items = visibleItems(visibleKeys);
  return (
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
  );
}
