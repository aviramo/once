# Project Instructions

## Server-side code (supabase/functions/ and database)

Claude owns the server side end-to-end: edge functions, RPCs, migrations, schema. The two-board rewrite is complete (server + client). Further work is incremental features, not a rewrite.

### Autonomy

Claude may deploy edge functions and apply DB migrations (DDL/DML, RPCs, indexes, triggers, data backfills) without asking, **except** for the items in the approval list below. No confirmation needed to ship a change that falls inside the autonomous zone.

### Approval rules (strict)

- **Never create a new `.ts` file** in `supabase/functions/` without explicit user approval.
- **Never add a new table, column, index, trigger, RPC signature, or cron job** without explicit user approval. Every approved addition must be reflected in the "Database schema" section of this file before (or alongside) the migration.
- Modifying the body of an existing RPC (without changing its signature) is autonomous. Adding a new one is not.
- Dropping columns/tables that have been explicitly approved for removal in this file is autonomous.
- `CLAUDE.md` is the source of truth for the data model. If code and this file disagree, treat this file as correct and update the code.

## UI layout iron rules (mobile/app/home.tsx)

These rules are absolute and must be applied any time the PagerView layout or pane navigation is touched.

### Pane mapping
- **Page 1 (Home pane)** always maps to `page1` data.
- **Page 2 (Viewers pane)** always maps to `page2` data.

### Page 2 rendering
- `page2` is an **array** → show viewers list.
- `page2` is an **object** → show incoming invitation card (with timer + approve/decline buttons).

### Visual order (immutable)
RTL right→left: **Settings | Home | Side(page2/chat)**
Logical pane constants (never change): `SETTINGS=0, HOME=1, PAGE2=2, CHAT=2`

`PAGE2_PANE === CHAT_PANE === 2` — they share the same physical slot.

### PagerView layout
Fixed 3-page layout:
`[settings(slot 0), home(slot 1), side(slot 2)]`

Slot 2 renders `ChatPage` when `chatAvailable` (`state === 'chat'`), page2 content otherwise.
No slot is added or removed — only the content of slot 2 changes.

### Chat transition animation
When `state` transitions to `'chat'`:
1. `chatAvailable` becomes true → slot 2 flips from page2 to `ChatPage` automatically.
2. `setPage(2)` via `requestAnimationFrame` — navigates to slot 2 if not already there.
3. If already on slot 2 (user just approved from page2), `setPage(2)` is a no-op; content flips in place.

When `state` transitions away from `'chat'`:
1. `setPageWithoutAnimation(HOME_PANE=1)` — instant snap to home.
2. Slot 2 flips back to page2 content automatically.

### No guards or `paneToPage`/`pageToPane` helpers needed
Slot 2 always has content (either chat or page2) — no guard needed in `onPageSelected`.

---

## i18n text style

Do NOT use em dashes (—) in any i18n string in `mobile/src/i18n/he.ts` or `mobile/src/i18n/en.ts`. Replace with period, comma, or colon depending on context.

## Performance principles (server)

Latency of the user-facing response is the top priority. Anything that does not change what the client receives must not block the response.

- **Await only the critical path.** For each endpoint: auth, the atomic state transaction, and building the response body are awaited. Everything else (`log` table insert, `restrictions` insert, push notifications, any derived/denormalized writes) runs via `EdgeRuntime.waitUntil(...)`.
- **Collapse round trips.** Every atomic transition is a single RPC call, not a sequence of `supabase.from(...)` calls. Load any related-user data the RPC needs as part of the same RPC, not a separate round trip from the handler.
- **Lazy-load siblings.** Do not preload the `others` list for actions that do not need it (`account`, `chat`, `ok`, `logout`). The current code unconditionally calls `others` at the top of every request — remove that.
- **No optimistic-retry loops.** The current `update()` has an optimistic-concurrency retry pattern. Replace it with `SELECT ... FOR UPDATE` inside a single RPC; the lock is held briefly and deterministically.
- **Push notifications are fire-and-forget.** Always behind `waitUntil`. A failed push must not delay or fail the HTTP response.
- **Reliability trade-off:** `log` telemetry uses `waitUntil`. To minimize loss, `save()` has a single retry and a `console.error` fallback (edge function logs are recoverable). A hard worker crash mid-`waitUntil` may lose a row; this is accepted in exchange for latency.

---

## Game Logic: Two-Board Model

Replaces the old single-board model (one board that toggled between "visible/being-viewed" and "hidden/searching"). The new model has **two boards always available simultaneously**, so a user can be waiting on an invitation they sent (page1) while also receiving a competing invitation from someone else (page2).

### Data model

Everything lives inside `users.relations` (JSONB column) for atomicity and performance. No separate `invitations` / `viewings` tables.

