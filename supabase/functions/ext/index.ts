import Log from "../log.ts";
import Tools from "../tools.ts";
import User from "../user.ts";
import { PushToken, PUSH_BODY } from "../global.ts";

async function firePush(log: Log, target_user_id: string, code: string, actor_id?: string) {
  type PushRow = { user_id: string; name: string | null; data?: { push_token?: unknown; lang?: string } };
  const ids = actor_id ? [target_user_id, actor_id] : [target_user_id];
  const data = await Tools.invoke(
    log,
    `push_lookup:${code}`,
    Tools.supabase.from("users").select("user_id, name, data").in("user_id", ids),
  );
  if (!data || !data[0]) return;
  const rows = data as PushRow[];
  const targetRow = rows.find(r => r.user_id === target_user_id);
  const actorRow = actor_id ? rows.find(r => r.user_id === actor_id) : undefined;
  if (!targetRow) return;

  const targetData = targetRow.data;
  const raw = targetData?.push_token;
  if (!raw) return;
  const token: PushToken | null = typeof raw === "string"
    ? (() => { try { return JSON.parse(raw) as PushToken; } catch { return null; } })()
    : (raw as unknown as PushToken);
  if (!token || token.type !== "expo" || !token.token) return;

  const lang = typeof targetData?.lang === "string" ? targetData.lang : "he";
  const bodyText = (PUSH_BODY[lang] ?? PUSH_BODY.he)[code] ?? "Once";
  const title = typeof actorRow?.name === "string" && actorRow.name ? actorRow.name : "Once";

  const payload: Record<string, unknown> = {
    type: code,
    collapseId: actor_id ? `${code}:${actor_id}` : code,
    title,
    body: bodyText,
  };
  const entry = log.log(`push:${code}`, { target: target_user_id, payload });
  await Tools.notify(entry, token, payload);
}

async function handleCron(log: Log) {
  const result = await Tools.rpc(log, "app_expire_sweep", {});
  const notifyList: Array<{ user_id: string; code: string; actor_id?: string }> = result?.notify ?? [];

  for (const n of notifyList) {
    if (!n.user_id) continue;
    EdgeRuntime.waitUntil(firePush(log, n.user_id, n.code, n.actor_id));
  }

  return log.success({ processed: result?.processed ?? 0 });
}

Deno.serve(async (req) => {
  const body = await Tools.getBody(req);
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const route = segments[segments.indexOf("ext") + 1] ?? "cron";

  const log = new Log(`ext/${route}`, body, new User({ user_id: null as unknown as string }));

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const expected = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!expected || auth !== `Bearer ${expected}`) {
      return log.error("auth", "unauthorized", 401);
    }

    if (route === "cron") return await handleCron(log);

    return log.error("route", `unknown route: ${route}`, 404);
  } catch (err) {
    const msg = (err as Error)?.message ?? "unknown";
    return log.error("handler", msg, 500);
  }
});
