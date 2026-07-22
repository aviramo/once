# Backward-compat cleanup queue

Tracks server-side shims kept alive only to support older published mobile builds. Each entry is a piece of code or schema that should be removed once the minimum live app version has moved past the cutoff.

See `CLAUDE.md` → "Backward compatibility with the deployed mobile app (production)" for the staging pattern (Expand → Migrate → Contract). Entries here are the **Contract** step waiting to happen.

## How to use this file

- **When you ship the Expand step** of a breaking change, add an entry here in the same change. If you don't, the cleanup will never happen.
- **When you start a session**, scan this file: any entry whose `Safe to remove after` version is now below the live floor can be removed.
- **When you remove an entry**, delete its section from this file in the same commit.

## Entry template

```
### <short title>

- **Added:** YYYY-MM-DD
- **Reason:** what breaking change this shim is bridging
- **Old shape (kept alive):** <field / endpoint / RPC / behavior the old app still relies on>
- **New shape (preferred):** <what the new app uses>
- **Safe to remove after:** mobile version >= X.Y.Z is the floor across live users
- **How to remove:**
  - <file:line or RPC name> — what to delete
  - <migration / SQL needed>
  - <any data backfill needed>
- **Verify before removing:** how to confirm no live reader is on the old shape (e.g., grep `log` table for endpoint hits, check version distribution)
```

## Open entries

### `app/set_tier` endpoint + `credits.tier` reads on the deployed mobile build

- **Added:** 2026-06-01
- **Reason:** Tier model (free/pro) retired in favour of purchasable extra hearts (`relations.credits.extra`). The new mobile UI has no tier-switch button — it offers a `BuyExtraPopup` that posts `/app/buy_extra` instead. But the deployed mobile build (≤ 1.0.3) still reads `relations.credits.tier` (falls back to 'free' when absent, so this is benign) AND wires a `"Upgrade to Pro"` button in the settings hearts popup that posts `/app/set_tier { tier: 'pro' }`. Dropping the endpoint would surface a server error to those users; dropping the column read would not (the fallback to 'free' kicks in).
- **Old shape (kept alive):**
  - `public.app_set_tier(me_id, new_tier)` exists as a NO-OP that returns the current user row (no wallet mutation). The edge dispatcher's `case "set_tier"` still routes to it. Old mobile builds tap "Upgrade to Pro" → see no error and no balance change (silent ignore).
  - The credits-wallet JSON shape has `extra: 0` on every row. Old readers ignore the unknown key. They keep reading `balance`, which is unchanged.
- **New shape (preferred):**
  - `relations.credits = { balance:0..3, extra:0..N, held:0..N, granted_on?, next_grant_at? }` — no `tier` field. Total spendable = balance + extra; charging deducts balance first, refund overflow lands in `extra`.
  - `public.app_buy_extra(me_id, p_count)` + `/app/buy_extra { count: 5|10|50 }`.
- **Safe to remove after:** mobile version where the BuyExtraPopup ships and the deprecated "Upgrade to Pro" button is gone is the floor across live users. Once `log` shows no recent `key='set_tier'` rows, both the endpoint case and the SQL function can be dropped.
- **How to remove:**
  - Remove the `case "set_tier":` block from `supabase/functions/app/index.ts`.
  - `DROP FUNCTION public.app_set_tier(uuid, text);` in a follow-up migration.
  - Drop the `"set_tier": "Switched plan"` entries from `web/src/i18n/dictionaries/{he,en}.json` activity map (now obsolete).
- **Verify before removing:** `SELECT count(*) FROM log WHERE key = 'set_tier' AND created_at > now() - interval '14 days'`. Zero hits = safe.

### `app/units` endpoint and `data.units` field

- **Added:** 2026-05-11
- **Reason:** Distance units used to be a user preference (`data.units` ∈ `{"metric","imperial"}`) togglable in Settings. New build derives the unit from device locale (`getLocales().regionCode`) and no longer writes the field. Older builds still POST `/app/units` and pass `units` inside `/app/account`.
- **Old shape (kept alive):** Dispatcher silently 200-OKs `/app/units` calls (no `case "units"` → default branch persists `last_seen` and returns success). Both endpoints accept `units` in the body but the field is no longer in `updatable`, so it is dropped on the floor.
- **New shape (preferred):** Client derives units from device locale; server never reads or writes `data.units`.
- **Safe to remove after:** mobile version where the new locale-derived units lib (`src/lib/units.ts`) ships is the floor across live users.
- **How to remove:**
  - Optional: add `case "units": break;` to the dispatcher to short-circuit legacy calls without persisting.
  - Optional: backfill to strip stale `data.units` from existing rows (`UPDATE users SET data = data - 'units' WHERE data ? 'units'`). Pure cleanup, no behavior impact.
