import Log from "../log.ts";
import Tools from "../tools.ts";
import User from "../user.ts";
import {
  Notify,
  Pages,
  PushPresence,
  PushToken,
  PUSH_BODY,
  PUSH_TITLE,
  pickGendered,
} from "../global.ts";

const searchable = ["is_for_male", "is_for_female", "age_from", "age_to", "range"];
// One page of group search / browse. The client sends its own window; this is
// only the fallback for a caller that sends none (the published build predates
// paging). The RPC clamps whatever arrives.
const SEARCH_PAGE = 20;
const updatable = ["weekStart", "os", "lang", "push_token", "location_custom", "location_type", "location_label"];
// User-initiated actions that start/extend an interaction and therefore
// require presence (the user must be reachable). A gated user — geo /
// disabled-group / no-notifications, all of which surface as
// relations.availability.state ≠ 'available' — is server-blocked from these,
// the symmetric counterpart to others() dropping them from match pools.
const requiresPresence = ["find", "invite", "add", "approve"];

// Actions that SEND (an invitation or a broadcast) and therefore require a
// BUILT profile — the profile-completion counterpart to requiresPresence.
// A user may look (find) the moment their account exists (name/gender/DOB),
// but may not surface to anyone until they have finished building a profile.
// The gate-aware mobile build already blocks these CTAs (the orange "build
// profile" step replaces the menu avatar, and the invite prompt opens a
// "build a profile first" popup instead of sending), so a correct current
// client never reaches here; this closes the loop for direct API calls.
const requiresProfile = ["invite", "add"];

// A deleted account's photos leave the PUBLIC `users` bucket the moment the
// account goes (user directive 2026-07-31). Nothing used to remove them at all:
// the row went and the face stayed reachable by URL forever. They move to the
// private `users-archive`, where the 30-day sweep collects them with the rest of
// the archive (_archive_ttl). Copy-then-remove rather than a bucket-to-bucket
// copy — these are a handful of small webp files and this needs no version of
// the storage client it does not already have. The remove runs whatever the copy
// did: a lost archive copy is a bad outcome, a photo left public is a worse one.
async function archivePhotos(log: Log, keys: string[]) {
  for (const key of keys) {
    const entry = log.log("archive_photo", { key });
    let copied = "missing";
    try {
      const dl = await Tools.supabase.storage.from("users").download(key);
      if (dl.data) {
        const up = await Tools.supabase.storage.from("users-archive").upload(key, dl.data, {
          contentType: dl.data.type || "image/webp",
          upsert: true,
        });
        copied = up.error ? `copy_failed:${up.error.message}` : "copied";
      } else {
        copied = `download_failed:${dl.error?.message ?? "not_found"}`;
      }
      const rm = await Tools.supabase.storage.from("users").remove([key]);
      if (rm.error) entry.result(`${copied};remove_failed:${rm.error.message}`, 500);
      else entry.result(copied, copied === "copied" ? 200 : 500);
    } catch (err) {
      entry.result((err as Error).message, 500);
    }
  }
}

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

// How many photos make a profile. The single completion marker the whole
// feature turns on, and since 2026-07-31 (user directive) it is the WHOLE of
// it: MIN_PROFILE_IMAGES photos and nothing else. The bio used to be half the
// test — onboarding saved it last, so it doubled as "the flow ran to the end" —
// which made the one field nobody has to fill in the thing that decided whether
// the account worked at all, and it disagreed with itself the moment the
// preview's inline editor let a built profile clear its bio back to null.
//
// Stated in three places and they must agree: here, mobile's
// selectProfileBuilt, and the only_available image filter inside others().
const MIN_PROFILE_IMAGES = 2;

// Is this user's profile BUILT? Gates the SEND actions (requiresProfile) and
// the self-seed in /app/start below, so a not-yet-built user can look but is
// never seen, seeded a viewer, or allowed to invite. others() drops the same
// rows from every match pool, so this is the symmetric half.
// Takes any user-SHAPED object, not only a User: the profile action has to ask
// this of the row an RPC just handed back (a plain json row) to know whether the
// save is the one that crossed the gate.
function profileComplete(u: { data?: unknown } | null | undefined): boolean {
  const imgs = (u?.data as { images?: unknown[] } | null | undefined)?.images;
  return Array.isArray(imgs) && imgs.length >= MIN_PROFILE_IMAGES;
}

// Does this user hold a clock of their OWN that has already run out — an
// invitation in either direction (page1 waiting as the inviter, page2 pending
// as the invitee), or a page1 WATCH whose hour is up?
// Pre-check only — cheap enough to run on every start/location/focus so the
// app_expire_self round trip is spent solely on rows that actually need it.
// app_expire_self re-checks every clock under the row lock, so a false positive
// here (clock skew, a concurrent extend) is a harmless no-op, never a
// premature close.
//
// The WATCH clause is what closes the gap the client had already opened on its
// own: home.tsx drops a watching card the instant expires_at passes, while the
// server used to tear it down only in the hourly ext/watch sweep. For up to 59
// minutes the row therefore read {state:'watching', profile:…} while the app
// showed nothing but the play button — and a press in that window took
// app_find's "already watching" branch, which keeps the page1 occupant out of
// the draw and in a small pool routinely left no candidate at all. A watch
// drawn before the expiry stamp carries no clock, and the RPC treats a
// clockless watch as expired (_watch_lapsed), so this must let it through too.
function isSelfClockLapsed(u: unknown): boolean {
  const rel = (u as { relations?: Pages } | null | undefined)?.relations;
  const lapsed = (at?: string | null) => !!at && Date.parse(at) <= Date.now();
  return (
    (rel?.page1?.state === "waiting" && lapsed(rel.page1.expires_at)) ||
    (rel?.page2?.state === "pending" && lapsed(rel.page2.expires_at)) ||
    (rel?.page1?.state === "watching" &&
      (!rel.page1.expires_at || lapsed(rel.page1.expires_at)))
  );
}

// Auto-hide on zero credits was REMOVED 2026-07-22 (credits rework). It used
// to flip page2 to locked via app_lock2 the moment balance + extra hit 0, so a
// user who ran out disappeared from the pool entirely — and therefore never
// received the invitation that would have been the reason to pay. The economy
// now works the other way round: a zero-credit user stays discoverable, the
// incoming invite's accept button IS the paywall, and only an accept the
// wallet could not cover (credits.unpaid_at, stamped in app_approve) takes
// them out of others(). With a daily pool of 1 the old rule also hid anyone
// who merely held a credit against a live invite. app_lock2 stays for the
// EXPLICIT hide in settings.

