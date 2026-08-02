"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Globe, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminEnv } from "@/lib/adminEnv";
import { setAdminEnv } from "../actions";

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
 * reason — it outranks the destination.
 *
 * `setAdminEnv` revalidates the whole layout, so switching repaints the nav
 * badges too; `router.refresh()` is what makes the current screen's server
 * components re-run with the new cookie.
 */

type Props = {
  env: AdminEnv;
  labels: { prod: string; test: string };
};

const CELL =
  "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-60 sm:px-2.5";

export function EnvSwitch({ env, labels }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pick(next: AdminEnv) {
    if (next === env || pending) return;
    startTransition(async () => {
      await setAdminEnv(next);
      router.refresh();
    });
  }

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
      <button
        type="button"
        onClick={() => pick("prod")}
        disabled={pending}
        aria-pressed={env === "prod"}
        className={cn(
          CELL,
          env === "prod"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Globe className="size-3.5" />
        {labels.prod}
      </button>
      <button
        type="button"
        onClick={() => pick("test")}
        disabled={pending}
        aria-pressed={env === "test"}
        className={cn(
          CELL,
          env === "test"
            ? "bg-amber-500 text-white shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <FlaskConical className="size-3.5" />
        {labels.test}
      </button>
    </div>
  );
}