```ts
type Pages = {
  page1?: Page1;               // undefined = brand new user, never searched
  page2: Profile[] | Page2Invite;  // array = list of viewers; object = incoming invitation
};

type Page1 = {
  profile?: Profile;           // present when state is non-null
  state: string | null;        // null = no active profile (see state/event table)
  event: string;               // always present; reason for current state
  invited_at?: string;         // ISO timestamp, sent time (present when state = 'waiting')
  expires_at?: string;         // ISO timestamp, absolute expiry (present when state = 'waiting')
  extended?: boolean;          // true after the one allowed extend; blocks further extends
};

type Page2Invite = Profile & {
  state: 'pending' | 'cancelled' | 'expired';  // pending = active; cancelled = inviter cancelled; expired = timed out
  invited_at?: string;         // ISO timestamp of when the invitation was sent
  expires_at?: string;         // ISO timestamp, absolute expiry
  extended?: boolean;          // mirrored from inviter's page1.extended
};
```

Both timestamps are written atomically on both sides. `invited_at` is stable for the life of the invitation (used for "X minutes ago" UI). `expires_at` moves forward on each `extend` call. The client-side countdown is driven by `expires_at`.

### State transition table

Every action is only honoured when its precondition (A page + State) matches. All other combinations are rejected by the server.

| A page | State | Event | Result | Todo |
|---|---|---|---|---|
| 1 | null | find/start/location/focus | no candidate | A.page1.state = null |
| 1 | null | find/start/location/focus | candidate B | A.page1.state = watching, B.page2[].add(A) |
| 1 | watching | ignore | no candidate | A.page1.state = null, B.page2[].remove(A) |
| 1 | watching | ignore | candidate C | A.page1.state = watching, B.page2[].remove(A), C.page2[].add(A) |
| 1 | watching | invite | B available | A.page1.state = waiting, B.page2.state = pending, B.page2.profile = A |
| 1 | watching | invite | B unavailable | A.page1.state = fail |
| 1 | waiting | cancel | | A.page1.state = null, B.page2.state = missed |
| 1 | waiting | extend | ok | A.page1.expires_at += minutes, B.page2.expires_at += minutes |
| 1 | waiting | extend | expired | A.page1.state = fail |
| 1 | waiting | expire (cron) | | A.page1.state = missed, B.page2.state = missed |
| 2 | pending | approve | not expired | A.page1.state = chat, B.page1.state = chat, A.page2 = [], B.page2 = [] |
| 2 | pending | approve | expired | A.page1.state = fail, B.page2.state = fail |
| 2 | pending | decline | | A.page2 = [], B.page1.state = missed |
| 2 | pending | expire (cron) | | A.page2.state = missed, B.page1.state = missed |
| 1 | chat | leave | | A.page1.state = null, B.page1.state = missed |
| 1 | chat | block | | A.page1.state = null, B.page1.state = missed |
| 1 | fail/missed | clear1 | | A.page1.state = null |
| 2 | fail/missed | clear2 | | A.page2 = [] |
| any | any | logout | | A.page1.state = null, A.page2 = [], B.page1.state = missed (where B.page1.profile = A), B.page2.state = missed (where B.page2.profile = A), B.page2[].remove(A) |
| any | any | delete | | A.page1.state = null, A.page2 = [], B.page1.state = missed (where B.page1.profile = A), B.page2.state = missed (where B.page2.profile = A), B.page2[].remove(A) |

### `page2` semantics

`page2` is either an array (viewers list) or a single object (invitation). The object form carries a `state` field:

| `page2` value | Meaning | Available action |
|---|---|---|
| `Profile[]` (array) | Users currently viewing me. Each has `page1.profile = me`, `page1.state = 'watching'`. | — (passive) |
| `{state: 'pending', ...Profile}` | Active incoming invitation — timer running. | `approve`, `decline` |
| `{state: 'missed', ...Profile}` | Inviter cancelled before I responded, or invitation timed out. | `clear2` |
| `{state: 'fail', ...Profile}` | Approve failed — invitation expired during my approve attempt. | `clear2` |

`clear2` acknowledges the dead invitation and returns `page2` to `[]`.

### Invariants the server must enforce after every transaction

1. `A.page1.state ∈ {watching, waiting}` ⇒ `A.page1.profile.user_id` names a real other user B.
2. `A.page1.state = 'waiting'` ⇔ `B.page2` is an object with `state = 'pending'` and `B.page2.profile.user_id = A.user_id`. A `page2` object with `state ∈ {missed, fail}` has no corresponding active page1 — it awaits `clear2`.
3. `A.page1.state = 'chat'` ⇔ `B.page1.state = 'chat'` and each `page1.profile` points at the other.
4. `A ∈ B.page2[]` (array form) ⇔ `A.page1.profile.user_id = B.user_id` and `A.page1.state = 'watching'`.
5. `B.page2` is an object ⇒ the array form is empty: all previous viewers were kicked to `missed/event` at the moment of invitation.
6. **Every write of `state` must include `event` in the same write.** `state` and `event` are always set together atomically — never one without the other.

