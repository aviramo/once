"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { StatusBadge } from "../../../_components/ui";

export type TestToggleDict = {
  /** Badge text while the user is in the test environment. */
  status: string;
  /** Button that moves the user INTO the test environment. */
  mark: string;
  /** Button that moves the user back to the normal environment. */
  unmark: string;
  /** Button label while the request is in flight. */
  busy: string;
  /** Confirm prompts (no {target} — the page is already about one user). */
  confirmMark: string;
  confirmUnmark: string;
  /** Shown when the flip fails. */
  fail: string;
};

/**
 * Admin-only per-user test-environment toggle.
 *
 * `users.is_test` partitions the matching pool — a test user is matchable ONLY
 * with other test users and vice versa. Flipping it also releases both of the
 * user's pages, since a live link may now straddle the two pools; that is why
 * the action is behind a confirm even though the flag itself is reversible.
 *
 * Deliberately quiet when the flag is off: it applies to a small minority of
 * users, so an always-on badge would add noise to every other profile.
 */
export function UserTestToggle({
  userId,
  isTest,
  dict,
  action,
}: {
  userId: string;
  isTest: boolean;
  dict: TestToggleDict;
  action: (
    userId: string,
    value: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function flip() {
    if (pending) return;
    const next = !isTest;
    if (!window.confirm(next ? dict.confirmMark : dict.confirmUnmark)) return;
    setFailed(false);
    startTransition(async () => {
      try {
        const res = await action(userId, next);
        if (res.ok) router.refresh();
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {isTest ? (
        <StatusBadge tone="busy">
          <FlaskConical className="me-1 inline size-3 align-[-1px]" />
          {dict.status}
        </StatusBadge>
      ) : null}
      <button
        type="button"
        onClick={flip}
        disabled={pending}
        className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
      >
        {pending ? dict.busy : isTest ? dict.unmark : dict.mark}
      </button>
      {failed ? (
        <span className="text-xs text-rose-600 dark:text-rose-400">
          {dict.fail}
        </span>
      ) : null}
    </span>
  );
}
