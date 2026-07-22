"use client";

import { useState, useTransition } from "react";

export type CreditsEditorDict = {
  /** Section title (e.g. "Credits"). */
  title: string;
  /** Input labels. */
  balanceLabel: string;
  extraLabel: string;
  /** Hint shown under the inputs (e.g. balance cap reminder). */
  hint: string;
  /** Save button label. */
  save: string;
  /** Save button while the request is in flight. */
  saving: string;
  /** Toast / message after a successful save. */
  done: string;
  /** Toast / message after a failed save. */
  fail: string;
  /** Validation: negative or non-integer. */
  invalid: string;
};

/**
 * Admin-only inline editor for a user's credits wallet. Two number inputs
 * (balance / extra) + a save button — wired to `setUserHearts(userId, …)`
 * which routes through the `app_admin_set_credits` RPC. The other credit
 * fields (held / granted_on / next_grant_at / bought_on / unpaid_at) are
 * preserved by the RPC, so this is safe to use without disturbing the daily
 * grant. Funding a wallet here does NOT clear `unpaid_at` — only the RPCs
 * do — but a positive balance already puts the user back in others().
 */
export function UserCreditsEditor({
  userId,
  initialBalance,
  initialExtra,
  dict,
  action,
}: {
  userId: string;
  initialBalance: number;
  initialExtra: number;
  dict: CreditsEditorDict;
  action: (
    userId: string,
    balance: number,
    extra: number,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [balance, setBalance] = useState(String(initialBalance));
  const [extra, setExtra] = useState(String(initialExtra));
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const balNum = Number(balance);
  const extNum = Number(extra);
  const valid =
    Number.isInteger(balNum) &&
    balNum >= 0 &&
    Number.isInteger(extNum) &&
    extNum >= 0;
  const dirty = balNum !== initialBalance || extNum !== initialExtra;

  function save() {
    if (!valid) {
      setMsg({ ok: false, text: dict.invalid });
      return;
    }
    if (!dirty || pending) return;
    setMsg(null);
    startTransition(async () => {
      try {
        const res = await action(userId, balNum, extNum);
        if (res.ok) setMsg({ ok: true, text: dict.done });
        else setMsg({ ok: false, text: dict.fail });
      } catch {
        setMsg({ ok: false, text: dict.fail });
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label={dict.balanceLabel}
          value={balance}
          onChange={setBalance}
          disabled={pending}
        />
        <Field
          label={dict.extraLabel}
          value={extra}
          onChange={setExtra}
          disabled={pending}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || !valid || !dirty}
          className="rounded-lg border border-border bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors disabled:cursor-default disabled:opacity-50"
        >
          {pending ? dict.saving : dict.save}
        </button>
      </div>
      {dict.hint ? (
        <p className="text-xs text-muted-foreground">{dict.hint}</p>
      ) : null}
      {msg ? (
        <p
          className={
            msg.ok
              ? "text-xs text-emerald-600 dark:text-emerald-400"
              : "text-xs text-rose-600 dark:text-rose-400"
          }
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary disabled:opacity-50"
      />
    </label>
  );
}