### Endpoints

All live under `POST /app/<action>`. Each executes as a single Postgres transaction: `BEGIN; SELECT ... FOR UPDATE ordered by user_id ascending; UPDATE ...; COMMIT`. The user_id ordering prevents deadlocks when multiple rows are locked.

| Action | Precondition | Rows locked | Writes | On failure | Restriction |
|---|---|---|---|---|---|
| `find` | `A.page1.state = null` | A, old target B (if any) | candidate P found: `A.page1 = {state: 'watching', event: event_key, profile: P}`; `P.page2[].add(A)` | no candidate: `A.page1 = {state: null, event: event_key}` | — |
| `ignore` | `A.page1.state = 'watching'` | A, B | candidate C found: `A.page1 = {state: 'watching', event: 'ignore', profile: C}`; `B.page2[].remove(A)`; `C.page2[].add(A)` | no candidate: `A.page1 = {state: null, event: 'ignore'}`; `B.page2[].remove(A)` | `ignore` A→B |
| `invite` | `A.page1.state = 'watching'` and `B.page2` is array | A, B, every C with `C.page1.profile = B` | `A.page1 = {state: 'waiting', event: 'invite', profile: B, invited_at, expires_at}`; `B.page2 = {state: 'pending', event: 'invite', profile: A, invited_at, expires_at}`; every C: `C.page1 = {state: 'missed', event: 'invite', profile: B}` | B unavailable: `A.page1 = {state: 'fail', event: 'invite', profile: B}` | — |
| `extend` | `A.page1.state = 'waiting'` and not expired; `body.minutes ∈ {10,30,60,120,240,480,1440}` | A, B | `A.page1.expires_at += minutes`; `B.page2.expires_at += minutes`; `extended = true` on both sides; if already extended: no-op | expired: `A.page1 = {state: 'fail', event: 'extend', profile: B}` | — |
| `cancel` | `A.page1.state = 'waiting'` | A, B | `A.page1 = {state: null, event: 'cancel'}`; `B.page2 = {state: 'missed', event: 'cancel', profile: A}` | — | `cancel` A→B |
| `approve` | `A.page2.state = 'pending'` and not expired | A, B | `A.page1 = {state: 'chat', event: 'invite', profile: B}`; `B.page1 = {state: 'chat', event: 'invite', profile: A}`; `A.page2 = []`; `B.page2 = []` | expired: `A.page1 = {state: 'fail', event: 'approve', profile: B}`; `B.page2 = {state: 'fail', event: 'approve', profile: A}` | — |
| `decline` | `A.page2.state = 'pending'` | A, B | `A.page2 = []`; `B.page1 = {state: 'missed', event: 'decline', profile: A}` | — | `decline` A→B |
| `leave` | `A.page1.state = 'chat'` | A, B | `A.page1 = {state: null, event: 'leave'}`; `B.page1 = {state: 'missed', event: 'leave', profile: A}` | — | `leave` A→B |
| `clear1` (from chat) | `A.page1.state = 'chat'` | A, B | `A.page1 = {state: null, event: 'block'}`; `B.page1 = {state: 'missed', event: 'leave', profile: A}` | — | `block` A→B (permanent) |
| `clear1` (from fail/missed) | `A.page1.state ∈ {fail, missed}` | A only | `A.page1 = {state: null, event: 'ok'}` | — | — |
| `remove` | `X ∈ B.page2[]` | B, X | remove X from `B.page2[]`; `X.page1 = {state: 'missed', event: 'remove', profile: B}` | — | `remove` B→X |
| `clear2` | `A.page2.state ∈ {missed, fail}` | A only | `A.page2 = []` | — | — |
| `logout` | any | A + all affected users | `A.page1 = {state: null, event: 'logout'}`; `A.page2 = []`; push_token = null; location = null; every B where `B.page1.profile = A`: `B.page1 = {state: 'missed', event: 'logout', profile: A}`; every B where `B.page2.profile = A`: `B.page2 = {state: 'missed', event: 'logout', profile: A}`; remove A from any `B.page2[]` | — | — |
| `delete` | any | A + all affected users | same writes as logout, then deletes A's row | — | — |

**Restrictions note:** rows are inserted behind `waitUntil` (off the critical path). The `others` RPC reads them during `find`, but since restrictions only affect the inserting user's future `find` calls, a sub-100ms race is harmless — the restriction will be in place well before the user calls `find` again.

### Invitation timeout and extension

