import { Globe, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminEnvHref, type AdminEnv } from "@/lib/adminEnv";

/**
 * The panel's PRIMARY control: which matching environment every screen is
 * showing. Two cells of one segmented pill, production first — the two pools
 * never meet, so this is a choice of which product you are looking at, not a
 * filter narrowing one list.
 *
 * It is not a checkbox and not a dropdown item: an operator must be able to
 * see which environment he is in without opening anything, from every screen,
 * and the test side is tinted so the answer is legible at a glance rather than
 * read off a label. It sits beside the logo (before the nav) for the same
 * reason — it outranks the destination, and it is why the header yields at the
 * wordmark rather than here when a phone runs out of width.
 *
 * A plain `<a>` per cell, and therefore no client component at all: the switch
 * is a GET to `/api/env` which sets the cookie and sends the browser back (see
 * ADMIN_ENV_ROUTE). The cell that is already selected is a `<span>` — it is
 * where you are, not somewhere to go — which also spends no tap on a reload.
 */

type Props = {
  env: AdminEnv;
  labels: { prod: string; test: string };
};

const CELL =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors sm:px-2.5";

export function EnvSwitch({ env, labels }: Props) {
  const cells = [
    {
      value: "prod" as const,
      label: labels.prod,
      Icon: Globe,
      on: "bg-background text-foreground shadow-sm",
    },
    {
      value: "test" as const,
      label: labels.test,
      Icon: FlaskConical,
      on: "bg-amber-500 text-white shadow-sm",
    },
  ];

  return (
    <div
      role="group"
      aria-label={`${labels.prod} / ${labels.test}`}
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-lg border p-0.5 transition-colors",
        env === "test"
          ? "border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10"
          : "border-border bg-muted",
      )}
    >
      {cells.map(({ value, label, Icon, on }) =>
        env === value ? (
          <span key={value} aria-current="true" className={cn(CELL, on)}>
            <Icon className="size-3.5" />
            {label}
          </span>
        ) : (
          <a
            key={value}
            href={adminEnvHref(value)}
            className={cn(CELL, "text-muted-foreground hover:text-foreground")}
          >
            <Icon className="size-3.5" />
            {label}
          </a>
        ),
      )}
    </div>
  );
}