- **Verify before removing:** grep the `log` table for recent `key='units'` rows; if zero, the cleanup is safe.

### `location_custom` embedded in `make_profile` snapshots

- **Added:** 2026-05-15
- **Reason:** Location anchor became typed (`data.location_type` ∈ `{device,home,work}`), replacing the boolean `data.location_custom`. New mobile builds drive the distance chip off the snapshot's `location_type` (PinIcon/HomeIcon/WorkIcon) and a live-vs-anchored text rule. Mobile builds that predate the typed model only read `match.location_custom` (binary PinIcon↔HomeIcon + passive-text swap); dropping it from the snapshot would break their distance chip.
- **Old shape (kept alive):** `make_profile` still emits `location_custom: true` whenever `location_type ∈ {home,work}` (or the legacy boolean is set). The mobile-side write path also keeps mirroring `location_custom` next to `location_type` so a pre-typed server read (none expected, but harmless) and old readers stay consistent.
- **New shape (preferred):** `make_profile` emits `location_type` (`home`/`work`, derived `home` for legacy `location_custom=true` rows with no type). New mobile reads `location_type`; viewer's own type from `data.location_type` with fallback `location_custom ? 'home' : 'device'`.
- **Safe to remove after:** mobile version that ships the typed location picker + `location_type`-driven chip is the floor across live users.
- **How to remove:**
  - `supabase/migrations/*_make_profile_location_type.sql` (the live `make_profile`) — drop the `'location_custom'` jsonb key and the legacy-`location_custom` branches of the `'location_type'` CASE; emit `location_type` only.
  - `mobile/src/stores/userStore.ts` — drop the `location_custom` read/promote/CLIENT_AUTHORED entries and the `location_type ?? (location_custom ? 'home' : 'device')` fallback.
  - `mobile/app/settings.tsx` — stop sending `location_custom` in the `app/location` payloads (send only `location_type`).
  - `supabase/functions/app/index.ts` — remove `"location_custom"` from `updatable`; `supabase/functions/global.ts` — drop `Data.location_custom` / `Profile` doc note.
  - Optional backfill: `UPDATE users SET data = data - 'location_custom' WHERE data ? 'location_custom'` (pure cleanup once nothing reads it).
- **Verify before removing:** check the live mobile version distribution; confirm the floor build reads `location_type`. Grep recent `log.user` snapshots / app version headers to confirm no pre-typed build is still active.

### Geo-availability gate — old clients show no gate message (informational)

- **Added:** 2026-05-16
- **Reason:** The geo-availability gate is **purely additive** server-side (new `relations.availability` key; the `others` candidacy clause is a no-op when no enabled areas exist), so it is *not* a breaking change and needs no Expand→Contract shim. This entry exists only to record a known **degraded-UX window** on old mobile builds, per the discipline that every cross-version behaviour change is logged here.
- **Old shape (kept alive):** Nothing. Mobile builds that predate the gate ignore the unknown `relations.availability` key. When the admin enables areas, a gated user on an old build is still correctly excluded from matching by `others()` (server-enforced), but the old app shows normal idle UI / "no one nearby" instead of the explanatory "not available in your area / not yet" message, and its side tab stays reachable. Functionally safe, just unexplained.
- **New shape (preferred):** Gate-aware mobile build renders `home.geoGate.*` in the headline slot, suppresses find, and removes the side tab while gated.
- **Safe to remove after:** mobile version that ships the `home.geoGate` handling is the floor across live users.
- **How to remove:** Nothing to delete in code (no shim). Just delete this note once the gate-aware build is the live floor.
- **Verify before removing:** check the live mobile version distribution; confirm the floor build contains `home.geoGate.unavailable` handling in `home.tsx`.

### `areas.enabled` transitional mirror

- **Added:** 2026-05-16
- **Reason:** `areas` moved from a 2-state `enabled boolean` to a 3-state `mode` (`active`/`scheduled`/`disabled`) as the source of truth. To avoid a broken window on the auto-deployed web admin (the previously-deployed build selects `areas_list.enabled` and writes the `enabled` column), the column is kept and mirrored.
- **Old shape (kept alive):** `areas.enabled` column + `areas_list.enabled` (= `mode <> 'disabled'`). The web Server Actions write both `mode` and `enabled` on every insert/update/mode-switch. `area_state`/`area_available` read `mode` only.
- **New shape (preferred):** `areas.mode` exclusively; `areas_list.mode`.
- **Safe to remove after:** the mode-aware web build (this change: AreaForm mode radio, AreaRow status badge, `setAreaMode`) is the only deployed web build — i.e. immediately after this deploy goes live and is confirmed (web is not version-pinned like mobile; one deploy replaces all).
- **How to remove:**
  - `supabase` migration: `alter table public.areas drop column enabled;` then `create or replace view public.areas_list` without the `enabled` column.
  - `web/src/app/[lang]/admin/areas/actions.ts` — drop the `enabled: p.mode !== "disabled"` writes.
  - Drop this entry.
