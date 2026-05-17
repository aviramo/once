"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { SignOutButton } from "./SignOutButton";

/**
 * Admin chrome navigation. One source for both layouts:
 * - sm and up: links + actions inline in the header bar.
 * - below sm: a single hamburger that opens a dropdown holding every option,
 *   so the bar stays one clean line and never overflows the viewport.
 *
 * The link set is declared ONCE (NAV_ITEMS) and rendered by both layouts —
 * adding a tab is a single edit, never two parallel JSX blocks.
 */

type NavKey = "dashboard" | "users" | "roles" | "areas" | "map";

type Labels = Record<NavKey, string> & {
  site: string;
  signOut: string;
};

type Props = {
  active: NavKey;
  labels: Labels;
  userLabel?: string;
};

const NAV_ITEMS: { key: NavKey; href: string }[] = [
  { key: "dashboard", href: "/admin" },
  { key: "users", href: "/admin/users" },
  { key: "roles", href: "/admin/roles" },
  { key: "areas", href: "/admin/areas" },
  { key: "map", href: "/admin/map" },
];

const linkBase = "rounded-md px-3 py-1.5 font-medium transition-colors";
const linkOn = "bg-muted text-foreground";
const linkOff =
  "text-muted-foreground hover:bg-muted/60 hover:text-foreground";

export function AdminNav({ active, labels, userLabel }: Props) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      {/* Desktop: inline links */}
      <nav className="hidden items-center gap-1 text-sm sm:flex">
        {NAV_ITEMS.map(({ key, href }) => (
          <Link
            key={key}
            href={href}
            className={cn(linkBase, active === key ? linkOn : linkOff)}
          >
            {labels[key]}
          </Link>
        ))}
      </nav>

      {/* Desktop: inline actions */}
      <div className="ms-auto hidden items-center gap-4 sm:flex">
        {userLabel ? (
          <span className="text-xs text-muted-foreground">{userLabel}</span>
        ) : null}
        <Link
          href="/"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {labels.site}
        </Link>
        <SignOutButton label={labels.signOut} />
      </div>

      {/* Mobile: hamburger toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="ms-auto inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground sm:hidden"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {/* Mobile: dropdown panel (wraps to its own line via basis-full) */}
      {open ? (
        <nav className="basis-full border-t border-border pt-3 pb-1 text-sm sm:hidden">
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ key, href }) => (
              <Link
                key={key}
                href={href}
                onClick={close}
                className={cn(linkBase, active === key ? linkOn : linkOff)}
              >
                {labels[key]}
              </Link>
            ))}
            <Link href="/" onClick={close} className={cn(linkBase, linkOff)}>
              {labels.site}
            </Link>
            {userLabel ? (
              <span className="px-3 pt-2 text-xs text-muted-foreground">
                {userLabel}
              </span>
            ) : null}
            <div className="px-3 pt-2">
              <SignOutButton label={labels.signOut} />
            </div>
          </div>
        </nav>
      ) : null}
    </>
  );
}
