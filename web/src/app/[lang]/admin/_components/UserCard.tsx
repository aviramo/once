import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { relativeTime } from "@/lib/relativeTime";
import { userActivity, type Relations } from "@/lib/humanize";
import { userImageUrl } from "@/lib/userImage";
import { Card, Avatar, StatusBadge } from "./ui";

export type UserRoleBadge = { name: string; enabled: boolean };

export type UserRow = {
  user_id: string;
  name: string | null;
  created_at: string;
  last_seen: string | null;
  data: { images?: Array<{ normal?: string; hash?: string }> } | null;
  relations: Relations;
  /** Joined separately from `users`; preserved across realtime merges since
   * the postgres_changes payload for `users` never carries it. */
  roles?: UserRoleBadge[];
};

type Props = {
  row: UserRow;
  email: string | null;
  dict: Dictionary["admin"];
  locale: Locale;
};

export function UserCard({ row, email, dict, locale }: Props) {
  const photo = userImageUrl(row.user_id, row.data?.images?.[0]?.normal);
  const activity = userActivity(dict, row.relations);

  return (
    <Card href={`/admin/users/${row.user_id}`} className="p-4">
      <div className="flex gap-4">
        <Avatar src={photo} name={row.name} size="md" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold">
            {row.name ?? "—"}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {email ?? dict.noEmail}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <StatusBadge tone={activity.tone}>{activity.text}</StatusBadge>
            {(row.roles ?? []).map((r) => (
              <span
                key={r.name}
                className={
                  r.enabled
                    ? "inline-flex items-center rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                    : "inline-flex items-center rounded-full bg-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 line-through dark:bg-zinc-800 dark:text-zinc-300"
                }
              >
                {r.name}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {dict.userLastSeen}: {relativeTime(row.last_seen, locale)}
          </p>
        </div>
      </div>
    </Card>
  );
}