- **Verify before removing:** confirm the live web deploy is the mode-aware build (the `/admin/areas` rows show הפעלה/תזמון/מושבת buttons and the מופעל/בהמתנה/מושבת badge); grep that nothing else selects `areas.enabled`.

### Notification-presence gate — old clients never report `notif_perm` (informational)

- **Added:** 2026-05-18
- **Reason:** The notification-presence gate (`push_blocked()` folded into `user_availability`/`others()`) is **purely additive** server-side: `push_blocked()` reads only the new `relations.push` key, which is absent on every row written by a pre-gate mobile build, so it returns false and nothing is gated. The `others()`/`user_availability` changes are CREATE OR REPLACE with unchanged signatures (no dependent-RPC breakage). Not a breaking change → no Expand→Contract shim. This entry records the **cross-version behaviour window** only, per the discipline that every cross-version behaviour change is logged here.
- **Old shape (kept alive):** Nothing. Pre-gate mobile builds never send `notif_perm` in `/app/start` or `/app/focus`, so `relations.push.perm` is never written and those users are **never push-gated** (only `DeviceNotRegistered` from the push pipeline can gate an old-build user, which is correct in any version — their token really is dead). They keep working exactly as before; the gate simply has less signal for them.
- **New shape (preferred):** Gate-aware mobile build sends `notif_perm` on start/focus so a user who denies / later revokes OS notifications is recorded (`relations.push.perm`) and gated unavailable until they re-enable.
- **Safe to remove after:** N/A for code (no shim). The phase-3 *tightening* (e.g. also gating on a positively-absent token, or requiring an explicit `granted`) must NOT be shipped until real-device `notif_perm` adoption is confirmed high — gating on missing-token today bricks ~90% of the base (see the `push_presence_gate` migration header / CLAUDE.md "Notification-presence gate"). Until then the conservative positive-evidence gate stays.
- **How to remove:** Nothing to delete (no shim). Delete this note once the perm-reporting build is the live floor AND any phase-3 tightening decision has been made and recorded.
- **Verify before removing:** check the live mobile version distribution; confirm the floor build sends `notif_perm` (grep `log` bodies for `notif_perm` on `key='start'`/`'focus'`), and query the share of located+active users with `relations.push.perm` set before considering any stricter rule.

### Invite costs 1 heart (held); cancel forfeits, every other exit refunds (informational)