- Initial expiry: `expires_at = invited_at + 1 hour`.
- **`extend` is additive and one-shot per invitation.** Server-side functionality only. Mobile UI does not surface an extend button; the waiting state shows a full-width cancel. Server adds the requested minutes to `expires_at` on both sides and marks the invitation as extended.
- Only the inviter (A) can extend. Only while the invite is still live (`expires_at > now()`). Only if it has not been extended before (`!page1.extended`).
- Expiration is enforced two ways:
  - **Lazy:** `approve` / `extend` / `decline` check `expires_at > now()` inside the transaction. If expired, they fail with the appropriate state.
  - **Eager (pg_cron, every minute):** sweeper RPC scans for `waiting` page1 entries with `expires_at <= now()`, and per pair atomically sets `A.page1 = {state: 'missed', event: 'expire'}`, `B.page2 = {...B.page2, state: 'expired'}` (preserves profile for `clear2`). Also fires the `expired-out` / `expired-in` pushes.

Client drives countdown off `expires_at`. If the sweeper runs late (up to 60s slack), the lazy path catches any early access and realtime corrects the UI.

### Skip = `find`

No separate `unview` / `skip` endpoint. Skipping is `find`: the same transaction removes A from the old target's `page2[]` and picks a new profile. `ignore` is the variant of skip that also records a 24h restriction.

### Match resolution (full `approve` flow)

The inviter's viewers are **not** kicked at invite time — they stay pointed at A in `watching`. They get kicked at **match time**. Similarly, if A has a pending incoming invitation from some X (parallel-state scenario: A invited B while X was inviting A), X's invitation becomes invalid at match time.

The full `approve(B, A)` transaction:
1. `A.page1 = {profile: B, state: 'chat', event: 'invite'}`
2. `B.page1 = {profile: A, state: 'chat', event: 'invite'}`
3. `A.page2 = []`
4. `B.page2 = []`
5. For every C where `C.page1.profile.user_id = A.user_id` and `C.page1.state ≠ 'chat'`: set `C.page1 = {profile: A, state: 'missed', event: 'matched'}`. This covers both A's watching viewers and any X who had a pending invitation to A.
6. B's side needs no sweep — B's viewers were kicked to `missed/invite` at invite time, and no one could have added themselves while `B.page2` was an object.

Rows locked: A, B, and all C matching step 5 (query via index on `relations->'page1'->'profile'->>'user_id'`).

### Cancel / leave / block policy

- `cancel`: `A.page1 = {state: null, event: 'cancel'}`, `B.page2 = {...B.page2, state: 'cancelled'}` — profile preserved so B sees who cancelled. B calls `clear2` to return to `[]`. Viewers kicked at invite time stay kicked.
- `leave`: initiated from chat. Leaver's `page1 = {state: null, event: 'leave'}`; partner's `page1 = {state: 'missed', event: 'leave'}` (distinct screen).
- `block`: identical to `leave` from the partner's perspective, but inserts a permanent `block` restriction so the pair will never match again. Leaver's `page1 = {state: null, event: 'block'}`.

### Navigating out of the feed

Closing or navigating out of the feed does **not** clear `page1`. State is preserved until the user takes an action.

### Known issues (accepted, not blocking)

- **Ghost viewers:** if a user closes the app without calling any endpoint, they remain in their target's `page2[]`. No cleanup cron. Revisit later.

### Push notifications

All pushes are fire-and-forget (`waitUntil`, never on the critical path). Each push code corresponds to a state transition the receiver observes.

**Default: every transition fires a push, except the two mass-notification ones (`kick-invitee`, `kick-match`)** which stay Realtime-only to avoid spam when many users are affected by a single transition.

| Code | Push | Trigger | Receiver state |
|---|---|---|---|
| `invite-in` | ✅ | someone invited me | `page2` becomes object, timer running |
| `match` | ✅ | I matched (my approve or my invitation accepted) | `page1 = {state: 'chat', event: 'invite'}` |
| `declined` | ✅ | my outgoing invitation was declined | `page1 = {state: 'missed', event: 'event'}` |
| `expired-out` | ✅ | my outgoing invitation timed out | `page1 = {state: 'missed', event: 'expire'}` |
| `expired-in` | ✅ | my incoming invitation timed out | `page2 = []` |
| `cancelled-in` | ✅ | the inviter cancelled before I responded | `page2 = []` |
| `removed` | ✅ | I was removed from someone's viewer list | `page1 = {state: 'missed', event: 'event'}` |
| `left` | ✅ | my chat partner left (or blocked) me | `page1 = {state: 'missed', event: 'leave'}` |
| `extended` | ✅ | inviter extended my incoming-invite timer | `page2.expires_at` updated |
| `invite-fail` | ✅ | my own invite attempt failed | `page1 = {state: 'fail', event: 'invite'}` |
| `approve-fail` | ✅ | my own approve attempt failed | `page1 = {state: 'fail', event: 'approve'}` |
| `kick-invitee` | ❌ | mass: target got invited by someone else | `page1 = {state: 'missed', event: 'invite'}` |
| `kick-match` | ❌ | mass: target matched with someone else | `page1 = {state: 'missed', event: 'matched'}` |

