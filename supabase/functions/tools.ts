// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { PostgrestTransformBuilder, PostgrestFilterBuilder } from "https://esm.sh/@supabase/postgrest-js@1.16.3/dist/cjs/index.js";
import Logger, { Log } from "./logger.ts";
import { PushToken } from "./global.ts";

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

  static async notify(log: Log, subJson: PushToken, payload: Record<string, unknown>) {
    const body = {
      to: subJson.token,
      sound: "default",
      priority: "high",
      title: (payload?.title as string) ?? "SyncWish",
      body: (payload?.body as string) ?? "",
      data: payload,
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
      log.result(json ?? (await res.text()), res.status);
      if (status === "ok") return { ok: true as const };
      return { ok: false as const, error: ticket?.details?.error as string | undefined };
    } catch (err: unknown) {
      const error = err as Error;
      log.result(error.message, 500);
      return { ok: false as const, error: error.message };
    }
  }

  static async invoke(
    logger: Logger,
    action: string,
    query:
      | PostgrestFilterBuilder<any, any, any, unknown, unknown>
      | PostgrestTransformBuilder<any, any, any, unknown, unknown>,
  ) {
    let url = (query as any).url;
    url = url ? url.toString().split("v1/")[1] : undefined;
    const body = (query as any).body;
    const log = logger.log(action, { url: url, body: action == 'others' ? { me: { user_id: body.me.user_id } } : body });
    const res = await (query as any);
    if (res?.error) log.result(res.error, res.status);
    else {
      log.result(res?.data?.length, res.status);
      return res?.data;
    }
  }

}
