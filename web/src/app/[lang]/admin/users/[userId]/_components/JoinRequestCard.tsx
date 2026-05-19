"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

export type JoinRequestDict = {
  /** Section explainer. */
  hint: string;
  /** "Requested to join {when}" — already composed server-side. */
  pendingText: string;
  /** Remove-request button label. */
  removeLabel: string;
  /** Button label while the action is in flight. */
  removingLabel: string;
};

/**
 * Pending join-request card. Only rendered when relations.join_request is set.
 * The button removes the request WITHOUT approving (clearJoinRequest →
 * app_admin_clear_join_request): the user stays gated and their app reverts to
 * the "request to join" CTA. On success the server action revalidates the page
 * so this card disappears; a failure surfaces the reason and keeps the card.
 */
export function JoinRequestCard({
  userId,
  dict,
  action,
}: {
  userId: string;
  dict: JoinRequestDict;
  action: (userId: string) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove() {
    setError(null);
    startTransition(async () => {
      try {
        await action(userId);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <div>
      <p className="mb-3 text-xs text-muted-foreground">{dict.hint}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-background px-4 py-3">
        <span className="min-w-0 flex-1 text-sm font-medium">
          {dict.pendingText}
        </span>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className={cn(
            "shrink-0 rounded-full border border-rose-300 px-3.5 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950",
          )}
        >
          {pending ? dict.removingLabel : dict.removeLabel}
        </button>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}