Push codes are lowercase kebab-case and are sent as `data.type` inside the push payload. The `collapseId` field uses the relevant other-user id where applicable, so an older push is superseded by a newer one for the same pair.

### `start` endpoint — auto-find

`POST /app/start` is called on every app launch (after permissions are granted). In addition to persisting location + push token, it calls `app_find` automatically in two cases:
- `page1 = undefined` (brand new user, never searched) — always auto-finds.
- `page1.state = null` and `page1.event ∈ {find, start, ignore, location}` — auto-finds (e.g. after a failed find the user re-opens the app).

All other null-state events (`cancel`, `leave`, `block`, `ok`, `logout`) require a manual `find` tap — the user sees an empty home screen.

### Client / mobile assumptions

- Realtime is wired: the mobile app subscribes to its own `users` row and re-renders when `relations` changes. Server endpoints should not echo state into the HTTP response as a synchronization mechanism — Realtime is the channel. (Echoing for convenience is fine, but the client treats Realtime as truth.)
- The PagerView has 4 panes: `[chat (conditional), page2, home/page1, settings]`. Chat pane is only mounted when `state === 'CHAT'`; the `paneToPage`/`pageToPane` helpers account for it.
- `userStore.ts` runs `deriveCompat()` on every server update, synthesizing legacy `state` string (HIDDEN/WATCHING/WAITING/REPLYING/CHAT/OTHER_LEFT/OTHER_CANCELLED) and `match`/`watchers` fields off the new `relations.page1/page2` so existing UI branches keep working.
- **Page2 pane** is implemented: shows viewers list (`page2` array form) with the same watcher cards. Incoming invitation UI (`page2` object form) is not yet implemented in mobile.
- **Home/page1 pane HIDDEN state**: shows magnifying glass icon + "search preferences" button. No visible/hidden mode toggle exists anymore.

### Pending mobile work

- **Invite timer UI:** countdown driven by `page1.expires_at` is implemented. Extend UI deliberately omitted — extend is server-only. Cancel button is full-width.
- **Incoming invitation UI (page2 object form):** accept/decline buttons when `page2` is an object. Not yet implemented.
- **Push notification handler:** `data.type` codes need routing to the correct screen. Only token registration exists currently.
- **Dead code cleanup:** `setVisibility`, `app/visibility`, OFF mode, reveal/hide confirm dialogs, `showOffScreen`, `offButton` are still in `home.tsx` but unreachable at runtime. Can be removed when convenient.

### `report` (pending decision)

User is considering a `report` action available from both `watching` and `chat`. Not implemented until the shape is decided: does it add to `restrictions`, insert into a new `reports` table, auto-clear the relation, and/or fire a push to moderation? Held.

### Open questions (need user decision before implementation)

1. **`report` action:** shape and scope (see above). Deferred.

---

## Database schema (source of truth)

This section lists every table and column the server relies on. Any change requires user approval and an update here.

### `users`

Identity, matching preferences, and the JSONB `relations` column that drives the two-board model.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | primary key |
| `created_at` | timestamptz | default `now()` |
| `last_seen` | timestamptz | default `now()`; updated on every authenticated request |
| `name` | text | |
| `is_male` | boolean | |
| `is_for_male` / `is_for_female` | boolean | gender preference |
| `is_for_kids` | boolean | |
| `birth_date` | date | |
| `age_from` / `age_to` | smallint | preferred age range |
| `range` | integer | preferred max distance (meters) |
| `location` | geography (PostGIS) | `SRID=4326;POINT(lng lat)` |
| `data` | jsonb, default `{}` | name, bio, images, units, os, lang, push_token, role |
| `relations` | jsonb | `Pages` (see Game Logic). Source of truth for page1/page2. |

**Removed columns (migration applied):** `state`, `other_id`, `is_visible`, `is_avaliable` are gone. `users.name` is a regular text column (was generated). `data->>'name'` removed.

### `log` (server call log; source of truth for telemetry)

Every authenticated request writes exactly one row here. See the "Logging" section for the invariant and failure modes.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | default `gen_random_uuid()`; also used as the in-memory `Action.id` |
| `created_at` | timestamptz | default `now()` |
| `user_id` | uuid (nullable) | null for unauthenticated calls |
| `key` | text | action name (`find`, `invite`, `approve`, ...) or pseudo-key like `options` / `api` for rejections |
| `status` | smallint | HTTP status of the final response |
| `run_ms` | integer | total handler time |
| `log` | jsonb | array of `Log` entries (task, body, data/error, run_ms each) |
| `user` | jsonb | post-transaction snapshot of the user row |

### `restrictions` (blocklist / cooldown source for `others`)

