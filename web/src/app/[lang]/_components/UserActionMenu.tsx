"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ComponentType } from "react";
import {
  RotateCcw,
  Trash2,
  FolderPlus,
  FolderMinus,
  Eraser,
  Maximize2,
  ExternalLink,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import { cn } from "@/lib/utils";
import { bulkUserAction, type BulkAction } from "../users/actions";

type ActionsDict = Dictionary["admin"]["actions"];
type Group = { id: string; name: string };

type Props = {
  /** One id for a single-user menu, many for a bulk menu. */
  ids: string[];
  /** Display name (single) or "{n} users" (bulk) — interpolated into prompts. */
  targetLabel: string;
  /** Present only for a single-user menu — enables the "open profile" row. */
  singleUserId?: string;
  groups: Group[];
  dict: ActionsDict;
  /** When set, the menu opens straight at the confirm step for this action
   * (the bulk bar's dedicated "reset" button uses it). */
  initialAction?: BulkAction;
  onClose: () => void;
  onDone: () => void;
};

const fill = (t: string, v: Record<string, string | number>) =>
  t.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** The confirm-step prompt for a destructive / release action. */
function confirmTextFor(
  action: BulkAction,
  dict: ActionsDict,
  target: string,
): string {
  if (action.kind === "delete") return fill(dict.confirmDelete, { target });
  if (action.kind === "release")
    return fill(
      action.page === 1 ? dict.confirmRelease1 : dict.confirmRelease2,
      { target },
    );
  if (action.kind === "expandFilters")
    return fill(dict.confirmExpandFilters, { target });
  return fill(dict.confirmReset, { target });
}

/** One tappable action row inside the menu. */
function ActionRow({
  icon: Icon,
  label,
  desc,
  onClick,
  danger = false,
  chevron = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  desc: string;
  onClick: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-3 text-start transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          danger
            ? "bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-300"
            : "bg-primary/10 text-primary",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-semibold",
            danger && "text-rose-600 dark:text-rose-400",
          )}
        >
          {label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {desc}
        </span>
      </span>
      {chevron ? (
        <ChevronLeft className="size-4 shrink-0 text-muted-foreground ltr:-scale-x-100" />
      ) : null}
    </button>
  );
}

const btnPrimary =
  "inline-flex flex-1 items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50";
const btnDanger =
  "inline-flex flex-1 items-center justify-center rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-50";
const btnGhost =
  "inline-flex flex-1 items-center justify-center rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50";

/**
 * The admin action menu shown inside a <Sheet> — for one user (the card ⋯) or
 * for a bulk selection. Every action funnels through bulkUserAction(ids, …), so
 * single and bulk share one code path. Internal steps: the action list →
 * confirm (destructive / release) or group-pick (assign) → result.
 */