- **Added:** 2026-05-31 (migration `restore_invite_credit_hold`)
- **Reason:** Reverted to the hold/refund/forfeit invite credit model. `app_invite` now charges 1 heart held server-side until the invite ends; every non-cancel exit (decline / expire / approve / mutual match / `_kick_page1_at` of a waiting inviter / logout / admin release) refunds the heart to balance, while `app_cancel` forfeits it (held -= 1, balance unchanged). `_credits_cost('invite')` flipped 0 → 1 and `_credits_cost('cancel')` flipped 1 → 0. This TIGHTENS a precondition the deployed mobile build can currently call successfully (a 0-heart invite went through, charged 0); breaking by CLAUDE.md's definition, but can't be staged Expand→Contract (you can't add a precondition "alongside" the old one) and the degraded behavior on old builds IS the intended new behavior.
- **Old shape (kept alive):** Nothing on the wire. A deployed mobile build with `CREDIT_COST.invite = 0` shows a "0" badge on the send-invite CTA, doesn't gate affordability, and a 0-heart user can still tap → `app/invite` → the new server precondition returns `400 'no_credits'`. The optimistic UI clears momentarily and Realtime restores the watching card. Old builds also display "1" on the waiting-card cancel button (cosmetic) and may disable it when `starsBalance < 1`, even though cancel is now free server-side — so users with 0 hearts see a wrongly-disabled cancel until they update. The held credit field is server-side accounting and isn't read by either build.
- **New shape (preferred):** Gate-aware mobile build sets `CREDIT_COST = { invite: 1, cancel: 0, approve: 1, broadcast: 1 }` and passes `affordable={starsBalance >= CREDIT_COST.invite}` to the page1 invite CTA so a 0-heart user sees a disabled button; the waiting-card cancel button no longer carries a cost badge and is never disabled-on-balance.
- **Safe to remove after:** the mobile build that ships the new `CREDIT_COST` constants and the invite affordability gate is the live floor.
- **How to remove:** Nothing to delete in code (no shim). Delete this note once the new build is the live floor.
- **Verify before removing:** check the live mobile version distribution; confirm the floor build shows the heart badge on the invite CTA (not the cancel CTA) and disables the invite button on insufficient balance.

### Credits rework 2026-07-22 — old builds show a stale cap and a dead "out of hearts" path (informational)

- **Added:** 2026-07-22 (migration `20260722120000_credits_one_per_day_open_purchase`)
- **Reason:** Daily cap 3 → 1, both `app_buy_extra` gates removed, the dispatcher's zero-credit auto-hide deleted, and a new `credits.unpaid_at` mark drives candidacy in `others()`. None of it changes a response shape, a field name, or an endpoint, so there is no shim to stage — but the deployed mobile build renders three things differently and that window is recorded here.
- **Old shape (kept alive):** Nothing on the wire. The deployed build:
  - hardcodes `CREDIT_CAP = 3`, so the settings row reads "1/3" and the popup says "refills to 3 hearts" while the server grants 1. Cosmetic, self-corrects on update.
  - mirrors the removed buy gates client-side (`buyExtraBlock`: wallet must be empty AND not bought this grant day) and hides the buy button otherwise. Strictly narrower than the server, so it never offers a tap the server rejects — old users simply see fewer chances to pay than the new build gives them.
  - routes "go visible" to the buy popup when the wallet is empty (`outOfHearts`) and shows the `settings.visibilityHiddenNoHearts` subtitle. With the auto-hide gone a zero-credit user is no longer hidden, so that branch is simply unreachable rather than wrong.
  - `credits.unpaid_at` is a new key inside the wallet; old clients ignore unknown keys.
- **New shape (preferred):** `CREDIT_CAP = 1`; no client-side buy gate; visibility never credit-gated; `credits.*` i18n keys and a `CoinIcon` instead of the heart.
- **Safe to remove after:** the build shipping `CREDIT_CAP = 1` is the live floor.
- **How to remove:** Nothing to delete in code (no shim). Delete this note once that build is the floor.
- **Verify before removing:** check the live mobile version distribution; confirm the floor build shows a coin (not a heart) on the invite cost badge.

### `app_buy_extra` count set stays {3,10,50}

- **Added:** 2026-07-22
- **Reason:** The 2026-07-22 rework made the daily grant 1, which invites shrinking the smallest pack to 1 credit. It was deliberately NOT done: the deployed mobile build posts `{ count: 3 }` from its buy sheet, and narrowing the accepted set would 400 every one of those taps. The pack is 3 = three days of allowance.
- **Old shape (kept alive):** `app_buy_extra` and the edge dispatcher both validate `count ∈ {3,10,50}`.
- **New shape (preferred):** unchanged for now. If a 1-credit pack is ever wanted, it must be staged: accept `{1,3,10,50}` server-side first, ship the client that offers 1, and only drop 3 once that build is the live floor.
- **Safe to remove after:** N/A — this is a constraint note, not a shim. Delete it if the pack set is ever intentionally changed under the staging rule above.
- **How to remove:** delete this entry.
- **Verify before removing:** `SELECT count(*) FROM log WHERE key = 'buy_extra' AND created_at > now() - interval '14 days'` and check which counts appear in the bodies.

## Removed (changelog)

- **`app_cancel` credit precondition (cancel costs 1 heart)** — added 2026-05-22, **reverted 2026-05-31** (migration `restore_invite_credit_hold`). The "cancelling costs 1 heart, inviting is free" model was reverted to the hold/refund/forfeit invite model (cost on send, cancel forfeits). The 2026-05-22 informational entry pointed at a missing client-side affordability gate on the cancel button; both sides of that gate are now obsolete (the precondition is gone, and the new client gates the invite button instead). Old mobile builds that pre-date the disabled-cancel-button shim see the same cosmetic "1" badge they always did — harmless, self-corrects on update.

- **`page1.profile` mirror of `page1.profiles[0]` (page1 candidate stack)** — added 2026-05-19, **reverted 2026-05-22** (migration `20260522000000_revert_page1_stack`) before the stack-aware mobile build ever reached the live floor. The candidate-stack experiment produced a stuck-card bug and the user chose to return to the single-profile model, so the Expand shim never needed a Contract. `page1.profiles[]` / `app_skip` / `_page1_pick` are gone; page1 is back to the single `page1.profile`.
