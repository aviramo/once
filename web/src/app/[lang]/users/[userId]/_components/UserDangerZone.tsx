"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ResetResult } from "../../actions";

export type DangerZoneDict = {
  /** Reset row title + explainer + button label. */
  resetTitle: string;
  resetDesc: string;
  resetButton: string;
  /** Confirm popup for reset. {name} is interpolated with the user's name. */
  resetConfirmTitle: string;
  resetConfirmBody: string;
  resetBusy: string;
  resetDone: string;
  /** Delete row title + explainer + button label. */
  deleteTitle: string;
  deleteDesc: string;
  deleteButton: string;
  /** Confirm popup for delete. {name} is interpolated with the user's name. */
  deleteConfirmTitle: string;
  deleteConfirmBody: string;
  deleteBusy: string;
  /** Shared. */
  fail: string;
  cancel: string;
};

type Mode = "reset" | "delete";

/**
 * Irreversible per-user admin controls. Two rows — "reset" (wipe the user's
 * state/history to a clean slate, via app_admin_reset_user) and "delete"
 * (permanently remove the account, via deleteUser) — each guarded by a confirm
 * popup that names the user. Reset reports inline and lets the revalidated page
 * refresh; a successful delete navigates back to the users list (the detail
 * page no longer exists).
 */
export function UserDangerZone({
  userId,
  userName,
  dict,
  resetAction,
  deleteAction,
  compact = false,
}: {
  userId: string;
  userName: string;
  dict: DangerZoneDict;
  resetAction: (userId: string) => Promise<ResetResult>;
  deleteAction: (userId: string) => Promise<{ ok: boolean }>;
  /** When true, render only the two destructive buttons inline (no rose-bordered
   * card, no title/description rows). Used when the zone sits inside the identity
   * card at the top of the page. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<Mode | null>(null);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const name = userName || userId.slice(0, 8);

  function run() {
    if (pending || !modal) return;
    const mode = modal;
    startTransition(async () => {
      try {
        if (mode === "reset") {
          const res = await resetAction(userId);
          if (res.ok) {
            setMsg({ ok: true, text: dict.resetDone });
            setModal(null);
          } else {
            setMsg({ ok: false, text: dict.fail });
          }
        } else {
          const res = await deleteAction(userId);
          if (res.ok) {
            router.push("/users");
          } else {
            setMsg({ ok: false, text: dict.fail });
          }
        }
      } catch {
        setMsg({ ok: false, text: dict.fail });
      }
    });
  }

  const modalTitle =
    modal === "delete" ? dict.deleteConfirmTitle : dict.resetConfirmTitle;
  const modalBody = (
    modal === "delete" ? dict.deleteConfirmBody : dict.resetConfirmBody
  ).replace("{name}", name);
  const modalConfirmLabel =
    modal === "delete" ? dict.deleteButton : dict.resetButton;
  const modalBusyLabel =
    modal === "delete" ? dict.deleteBusy : dict.resetBusy;

  const modalRoot = modal ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) setModal(null);
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-5 shadow-xl">
        <h2 className="text-base font-semibold">{modalTitle}</h2>
        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
          {modalBody}
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setModal(null)}
            disabled={pending}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {dict.cancel}
          </button>
          <button
            type="button"
            onClick={run}
            disabled={pending}
            className="rounded-lg border border-rose-300 bg-rose-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-default disabled:opacity-60 dark:border-rose-900"
          >
            {pending ? modalBusyLabel : modalConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            setModal("reset");
          }}
          disabled={pending}
          className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-default disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/40"
        >
          {dict.resetButton}
        </button>
        <button
          type="button"
          onClick={() => {
            setMsg(null);
            setModal("delete");
          }}
          disabled={pending}
          className="rounded-lg border border-rose-300 bg-rose-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-default disabled:opacity-60 dark:border-rose-900"
        >
          {dict.deleteButton}
        </button>
        {msg && !msg.ok ? (
          <span className="text-xs text-rose-600 dark:text-rose-400">
            {msg.text}
          </span>
        ) : null}
        {modalRoot}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-rose-200 dark:border-rose-900/60">
      <DangerRow
        title={dict.resetTitle}
        desc={dict.resetDesc}
        button={dict.resetButton}
        onClick={() => {
          setMsg(null);
          setModal("reset");
        }}
        disabled={pending}
      />
      <div className="border-t border-rose-200 dark:border-rose-900/60" />
      <DangerRow
        title={dict.deleteTitle}
        desc={dict.deleteDesc}
        button={dict.deleteButton}
        onClick={() => {
          setMsg(null);
          setModal("delete");
        }}
        disabled={pending}
      />
      {msg ? (
        <p
          className={
            msg.ok
              ? "border-t border-rose-200 px-4 py-2.5 text-xs text-emerald-600 dark:border-rose-900/60 dark:text-emerald-400"
              : "border-t border-rose-200 px-4 py-2.5 text-xs text-rose-600 dark:border-rose-900/60 dark:text-rose-400"
          }
        >
          {msg.text}
        </p>
      ) : null}
      {modalRoot}
    </div>
  );
}

function DangerRow({
  title,
  desc,
  button,
  onClick,
  disabled,
}: {
  title: string;
  desc: string;
  button: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 bg-rose-50/40 px-4 py-3.5 dark:bg-rose-950/20">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="shrink-0 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-100 disabled:cursor-default disabled:opacity-60 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/50"
      >
        {button}
      </button>
    </div>
  );
}
