// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { PostgrestTransformBuilder, PostgrestFilterBuilder } from "https://esm.sh/@supabase/postgrest-js@1.16.3/dist/cjs/index.js";
import Log from "./log.ts";
import { LogEntry, PushToken, RpcResult } from "./global.ts";

export default class Tools {
  static supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  static supabase = createClient(
    Tools.supabaseUrl,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  static async getBody(req: Request) {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }

  static async notify(entry: LogEntry, subJson: PushToken, payload: Record<string, unknown>) {
    const title = (payload?.title as string) ?? "Livo";
    const body = {
      to: subJson.token,
      sound: "default",
      priority: "high",
      channelId: "default",
      title,
      body: (payload?.body as string) || title,
      data: payload,
      collapseId: (payload?.collapseId as string) ?? undefined,
    };
    try {
      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      const json = await res.json().catch(() => null);
      const ticket = json?.data;
      const status = ticket?.status as string | undefined;
      if (status !== "ok") console.error("push_failed", JSON.stringify({ token: subJson.token, ticket }));
      entry.result(json ?? (await res.text()), res.status);
      if (status === "ok") return { ok: true as const };
      return { ok: false as const, error: ticket?.details?.error as string | undefined };
    } catch (err: unknown) {
      const error = err as Error;
      entry.result(error.message, 500);
      return { ok: false as const, error: error.message };
    }
  }

  static async invoke(
    log: Log,
    task: string,
    query:
      | PostgrestFilterBuilder<any, any, any, unknown, unknown>
      | PostgrestTransformBuilder<any, any, any, unknown, unknown>,
  ) {
    let url = (query as any).url;
    url = url ? url.toString().split("v1/")[1] : undefined;
    const body = (query as any).body;
    const entry = log.log(task, { url, body });
    const res = await (query as any);
    if (res?.error) entry.result(res.error, res.status);
    else {
      entry.result(res?.data?.length, res.status);
      return res?.data;
    }
  }

  static async rpc(log: Log, fn: string, params: Record<string, unknown>): Promise<RpcResult | undefined> {
    const entry = log.log(`rpc:${fn}`, params);
    const res = await Tools.supabase.rpc(fn, params);
    if (res.error) {
      entry.result(res.error, res.status ?? 500);
      return undefined;
    }
    const rpcResult = res.data as RpcResult | null;
    let logData: Record<string, unknown> | null = null;
    if (rpcResult) {
      const rels = rpcResult.user?.relations as Record<string, unknown> | undefined;
      const p1 = rels?.page1 as { state?: string; profile?: { user_id?: string }; expires_at?: string; extended?: boolean } | undefined;
      const p2 = rels?.page2;
      logData = {
        user: rpcResult.user?.user_id,
        page1: p1 ? {
          state: p1.state,
          with: p1.profile?.user_id,
          ...(p1.expires_at ? { expires_at: p1.expires_at } : {}),
          ...(p1.extended !== undefined ? { extended: p1.extended } : {}),
        } : undefined,
        page2: Array.isArray(p2)
          ? (p2 as { user_id?: string }[]).map(p => p.user_id)
          : (p2 as { user_id?: string } | undefined)?.user_id,
        notify: rpcResult.notify,
        ...(rpcResult.error ? { error: rpcResult.error } : {}),
      };
    }
    entry.result(logData, res.status ?? 200);
    return (res.data ?? undefined) as RpcResult | undefined;
  }
}
