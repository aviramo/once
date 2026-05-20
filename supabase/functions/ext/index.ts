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
  const res = await Tools.notify(entry, token, payload);
  // Dead Expo token → clear it + recompute availability so the user leaves
  // every pool immediately (the app requires presence).
  if (!res.ok && res.error === "DeviceNotRegistered") {
    EdgeRuntime.waitUntil(
      Tools.rpc(log, "app_push_dead", { p_user_id: target_user_id }).then(() => {}),
    );
  }
}

function dispatch(log: Log, notify: Array<{ user_id: string; code: string; actor_id?: string }>) {
  for (const n of notify) {
    if (!n.user_id) continue;
    EdgeRuntime.waitUntil(firePush(log, n.user_id, n.code, n.actor_id));
  }
}

// Geo-availability resync: recomputes every user's availability vs. the
// admin-defined areas and, on any change, flips relations.availability
// (Realtime → open apps update instantly) and fires area-open / area-closed
// pushes (closed apps). Idempotent — only changed users are touched.
async function handleResync(log: Log) {
  const res = await Tools.rpc(log, "app_area_resync", {});
  dispatch(log, res?.notify ?? []);
  return log.success({ processed: res?.processed ?? 0 });
}

async function handleCron(log: Log) {
  const expire = await Tools.rpc(log, "app_expire_sweep", {});
  // Same resync the admin triggers on demand — here it's the per-minute
  // scheduled-launch + self-heal safety net (covers scheduled areas going
  // live, and anything an on-demand resync missed).
  const resync = await Tools.rpc(log, "app_area_resync", {});
  // Daily credits top-up. app_credits_grant is idempotent per grant day
  // (20:00 Asia/Jerusalem boundary) — most ticks update 0 rows; the first
  // tick at/after 20:00 tops every user up to their tier cap. No pushes
  // (silent top-up), so nothing to dispatch.
  const grant = await Tools.rpc(log, "app_credits_grant", {});

  dispatch(log, [...(expire?.notify ?? []), ...(resync?.notify ?? [])]);

  return log.success({
    processed: (expire?.processed ?? 0) + (resync?.processed ?? 0),
    credits_granted: grant?.processed ?? 0,
  });
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
    if (route === "resync") return await handleResync(log);

    return log.error("route", `unknown route: ${route}`, 404);
  } catch (err) {
    const msg = (err as Error)?.message ?? "unknown";
    return log.error("handler", msg, 500);
  }
});
