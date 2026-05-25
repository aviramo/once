"use client";

import { useState, useTransition } from "react";

export type GroupInviteCodeDict = {
  label: string;
  copy: string;
  copied: string;
  regenerate: string;
  regenerateBusy: string;
  confirmTitle: string;
  confirmBody: string;
  confirmConfirm: string;
  cancel: string;
  fail: string;
};

/**
 * Per-group 6-digit invite code, rendered as an inline row inside the
 * group's header card (NOT its own card / section). Code display + copy +
 * regenerate (gated). Regenerate invalidates the old code so the action is
 * behind a confirm dialog. Admins always see regenerate; group managers see
 * it only for groups they manage (the server action enforces the same gate).
 */
export function GroupInviteCode({
  groupId,
  initialCode,
  canRegenerate,
  dict,
  regenerateAction,
}: {
  groupId: string;
  initialCode: string;
  canRegenerate: boolean;
  dict: GroupInviteCodeDict;
  regenerateAction: (
    fd: FormData,
  ) => Promise<{ ok: true; code: string } | { ok: false; reason: string }>;
}) {
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const [modal, setModal] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function copy() {
    setError(null);
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => setError(dict.fail));
  }

  function regenerate() {
    if (pending) return;
    const fd = new FormData();
    fd.set("groupId", groupId);
    setError(null);
    startTransition(async () => {
      const result = await regenerateAction(fd);
      if (result.ok) {
        setCode(result.code);
        setModal(false);
      } else {
        setError(dict.fail);
        setModal(false);
      }
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{dict.label}</span>
        <div
          dir="ltr"
          className="rounded-lg border border-border bg-muted/40 px-3 py-1 text-lg font-bold tabular-nums tracking-[0.2em] select-all"
        >
          {code}
        </div>
        <button
          type="button"
          onClick={copy}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60"
        >
          {copied ? dict.copied : dict.copy}
        </button>
        {canRegenerate ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setModal(true);
            }}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {pending ? dict.regenerateBusy : dict.regenerate}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}

      {modal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setModal(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl">
            <h2 className="text-base font-semibold">{dict.confirmTitle}</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
              {dict.confirmBody}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(false)}
                disabled={pending}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
              >
                {dict.cancel}
              </button>
              <button
                type="button"
                onClick={regenerate}
                disabled={pending}
                className="rounded-lg border border-primary bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {pending ? dict.regenerateBusy : dict.confirmConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
