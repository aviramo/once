import Log from "../log.ts";
import Tools from "../tools.ts";
import User from "../user.ts";
import { Notify, PushToken, PUSH_BODY, PUSH_TITLE } from "../global.ts";

const searchable = ["is_for_male", "is_for_female", "age_from", "age_to", "range"];
const updatable = ["weekStart", "os", "lang", "appearance", "push_token", "location_custom", "location_type", "location_label"];

function applyBodyFields(user: User, body: Record<string, unknown>) {
  for (const [k, v] of Object.entries(body)) {
    if (searchable.includes(k)) (user as unknown as Record<string, unknown>)[k] = v;
    if (updatable.includes(k)) (user.data as unknown as Record<string, unknown>)[k] = v;
  }
  if ("location" in body) {
    if (body.location) {
      const loc = body.location as { longitude: unknown; latitude: unknown };
      const lng = Number(loc.longitude);
      const lat = Number(loc.latitude);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return "invalid_location";
      user.location = `SRID=4326;POINT(${lng} ${lat})`;
    } else user.location = null;
  }
  return null;
}

// Geo-availability gate state, read off a user-shaped object's
// relations.availability (written by app_availability / area_state). Absent =
// 'available' (gate not yet evaluated, or no enabled areas) so nothing is
// gated until we've actually placed the user. Used to skip auto-find for a
// gated user — there's no point pulling candidates they can't act on, and
// others() already drops them from everyone else's candidate pool.
function availabilityState(u: unknown): string {
  const rel = (u as { relations?: { availability?: { state?: string } } } | null | undefined)?.relations;
  return rel?.availability?.state ?? "available";
}

function pickGendered(table: Record<string, Record<string, string>>, code: string, lang: string, actorIsMale: boolean | null): string | undefined {
  const dict = table[lang] ?? table.he;
  if (actorIsMale !== null) {
    const variant = dict[`${code}_${actorIsMale ? "m" : "f"}`];
    if (variant) return variant;
  }
  return dict[code];
}

async function firePush(log: Log, target_user_id: string, code: string, actor_id: string) {
  type PushRow = { user_id: string; name: string | null; is_male: boolean | null; data?: { push_token?: unknown; lang?: string } };
  const data = await Tools.invoke(
    log,
    `push_lookup:${code}`,
    Tools.supabase.from("users").select("user_id, name, is_male, data").in("user_id", [target_user_id, actor_id]),
  );
  if (!data || !data[0]) return;
  const rows = data as PushRow[];
  const targetRow = rows.find(r => r.user_id === target_user_id);
  const actorRow = rows.find(r => r.user_id === actor_id);
  if (!targetRow) return;

  const targetData = targetRow.data;
  const raw = targetData?.push_token;
  if (!raw) return;
  const token: PushToken | null = typeof raw === "string"
    ? (() => { try { return JSON.parse(raw) as PushToken; } catch { return null; } })()
    : (raw as unknown as PushToken);
  if (!token || token.type !== "expo" || !token.token) return;

  const lang = typeof targetData?.lang === "string" ? targetData.lang : "he";
  const actorName = typeof actorRow?.name === "string" && actorRow.name ? actorRow.name : "Once";
  // Uniform layout for every push: title = actor's name, body = state text.
  // The state text is sourced from PUSH_TITLE for lifecycle pushes (declined,
  // expired-*, cancelled-in, removed, left, invite-fail, approve-fail) and
  // from PUSH_BODY for active-interaction pushes (invite-in, candidate, match,
  // extended, chat). Falls back to "Once" if neither table has the code.
  const stateText = pickGendered(PUSH_TITLE, code, lang, actorRow?.is_male ?? null)
    ?? pickGendered(PUSH_BODY, code, lang, actorRow?.is_male ?? null)
    ?? "Once";
  const title = actorName;
  const bodyText = stateText;

  const payload: Record<string, unknown> = {
    type: code,
    collapseId: actor_id,
    title,
    body: bodyText,
    channelId: "default",
  };
  const entry = log.log(`push:${code}`, { target: target_user_id, payload });
  await Tools.notify(entry, token, payload);
}

