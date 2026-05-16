import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/locales";
import { relativeTime } from "@/lib/relativeTime";
import { userActivity, type Relations } from "@/lib/humanize";
import { Card, Avatar, StatusBadge } from "./ui";

export type UserRow = {
  user_id: string;
  name: string | null;
  created_at: string;
  last_seen: string | null;
  data: { images?: Array<{ normal?: string; hash?: string }> } | null;
  relations: Relations;
};

function imageUrl(userId: string, filename: string | undefined): string | null {
  if (!filename) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/users/${userId}/normal/${filename}`;
}

type Props = {
  row: UserRow;
  email: string | null;
  dict: Dictionary["admin"];
  locale: Locale;
};

export function UserCard({ row, email, dict, locale }: Props) {
  const photo = imageUrl(row.user_id, row.data?.images?.[0]?.normal);
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
          <div className="mt-3">
            <StatusBadge tone={activity.tone}>{activity.text}</StatusBadge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {dict.userLastSeen}: {relativeTime(row.last_seen, locale)}
          </p>
        </div>
      </div>
    </Card>
  );
}