Every soft/hard refusal writes a row. The `others` RPC left-joins here to set `relevance_restiction` to 0 when a row exists.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | default `gen_random_uuid()` |
| `created_at` | timestamptz | default `now()` |
| `user_id` | uuid | who issued the restriction |
| `other_id` | uuid | target |
| `key` | text | reason. `others` treats `ignore`/`refuse`/`cancel`/`leave` as a 24h cooldown and `block` as permanent. |

Keys under the new endpoint set:
- `cancel` — A cancelled an outgoing invite to B → cooldown A→B (24h)
- `decline` — B declined A's incoming invite → cooldown B→A (24h, replaces old `refuse`)
- `remove` — B removed viewer X → cooldown B→X (24h)
- `leave` — chat ended by one side (24h) — kept if chat-leave endpoint survives (open)
- `ignore` — passive skip (24h) — kept if ignore endpoint survives (open)
- `block` — hard block, **permanent** (no expiry)

Cooldown is **24h for all keys except `block`, which never expires.** The `others` RPC currently implements this (`key in (...) and created_at > now() - interval '1 day' or key = 'block'`) and stays as-is.

### `chat` (message log)

One row per message. Either `text` or `image_key` must be non-null (enforced in the server handler, not DB constraint).

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | sender |
| `other_id` | uuid | recipient |
| `created_at` | timestamptz | default `now()` |
| `text` | text, **nullable** | null for image-only messages |
| `image_key` | text, nullable | Storage object key: `{user_id}/{uuid}.jpg` |
| `location` | jsonb, nullable | `{lat: number, lng: number}` for location messages |
| `audio_key` | text, nullable | Storage object key: `{user_id}/{timestamp}.m4a` |
| `audio_bars` | jsonb, nullable | Array of 60 amplitude samples (0..1) captured during recording. Receiver renders a real waveform from this; null falls back to a deterministic hash-based decorative waveform. |
| `audio_duration_ms` | integer, nullable | Recording duration in ms, captured at record time. Lets the bubble show duration before the player loads (since playback is lazy on first tap). Null falls back to `–:––` until player loads. |
| `is_event` | boolean, nullable | true for system event rows |

Storage bucket: `chat-images` (images). Storage bucket: `chat-audio` (voice messages, 10 MB limit, m4a/mp4/aac/mpeg). Both private; same upload/read policy pattern as chat-images. (private, 5 MB limit, jpeg/png/webp). Upload policy: authenticated users may only write to their own folder (`storage.foldername(name)[1] = auth.uid()`). Read policy: uploader or any user referenced in `chat.user_id`/`chat.other_id` for that key.

### `states` (dormant)

Exists in the DB but nothing writes to it. Treat as dead; plan to drop eventually.

---

## Logging (every server call must land in `log`)

The telemetry invariant is: **every HTTP request that reaches the edge function produces exactly one row in `log`**, regardless of outcome (success, validation error, auth failure, uncaught exception, DB failure mid-transaction). Missing rows are bugs.

### Current pattern (to preserve)

- `Action` is constructed synchronously at the top of the handler with `id = crypto.randomUUID()`, the route `key`, and the request `body` recorded as the first `Log`.
- Every DB call goes through `Tools.invoke(action, task, query)`, which creates a `Log` with task name + url + body, awaits the query, and stores either `data` (success) or `error` + non-2xx `status` (failure). Never call `Tools.supabase.*` directly from handler code — it bypasses the log.
- `action.error(task, message, status)` returns an HTTP response and also appends an error `Log` with that task name.
- `action.response()` is the only path that writes to `log`; use it for every exit (success or error).

### Logging invariants (implemented)

All gaps from the original list have been fixed:
- Top-level `try/catch` wraps the handler; uncaught exceptions produce a `log` row.
- `Action.save()` no longer short-circuits on unauthenticated requests; `user_id` is `null` for those rows.
- `save()` retries once on insert failure, then `console.error`s the row as a fallback.
- `body` is captured before any early return (constructor runs first).
- Hard worker crash mid-`waitUntil`: accepted loss.

### Rules for new endpoints

- Always funnel DB access through `Tools.invoke()`. No direct `supabase.from(...).insert(...)` in handlers.
- Every precondition check that rejects a request must go through `action.error(...)` so the rejection shows up as a log entry, not a silent 4xx.
- Atomic transactions (from the endpoint spec) should be wrapped as a single RPC or a single `Tools.invoke` call so the whole transaction is one log entry with clear success/failure status, rather than multiple partial entries.

---

## Approved removals (already migrated)

The following were dropped in the `two_board_refactor` migration and are gone from the schema:
- `users.state`, `users.other_id`, `users.is_visible`, `users.is_avaliable` — dropped.
- `users.data->>'name'` — removed; `users.name` is now a regular text column.
- `restrictions` — truncated; all rows reset.
- `users.relations` on all existing rows — reset to `{"page2": []}`.

