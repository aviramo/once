import Log from "../log.ts";
import Tools from "../tools.ts";
import User from "../user.ts";
import { PushToken, PUSH_BODY, PUSH_TITLE } from "../global.ts";

async function firePush(
  log: Log,
  target_user_id: string,
  code: string,
  actor_id?: string,
  extra?: { group_id?: string; group_name?: string; count?: number },
) {
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
  // Sweep pushes about a GROUP live in PUSH_TITLE with the rest of the group
  // lifecycle (that is where {group} bodies are kept); everything else this
  // function sends is a PUSH_BODY code.
  const template = (PUSH_TITLE[lang] ?? PUSH_TITLE.he)[code]
    ?? (PUSH_BODY[lang] ?? PUSH_BODY.he)[code]
    ?? "Once";
  const bodyText = template
    .replace("{group}", extra?.group_name ?? "")
    .replace("{count}", String(extra?.count ?? ""));
  const title = typeof actorRow?.name === "string" && actorRow.name ? actorRow.name : "Once";

  const payload: Record<string, unknown> = {
    type: code,
    collapseId: extra?.group_id ?? (actor_id ? `${code}:${actor_id}` : code),
    title,
    body: bodyText,
  };
  // Same deep-link contract the app function uses: the tap handler routes on
  // these two.
  if (extra?.group_id) payload.group_id = extra.group_id;
  if (actor_id) payload.actor_id = actor_id;
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

function dispatch(
  log: Log,
  notify: Array<{ user_id: string; code: string; actor_id?: string; group_id?: string; group_name?: string; count?: number }>,
) {
  for (const n of notify) {
    if (!n.user_id) continue;
    EdgeRuntime.waitUntil(firePush(log, n.user_id, n.code, n.actor_id, {
      group_id: n.group_id, group_name: n.group_name, count: n.count,
    }));
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

// Hourly watching-card teardown. A drawn candidate left un-actioned for an hour
// (page1 'watching' past its stamped expires_at) is flipped to a bare 'locked'
// and pulled from the drawn person's viewer list. Own hourly schedule (not the
// per-minute cron) — a 1h clock needs no finer granularity, and it keeps the
// churn off the hot path. Bounded + capped-logged inside the RPC; no pushes.
async function handleWatchSweep(log: Log) {
  const res = await Tools.rpc(log, "app_expire_watch_sweep", {});
  return log.success({ processed: res?.processed ?? 0, capped: res?.capped ?? false });
}

// Hourly `log` retention. Every request that reaches an edge function writes a
// row to `log`, which makes it the fastest growing table here by a wide margin,
// and nothing reads past _log_ttl(). Own hourly schedule (not the per-minute
// cron): the RPC is bounded per run, so an hourly tick drains any backlog over
// a few ticks and steady state deletes one hour's worth. No pushes.
async function handleLogPurge(log: Log) {
  const res = await Tools.rpc(log, "app_log_purge", {});
  return log.success({ processed: res?.processed ?? 0, capped: res?.capped ?? false });
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
  // Referral payouts, safety net. The normal path is app_referral_qualify on
  // the invitee's own save-profile round trip; this catches everything that
  // path can't see (an old mobile build, a save that errored after the write,
  // rows that hit the daily cap earlier and are now under it again). Bounded
  // at 200 rows a tick and idempotent, so most ticks credit nothing.
  const referrals = await Tools.rpc(log, "app_referral_sweep", {});
  // Join requests rot in queues. Two days without an answer and the staff get
  // ONE nudge per group (user directive 2026-07-27), stamped on the rows so it
  // never repeats. Most ticks nudge nobody.
  const nudge = await Tools.rpc(log, "app_join_nudge_sweep", {});

  dispatch(log, [
    ...(expire?.notify ?? []), ...(resync?.notify ?? []),
    ...(referrals?.notify ?? []), ...(nudge?.notify ?? []),
  ]);

  return log.success({
    processed: (expire?.processed ?? 0) + (resync?.processed ?? 0),
    credits_granted: grant?.processed ?? 0,
    referrals_credited: referrals?.processed ?? 0,
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
    if (route === "watch") return await handleWatchSweep(log);
    if (route === "purge") return await handleLogPurge(log);

    return log.error("route", `unknown route: ${route}`, 404);
  } catch (err) {
    const msg = (err as Error)?.message ?? "unknown";
    return log.error("handler", msg, 500);
  }
});
