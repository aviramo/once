import Link from "next/link";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { relativeTime } from "@/lib/relativeTime";

export type UserRow = {
  user_id: string;
  name: string | null;
  created_at: string;
  last_seen: string | null;
  data: { images?: Array<{ normal?: string; hash?: string }> } | null;
  relations:
    | {
        page1?: { state?: string };
        page2?: { state?: string };
      }
    | null;
};

const P1_BADGE: Record<string, string> = {
  free: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  watching: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  waiting: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  chat: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  locked: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const P2_BADGE: Record<string, string> = {
  free: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  chat: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  locked: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

function imageUrl(userId: string, filename: string | undefined): string | null {
  if (!filename) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/users/${userId}/normal/${filename}`;
}

type Props = {
  row: UserRow;
  dict: Dictionary["admin"];
  locale: Locale;
};

export function UserCard({ row, dict, locale }: Props) {
  const photo = imageUrl(row.user_id, row.data?.images?.[0]?.normal);
  const p1 = row.relations?.page1?.state ?? "locked";
  const p2 = row.relations?.page2?.state ?? "locked";
  const p1Label =
    (dict.page1States as Record<string, string>)[p1] ?? p1;
  const p2Label =
    (dict.page2States as Record<string, string>)[p2] ?? p2;
  const initial = (row.name ?? "?").trim().charAt(0).toUpperCase();

  return (
    <Link
      href={`/admin/users/${row.user_id}`}
      className="group flex gap-4 rounded-2xl border border-border bg-background p-4 transition-colors hover:border-primary/40 hover:bg-muted/40"
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-muted">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-primary/60 text-2xl font-bold text-primary-foreground">
            {initial}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold">
          {row.name ?? "—"}
        </h3>
        <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
          <p>
            {dict.userCreated}: {relativeTime(row.created_at, locale)}
          </p>
          <p>
            {dict.userLastSeen}: {relativeTime(row.last_seen, locale)}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${P1_BADGE[p1] ?? P1_BADGE.locked}`}
          >
            {dict.filterP1}: {p1Label}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${P2_BADGE[p2] ?? P2_BADGE.locked}`}
          >
            {dict.filterP2}: {p2Label}
          </span>
        </div>
      </div>
    </Link>
  );
}