The following server files have been fully rewritten and are clean:
- `supabase/functions/app/index.ts` — dispatcher for all new endpoints
- `supabase/functions/user.ts` — `getById`, `getByRequest`, `insert`, `persist`, `delete`, `pushToken`
- `supabase/functions/global.ts` — `Page1`, `Page2Invite`, `Pages`, `Profile`, `Notify`, `RpcResult`, `Log`
- `supabase/functions/action.ts` — full logging, retry, `success()` method
- `supabase/functions/tools.ts` — `invoke()`, `rpc()`, `notify()`

The following RPCs exist in the DB and match the endpoint table above:
`app_find`, `app_ignore`, `app_clear1`, `app_clear2`, `app_invite`, `app_extend`, `app_cancel`, `app_approve`, `app_decline`, `app_leave`, `app_block`, `app_remove`, `app_expire_sweep` (called by pg_cron every minute), `app_delete_cleanup` (called by the `delete` endpoint before row deletion), `app_logout_cleanup` (called by the `logout` endpoint: kicks page2 viewers to `logout`, clears page2), `app_refresh_snapshots` (see below).

Helper functions: `make_profile`, `_remove_from_page2`, `_kick_pointing_at`, `_add_restriction`.

### `app_refresh_snapshots(me_id)` — keeping snapshots fresh

The `Profile` snapshot stored inside `relations` (via `make_profile`) freezes `last_seen` and `distance` at write time. Without active refresh, a chat partner or watcher would always show the value captured at match/view-start time, not the current value.

`app_refresh_snapshots(me_id)` is called from the handler (behind `EdgeRuntime.waitUntil`) on every endpoint **except** `delete` and `reset`. It propagates A's current `last_seen` + `location` into every snapshot of A that lives in other users' relations, and recomputes distances inside A's own relations. The chat-state rule:

- **state ≠ chat** → snapshot has live `last_seen` + `distance`
- **state = chat** → snapshot has live `last_seen`; `distance` is stripped (and never re-added)

Specifically:
- Outward: for every B referencing A in `B.page1.profile`, `B.page2[]` array, or `B.page2` object, update `last_seen` (always) and `distance` (unless that reference is in chat state).
- Inward: in A's own relations, recompute distances against the latest `me.location`. In `A.page1.profile` chat state, ensure `distance` is absent.

Realtime delivers the resulting `users.relations` change to the affected client. Mobile keeps reading `match.last_seen`, `watcher.last_seen`, `watcher.distance` from the snapshot — the snapshot is now kept fresh for it.

---

## Proposed state machine v2 (pending implementation)

Forward-looking spec for the next refactor. The currently deployed model is "Game Logic: Two-Board Model" above; this section supersedes it once implemented. **Do not implement until the user gives the go-ahead.** This section exists so the table is easy to pull up later when we start the work.

### What changes vs. today

- The `event` field on `page1` and `page2` is removed entirely.
- `state` becomes a small fixed enum on each page; `message` (optional) replaces `event` and is set only on transitions where the affected user needs UI feedback.
- `page2` is no longer "array OR object". It always has a `state` field, and the watcher list (`profiles`) and singular invitee/partner snapshot (`profile`) live as separate populations beside it.
- Findability rule changes (see below).

### State vocabulary

- `page1.state ∈ {free, watching, waiting, chat, locked}`
- `page2.state ∈ {free, pending, chat, locked}`
- `message`: optional string, per page. Set only on writes marked `*` in the transition table. Value = the actor's event code (e.g., `cancel`, `decline`, `expire`). Auto-find triggers (`start`/`location`/`focus`) are never propagated as `message`.
- `profile` (singular) and `profiles` (array of watchers) populations are managed independently of `state` and are not in the transition table.

### Initial state (brand-new user)

`page1.state = locked`, `page2.state = locked`, both with no `message`. The user exits via the green-button paths described under "UI button mapping".

### Findability (used by `find` to pick a candidate P for actor A)

P is findable iff:
- `P.page1.state ≠ chat`
- `P.page2.state ∉ {locked, pending}`

### Auto-find behavior

`start`, `location`, `focus` always run on app open / location change / focus to refresh `relations` snapshots (analog of `app_refresh_snapshots`). They additionally trigger auto-find **iff** `A.page1.state === 'free'`. Any other state (`locked`, `watching`, `waiting`, `chat`) → snapshot refresh only, no auto-find.

### UI button mapping (per page, when `state === 'locked'`)

