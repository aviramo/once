import Link from "next/link";
import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Tone } from "@/lib/humanize";
import { cn } from "@/lib/utils";
import { AdminNav } from "./AdminNav";

/**
 * The single admin design system. Every admin screen composes these — no page
 * re-implements a card, badge, avatar, section header or shell. Flat surfaces
 * only (no gradients), logical properties so RTL/LTR both work.
 */

/* ---------------------------------------------------------------- Shell -- */

type ShellProps = {
  dict: Dictionary["admin"];
  active: "users" | "areas";
  children: ReactNode;
  /** Sub-page back link target (omitted on the top-level list pages). */
  backHref?: string;
  userLabel?: string;
};

export function AdminShell({
  dict,
  active,
  children,
  backHref,
  userLabel,
}: ShellProps) {
  return (
    // overflow-x-clip (not hidden) guards every admin page against a child
    // that's momentarily wider than the viewport — a long unbroken email/name,
    // an input's intrinsic width — without introducing a scroll container
    // (sticky header keeps working) or a horizontal scrollbar.
    <div className="min-h-screen overflow-x-clip bg-muted/30">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        {/* Wraps to a second line on narrow screens (no fixed height) so the
            header never forces the document wider than the viewport. */}
        <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2 sm:flex-nowrap sm:gap-6 sm:px-5 sm:py-0">
          <Link href="/admin" className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight">Once</span>
            <span className="text-sm text-muted-foreground">
              {dict.dashboardTitle}
            </span>
          </Link>
          <AdminNav
            active={active}
            labels={{
              users: dict.nav.users,
              areas: dict.nav.areas,
              site: dict.nav.site,
              signOut: dict.signOut,
            }}
            userLabel={userLabel}
          />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-8">
        {backHref ? (
          <Link
            href={backHref}
            className="mb-5 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {dict.back}
          </Link>
        ) : null}
        {children}
      </main>
    </div>
  );
}

/* --------------------------------------------------------------- Section -- */

export function Section({
  title,
  count,
  hint,
  action,
  children,
  className,
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-10 first:mt-0", className)}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">
            {title}
            {typeof count === "number" ? (
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                {count}
              </span>
            ) : null}
          </h2>
          {hint ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ Card -- */

export function Card({
  children,
  href,
  className,
}: {
  children: ReactNode;
  href?: string;
  className?: string;
}) {
  const base =
    "rounded-2xl border border-border bg-background p-5 transition-colors";
  if (href) {
    return (
      <Link
        href={href}
        className={cn(base, "block hover:border-primary/40 hover:bg-muted/30", className)}
      >
        {children}
      </Link>
    );
  }
  return <div className={cn(base, className)}>{children}</div>;
}

/* ---------------------------------------------------------------- Avatar -- */

const AVATAR_SIZE: Record<string, string> = {
  sm: "size-10 text-sm",
  md: "size-14 text-lg",
  lg: "size-20 text-2xl",
  xl: "size-28 text-4xl",
};

export function Avatar({
  src,
  name,
  size = "md",
}: {
  src: string | null;
  name: string | null;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const cls = AVATAR_SIZE[size] ?? AVATAR_SIZE.md;
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden rounded-2xl bg-muted",
        cls,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-primary font-bold text-primary-foreground">
          {(name ?? "?").trim().charAt(0).toUpperCase() || "?"}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ StatusBadge -- */

const TONE: Record<Tone, string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  busy: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  chat: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  idle: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  ended:
    "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300",
};

const TONE_DOT: Record<Tone, string> = {
  ok: "bg-emerald-500",
  busy: "bg-amber-500",
  chat: "bg-sky-500",
  idle: "bg-zinc-400",
  ended: "bg-rose-500",
};

export function ToneDot({ tone }: { tone: Tone }) {
  return (
    <span
      className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[tone])}
      aria-hidden
    />
  );
}

export function StatusBadge({
  tone,
  children,
  dot = true,
}: {
  tone: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        TONE[tone],
      )}
    >
      {dot ? <ToneDot tone={tone} /> : null}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------- EmptyState -- */

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/* --------------------------------------------------------------- KeyValue -- */

export function KeyValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm", mono && "font-mono text-xs break-all")}>
        {value}
      </dd>
    </div>
  );
}
