// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { PostgrestTransformBuilder, PostgrestFilterBuilder } from "https://esm.sh/@supabase/postgrest-js@1.16.3/dist/cjs/index.js";
import webpush from "npm:web-push@3.6.7";
import Logger, { Log } from "./logger.ts";

export type Subscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

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

  static async notify(log: Log, subJson: Subscription, payload: Record<string, unknown>) {
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT")!,
      Deno.env.get("VAPID_PUBLIC_KEY")!,
      Deno.env.get("VAPID_PRIVATE_KEY")!,
    );
    try {
      const res = await webpush.sendNotification(
        subJson,
        JSON.stringify(payload),
        {
          TTL: 60,
          headers: {
            Urgency: "high",
            Topic: (payload?.tag as string) ?? "default",
          },
        },
      );
      log.result(res.body, res.statusCode);
      return true;
    } catch (err: unknown) {
      const error = err as Error & { body?: string; statusCode?: number };
      log.result(error.body, error.statusCode ?? 500)
      return false;
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
    const log = logger.log(action, { url: url, body: body });
    const res = await (query as any);
    if (res?.error) log.result(res.error, res.status);
    else {
      log.result(res?.data?.length, res.status);
      return res?.data;
    }
  }

}