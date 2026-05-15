import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function extractOtherIds(logEntry: unknown, selfId: string): string[] {
  const found = new Set<string>();
  const str = JSON.stringify(logEntry);
  const selfLower = selfId.toLowerCase();
  for (const m of str.matchAll(UUID_RE)) {
    const id = m[0].toLowerCase();
    if (id !== selfLower) found.add(id);
  }
  return [...found];
}

export type PartnerSummary = {
  otherId: string;
  lastAt: string;
  chatCount: number;
  restrictOut: string[];
  restrictIn: string[];
  rpcCount: number;
};

type ChatRow = { user_id: string; other_id: string; created_at: string };
type RestrictionRow = {
  user_id: string;
  other_id: string;
  created_at: string;
  key: string;
};
type LogRow = {
  id: string;
  created_at: string;
  key: string;
  status: number;
  log: unknown;
};

export async function fetchPartnerSummaries(
  admin: SupabaseClient,
  selfId: string,
): Promise<PartnerSummary[]> {
  const [
    { data: chatMsgs },
    { data: restrictionsOut },
    { data: restrictionsIn },
    { data: logEntries },
  ] = await Promise.all([
    admin
      .from("chat")
      .select("user_id, other_id, created_at")
      .or(`user_id.eq.${selfId},other_id.eq.${selfId}`)
      .order("created_at", { ascending: false })
      .limit(500),
    admin
      .from("restrictions")
      .select("user_id, other_id, created_at, key")
      .eq("user_id", selfId)
      .order("created_at", { ascending: false }),
    admin
      .from("restrictions")
      .select("user_id, other_id, created_at, key")
      .eq("other_id", selfId)
      .order("created_at", { ascending: false }),
    admin
      .from("log")
      .select("id, created_at, key, status, log")
      .eq("user_id", selfId)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const map = new Map<string, PartnerSummary>();
  const touch = (otherId: string, at: string): PartnerSummary => {
    const existing = map.get(otherId);
    if (existing) {
      if (at > existing.lastAt) existing.lastAt = at;
      return existing;
    }
    const fresh: PartnerSummary = {
      otherId,
      lastAt: at,
      chatCount: 0,
      restrictOut: [],
      restrictIn: [],
      rpcCount: 0,
    };
    map.set(otherId, fresh);
    return fresh;
  };

  for (const row of (chatMsgs ?? []) as ChatRow[]) {
    const otherId = row.user_id === selfId ? row.other_id : row.user_id;
    touch(otherId, row.created_at).chatCount++;
  }
  for (const row of (restrictionsOut ?? []) as RestrictionRow[]) {
    touch(row.other_id, row.created_at).restrictOut.push(row.key);
  }
  for (const row of (restrictionsIn ?? []) as RestrictionRow[]) {
    touch(row.user_id, row.created_at).restrictIn.push(row.key);
  }
  for (const row of (logEntries ?? []) as LogRow[]) {
    const others = extractOtherIds(row.log, selfId);
    for (const otherId of others) {
      touch(otherId, row.created_at).rpcCount++;
    }
  }

  return [...map.values()].sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}