Deno.serve(async (req) => {
  const body = await Tools.getBody(req);
  const segments = new URL(req.url).pathname.split("/").filter(Boolean);
  const key = segments[segments.indexOf("app") + 1];
  const log = new Log(key, body, new User({ user_id: "unknown" }));

  try {
    // CORS preflight / empty ping
    if (!log.key && Object.keys(body).length === 0) {
      return log.error("options", "options", 200);
    }

    const user = await User.getByRequest(log, req);
    if (!user) return log.error("api", "unauthenticated", 401);
    log.user = user;
    user.last_seen = new Date();

    const applyErr = applyBodyFields(user, body);
    if (applyErr) return log.error("location", applyErr, 400);

    let rpcUser: Record<string, unknown> | undefined;
    let notifyList: Notify[] = [];

    switch (key) {
      case "account": {
        if (typeof body.name === "string" && typeof body.birth_date === "string" && typeof body.is_male === "boolean") {
          const bd = new Date(body.birth_date);
          if (Number.isNaN(bd.getTime())) return log.error("account", "invalid_birth_date", 400);
          await user.insert(log, body.name, bd, body.is_male);
        }
        await user.persist(log);
        // Same auto-find rule as start/location/focus: account changes
        // (gender/age via birth_date) affect who matches, so re-pick when
        // the user is sitting idle with nothing in their page1 to look at.
        // Skip while geo-gated — a gated user gets no candidates.
        if (availabilityState(user) === "available"
          && user.relations?.page1?.state === "free" && !user.relations?.page1?.profile) {
          const result = await Tools.rpc(log, "app_find", { me_id: user.user_id, event_key: "find" });
          if (result && !result.error) {
            rpcUser = result.user;
            notifyList = result.notify ?? [];
          }
        }
        break;
      }

      case "start":
      case "location":
      case "focus": {
        // Re-login reset: app_logout_cleanup writes page2 = {state:'locked',
        // message:'logout'} on logout so we can distinguish it from an
        // explicit lock2 hide. When a logged-out user comes back, their
        // first /app/start (or /location, /focus) flips page2 back to
        // {state:'free', profiles:[]} so they're discoverable again.
        // Explicit-hide users (locked, no message) stay locked across
        // re-logins — that's the whole point of the message marker.
        const p2 = user.relations?.page2 as { state?: string; message?: string } | undefined;
        if (p2?.state === "locked" && p2?.message === "logout") {
          user.relations.page2 = { state: "free", profiles: [] } as typeof user.relations.page2;
        }
        await user.persist(log);
        // Recompute the geo-availability gate from the just-persisted
        // location and surface it via relations.availability. Synchronous so
        // the /app/start (or /location, /focus) response — and the Realtime
        // relations change it triggers — carries the gate state immediately,
        // and so the auto-find skip below sees a fresh value.
        const av = await Tools.rpc(log, "app_availability", { me_id: user.user_id });
        if (av && !av.error) rpcUser = av.user;
        const availableNow = availabilityState(rpcUser ?? user.db.new) === "available";
        // Auto-find only when available AND state='free' AND nothing already
        // in page1 to look at — don't override an existing candidate the user
        // hasn't acted on. Other states (locked / watching / waiting / chat)
        // are intentionally skipped: they each represent an active
        // interaction the user has to clear manually. A geo-gated user gets
        // no candidates (others() also drops them from everyone's pool).
        if (availableNow && user.relations?.page1?.state === "free" && !user.relations?.page1?.profile) {
          const eventKey = key === "location" ? "location" : key;
          const result = await Tools.rpc(log, "app_find", { me_id: user.user_id, event_key: eventKey });
          if (result && !result.error) {
            rpcUser = result.user;
            notifyList = result.notify ?? [];
          }
        }
        break;
      }

      case "age":
      case "range":
      case "preferred_gender": {
        await user.persist(log);
        if (availabilityState(user) === "available"
          && user.relations?.page1?.state === "free" && !user.relations?.page1?.profile) {
          const result = await Tools.rpc(log, "app_find", { me_id: user.user_id, event_key: "find" });
          if (result && !result.error) {
            rpcUser = result.user;
            notifyList = result.notify ?? [];
          }
        }
        break;
      }

      case "find": {
        await user.persist(log);
        const result = await Tools.rpc(log, "app_find", { me_id: user.user_id, force: true, event_key: "find" });
        if (result?.error) return log.error("find", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        break;
      }
      case "cancel":
      case "leave":
      case "block": {
        const result = await Tools.rpc(log, `app_${key}`, { me_id: user.user_id });
        if (result?.error) {
          await user.persist(log);
          return log.error(key, result.error, 400);
        }
        notifyList = result?.notify ?? [];
        rpcUser = result?.user;
        await user.persist(log);
        break;
      }

      case "ignore":
      case "invite":
      case "approve":
      case "decline":
      case "clear1":
      case "clear2":
      case "free2":
      case "lock2":
      case "pause":
      case "add":
      case "cancel_add": {
        const result = await Tools.rpc(log, `app_${key}`, { me_id: user.user_id });
        await user.persist(log);
        if (result?.error) return log.error(key, result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        break;
      }

      case "resume": {
        const resumeResult = await Tools.rpc(log, "app_resume", { me_id: user.user_id });
        await user.persist(log);
        if (resumeResult?.error) return log.error(key, resumeResult.error, 400);
        rpcUser = resumeResult?.user;
        notifyList = resumeResult?.notify ?? [];
        // Resume flips both pages to free. Mirror start/focus auto-find so
        // the user lands on a candidate instead of an empty home pane.
        const relationsAfter = (resumeResult?.user as { relations?: { page1?: { state?: string; profile?: unknown } } } | undefined)?.relations;
        if (availabilityState(resumeResult?.user) === "available"
          && relationsAfter?.page1?.state === "free" && !relationsAfter?.page1?.profile) {
          const findResult = await Tools.rpc(log, "app_find", { me_id: user.user_id, event_key: "find" });
          if (findResult && !findResult.error) {
            rpcUser = findResult.user;
            notifyList = [...notifyList, ...(findResult.notify ?? [])];
          }
        }
        break;
      }

      case "extend": {
        const minutes = Number(body.minutes);
        if (!Number.isFinite(minutes)) return log.error("extend", "bad_minutes", 400);
        const result = await Tools.rpc(log, "app_extend", { me_id: user.user_id, add_minutes: minutes });
        await user.persist(log);
        if (result?.error) return log.error("extend", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        break;
      }

      case "remove": {
        const viewer_id = typeof body.user_id === "string" ? body.user_id : null;
        if (!viewer_id) return log.error("remove", "no_user_id", 400);
        const result = await Tools.rpc(log, "app_remove", { me_id: user.user_id, viewer_id });
        await user.persist(log);
        if (result?.error) return log.error("remove", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        break;
      }

      case "chat": {
        const chatBody = body.chat as { text?: unknown; image_key?: unknown; location?: unknown; audio_key?: unknown; audio_bars?: unknown; audio_duration_ms?: unknown; schedule?: unknown; created_at?: unknown } | undefined;
        const text = typeof chatBody?.text === "string" && chatBody.text.trim() !== "" ? chatBody.text.trim() : null;
        const image_key = typeof chatBody?.image_key === "string" && chatBody.image_key.trim() !== "" ? chatBody.image_key.trim() : null;
        const audio_key = typeof chatBody?.audio_key === "string" && chatBody.audio_key.trim() !== "" ? chatBody.audio_key.trim() : null;
        const audio_bars = Array.isArray(chatBody?.audio_bars)
          && chatBody.audio_bars.length === 60
          && chatBody.audio_bars.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)
          ? chatBody.audio_bars as number[]
          : null;
        const audio_duration_ms = typeof chatBody?.audio_duration_ms === "number"
          && Number.isFinite(chatBody.audio_duration_ms)
          && chatBody.audio_duration_ms > 0
          && chatBody.audio_duration_ms < 24 * 60 * 60 * 1000
          ? Math.round(chatBody.audio_duration_ms as number)
          : null;
        const locationRaw = chatBody?.location as { lat?: unknown; lng?: unknown } | undefined;
        const location = locationRaw && Number.isFinite(Number(locationRaw.lat)) && Number.isFinite(Number(locationRaw.lng))
          ? { lat: Number(locationRaw.lat), lng: Number(locationRaw.lng) }
          : null;
        // Schedule snapshot: frozen at send time. Validate shape strictly so we
        // never persist something the renderer can't read. Anchor must be an
        // ISO yyyy-mm-dd; weeks must be 1..FAMILY_MAX_WEEKS arrays of exactly 7
        // booleans, and at least one cell must be true (empty schedule isn't a
        // message). Gating: only senders with hasKids === true may send.
        const FAMILY_MAX_WEEKS = 4;
        const scheduleRaw = chatBody?.schedule as { anchor?: unknown; weeks?: unknown } | null | undefined;
        let schedule: { anchor: string; weeks: boolean[][] } | null = null;
        if (scheduleRaw && typeof scheduleRaw === "object") {
          const anchor = typeof scheduleRaw.anchor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(scheduleRaw.anchor)
            ? scheduleRaw.anchor
            : null;
          const weeksRaw = scheduleRaw.weeks;
          const weeksValid = Array.isArray(weeksRaw)
            && weeksRaw.length >= 1
            && weeksRaw.length <= FAMILY_MAX_WEEKS
            && weeksRaw.every(w => Array.isArray(w) && w.length === 7 && w.every(d => typeof d === "boolean"));
          if (anchor && weeksValid) {
            const weeks = weeksRaw as boolean[][];
            const anyMarked = weeks.some(w => w.some(d => d));
            if (anyMarked) schedule = { anchor, weeks };
          }
        }
        if (schedule) {
          const fam = (user.data as { family?: { hasKids?: unknown } } | undefined)?.family;
          if (!fam || fam.hasKids !== true) return log.error("chat", "schedule_not_allowed", 403);
        }
        // Client-provided created_at lets the optimistic bubble and the row inserted
        // here share the same key, so the chat client's polling fallback can dedup.
        // Accept only a recent ISO string (±5 min from server now); fall back to default.
        let created_at: string | null = null;
        if (typeof chatBody?.created_at === "string") {
          const t = Date.parse(chatBody.created_at);
          if (Number.isFinite(t) && Math.abs(t - Date.now()) <= 5 * 60 * 1000) {
            created_at = new Date(t).toISOString();
          }
        }
        if (!text && !image_key && !location && !audio_key && !schedule) return log.error("chat", "no_content", 400);
        if (image_key && !image_key.startsWith(`${user.user_id}/`)) return log.error("chat", "invalid_image_key", 403);
        if (audio_key && !audio_key.startsWith(`${user.user_id}/`)) return log.error("chat", "invalid_audio_key", 403);
        const other_id = (user.relations?.page1 as { profile?: { user_id?: string } } | undefined)?.profile?.user_id ?? null;
        if (!other_id) return log.error("chat", "no_partner", 400);
        const row: Record<string, unknown> = { user_id: user.user_id, other_id };
        if (text) row.text = text;
        if (image_key) row.image_key = image_key;
        if (audio_key) row.audio_key = audio_key;
        if (audio_key && audio_bars) row.audio_bars = audio_bars;
        if (audio_key && audio_duration_ms) row.audio_duration_ms = audio_duration_ms;
        if (location) row.location = location;
        if (schedule) row.schedule = schedule;
        if (created_at) row.created_at = created_at;
        EdgeRuntime.waitUntil(
          Tools.invoke(log, "chat_insert", Tools.supabase.from("chat").insert(row)).then(() => {}),
        );
        await user.persist(log);
        notifyList = [{ user_id: other_id, code: "chat" }];
        break;
      }

      case "logout": {
        user.data.push_token = null;
        user.location = null;
        const cleanup = await Tools.rpc(log, "app_logout_cleanup", { me_id: user.user_id });
        notifyList = cleanup?.notify ?? [];
        await user.persist(log);
        break;
      }

      case "reset": {
        if (user.data.role !== "ADMIN") return log.error("reset", "unauthorized", 403);
        await Tools.invoke(log, "reset_chat", Tools.supabase.from("chat").delete().not("user_id", "is", null));
        await Tools.invoke(log, "reset_log", Tools.supabase.from("log").delete().not("user_id", "is", null));
        await Tools.invoke(log, "reset_restrictions", Tools.supabase.from("restrictions").delete().not("id", "is", null));
        await Tools.invoke(log, "reset_relations", Tools.supabase.from("users").update({ last_seen: new Date(), relations: { page1: { state: 'locked' }, page2: { state: 'free', profiles: [] } } }).not("user_id", "is", null));
        await user.persist(log);
        break;
      }

      case "profile": {
        // Accept any subset of {images, bio, family}. Keys absent from the
        // body are left untouched on the row. Pass null on a key to clear
        // the corresponding field (bio/family). The "wants own kids"
        // preference (formerly the is_for_kids column) lives inside
        // family.isForKids — the client embeds it before sending.
        const payload: Record<string, unknown> = {};
        if ("images" in body && Array.isArray(body.images)) payload.images = body.images;
        if ("bio" in body) payload.bio = typeof body.bio === "string" ? body.bio : null;
        if ("family" in body) {
          payload.family = body.family && typeof body.family === "object" && !Array.isArray(body.family)
            ? body.family
            : null;
        }
        if (Object.keys(payload).length === 0) return log.error(key, "empty_payload", 400);
        const result = await Tools.rpc(log, "app_save_profile", { me_id: user.user_id, payload });
        await user.persist(log);
        if (result?.error) return log.error(key, result.error, 400);
        rpcUser = result?.user;
        // family.isForKids and family.schedule both feed into matching
        // relevance, so re-pick when the user is idle with no page1 profile.
        // Re-read state from the rpcUser (app_save_profile may have updated it).
        const userAfter = (rpcUser as Record<string, unknown> | undefined) ?? user;
        const relations = (userAfter as { relations?: { page1?: { state?: string; profile?: unknown } } }).relations;
        if (availabilityState(userAfter) === "available"
          && relations?.page1?.state === "free" && !relations?.page1?.profile) {
          const findResult = await Tools.rpc(log, "app_find", { me_id: user.user_id, event_key: "find" });
          if (findResult && !findResult.error) {
            rpcUser = findResult.user;
            notifyList = findResult.notify ?? [];
          }
        }
        break;
      }

      case "delete": {
        const result = await Tools.rpc(log, "app_delete_cleanup", { me_id: user.user_id });
        notifyList = result?.notify ?? [];
        await user.delete(log);
        break;
      }

      default: {
        await user.persist(log);
      }
    }

    // Fire pushes behind waitUntil (never block response).
    for (const n of notifyList) {
      if (!n.user_id || n.user_id === user.user_id) continue;
      EdgeRuntime.waitUntil(firePush(log, n.user_id, n.code, user.user_id));
    }

    // Propagate fresh last_seen / location into snapshots inside other users'
    // relations (and recompute distances inside this user's own relations).
    // Skip for delete (row is gone) and reset (just touched everyone already).
    if (key !== "delete" && key !== "reset") {
      EdgeRuntime.waitUntil(
        Tools.rpc(log, "app_refresh_snapshots", { me_id: user.user_id }).then(() => {}),
      );
    }

    return log.success(rpcUser ?? user.db.new);
  } catch (err) {
    const msg = (err as Error)?.message ?? "unknown";
    return log.error("handler", msg, 500);
  }
});
