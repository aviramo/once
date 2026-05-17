"use client";

import { useRef, useState, useTransition } from "react";
import { StatusBadge } from "../../_components/ui";

export type RoleRow = {
  id: string;
  name: string;
  enabled: boolean;
  members: number;
};

export type RolesDict = {
  title: string;
  subtitle: string;
  add: string;
  namePlaceholder: string;
  save: string;
  cancel: string;
  rename: string;
  enable: string;
  disable: string;
  delete: string;
  statusActive: string;
  statusDisabled: string;
  members: string;
  none: string;
  confirmDelete: string;
  inUse: string;
  duplicate: string;
  disabledHint: string;
};

// Maps the typed reasons thrown by the server actions to a human message.
function reason(err: unknown, dict: RolesDict): string {
  const m = err instanceof Error ? err.message : String(err);
  if (m === "duplicate_name") return dict.duplicate;
  if (m === "role_in_use") return dict.inUse;
  return m;
}

/* --------------------------------------------------------------- AddForm -- */

export function RoleAddForm({
  action,
  dict,
}: {
  action: (fd: FormData) => Promise<void>;
  dict: RolesDict;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      action={(fd) => {
        setError(null);
        startTransition(async () => {
          try {
            await action(fd);
            formRef.current?.reset();
          } catch (e) {
            setError(reason(e, dict));
          }
        });
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input
        name="name"
        required
        maxLength={64}
        placeholder={dict.namePlaceholder}
        className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-50"
      >
        {dict.save}
      </button>
      {error ? (
        <p className="basis-full text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/* ------------------------------------------------------------------ Row -- */

function Row({
  role,
  dict,
  renameAction,
  setEnabledAction,
  deleteAction,
}: {
  role: RoleRow;
  dict: RolesDict;
  renameAction: (fd: FormData) => Promise<void>;
  setEnabledAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        setError(reason(e, dict));
      }
    });
  }

  function submitRename(fd: FormData) {
    fd.set("id", role.id);
    run(async () => {
      await renameAction(fd);
      setEditing(false);
    });
  }

  function toggleEnabled() {
    const fd = new FormData();
    fd.set("id", role.id);
    fd.set("enabled", String(!role.enabled));
    run(() => setEnabledAction(fd));
  }

  function remove() {
    if (role.members > 0) return;
    if (!window.confirm(dict.confirmDelete)) return;
    const fd = new FormData();
    fd.set("id", role.id);
    run(() => deleteAction(fd));
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <form
            action={submitRename}
            className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
          >
            <input
              name="name"
              required
              maxLength={64}
              defaultValue={role.name}
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button
              type="submit"
              disabled={pending}
              className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {dict.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/60"
            >
              {dict.cancel}
            </button>
          </form>
        ) : (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 truncate font-medium">{role.name}</span>
            <StatusBadge tone={role.enabled ? "ok" : "idle"}>
              {role.enabled ? dict.statusActive : dict.statusDisabled}
            </StatusBadge>
            <span className="shrink-0 text-xs text-muted-foreground">
              {role.members} {dict.members}
            </span>
          </div>
        )}

        {!editing ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              {dict.rename}
            </button>
            <button
              type="button"
              onClick={toggleEnabled}
              disabled={pending}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              {role.enabled ? dict.disable : dict.enable}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={pending || role.members > 0}
              title={role.members > 0 ? dict.inUse : undefined}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-rose-400 dark:hover:bg-rose-950/30"
            >
              {dict.delete}
            </button>
          </div>
        ) : null}
      </div>

      {!role.enabled ? (
        <p className="mt-2 text-xs text-muted-foreground">{dict.disabledHint}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------- Manager -- */

export function RolesManager({
  roles,
  dict,
  renameAction,
  setEnabledAction,
  deleteAction,
}: {
  roles: RoleRow[];
  dict: RolesDict;
  renameAction: (fd: FormData) => Promise<void>;
  setEnabledAction: (fd: FormData) => Promise<void>;
  deleteAction: (fd: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-3">
      {roles.map((role) => (
        <Row
          key={role.id}
          role={role}
          dict={dict}
          renameAction={renameAction}
          setEnabledAction={setEnabledAction}
          deleteAction={deleteAction}
        />
      ))}
    </div>
  );
}
