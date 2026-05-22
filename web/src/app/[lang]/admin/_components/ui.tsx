import Link from "next/link";
import type { ComponentType, CSSProperties, ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { Tone } from "@/lib/humanize";
import { cn } from "@/lib/utils";

/**
 * The admin panel design system — one "operations console" language: flat
 * solid surfaces (no gradients), crisp 1px borders, restrained elevation,
 * indigo as the single accent, tabular numerals for every metric. Every admin
 * screen composes these primitives; no page re-implements a card, stat, badge,
 * section or shell. Logical properties throughout so RTL (Hebrew) and LTR both
 * work.
 */

/* --------------------------------------------------------------- Section -- */

export function Section({
  title,
  count,
  hint,
  action,
  children,
  className,
  style,
}: {
  title: string;
  count?: number;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={cn("mt-8 first:mt-0", className)} style={style}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <span
              className="h-3.5 w-1 shrink-0 rounded-full bg-primary"
              aria-hidden
            />
            <span className="truncate">{title}</span>
            {typeof count === "number" ? (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                {count}
              </span>
            ) : null}
          </h2>
          {hint ? (
            <p className="mt-1 ps-3 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3.5">{children}</div>
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
    "rounded-xl border border-border bg-background p-5 shadow-sm";
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          base,
          "block transition-all hover:border-primary/40 hover:shadow-md",
          className,
        )}
      >
        {children}
      </Link>
    );
  }
  return <div className={cn(base, className)}>{children}</div>;
}

/* -------------------------------------------------------------- CardGrid -- */

/**
 * The one responsive grid every dashboard / list cluster uses. `auto-fill` +
 * `minmax` reflows to fit at any width; `min` is the only knob — a smaller
 * `min` packs more tiles per row (denser on a phone).
 */
export function CardGrid({
  children,
  min = "13rem",
  className,
}: {
  children: ReactNode;
  min?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("grid gap-2.5", className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${min}, 100%), 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- NavTile -- */

type IconType = ComponentType<{ className?: string }>;

/**
 * A module entry card for the dashboard hub — compact: an icon tile and the
 * headline count on one row, then title + description. Composes <Card> so
 * hover / href behaviour is never re-implemented.
 */
export function NavTile({
  icon: Icon,
  title,
  desc,
  value,
  href,
}: {
  icon: IconType;
  title: string;
  desc: string;
  value?: ReactNode;
  href: string;
}) {
  return (
    <Card href={href} className="group p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        {value != null ? (
          <span className="text-2xl font-bold tabular-nums tracking-tight">
            {value}
          </span>
        ) : null}
      </div>
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{desc}</span>
        <ArrowLeft className="size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-primary ltr:-scale-x-100" />
      </p>
    </Card>
  );
}

/* ------------------------------------------------------------------ Stat -- */

/** Accent tint for a Stat's value — semantic, from the shared Tone palette so
 * the dashboard never invents its own colours. */
const STAT_ACCENT: Record<Tone, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  busy: "text-amber-600 dark:text-amber-400",
  chat: "text-sky-600 dark:text-sky-400",
  idle: "text-foreground",
  ended: "text-rose-600 dark:text-rose-400",
};

/**
 * A single KPI tile: quiet label, loud value, optional hint. Clickable when
 * `href` is given (deep-links to the filtered screen that owns the metric).
 */
export function Stat({
  label,
  value,
  hint,
  href,
  accent = "idle",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  href?: string;
  accent?: Tone;
}) {
  return (
    <Card href={href} className="p-3.5">
      <span className="block text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "mt-1.5 block text-[26px] font-bold leading-none tabular-nums tracking-tight",
          STAT_ACCENT[accent],
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className="mt-2 block text-[11px] leading-tight text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </Card>
  );
}

/* ---------------------------------------------------------------- Avatar -- */

const AVATAR_SIZE: Record<string, string> = {
  sm: "size-9 text-xs",
  md: "size-11 text-sm",
  lg: "size-16 text-xl",
  xl: "size-24 text-3xl",
};

export function Avatar({
  src,
  name,
  size = "md",
  circle = false,
}: {
  src: string | null;
  name: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  circle?: boolean;
}) {
  const cls = AVATAR_SIZE[size] ?? AVATAR_SIZE.md;
  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden bg-muted",
        circle ? "rounded-full" : "rounded-xl",
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
  ok: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  busy: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  chat: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  idle: "bg-muted text-muted-foreground",
  ended: "bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
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
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium",
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
    <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
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