- **`message` present** → page renders the "what happened" card (the screen today's `event` value would render) with a **gray "Continue" button**. Tap fires `clear1` / `clear2` to the server, which clears `message` only — `state` stays `locked`.
- **`message` absent** → page renders its default UI with a **green action button**:
  - page1 green button → `find` (transitions `page1.state` from `locked` to `watching` or `free` and runs candidate selection).
  - page2 green button → `free2` (transitions `page2.state` from `locked` to `free`).

So a fully-locked-with-message page exits in two taps: gray (clear message) → green (find / free2). page1 has no separate `free1`; `find` covers it.

### How to read the state transition table

- **page**: which UI page the actor (A) initiated the action from. Informational, not a precondition by itself.
- **A.event**: the event code A fired. `a/b` means either action shares the row but writes its own event code as `message` when applicable.
- **page1.state / page2.state**: how the named pages of the involved users are written by the transaction.
  - **Letter in parens** = which user the write applies to. `A` = actor; `B` = the direct counterparty (e.g., the inviter, the chat partner, the user being removed); `C` = any third party affected (e.g., A's or B's other watchers).
  - **`*` next to a letter** = on top of writing `state`, also write `message` for that user, with value = the event code from column 2.
  - **`+`** = both apply (multiple writes in one transaction, possibly to different users).
  - **`/`** = alternative outcomes (success vs. failure vs. mutual case).
  - **Empty cell** = the page's `state` is not written by this transaction. `profile` / `profiles` populations are managed separately and don't appear in this table (the only exception is `page2.state = locked`, which by convention also clears the `profiles` array — see below).
- **`locked` semantics**: end-of-interaction marker for that page. May be a successful terminal write (e.g., `cancel` writes A.page1=locked with no message) or a failure landing (e.g., `invite` failure writes A.page1=locked with `message=invite`).
- **`page2.state = locked`** also implies the watcher array on that page is cleared as part of the same write (locked = "no incoming interaction; array deleted"). The array can re-populate after `free2` returns it to `free`.

### State transition table

| page | A.event | page1.state | page2.state |
|------|---------|-------------|-------------|
| | start/location/focus | free/watching (A) | |
| 1 | find/ignore | free/watching (A) | |
| 1 | cancel | locked (A) | locked (B*) |
| 1 | invite | (waiting/chat/locked (A*) / chat (B)) + locked (C*) | pending (B) + locked (A) |
| 1 | extend | locked (A*) | |
| 2 | remove | locked (B*) | |
| 2 | approve | chat (A+B) + locked (C*) | locked (A*+B) |
| 2 | decline | locked (B*) | locked (A) |
| 1 | leave/block | locked (A) + locked (B*) | |
| | logout/delete | locked (A+B*) | locked (A+B*) |
| | cron | locked (A*/B*) | locked (A*/B*) |
| 1 | clear1 | | |
| 2 | clear2 | | |
| 2 | free2 | | free (A) |

`clear1` and `clear2` write only `message = null` on their respective page (state untouched). `free2` writes only `page2.state = free` (no message).

### Event list (19 events)

`start`, `location`, `focus`, `find`, `ignore`, `cancel`, `invite`, `extend`, `remove`, `approve`, `decline`, `leave`, `block`, `logout`, `delete`, `cron`, `clear1`, `clear2`, `free2`.

### Worked examples

- **`logout/delete | locked (A+B*) | locked (A+B*)`**: A's page1 → locked (no message — A initiated). Every B referencing A (in `B.page1.profile`, `B.page2.profile`, or `B.page2.profiles[]`) gets their corresponding page → locked + `message = logout` (or `delete`).
- **`invite | (waiting/chat/locked (A*) / chat (B)) + locked (C*) | pending (B) + locked (A)`**: A in watching invites B. Three branches for A.page1: `waiting` (success), `chat` (mutual case where B was already inviting A), or `locked` + `message=invite` (failure). On the mutual branch, B.page1 also goes to `chat`. B.page2 → `pending` with A's profile (no message, B is the recipient and the UI shows pending). A.page2 → `locked` (no message — A's own previous viewer array is cleared as A goes off-market). Every C with B as their watching target → C.page1 = `locked` + `message=invite` ("kicked because target was invited").
- **`approve | chat (A+B) + locked (C*) | locked (A*+B)`**: A approves B's pending invite. Both A.page1 and B.page1 → `chat`. A.page2 → `locked` + `message=approve` (A sees a "you accepted" lock that clears via `clear2`). B.page2 → `locked` (no message — B was just an invitee; their view is now the chat). Every C watching A or B → C.page1 = `locked` + `message=approve`.

### Implementation scope (when greenlit)

In order:
1. **Schema migration** on `users.relations`: add `message` to page1/page2; remove `event`; convert page2 to unified `{state, profile?, profiles?, message?, invited_at?, expires_at?, extended?}`.
2. **Backfill** existing rows.
3. **RPCs**: rewrite to match the table. Keep names where the action is unchanged (`app_find`, `app_invite`, ...). Add `app_free2` (no `app_free1` — `find` covers page1's exit). `app_clear1` / `app_clear2` change semantics from "transition out of fail/missed → null" to "clear message only, leave state=locked".
4. **Client**: drop `deriveCompat` shim from `userStore.ts`; consume `state` and `message` directly. UI: gray-vs-green button per the rule above.