// Record the notification-presence signal into relations.push (drives the SQL
// push_blocked() gate). Called from start/location/focus only. `notif_perm` is
// client-reported — absent on old mobile builds, so they are left untouched
// and never gated. A fresh push_token arriving (or perm 'granted') clears any
// stale DeviceNotRegistered mark so the gate releases. No-op when the body
// carries neither signal, so it never churns relations on every call.
function recordPushPresence(user: User, body: Record<string, unknown>) {
  const raw = typeof body.notif_perm === "string" ? body.notif_perm : undefined;
  const perm = raw === "granted" || raw === "denied" || raw === "undetermined" ? raw : undefined;
  const freshToken = "push_token" in body && !!body.push_token;
  if (!perm && !freshToken) return;
  const prev: PushPresence = user.relations.push ?? {};
  const next: PushPresence = {
    ...prev,
    token: !!user.data?.push_token,
    checked_at: new Date().toISOString(),
  };
  if (perm) next.perm = perm;
  if (freshToken || perm === "granted") next.dead = false;
  user.relations.push = next;
}

async function firePush(
  log: Log,
  target_user_id: string,
  code: string,
  actor_id: string,
  extra?: { group_id?: string; group_name?: string },
) {
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
  // Group-lifecycle bodies carry a {group} placeholder filled from the notify's
  // group_name (see Notify). Harmless no-op for every other code.
  const bodyText = extra?.group_name ? stateText.replace("{group}", extra.group_name) : stateText;

  const payload: Record<string, unknown> = {
    type: code,
    collapseId: extra?.group_id ?? actor_id,
    title,
    body: bodyText,
    channelId: "default",
  };
  // The mobile tap handler deep-links to this group when present.
  if (extra?.group_id) payload.group_id = extra.group_id;
  // WHO the push is about. A join request opens that person's card with the
  // approve/decline pair on it, and a new friend link opens that friend's page
  // (user directive 2026-07-27: the tap lands on the person, not on a list).
  payload.actor_id = actor_id;
  const entry = log.log(`push:${code}`, { target: target_user_id, payload });
  const res = await Tools.notify(entry, token, payload);
  // The request's log row is serialized the moment the response goes out, so a
  // `push:` entry resolved inside waitUntil never reaches the DB. The runtime
  // log is the only place a push outcome is observable — record every one, not
  // just the failures Tools.notify already shouts about.
  console.log("push_sent", JSON.stringify({ code, target: target_user_id, ok: res.ok, error: res.error }));
  // Expo says this token is dead (app uninstalled / push receipt revoked).
  // Clear it and recompute availability so the user drops out of every pool
  // immediately — they can no longer be reached, the app requires presence.
  if (!res.ok && res.error === "DeviceNotRegistered") {
    EdgeRuntime.waitUntil(
      Tools.rpc(log, "app_push_dead", { p_user_id: target_user_id }).then(() => {}),
    );
  }
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
    // Sidecar list of the caller's current group memberships. Set by the
    // group-related RPCs (redeem_invite, leave_group, my_groups) so the
    // settings sheet can render an up-to-date list without an extra round
    // trip after a mutation. Merged into the response body via log.success.
    let rpcGroups: unknown | undefined;
    // Generic sidecar for the communities/friends read+write RPCs. Their
    // return payloads carry data (group, members, friends, requests, results)
    // rather than a fresh user row, so we merge those keys onto the response
    // body alongside the (unchanged) user. `notify` is peeled off into
    // notifyList; everything else rides here.
    let rpcExtra: Record<string, unknown> | undefined;

    // Presence gate (symmetric direction). others() already drops a gated
    // user from everyone's pool; this stops a gated user from actively
    // searching / inviting / broadcasting / accepting. A no-notifications
    // user who sends an invite could never be told it was accepted — a dead
    // end for both sides; same for geo / disabled-group gating. The
    // gate-aware mobile build already hides these CTAs while gated, so a
    // correctly-gated current client never reaches here; this closes the
    // loop for old builds and direct API calls. Teardown/exit actions
    // (clear1/clear2, decline, cancel, leave, free2, lock2, pause, logout,
    // ignore) are deliberately NOT gated — a gated user must still be able
    // to clear a stale state and get out. availabilityState defaults to
    // 'available' when the key is absent, so onboarding users (no gate
    // computed yet) are unaffected.
    if (requiresPresence.includes(key) && availabilityState(user) !== "available") {
      await user.persist(log);
      return log.error(key, "unavailable", 403);
    }

    // Profile-built gate (symmetric to the presence gate above). A browse-only
    // user — account created, profile not yet built — can look but must not be
    // able to SEND an invitation or broadcast until they finish. The mobile
    // build blocks the CTA client-side; this closes the loop for old builds and
    // direct API calls. Rejected as a logged precondition, not a silent 4xx.
    if (requiresProfile.includes(key) && !profileComplete(user)) {
      await user.persist(log);
      return log.error(key, "profile_incomplete", 403);
    }

    // Re-seed-on-skip: when a skip (find / ignore) detaches the caller from the
    // user they were watching, that user may drop to zero viewers. Capture them
    // now (pre-skip page1 target) so we can seed one fresh viewer for them after
    // the skip commits — see the app_seed_viewer call near the push loop.
    // app_seed_viewer no-ops unless that user is visible with an EMPTY viewer
    // list, so the seed fires only when the skipper was their last viewer.
    // Only a real skip (was 'watching' someone) qualifies — pressing play from
    // free/locked has no released target. The ignore path writes a synchronous
    // B->A restriction, and others() excludes restrictions bidirectionally, so
    // the freshly seeded viewer is never the skipper.
    const skipReleased: string | null =
      (key === "find" || key === "ignore") && user.relations?.page1?.state === "watching"
        ? (user.relations?.page1?.profile?.user_id ?? null)
        : null;

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
        // Re-login reset: app_logout_cleanup stamps `signed_out` so we can
        // distinguish a logout from an explicit lock2 hide. When a logged-out
        // user comes back, their first /app/start (or /location, /focus) opens
        // the account back up. Explicit-hide users are `discoverable = false`
        // with no such stamp and stay hidden across re-logins — that is the
        // whole point of the marker.
        //
        // It used to be page2 = {state:'locked', message:'logout'} — a message
        // with no relation behind it. `watch` cannot carry one (there is no row
        // for "I signed out"), so the marker moved to the column it always was,
        // and the boards are projected from relations like everything else.
        // Set on `user` itself, not on user.db.new: persist() builds its delta
        // by diffing the object against db.old, so a write to db.new is never
        // sent.
        if ((user as unknown as { signed_out?: boolean }).signed_out) {
          (user as unknown as Record<string, unknown>).signed_out = false;
          (user as unknown as Record<string, unknown>).seeking = true;
          (user as unknown as Record<string, unknown>).discoverable = true;
        }
        // Capture the client-reported notification permission (+ token health)
        // before persist, so the app_availability recompute below sees a fresh
        // relations.push and the push_blocked() gate is correct in the same
        // round-trip the client gets back.
        recordPushPresence(user, body);
        await user.persist(log);
        // Lazy expiry of the caller's own clocks. The crons are the safety net
        // for closed apps -- per-minute app_expire_sweep for invitations,
        // HOURLY ext/watch for watches -- and for an app that is OPEN both are
        // far too slow: the client's countdown hits 00:00 and the card would
        // sit there, live cancel button and all, until the next tick. The
        // client fires this endpoint the moment its invite clock reaches zero,
        // so the real state comes back in one round trip instead.
        //
        // The WATCH has no such client trigger and needs none: it is torn down
        // silently and locally (useLapsed), so the only thing that has to
        // happen here is the server AGREEING, which start/location/focus is
        // already in the middle of doing. Without it the row stayed 'watching'
        // for up to an hour after the app stopped showing it, and app_find read
        // that stale occupant as someone to keep out of the next draw.
        //
        // Guarded by a cheap in-memory pre-check so the common call adds
        // nothing; app_expire_self re-verifies every clock under the lock and
        // no-ops if the invite/watch is still live (or was extended
        // concurrently). Runs before app_availability so the recompute -- and
        // the Realtime relations change the client renders from -- carries the
        // closed state.
        if (isSelfClockLapsed(user)) {
          const expired = await Tools.rpc(log, "app_expire_self", { me_id: user.user_id });
          if (expired && !expired.error) {
            rpcUser = expired.user;
            notifyList = [...notifyList, ...(expired.notify ?? [])];
          }
        }
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
        // Seed first viewer: a freshly visible user with an empty viewer list
        // gets one top-relevance candidate assigned to watch them (B.page1
        // -> watching A, B's profile appended to A.page2.profiles[]), so the
        // viewer count is not stuck at 0. RPC is a no-op when the
        // preconditions don't hold (page2 not free / already has viewers /
        // gated / no idle candidate), so the guard here is just a cheap
        // pre-check. Auto-find above never fills A's own viewer list, so it
        // is safe to run after it.
        // Gated on profileComplete: a browse-only user must never be seeded a
        // viewer (that is what would make an unbuilt profile visible to, and
        // invitable by, someone else). They can look; they are not looked at.
        if (availableNow && profileComplete(user)) {
          const userAfter = (rpcUser ?? user.db.new) as { relations?: { page2?: { state?: string; profiles?: unknown[] } } };
          const p2state = userAfter.relations?.page2?.state ?? "free";
          const profiles = userAfter.relations?.page2?.profiles;
          const noViewers = !Array.isArray(profiles) || profiles.length === 0;
          if (p2state === "free" && noViewers) {
            const seedResult = await Tools.rpc(log, "app_seed_viewer", { me_id: user.user_id });
            if (seedResult && !seedResult.error) {
              rpcUser = seedResult.user;
              notifyList = [...notifyList, ...(seedResult.notify ?? [])];
            }
          }
        }
        break;
      }

      // /app/join_request retired 2026-05-25: the no-group=available rule
      // makes the request-to-join state unreachable. Old mobile builds that
      // still call this endpoint get a 404 here, which is harmless (the
      // request was a no-op under the new gate anyway).

      case "notif": {
        // Lean notification-permission heartbeat. The client posts this the
        // instant the OS permission changes (foreground poll / return from
        // Settings), so the presence gate stays near-realtime. Only what the
        // gate needs: record relations.push, persist, recompute availability
        // (synchronous so the response + Realtime carry the new gate state).
        // No auto-find / no extra work — keep this call cheap (it can fire
        // a few times around a permission toggle).
        recordPushPresence(user, body);
        await user.persist(log);
        const av = await Tools.rpc(log, "app_availability", { me_id: user.user_id });
        if (av && !av.error) rpcUser = av.user;
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
        // RPC first, persist (last_seen bump) AFTER — same order as
        // ignore/cancel/leave/block. Persisting BEFORE app_find broadcast a
        // Realtime UPDATE whose payload still carried the PRE-find relations
        // (page1 locked/free). user.persist bumps last_seen while app_find
        // does not, so that stale event and the app_find event share one
        // last_seen and the client's strict `ts < lastAppliedLastSeen`
        // ordering guard cannot drop the stale one — it rolled page1 back to
        // null for one frame between the trusted invoke:find HTTP result and
        // the app_find Realtime event, the visible "profile -> empty ->
        // profile" card flicker on the play button. Running app_find first
        // means every relations-bearing Realtime event after a find already
        // reflects the post-find (watching) state.
        const result = await Tools.rpc(log, "app_find", { me_id: user.user_id, force: true, event_key: "find" });
        await user.persist(log);
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

      case "set_tier": {
        // DEPRECATED 2026-06-01: tier model retired (no more free/pro). The
        // RPC stays as a server-side no-op for the deployed mobile build whose
        // settings popup still wires an "Upgrade to Pro" button — returning
        // success keeps that old flow from showing an error. New mobile UI
        // removes the button and calls /app/buy_extra instead.
        const tier = typeof body.tier === "string" ? body.tier.toLowerCase() : "";
        if (tier !== "free" && tier !== "pro") return log.error("set_tier", "bad_tier", 400);
        const result = await Tools.rpc(log, "app_set_tier", { me_id: user.user_id, new_tier: tier });
        await user.persist(log);
        if (result?.error) return log.error("set_tier", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        break;
      }

      case "buy_extra": {
        // Add `count` purchasable credits to relations.credits.extra. Count
        // is validated against the offered options (3/10/50). Pricing is
        // mobile-side (currently all "Free"); once real payments are wired
        // up, receipt verification happens before this RPC is invoked. The
        // RPC no longer gates on an empty wallet / one-buy-a-day: buying is
        // always available (2026-07-22).
        const count = Number(body.count);
        if (!Number.isFinite(count) || ![3, 10, 50].includes(count)) {
          return log.error("buy_extra", "bad_count", 400);
        }
        const result = await Tools.rpc(log, "app_buy_extra", { me_id: user.user_id, p_count: count });
        await user.persist(log);
        if (result?.error) return log.error("buy_extra", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        break;
      }

      case "referral": {
        // Claim the referral code the Play Install Referrer API handed the
        // client on first launch. The invitee never sees or types it — this
        // is a silent background call, so it must never surface an error to
        // them. app_referral_attach is idempotent (unique(invitee_id)) and
        // irreversible; a second call for an already-claimed account returns
        // outcome 'already', not an error.
        //
        // NOT in requiresPresence: this fires during onboarding, before the
        // gate has anything to say, and it starts no interaction.
        const code = typeof body.code === "string" ? body.code.trim() : "";
        if (!code) return log.error("referral", "no_code", 400);
        const source = typeof body.source === "string" ? body.source : "unknown";
        const result = await Tools.rpc(log, "app_referral_attach", {
          me_id: user.user_id, p_code: code, p_source: source,
        });
        await user.persist(log);
        if (result?.error) return log.error("referral", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        break;
      }

      case "redeem_invite": {
        // Per-group 6-digit invite code: user joins the matching enabled
        // group atomically. Additive — never removes existing memberships.
        // Not in requiresPresence: a gated (all-disabled-groups) user must
        // be able to redeem a code that flips them back to available.
        const code = typeof body.code === "string" ? body.code.trim() : "";
        if (!code) return log.error("redeem_invite", "no_code", 400);
        const result = await Tools.rpc(log, "app_redeem_invite", { me_id: user.user_id, p_code: code });
        await user.persist(log);
        if (result?.error) return log.error("redeem_invite", result.error, 400);
        rpcUser = result?.user;
        // notify carries group_join pushes to owner+managers when the group is
        // approval-gated (empty otherwise). join_status ∈ joined|pending|already
        // lets the client render a "Pending" state instead of "Joined".
        notifyList = result?.notify ?? [];
        rpcGroups = result?.groups;
        // `group` is the circle the link named, described the way the group
        // popup reads a circle (_group_brief_json). A tapped invite link opens
        // that popup over the hub, and it cannot wait for the denormalized
        // summary to arrive: an invoke response has its `relations` stripped on
        // the way into the client store, so the membership this call just
        // created lands there a beat later over a popup with nothing to draw.
        rpcExtra = { join_status: result?.join_status, group: result?.group };
        break;
      }

      case "leave_group": {
        // User-initiated leave of a single group. Idempotent (leaving a
        // group you're not in is a no-op success). Cascade trigger
        // _gm_cascade_on_membership_remove also clears any group_managers
        // grant tied to this membership.
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        if (!group_id) return log.error("leave_group", "no_group_id", 400);
        const result = await Tools.rpc(log, "app_leave_group", { me_id: user.user_id, p_group_id: group_id });
        await user.persist(log);
        if (result?.error) return log.error("leave_group", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        rpcGroups = result?.groups;
        break;
      }

      case "cancel_join": {
        // Requester withdraws their own pending group-join request. Idempotent
        // (cancelling a request that no longer exists is a no-op success).
        // Silent — no push to owner/managers.
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        if (!group_id) return log.error("cancel_join", "no_group_id", 400);
        const result = await Tools.rpc(log, "app_cancel_join", { me_id: user.user_id, p_group_id: group_id });
        await user.persist(log);
        if (result?.error) return log.error("cancel_join", result.error, 400);
        rpcUser = result?.user;
        rpcGroups = result?.groups;
        break;
      }

      case "my_groups": {
        // Read-only: list the caller's current group memberships, used to
        // populate the settings "My groups" sheet. The user row is returned
        // alongside so applyServerUser keeps the rest of the client state
        // fresh in the same call.
        const result = await Tools.rpc(log, "app_my_groups", { me_id: user.user_id });
        await user.persist(log);
        if (result?.error) return log.error("my_groups", result.error, 400);
        rpcUser = result?.user;
        rpcGroups = result?.groups;
        break;
      }

      // ── Communities & Friends (phase 1) ─────────────────────────────────
      // All additive; none in requiresPresence (management, not interaction).
      // Their RPC payloads carry data, not a fresh user row, so they peel
      // `notify` into notifyList and merge the rest via rpcExtra.
      case "create_group": {
        const name = typeof body.name === "string" ? body.name : "";
        const is_public = body.is_public === true;
        const p_description = typeof body.description === "string" ? body.description : null;
        const p_requires_approval = body.requires_approval === true;
        // Optional, like the description — only the name is required to create
        // a group. Absent/empty is simply a group with no link.
        const p_link = typeof body.link === "string" ? body.link : null;
        const result = await Tools.rpc(log, "app_create_group", {
          me_id: user.user_id, p_name: name, p_is_public: is_public,
          p_description, p_requires_approval, p_link,
        });
        await user.persist(log);
        if (result?.error) return log.error("create_group", result.error, 400);
        const { notify: _n, ...extra } = result ?? {};
        notifyList = (result?.notify as Notify[]) ?? [];
        rpcExtra = extra;
        break;
      }

      case "owned_groups": {
        const result = await Tools.rpc(log, "app_owned_groups", { me_id: user.user_id });
        await user.persist(log);
        rpcExtra = { owned: result };
        break;
      }

      case "group_members": {
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        if (!group_id) return log.error("group_members", "no_group_id", 400);
        const result = await Tools.rpc(log, "app_group_members", { me_id: user.user_id, p_group_id: group_id });
        await user.persist(log);
        if (result?.error) return log.error("group_members", result.error, 400);
        rpcExtra = result;
        break;
      }

      case "remove_member": {
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        const member_id = typeof body.user_id === "string" ? body.user_id : null;
        if (!group_id || !member_id) return log.error("remove_member", "bad_args", 400);
        const result = await Tools.rpc(log, "app_remove_member", { me_id: user.user_id, p_group_id: group_id, p_user_id: member_id });
        await user.persist(log);
        if (result?.error) return log.error("remove_member", result.error, 400);
        rpcExtra = result;
        break;
      }

      case "set_manager": {
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        const member_id = typeof body.user_id === "string" ? body.user_id : null;
        const make = body.make === true;
        if (!group_id || !member_id) return log.error("set_manager", "bad_args", 400);
        const result = await Tools.rpc(log, "app_set_manager", { me_id: user.user_id, p_group_id: group_id, p_user_id: member_id, p_make: make });
        await user.persist(log);
        if (result?.error) return log.error("set_manager", result.error, 400);
        rpcExtra = result;
        break;
      }

      case "transfer_owner": {
        // The owner hands the group to one of its members. The new owner gets
        // everything; the caller drops to MANAGER, so the group stays in their
        // `managed` list with is_owner off — hence BOTH the fresh user row (the
        // new standing) and the fresh roster (the crown moved rows), the same
        // roster set_manager and remove_member answer with.
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        const member_id = typeof body.user_id === "string" ? body.user_id : null;
        if (!group_id || !member_id) return log.error("transfer_owner", "bad_args", 400);
        const result = await Tools.rpc(log, "app_transfer_owner", { me_id: user.user_id, p_group_id: group_id, p_user_id: member_id });
        await user.persist(log);
        if (result?.error) return log.error("transfer_owner", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        rpcExtra = { members: result?.members };
        break;
      }

      case "set_group_hidden": {
        // The caller steps out of the game inside ONE group they run: its
        // members stop being offered to them and they stop being offered to its
        // members (others() drops the pair both ways). A property of the
        // caller's own membership, not of the group — nobody else is affected
        // and every other group they are in is untouched.
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        if (!group_id) return log.error("set_group_hidden", "no_group_id", 400);
        const hidden = body.hidden === true;
        const result = await Tools.rpc(log, "app_set_group_hidden", { me_id: user.user_id, p_group_id: group_id, p_hidden: hidden });
        await user.persist(log);
        if (result?.error) return log.error("set_group_hidden", result.error, 400);
        rpcExtra = result;
        break;
      }

      case "update_group": {
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        if (!group_id) return log.error("update_group", "no_group_id", 400);
        const p_name = typeof body.name === "string" ? body.name : null;
        const p_is_public = typeof body.is_public === "boolean" ? body.is_public : null;
        // Presence of the `description` key means "set it" (to a string or null
        // to clear) — mirrors the `'bio' in body` null-clear pattern in profile.
        const p_desc_provided = "description" in body;
        const p_description = typeof body.description === "string" ? body.description : null;
        const p_requires_approval = typeof body.requires_approval === "boolean" ? body.requires_approval : null;
        // Same key-presence contract as the description: `link` present means
        // "set it" (a string, or null to clear). The RPC is what normalizes a
        // bare host to https:// and refuses any other scheme — the value ends
        // up in Linking.openURL on someone else's phone.
        const p_link_provided = "link" in body;
        const p_link = typeof body.link === "string" ? body.link : null;
        const result = await Tools.rpc(log, "app_update_group", {
          me_id: user.user_id, p_group_id: group_id, p_name, p_is_public,
          p_description, p_desc_provided, p_requires_approval,
          p_link, p_link_provided,
        });
        await user.persist(log);
        if (result?.error) return log.error("update_group", result.error, 400);
        // Turning a group OPEN admits everyone who was queued, so this action
        // can approve people — same push an individual approval sends.
        const { notify: _gn, ...groupExtra } = result ?? {};
        notifyList = (result?.notify as Notify[]) ?? [];
        rpcExtra = groupExtra;
        break;
      }

      case "delete_group": {
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        if (!group_id) return log.error("delete_group", "no_group_id", 400);
        const result = await Tools.rpc(log, "app_delete_group", { me_id: user.user_id, p_group_id: group_id });
        await user.persist(log);
        if (result?.error) return log.error("delete_group", result.error, 400);
        rpcExtra = result;
        break;
      }

      case "search_groups": {
        // An empty q is legal and means "browse the catalogue" — the RPC pages
        // and orders either way. The page window is clamped inside the RPC, so
        // a hostile limit costs nothing here.
        const q = typeof body.q === "string" ? body.q : "";
        const limit = typeof body.limit === "number" ? body.limit : SEARCH_PAGE;
        const offset = typeof body.offset === "number" ? body.offset : 0;
        const result = await Tools.rpc(log, "app_search_groups", { me_id: user.user_id, p_q: q, p_limit: limit, p_offset: offset });
        await user.persist(log);
        // { results, has_more } — passed through whole. A published client that
        // predates paging reads `results` and ignores the rest.
        rpcExtra = result;
        break;
      }

      case "group_requests": {
        // Owner/manager reads the pending join requests for one group they run.
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        if (!group_id) return log.error("group_requests", "no_group_id", 400);
        const result = await Tools.rpc(log, "app_group_requests", { me_id: user.user_id, p_group_id: group_id });
        await user.persist(log);
        if (result?.error) return log.error("group_requests", result.error, 400);
        rpcExtra = result;
        break;
      }

      case "respond_join": {
        // Owner/manager approves (join + push the requester) or rejects
        // (silent) one pending join request by its id.
        const request_id = typeof body.request_id === "string" ? body.request_id : null;
        const accept = body.accept === true;
        if (!request_id) return log.error("respond_join", "no_request_id", 400);
        const result = await Tools.rpc(log, "app_respond_join", { me_id: user.user_id, p_request_id: request_id, p_accept: accept });
        await user.persist(log);
        if (result?.error) return log.error("respond_join", result.error, 400);
        const { notify: _n, ...extra } = result ?? {};
        notifyList = (result?.notify as Notify[]) ?? [];
        rpcExtra = extra;
        break;
      }

      case "approve_all_joins": {
        // Owner/manager empties the whole queue: every pending request for the
        // group is approved in ONE transaction (the same drain the open-flip
        // uses), each requester pushed. Returns the fresh queue + roster in
        // respond_join's shape, so the client writes both caches from it.
        const group_id = typeof body.group_id === "string" ? body.group_id : null;
        if (!group_id) return log.error("approve_all_joins", "no_group_id", 400);
        const result = await Tools.rpc(log, "app_approve_all_joins", { me_id: user.user_id, p_group_id: group_id });
        await user.persist(log);
        if (result?.error) return log.error("approve_all_joins", result.error, 400);
        const { notify: _an, ...allExtra } = result ?? {};
        notifyList = (result?.notify as Notify[]) ?? [];
        rpcExtra = allExtra;
        break;
      }

      case "my_friends": {
        const result = await Tools.rpc(log, "app_my_friends", { me_id: user.user_id });
        await user.persist(log);
        rpcExtra = result;
        break;
      }

      case "shared_groups": {
        // Read-only list backing the group chip's detail popup: every group the
        // caller and `user_id` both belong to, each with owner + member count.
        // Not in requiresPresence — it starts no interaction.
        const other_id = typeof body.user_id === "string" ? body.user_id : null;
        if (!other_id) return log.error("shared_groups", "no_user_id", 400);
        const result = await Tools.rpc(log, "app_shared_groups", { me_id: user.user_id, p_other: other_id });
        await user.persist(log);
        if (result?.error) return log.error("shared_groups", result.error, 400);
        rpcExtra = result;
        break;
      }

      case "shared_friends": {
        // The friend chip's twin of shared_groups: every person the caller and
        // `user_id` are both friends with. Read-only, starts no interaction, so
        // it stays out of requiresPresence.
        const other_id = typeof body.user_id === "string" ? body.user_id : null;
        if (!other_id) return log.error("shared_friends", "no_user_id", 400);
        const result = await Tools.rpc(log, "app_shared_friends", { me_id: user.user_id, p_other: other_id });
        await user.persist(log);
        if (result?.error) return log.error("shared_friends", result.error, 400);
        rpcExtra = result;
        break;
      }

      case "search_people": {
        const q = typeof body.q === "string" ? body.q : "";
        const result = await Tools.rpc(log, "app_search_people", { me_id: user.user_id, p_q: q });
        await user.persist(log);
        rpcExtra = { results: result };
        break;
      }

      case "friend_request": {
        const target_id = typeof body.user_id === "string" ? body.user_id : null;
        if (!target_id) return log.error("friend_request", "no_user_id", 400);
        const result = await Tools.rpc(log, "app_friend_request", { me_id: user.user_id, p_target_id: target_id });
        await user.persist(log);
        if (result?.error) return log.error("friend_request", result.error, 400);
        const { notify: _n, ...extra } = result ?? {};
        notifyList = (result?.notify as Notify[]) ?? [];
        rpcExtra = extra;
        break;
      }

      case "friend_respond": {
        const request_id = typeof body.request_id === "string" ? body.request_id : null;
        const accept = body.accept === true;
        if (!request_id) return log.error("friend_respond", "no_request_id", 400);
        const result = await Tools.rpc(log, "app_friend_respond", { me_id: user.user_id, p_request_id: request_id, p_accept: accept });
        await user.persist(log);
        if (result?.error) return log.error("friend_respond", result.error, 400);
        const { notify: _n, ...extra } = result ?? {};
        notifyList = (result?.notify as Notify[]) ?? [];
        rpcExtra = extra;
        break;
      }

      case "unfriend": {
        const other_id = typeof body.user_id === "string" ? body.user_id : null;
        if (!other_id) return log.error("unfriend", "no_user_id", 400);
        const result = await Tools.rpc(log, "app_unfriend", { me_id: user.user_id, p_other_id: other_id });
        await user.persist(log);
        if (result?.error) return log.error("unfriend", result.error, 400);
        rpcExtra = result;
        break;
      }

      case "friend_link": {
        // Auto-link the caller to the owner of an invite code (the inviter's
        // referral_code), reached by opening a /f/<CODE> link with the app
        // installed (deep link) or on first launch after an install. Mutual,
        // no request, no approval. Not in requiresPresence: a just-installed or
        // geo-gated invitee must still be able to connect.
        const code = typeof body.code === "string" ? body.code.trim() : "";
        if (!code) return log.error("friend_link", "no_code", 400);
        const result = await Tools.rpc(log, "app_friend_link_by_code", { me_id: user.user_id, p_code: code });
        await user.persist(log);
        if (result?.error) return log.error("friend_link", result.error, 400);
        const { notify: _n, ...extra } = result ?? {};
        notifyList = (result?.notify as Notify[]) ?? [];
        rpcExtra = extra;
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

      case "report": {
        // Public-launch safety (Apple 1.2 / Google UGC): report another user.
        // Always records + permanently blocks the pair; tears the live link
        // down via app_report (mirrors leave/cancel/decline per surface).
        const reported_id = typeof body.user_id === "string" ? body.user_id : null;
        if (!reported_id) return log.error("report", "no_user_id", 400);
        const p_reason = typeof body.reason === "string" ? body.reason : null;
        const p_note = typeof body.note === "string" ? body.note : null;
        const result = await Tools.rpc(log, "app_report", {
          me_id: user.user_id, reported_id, p_reason, p_note,
        });
        await user.persist(log);
        if (result?.error) return log.error("report", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        break;
      }

      case "bug_report": {
        // User-submitted bug report: free text + one optional attachment key
        // (image already uploaded to the private `bug-attachments` bucket by
        // the client). Pure insert via app_bug_report — does NOT touch
        // relations / credits / any game state. Surfaced in the web admin.
        const bug_text = typeof body.text === "string" ? body.text : "";
        const attachment_key = typeof body.attachment_key === "string" ? body.attachment_key : null;
        const result = await Tools.rpc(log, "app_bug_report", {
          me_id: user.user_id, p_text: bug_text, p_attachment_key: attachment_key,
        });
        await user.persist(log);
        if (result?.error) return log.error("bug_report", result.error, 400);
        rpcUser = result?.user;
        notifyList = result?.notify ?? [];
        break;
      }

      case "chat": {
        const chatBody = body.chat as { text?: unknown; image_key?: unknown; location?: unknown; audio_key?: unknown; audio_bars?: unknown; audio_duration_ms?: unknown; schedule?: unknown; reply_to?: unknown; created_at?: unknown } | undefined;
        // Truncated, never refused: the composer has no cap of its own and the
        // longest message ever sent is 41 characters, so this is a ceiling on
        // abuse (the row is broadcast to the partner over Realtime) and not a
        // limit any conversation can feel.
        const CHAT_TEXT_MAX = 4000;
        const text = typeof chatBody?.text === "string" && chatBody.text.trim() !== "" ? chatBody.text.trim().slice(0, CHAT_TEXT_MAX) : null;
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
        // Reply snapshot: a frozen preview of the message this one answers. It is
        // display-only (never joined against), so we sanitize rather than verify:
        // clamp the preview, whitelist the kind, and require the quoted author to
        // be one of the two participants (a client can't fabricate a third party).
        const REPLY_KINDS = ["text", "image", "audio", "location", "schedule"];
        const replyRaw = chatBody?.reply_to as { user_id?: unknown; created_at?: unknown; kind?: unknown; preview?: unknown } | null | undefined;
        let reply_to: { user_id: string; created_at: string; kind: string; preview?: string } | null = null;
        if (replyRaw && typeof replyRaw === "object") {
          const ruid = typeof replyRaw.user_id === "string" ? replyRaw.user_id : null;
          const rcreated = typeof replyRaw.created_at === "string" && Number.isFinite(Date.parse(replyRaw.created_at))
            ? new Date(replyRaw.created_at).toISOString()
            : null;
          const kind = typeof replyRaw.kind === "string" && REPLY_KINDS.includes(replyRaw.kind) ? replyRaw.kind : null;
          const preview = typeof replyRaw.preview === "string" && replyRaw.preview.trim() !== ""
            ? replyRaw.preview.slice(0, 140)
            : null;
          if (ruid && rcreated && kind && (ruid === user.user_id || ruid === other_id)) {
            reply_to = { user_id: ruid, created_at: rcreated, kind };
            if (preview) reply_to.preview = preview;
          }
        }
        const row: Record<string, unknown> = { user_id: user.user_id, other_id };
        if (text) row.text = text;
        if (image_key) row.image_key = image_key;
        if (audio_key) row.audio_key = audio_key;
        if (audio_key && audio_bars) row.audio_bars = audio_bars;
        if (audio_key && audio_duration_ms) row.audio_duration_ms = audio_duration_ms;
        if (location) row.location = location;
        if (schedule) row.schedule = schedule;
        if (reply_to) row.reply_to = reply_to;
        if (created_at) row.created_at = created_at;
        EdgeRuntime.waitUntil(
          Tools.invoke(log, "chat_insert", Tools.supabase.from("chat").insert(row)).then(() => {}),
        );
        await user.persist(log);
        notifyList = [{ user_id: other_id, code: "chat" }];
        break;
      }

      // Delete one of MY OWN messages, for both sides. The row is never removed:
      // the two histories must stay identical and a reply quoting this message
      // still points at its key, so the content is stripped and `deleted_at` is
      // stamped — the tombstone both clients draw. Keyed by (user_id, created_at),
      // the composite the whole chat is keyed by, and scoped to the caller's own
      // rows, so a client can only ever delete what it sent.
      case "chat_delete": {
        const delBody = body.chat_delete as { created_at?: unknown } | undefined;
        const raw = typeof delBody?.created_at === "string" ? Date.parse(delBody.created_at) : NaN;
        if (!Number.isFinite(raw)) return log.error("chat_delete", "no_message", 400);
        const key = new Date(raw).toISOString();
        await Tools.invoke(
          log,
          "chat_delete",
          Tools.supabase.from("chat")
            .update({
              deleted_at: new Date().toISOString(),
              text: null,
              image_key: null,
              audio_key: null,
              audio_bars: null,
              audio_duration_ms: null,
              location: null,
              schedule: null,
              reply_to: null,
            })
            .eq("user_id", user.user_id)
            .eq("created_at", key)
            .is("deleted_at", null),
        );
        await user.persist(log);
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

      case "profile": {
        // Accept any subset of {images, bio, family, height, smokes}. Keys absent
        // from the body are left untouched on the row. Pass null on a key to
        // clear the corresponding field (everything but images). The "wants own
        // kids" preference (formerly the is_for_kids column) lives inside
        // family.isForKids — the client embeds it before sending.
        const payload: Record<string, unknown> = {};
        // A PHOTO IS A FILE NAME IN MY OWN FOLDER, AND THE SERVER IS WHAT SAYS SO.
        // This used to be `payload.images = body.images` — an arbitrary JSON array
        // straight onto the row, with app_save_profile checking only that it WAS an
        // array. The client reads a card's photos as `<bucket>/users/<that card's
        // user_id>/normal/<name>` but passes anything containing "://" through
        // as-is (matchImageUrls, MatchCard), so a name of "https://…" made every
        // viewer's device fetch an attacker's server: the viewers' IPs, content
        // that never passed moderation, and a picture swappable after the fact.
        // Two of them also satisfy profileComplete, i.e. buy a place in the pool.
        //
        // SANITIZED, NOT REJECTED. The published build is the only writer and every
        // row on it today is {hash, normal} with a bare file name (301 of 301,
        // measured) — but a 400 here would be an onboarding that cannot finish, and
        // an unknown future key is not an attack. So an entry keeps the string
        // fields that are file names and drops the ones that are not; an entry with
        // no usable `normal` is not a photo and goes. IMAGE_KEY_RE is the whole
        // guard: no scheme, no slash, no traversal, nothing the URL builder could
        // read as anything but a leaf under the card owner's own folder.
        const IMAGE_KEY_RE = /^[A-Za-z0-9._-]{1,128}$/;
        const IMAGE_MAX = 12; // twice the client's own ceiling of MIN..6
        const BIO_MAX = 500; // the client caps at 150 (lib/bio.ts); nobody reaches this
        const JSON_FIELD_MAX = 4000;
        if ("images" in body && Array.isArray(body.images)) {
          payload.images = (body.images as unknown[])
            .slice(0, IMAGE_MAX)
            .map(entry => {
              if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
              const clean: Record<string, unknown> = {};
              for (const [k, v] of Object.entries(entry as Record<string, unknown>)) {
                if (typeof v !== "string") { clean[k] = v; continue; }
                if (IMAGE_KEY_RE.test(v)) clean[k] = v;
              }
              return typeof clean.normal === "string" ? clean : null;
            })
            .filter(Boolean);
        }
        if ("bio" in body) payload.bio = typeof body.bio === "string" ? body.bio.slice(0, BIO_MAX) : null;
        if ("family" in body) {
          const fam = body.family && typeof body.family === "object" && !Array.isArray(body.family)
            ? body.family
            : null;
          // The row is broadcast over Realtime and rides every candidate card, so a
          // free-form object on it is a payload the whole pool pays for. The real
          // maximum is 320 bytes; anything past this is not a family.
          payload.family = fam && JSON.stringify(fam).length <= JSON_FIELD_MAX ? fam : null;
        }
        // Height in CENTIMETRES — one canonical number on the row whatever the
        // client's own units are (see mobile/src/lib/height.ts). Anything that is
        // not a finite number clears the key, which is how "not stated" is said:
        // a height nobody has answered is an ABSENT key, never a 0.
        if ("height" in body) {
          const cm = typeof body.height === "number" && isFinite(body.height) ? body.height : null;
          payload.height = cm;
        }
        // Three states, and only two of them are booleans: true, false, and
        // "hasn't answered", which is the key not being there at all.
        if ("smokes" in body) {
          payload.smokes = typeof body.smokes === "boolean" ? body.smokes : null;
        }
        if (Object.keys(payload).length === 0) return log.error(key, "empty_payload", 400);
        // Read the gate BEFORE the save: the auto-visible below fires on the
        // TRANSITION into a built profile and on nothing else, so a built user
        // who hid on purpose and later edits his profile stays hidden. The save
        // that crosses the gate is the IMAGES one now (the bio is optional), so
        // it is onboarding's photo flush that lights the user up.
        const wasBuilt = profileComplete(user);
        // PERSIST FIRST, then save. This is the one action whose RPC writes the
        // same COLUMN the persist does (`data`), and persist writes the whole
        // column from a copy read before the RPC ran — so in the other order the
        // save was undone by the update right behind it. It only shows when the
        // in-memory copy differs from the row, which the User constructor can
        // make happen on its own: it merges the row over a default `data`
        // ({images, os, lang, push_token}), so a row missing any of those keys
        // comes back with them, `delta()` sees `data` as changed, and the whole
        // column is written back — bio included, i.e. removed. A row created by
        // anything other than User.insert (a seed, a restore) is born that way,
        // and its first profile save was silently dropped; the SECOND stuck,
        // because by then the shape had been normalized. Reproduced on the
        // review account 2026-07-30. Persisting first also means the RPC reads a
        // row that already carries this request's body fields.
        //
        // THE COST OF THAT ORDER IS AN ECHO OF THE OLD PROFILE, AND
        // app_save_profile PAYS IT BY STAMPING `last_seen` ITSELF (migration
        // 20260802190000). The persist writes the whole row while `data` still
        // holds the PREVIOUS bio / height / photos, so Realtime hands the client
        // the old profile and then the new one — harmless while it can tell the
        // two apart, which is exactly what its `last_seen` ordering guard is
        // for. The save used to leave the stamp alone, so both events carried
        // the persist's, neither could be ordered against the other, and the
        // stale one repainted the previous value for a beat (the HTTP response
        // lands ~150ms in, long before Realtime's echo, and spends the store's
        // optimistic `pending` guard on its way past). Any RPC that writes what
        // the client is looking at, behind a persist, owes the same stamp.
        await user.persist(log);
        const result = await Tools.rpc(log, "app_save_profile", { me_id: user.user_id, payload });
        if (result?.error) return log.error(key, result.error, 400);
        rpcUser = result?.user;
        // Referral payout hook. Saving a profile is the round trip in which an
        // invitee typically crosses the matchable gate (>= 1 image), which is
        // exactly what qualifies their inviter for a credit. Fire-and-forget:
        // it moves a THIRD PARTY's wallet and must never sit on the caller's
        // critical path, and the inviter learns about it through Realtime +
        // push, not through this response. No-op for the overwhelming majority
        // of calls (no pending referral row). The per-minute app_referral_sweep
        // is the safety net if this ever misses.
        EdgeRuntime.waitUntil((async () => {
          const q = await Tools.rpc(log, "app_referral_qualify", { me_id: user.user_id });
          if (!q || q.error) return;
          for (const n of (q.notify ?? []) as Notify[]) {
            if (n.user_id) await firePush(log, n.user_id, n.code, user.user_id);
          }
        })());
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
        // FINISHING THE PROFILE IS WHAT MAKES YOU VISIBLE (user directive
        // 2026-07-30). Up to this save the user was unseeable by construction --
        // others() drops an under-photographed row from every pool and the seed below is
        // gated on the same profileComplete -- and the app says so, on the one
        // control that states it (the preferences popup's visibility row, shut
        // for exactly this reason). So the round trip that closes that gap must
        // also do what the row promised: be visible, and have someone looking.
        //
        // Two steps, both no-ops in the ordinary case:
        //  • app_free2 only touches a page2 that is 'locked'. A fresh account is
        //    born 'free' (user.ts newRelations), so this is here for the row
        //    that got locked before the profile existed -- an older mobile build
        //    whose visibility row was still tappable, or a logout marker that no
        //    start has cleared yet -- and never for the built user above, whose
        //    hide is his own.
        //  • app_seed_viewer gives him his first watcher, so home is not an
        //    empty count after the one action that was supposed to change
        //    everything. It re-checks every precondition under the row lock
        //    (available / page2 free / no viewers / an idle candidate exists),
        //    so the guard here is only about not spending the round trip.
        // Synchronous, not waitUntil: both write the caller's OWN page2 and the
        // response body (and the Realtime row this triggers) has to carry them,
        // or the user lands on home still reading "hidden" until his next start.
        if (!wasBuilt && profileComplete(rpcUser ?? user.db.new)) {
          const built = (rpcUser ?? user.db.new) as { relations?: { page2?: { state?: string } } };
          if (built.relations?.page2?.state === "locked") {
            const freed = await Tools.rpc(log, "app_free2", { me_id: user.user_id });
            if (freed && !freed.error) rpcUser = freed.user;
          }
          const seedUser = (rpcUser ?? user.db.new) as { relations?: { page2?: { state?: string; profiles?: unknown[] } } };
          const p2 = seedUser.relations?.page2;
          const profiles = p2?.profiles;
          const noViewers = !Array.isArray(profiles) || profiles.length === 0;
          if (availabilityState(seedUser) === "available" && p2?.state === "free" && noViewers) {
            const seeded = await Tools.rpc(log, "app_seed_viewer", { me_id: user.user_id });
            if (seeded && !seeded.error) {
              rpcUser = seeded.user;
              notifyList = [...notifyList, ...(seeded.notify ?? [])];
            }
          }
        }
        break;
      }

      case "delete": {
        const result = await Tools.rpc(log, "app_delete_cleanup", { me_id: user.user_id });
        notifyList = result?.notify ?? [];
        // Everything personal moves to the `archive` schema BEFORE the row goes,
        // since it is that row being copied: the profile, the chat, the reads,
        // and every restriction except one — a block somebody else placed on him
        // stays live, so deleting and re-registering is not a way back to
        // someone who blocked you (user directive 2026-07-31). The photos are
        // the one part SQL cannot move; the RPC hands back their keys.
        const archived = await Tools.rpc(log, "app_archive_user", { me_id: user.user_id });
        await user.delete(log);
        const images = ((archived as unknown as { images?: string[] })?.images) ?? [];
        if (images.length) EdgeRuntime.waitUntil(archivePhotos(log, images));
        break;
      }

      default: {
        await user.persist(log);
      }
    }

    // (The zero-credit auto-hide that used to run here was removed in the
    // 2026-07-22 credits rework — see the note where maybeAutoHide stood.)

    // Fire pushes behind waitUntil (never block response).
    for (const n of notifyList) {
      if (!n.user_id || n.user_id === user.user_id) continue;
      EdgeRuntime.waitUntil(firePush(log, n.user_id, n.code, user.user_id, { group_id: n.group_id, group_name: n.group_name }));
    }

    // Re-seed-on-skip (see skipReleased capture above). A skip that emptied the
    // watched user's viewer list gets them one fresh viewer. Fire-and-forget:
    // it's a third party's surface, never the caller's critical path. The
    // 'candidate' push goes to the newly seeded viewer with the watched user as
    // the actor (n.actor_id), NOT the caller — so it can't use the notifyList
    // loop above (which fires with actor = caller).
    if (skipReleased) {
      EdgeRuntime.waitUntil((async () => {
        const seed = await Tools.rpc(log, "app_seed_viewer", { me_id: skipReleased });
        if (!seed || seed.error) return;
        for (const n of (seed.notify ?? []) as Notify[]) {
          if (n.user_id && n.actor_id) await firePush(log, n.user_id, n.code, n.actor_id);
        }
      })());
    }

    // Propagate fresh last_seen / location into the profile copies the boards
    // carry. Refreshing a snapshot IS projecting a board — the projection
    // rebuilds those copies from make_profile every time it runs, from the one
    // row both ends are drawn from — but it only runs when something CHANGES,
    // and a snapshot goes stale on the clock rather than on an event. So the
    // call stays and what it calls changed. Skip for delete (the row is gone).
    if (key !== "delete") {
      EdgeRuntime.waitUntil(
        Tools.rpc(log, "app_refresh_boards", { me_id: user.user_id }).then(() => {}),
      );
    }

    const responseUser = rpcUser ?? user.db.new;
    const responseBody = (rpcGroups !== undefined || rpcExtra !== undefined)
      ? {
          ...(responseUser as Record<string, unknown>),
          ...(rpcGroups !== undefined ? { groups: rpcGroups } : {}),
          ...(rpcExtra ?? {}),
        }
      : responseUser;
    return log.success(responseBody);
  } catch (err) {
    const msg = (err as Error)?.message ?? "unknown";
    return log.error("handler", msg, 500);
  }
});