export function UserActionMenu({
  ids,
  targetLabel,
  singleUserId,
  groups,
  dict,
  initialAction,
  onClose,
  onDone,
}: Props) {
  const [step, setStep] = useState<
    "menu" | "confirm" | "group" | "groupRemove" | "result"
  >(initialAction ? "confirm" : "menu");
  const [pendingAction, setPendingAction] = useState<BulkAction | null>(
    initialAction ?? null,
  );
  const [confirmText, setConfirmText] = useState(() =>
    initialAction ? confirmTextFor(initialAction, dict, targetLabel) : "",
  );
  const [result, setResult] = useState<{ ok: boolean; count: number } | null>(
    null,
  );
  const [running, startTransition] = useTransition();
  const bulk = ids.length > 1;

  function run(action: BulkAction) {
    startTransition(async () => {
      try {
        const res = await bulkUserAction(ids, action);
        setResult(res);
        if (res.ok && res.count > 0) onDone();
      } catch {
        setResult({ ok: false, count: 0 });
      }
      setStep("result");
    });
  }

  function askConfirm(action: BulkAction, text: string) {
    setPendingAction(action);
    setConfirmText(text);
    setStep("confirm");
  }

  if (step === "menu") {
    return (
      <div className="space-y-1.5">
        <ActionRow
          icon={RotateCcw}
          label={dict.reset}
          desc={dict.resetDesc}
          onClick={() =>
            askConfirm(
              { kind: "reset" },
              fill(dict.confirmReset, { target: targetLabel }),
            )
          }
        />
        <ActionRow
          icon={Maximize2}
          label={dict.expandFilters}
          desc={dict.expandFiltersDesc}
          onClick={() =>
            askConfirm(
              { kind: "expandFilters" },
              fill(dict.confirmExpandFilters, { target: targetLabel }),
            )
          }
        />
        <ActionRow
          icon={FolderPlus}
          label={dict.assignGroup}
          desc={dict.assignGroupDesc}
          chevron
          onClick={() => setStep("group")}
        />
        <ActionRow
          icon={FolderMinus}
          label={dict.removeGroup}
          desc={dict.removeGroupDesc}
          chevron
          onClick={() => setStep("groupRemove")}
        />
        {/* Per-page release belongs on the page BADGES for a single user (one
            tap, in context). The bulk sheet keeps it because there's no per-
            user badge to anchor the action to when N users are selected. */}
        {!singleUserId ? (
          <>
            <ActionRow
              icon={Eraser}
              label={dict.releasePage1}
              desc={dict.releasePage1Desc}
              onClick={() =>
                askConfirm(
                  { kind: "release", page: 1 },
                  fill(dict.confirmRelease1, { target: targetLabel }),
                )
              }
            />
            <ActionRow
              icon={Eraser}
              label={dict.releasePage2}
              desc={dict.releasePage2Desc}
              onClick={() =>
                askConfirm(
                  { kind: "release", page: 2 },
                  fill(dict.confirmRelease2, { target: targetLabel }),
                )
              }
            />
          </>
        ) : null}
        <ActionRow
          icon={Trash2}
          label={dict.delete}
          desc={dict.deleteDesc}
          danger
          onClick={() =>
            askConfirm(
              { kind: "delete" },
              fill(dict.confirmDelete, { target: targetLabel }),
            )
          }
        />
        {singleUserId ? (
          <Link
            href={`/users/${singleUserId}`}
            onClick={onClose}
            className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-start transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ExternalLink className="size-[18px]" />
            </span>
            <span className="text-sm font-semibold">{dict.openProfile}</span>
          </Link>
        ) : null}
      </div>
    );
  }

  if (step === "confirm") {
    const danger = pendingAction?.kind === "delete";
    return (
      <div className="space-y-5 p-1">
        <p className="text-sm leading-relaxed">{confirmText}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep("menu")}
            disabled={running}
            className={btnGhost}
          >
            {dict.cancel}
          </button>
          <button
            type="button"
            onClick={() => pendingAction && run(pendingAction)}
            disabled={running}
            className={danger ? btnDanger : btnPrimary}
          >
            {running ? dict.busy : dict.confirm}
          </button>
        </div>
      </div>
    );
  }

  if (step === "group" || step === "groupRemove") {
    const removing = step === "groupRemove";
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setStep("menu")}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4 rtl:-scale-x-100" />
          {dict.back}
        </button>
        <p className="text-xs font-medium text-muted-foreground">
          {removing ? dict.pickGroupRemove : dict.pickGroup}
        </p>
        {groups.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {dict.noGroups}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  disabled={running}
                  onClick={() =>
                    run(
                      removing
                        ? { kind: "removeGroup", groupId: g.id }
                        : { kind: "assignGroup", groupId: g.id },
                    )
                  }
                  className="flex w-full items-center gap-2 rounded-xl border border-border bg-background p-3 text-start text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:opacity-50"
                >
                  {removing ? (
                    <FolderMinus className="size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  ) : (
                    <FolderPlus className="size-4 shrink-0 text-primary" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // result
  return (
    <div className="space-y-5 p-1 text-center">
      <p
        className={cn(
          "text-sm font-semibold",
          result?.ok
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-rose-600 dark:text-rose-400",
        )}
      >
        {result?.ok
          ? bulk
            ? fill(dict.doneCount, { count: result.count })
            : dict.done
          : dict.fail}
      </p>
      <button type="button" onClick={onClose} className={btnPrimary}>
        {dict.confirm}
      </button>
    </div>
  );
}

// Silences the unused-type import when tree-shaken; LucideIcon documents the
// icon prop's shape above.
export type { LucideIcon };
