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

### `review-login` falls back to the old literal code when `REVIEW_CODE` is unset

- **Added:** 2026-08-03
- **Reason:** Security fix. The store-review code was the literal `once-review-7Fq2` in `supabase/functions/review-login/index.ts`, i.e. a live pre-auth credential readable by anyone with the repo. It is an env var now and has been rotated. This is NOT a mobile-build shim: the code is typed into a field by the reviewer (`mobile/app/login.tsx` takes it as an argument and holds no copy of it), so no app version depends on any particular value. The fallback exists only so that the deploy and the setting of the secret are safe in either order.
- **Old shape (kept alive):** `Deno.env.get("REVIEW_CODE") ?? "once-review-7Fq2"` — with the secret unset, the old published code would work again.
- **New shape (preferred):** `REVIEW_CODE` (and `REVIEW_EMAIL`) set as function secrets. Set and verified 2026-08-03: the old literal is refused, the new code returns an OTP.
- **Safe to remove after:** immediately. There is no mobile floor to wait for.
- **How to remove:** in `review-login/index.ts`, drop both `??` fallbacks and refuse outright when the env is unset.
- **Verify before removing:** `curl` the endpoint with the old literal — must be 401 (it is).

### `/ext` still accepts the bare anon key when `EXT_SECRET` is unset

- **Added:** 2026-08-03
- **Reason:** Security fix. The `/ext` sweeps (`cron`, `resync`, `watch`, `purge`, `archive`) authorized on `SUPABASE_ANON_KEY`, which is not a secret — it ships in the mobile bundle and was in plain text in the cron migrations. They now authorize on an `x-ext-secret` header matched against `EXT_SECRET`. This is the one entry here that is NOT about an old mobile build: the callers are the four pg_cron jobs, and they are updated by a migration that is applied separately from the function deploy, so the fallback is what makes the two orderings safe.
- **Old shape (kept alive):** in `supabase/functions/ext/index.ts`, when `EXT_SECRET` is unset the gate falls back to `Authorization: Bearer <SUPABASE_ANON_KEY>` — i.e. exactly the old, public-credential behaviour.
- **New shape (preferred):** `x-ext-secret: <EXT_SECRET>`, with `Authorization` carrying the anon key only to satisfy the platform's JWT gateway (a random string there is refused upstream, before the function runs). Both values are read out of the Vault at fire time (`ext_secret`, `ext_anon_key`), so neither is in git or in `cron.job`.
- **Safe to remove after:** immediately — the four jobs were migrated on 2026-08-03 and verified returning 200. There is no mobile floor to wait for.
- **How to remove:**
  - `supabase/functions/ext/index.ts` — delete the `legacy` const and collapse the gate to `req.headers.get("x-ext-secret") === secret`, plus a hard refusal when `EXT_SECRET` is unset.
  - No migration and no backfill.
- **Verify before removing:** `select status_code, count(*) from net._http_response where created > now() - interval '1 day' group by 1` — all 200. Any 401 means a job is still on the old shape.

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

### `app/buy_extra` endpoint kept alive after purchasing was switched off

- **Added:** 2026-07-22 (referral program — migration `20260722160000_referral_program`)
- **Reason:** Every `BUY_EXTRA_OPTIONS` entry flipped to `enabled: false`, so the new mobile build never posts `/app/buy_extra` — inviting a friend is now the only way to earn beyond the daily pool. The endpoint and RPC are deliberately left untouched: the deployed build (≤ 1.0.3) still renders the 3-credit row as tappable and calls it, and removing it would 400 those taps. Purely a *client-side* narrowing, so nothing needed staging — this entry is the cleanup reminder.
- **Old shape (kept alive):** `public.app_buy_extra(me_id, p_count)` + the `case "buy_extra":` dispatcher branch, both validating `count ∈ {3,10,50}`. Old builds keep granting themselves 3 free credits per tap until they update.
- **New shape (preferred):** no purchase path at all. Credits come from the 20:00 grant (`_credits_cap()` = 1) and from referrals (`_referral_reward()` = 1 per friend who installs AND completes a profile, capped at `_referral_daily_cap()` = 10 per grant day).
- **Safe to remove after:** the build shipping the referral row (all buy options "coming soon") is the live floor. Note this supersedes the `app_buy_extra count set stays {3,10,50}` entry above — resolve both together.
- **How to remove:**
  - Remove the `case "buy_extra":` block from `supabase/functions/app/index.ts`.
  - `DROP FUNCTION public.app_buy_extra(uuid, integer);` in a follow-up migration.
  - Delete `BUY_EXTRA_OPTIONS` / `BuyExtraCount` / `onPick` from `mobile/src/lib/credits.ts` + `mobile/src/components/BuyExtraPopup.tsx`, leaving the referral row as the sheet's only content (and rename the component).
  - **Only if real payments are never wired up.** If they are, flip `enabled` back on instead of deleting.
- **Verify before removing:** `SELECT count(*) FROM log WHERE key = 'buy_extra' AND created_at > now() - interval '14 days'`. Zero hits = safe.

### Referral program — old builds never claim an install referrer (informational)

- **Added:** 2026-07-22
- **Reason:** The referral program is entirely additive server-side (new `users.referral_code` column, new `referrals` table, new `relations.referral` key, new `/app/referral` endpoint, new `referral` push code). No response shape, field, or endpoint changed, so there is no shim. This records the cross-version window only.
- **Old shape (kept alive):** Nothing. Builds that predate the referral row never call `/app/referral`, so **an install attributable to a referral is simply never claimed if the invitee is on an old build** — but that cannot happen in practice, since a new install always gets the current store build. The real window is the *inviter* side: an old build has no invite row in its credits sheet, so those users cannot earn until they update. They ignore the unknown `referral_code` / `relations.referral` keys.
- **New shape (preferred):** the credits sheet's top row shares `https://once-lake.vercel.app/i/<CODE>`; the invitee's first launch reads the Play install referrer and posts `/app/referral`.
- **Safe to remove after:** the referral-row build is the live floor.
- **How to remove:** nothing to delete (no shim). Delete this note.
- **Verify before removing:** check the live mobile version distribution, and `SELECT source, count(*) FROM referrals GROUP BY 1` to confirm claims are arriving.

### A built profile is TWO PHOTOS, not a bio (informational)

- **Added:** 2026-07-31 (migration `20260731150000_profile_built_is_two_photos`)
- **Reason:** The bio stopped being required (user directive 2026-07-31): onboarding's last step finishes with the field empty, the profile preview's inline editor commits a cleared bio as null, and what makes a profile complete is `images.length >= 2` and nothing else. The number is stated in three places that must agree — `selectProfileBuilt` (mobile), `profileComplete` (`supabase/functions/app/index.ts`) and the `only_available` image filter inside `others()` — and both server ones moved in this change (`profileComplete` dropped the bio clause and went 1 → 2; `others()` went 1 → 2). The photo floor is a *tightening*, which cannot be staged Expand → Migrate → Contract, so this entry records the cross-version window; the bio half is a *loosening* and can break no client.
- **Old shape (kept alive):** Nothing removed from the response shapes; `data.bio` still exists, is still read by every card, and is still saved through `/app/profile`. Two windows, both benign:
  - **Photos-but-no-bio users become visible.** A deployed build (≤ current) computes `selectProfileBuilt` from the bio, so a user who abandoned onboarding between the photo flush and the bio save now counts as built server-side — seeded a viewer, offered in pools, allowed to invite — while his own old client still shows him the build-profile CTA and the "hidden" visibility row, and blocks his invite button client-side. He is discoverable and can be invited; he simply cannot invite until he updates or finishes. That is the intended new semantics, not a shim.
  - **The 1 → 2 photo floor.** A row with exactly one photo stops being built. At the time of the change there was **one** such live user (`is_test=false`), last seen 2026-07-05 — already past `_presence_ttl()`, so already out of every pool. The app tells him: the dock's profile key wears its dot and routes to onboarding's photo step, which is the exact fix.
- **New shape (preferred):** `MIN_PHOTOS` (`mobile/src/lib/photos.ts`) / `MIN_PROFILE_IMAGES` (edge) / the literal `2` in `others()`. The `bio.min` i18n string and `BIO_MIN` are deleted; `EditableText` runs the bio with `min={0} allowEmpty`.
- **Safe to remove after:** N/A — not a shim, a permanent definition. Delete this note once the two-photo build is the live floor (nothing to remove in code).
- **How to remove:** Nothing to delete. Drop this note.
- **Verify before removing:** `SELECT count(*) FROM users WHERE is_test = false AND coalesce(jsonb_array_length(data->'images'), 0) = 1` should stay at zero; `SELECT count(*) FROM log WHERE key IN ('invite','add') AND created_at > now() - interval '14 days'` with `profile_incomplete` in the bodies shows whether any client is still sending while unbuilt.

### Profile-built gate on `invite`/`add` + browse-before-onboarding (informational)

- **Added:** 2026-07-23 (superseded 2026-07-31 by the entry above — the gate is unchanged, only its definition moved)
- **Reason:** New rule: a user browses on /home the moment their **account** exists (name/gender/DOB → `app/account`), and only needs a **built profile** (>= 1 photo AND a non-empty bio, since 2026-07-31 simply >= 2 photos) to be seen or to SEND. Enforced at the edge: `requiresProfile = ["invite","add"]` rejects `profile_incomplete` (403), and the `/app/start` self-seed (`app_seed_viewer`) is gated on the same `profileComplete(user)`. This *tightens* a precondition, which CLAUDE.md calls breaking, but it cannot be staged Expand→Contract and has **zero live-build impact** (see below).
- **Old shape (kept alive):** Nothing on the wire. The deployed mobile build (≤ current) forces onboarding to completion (a non-empty bio) *before* /home, so an old-build user can only reach the invite/add CTAs with a fully built profile — `profileComplete` is always true for them and the new gate never fires. The `others()` image gate already excluded a photo-less user from every pool, so the seed gate only closes the one path (self-seed) an old build never reaches while incomplete anyway.
- **New shape (preferred):** Gate-aware mobile build routes on `selectNeedsAccount` (not `selectProfileBuilt`), lands account-only users on /home, shows the orange `settings.buildProfile` CTA in place of the menu avatar while `!selectProfileBuilt`, and opens the `home.buildProfile*` popup instead of sending an invite. Server `profileComplete` is the authority.
- **Safe to remove after:** N/A — not a shim, a permanent gate. Delete this note once the browse-before-onboarding build is the live floor (nothing to remove in code).
- **How to remove:** Nothing to delete. Drop this note.
- **Verify before removing:** `SELECT count(*) FROM log WHERE key IN ('invite','add') AND value = 'profile_incomplete' AND created_at > now() - interval '14 days'` — hits would mean a real client is sending while unbuilt (expected only from the new build's direct-API edge cases, never the send button).

### Group join-approval + group descriptions (informational)

- **Added:** 2026-07-26 (migration `20260726140000_group_approval_and_description`)
- **Reason:** New per-group `requires_approval` flag + a `group_join_requests` table + a `description` column, with new endpoints (`/app/group_requests`, `/app/respond_join`) and two push codes (`group_join`, `group_approved`). All additive server-side — new columns are defaulted, the summary/owned/search RPCs gain fields, and the new endpoints are unknown to old builds. The one cross-version subtlety is recorded here.
- **Old shape (kept alive):** Nothing removed. `app_redeem_invite` keeps its `{user, notify, groups}` shape and adds `join_status`. The behaviour change: when an owner turns on `requires_approval`, a `/app/redeem_invite` call by a non-member now records a **pending request** (notify → owner/managers) instead of joining. A deployed build (≤ current) that still calls redeem on such a group shows its optimistic "Joined" pill while the server actually queued a request — the user is not a member until approved. Degraded UX in that one window, no data loss; it self-corrects when the build ships the "Pending"/"Request to join" states. Old builds ignore the unknown `requires_approval`/`description`/`join_status`/`pending`/`requested` fields and the new push codes render with the actor's name as title + the interpolated body (they just won't deep-link on tap).
- **New shape (preferred):** The approval-aware build shows "Request to join"/"Pending" in search, a description editor (shared with the bio via `EditableText`), an approval toggle + a join-requests section on the manage page, a pending badge on managed hub rows, and deep-links a `group_join` tap to the group's manage page.
- **Safe to remove after:** N/A — not a shim, additive features. Delete this note once the approval-aware build is the live floor.
- **How to remove:** Nothing to delete in code. Drop this note.
- **Verify before removing:** check the live mobile version distribution; confirm the floor build renders the "Request to join" state. `SELECT count(*) FROM log WHERE key='redeem_invite' AND created_at > now() - interval '14 days'` shows redeem is still in use, but the pending path only triggers for groups an owner explicitly gated.

### `app/bug_report` endpoint kept alive after the in-app report sheet was deleted

- **Added:** 2026-07-27
- **Reason:** "Report a bug" became "Support" (user directive 2026-07-27) and the in-app composer was deleted: the settings row now opens the device mail composer at `once.app.support@gmail.com` (`supportMailUrl` in `mobile/src/lib/links.ts`). The new build never posts `/app/bug_report` and never uploads to the `bug-attachments` bucket. The endpoint, the `app_bug_report` RPC, the `bug_reports` table and the web admin page at `/bugs` are deliberately untouched — the deployed build still carries the sheet, and removing them would break those users' sends and hide the reports already filed.
- **Old shape (kept alive):** `case "bug_report":` in `supabase/functions/app/index.ts` → `app_bug_report(me_id, text, attachment_key)`, the private `bug-attachments` storage bucket, the `bug_reports` table, and the web admin `/bugs` page that reads them.
- **New shape (preferred):** a `mailto:` to the support inbox. Support threads live in the mailbox, not in the DB.
- **Safe to remove after:** the support-row build is the live floor **and** the existing `bug_reports` rows have been triaged (they are user data — read them before dropping anything).
- **How to remove:**
  - Remove the `case "bug_report":` block from `supabase/functions/app/index.ts`.
  - `DROP FUNCTION public.app_bug_report(...)` in a follow-up migration; drop the `bug_reports` table and the `bug-attachments` bucket **only** after the rows are triaged.
  - Delete `web/src/app/[lang]/bugs/` and its entry points in `web/src/app/[lang]/_components/AdminShell.tsx`.
- **Verify before removing:** `SELECT count(*) FROM log WHERE key = 'bug_report' AND created_at > now() - interval '14 days'`. Zero hits = no live sender left.

### Managers lost the group-config rights (informational)

- **Added:** 2026-07-28
- **Reason:** The owner/manager line was redrawn (user directive 2026-07-28): a manager answers join requests and removes plain members, and the only thing of his in the group's settings is "hide me from the members here". `app_update_group` went **owner-only** in migration `20260728190000_owner_only_admin_and_transfer.sql`. (`app_remove_member` went owner-only in that same migration and was put back to owner-or-manager the same day by `20260728200000_manager_removes_plain_members.sql`, so it never changed for a live client.) A permission tightening has to take effect the moment it deploys, so this is deliberately NOT staged Expand→Migrate→Contract; the entry records the cross-version window.
- **Old shape (kept alive):** Nothing removed from the response shapes. The deployed mobile build still RENDERS the full settings page (name / description / link / kind editors) to a **manager**, and still offers the promote/demote button under the old `iAmOwner || !m.manager` rule. Those controls now come back `not_owner` (HTTP 400) instead of applying. Degraded UX for managers of someone else's group, in that one window; owners are unaffected, and nothing an old client can do corrupts state.
- **New shape (preferred):** the new build gives a manager a settings page holding only the hide-me switch and a member page whose only action is "Remove from group" (plain members only), and gives the owner a third action, "Transfer ownership" (`/app/transfer_owner` → `app_transfer_owner`).
- **Safe to remove after:** the build with the manager-restricted settings page is the live floor. Nothing to delete either way, this is a note.
- **How to remove:** drop this entry.
- **Verify before removing:** check the live mobile version distribution; `SELECT count(*) FROM log WHERE key = 'update_group' AND body->>'error' = 'not_owner' AND created_at > now() - interval '14 days'` should be zero once no old client is left driving those controls as a manager.

### Ownership is handed only to a manager (informational)

- **Added:** 2026-07-30 (migration `20260730120000_transfer_owner_managers_only`)
- **Reason:** Ownership passes through management (user directive 2026-07-30): the owner promotes someone first and hands the group over second, so `app_transfer_owner` now returns `not_manager` when the target is a plain member. A permission tightening has to take effect the moment it deploys and cannot be staged Expand→Migrate→Contract (a precondition cannot be added "alongside" its absence), so this entry records the cross-version window instead.
- **Old shape (kept alive):** Nothing removed from the response shapes. The deployed build (the transfer button shipped 2026-07-28 and is not yet at the live floor) offers "Transfer ownership" on **every** member's page. Picking a plain member there now comes back `not_manager` (HTTP 400) instead of applying; the roster and the caller's standing are untouched, so nothing an old client can do corrupts state. Owners handing the group to a manager — the normal path — are unaffected.
- **New shape (preferred):** the new build shows the key only on a manager's page (`canTransfer = iAmOwner && !m.owner && !!m.manager` in `mobile/src/components/CommunitiesPage.tsx`); a plain member's page offers "Make approver" and "Remove from group". **Amended 2026-07-30** (migration `20260730140000_open_group_has_no_approvers`): an OPEN group has no approvers, so there the key goes straight to any member and the rule reads `canTransfer = iAmOwner && !m.owner && (openGroup || !!m.manager)`. That half is a *loosening* — no client can be broken by it.
- **Safe to remove after:** the manager-only-transfer build is the live floor. Nothing to delete either way, this is a note.
- **How to remove:** drop this entry.
- **Verify before removing:** `SELECT count(*) FROM log WHERE key = 'transfer_owner' AND created_at > now() - interval '14 days' AND EXISTS (SELECT 1 FROM jsonb_array_elements(log) e WHERE e->>'error' = 'not_manager')` — zero means no old client is still offering the key on a plain member's page.

### An open group has no approvers — old builds still offer "Make manager" there (informational)

- **Added:** 2026-07-30 (migration `20260730140000_open_group_has_no_approvers`)
- **Reason:** The role formerly shown as "manager" is now shown as **approver** (user directive 2026-07-30) and is defined by its one job, answering join requests. An OPEN group (in search, joins instantly) has no requests, so the role does not exist there: `app_set_manager` refuses to appoint one (`open_group`), `app_update_group` deletes every appointment the moment a group's policy becomes open, and `app_transfer_owner` hands an open group straight to any member (and leaves the outgoing owner nothing). Adding a precondition cannot be staged Expand→Migrate→Contract and has to bite the moment it deploys, so this entry records the cross-version window instead. Renaming the role is client-side copy only — the wire and the DB keep `manager` / `group_managers` / `/app/set_manager`, so nothing on the wire moved.
- **Old shape (kept alive):** Nothing removed from the response shapes. The deployed build offers "Make manager" on every member's page of a group it runs, including an open one; that tap now comes back `open_group` (HTTP 400) instead of applying, and the roster and the caller's standing are untouched. It also still labels the role "manager"/"מנהל" until it updates. The one-off cleanup that ran with the migration stripped the appointments already standing on open groups (one row, on a test group — real groups had none), so an old build may show a manager tag on an open group's roster until its next roster read.
- **New shape (preferred):** the appointment button is not rendered on an open group (`canPromote = canOwnerAct && !openGroup`), and "Transfer ownership" is offered to any member there (`canTransfer = canOwnerAct && (openGroup || !!m.manager)`), with its own confirm copy (`communities.transferOwnerDescOpen`) saying the outgoing owner keeps nothing.
- **Safe to remove after:** the approver-aware build is the live floor. Nothing to delete either way, this is a note.
- **How to remove:** drop this entry.
- **Verify before removing:** `SELECT count(*) FROM log WHERE key = 'set_manager' AND created_at > now() - interval '14 days'` and check for `open_group` in the bodies — zero means no old client is still offering the appointment on an open group.

### An approver is unappointed before he is removed — old builds still offer "Remove" on his page (informational)

- **Added:** 2026-07-31 (migration `20260731130000_approver_is_unappointed_before_removal`)
- **Reason:** Removing someone from a group acts on a PLAIN member only, whoever is asking (user directive 2026-07-31). The owner's exemption — `app_remove_member`'s `IF v_target_manager AND NOT v_is_owner` — is gone, so an approver must have his appointment cancelled (`app_set_manager`) before he can be taken out. A permission tightening cannot be staged Expand → Migrate → Contract (a precondition cannot be added "alongside" its absence) and has to bite the moment it deploys, so this entry records the cross-version window instead. Nothing on the wire moved; the RPC gained one error code, `cant_remove_manager`.
- **Old shape (kept alive):** Nothing removed from the response shapes. The deployed build (the member page's action set shipped 2026-07-28 and is not yet at the live floor) renders "Remove from group" to the **owner** on an approver's page under the old `!m.owner && (iAmOwner || !m.manager)` rule. That tap now comes back `cant_remove_manager` (HTTP 400) instead of applying; the roster and the target's membership are untouched, so nothing an old client can do corrupts state, and the owner's two-step route (unappoint, then remove) works on the old build exactly as on the new one. Managers were already refused on another approver (`owner_only`) and are unaffected. Leaving a group yourself is `app_leave_group` and is untouched — an approver can still leave his own group.
- **New shape (preferred):** `canRemove = !m.owner && !m.manager` in `mobile/src/components/CommunitiesPage.tsx` — an approver's page offers "Cancel appointment" and "Transfer ownership" only, which is also what holds that page to at most two actions.
- **Safe to remove after:** the build with `canRemove = !m.owner && !m.manager` is the live floor. Nothing to delete either way, this is a note.
- **How to remove:** drop this entry.
- **Verify before removing:** `SELECT count(*) FROM log WHERE key = 'remove_member' AND created_at > now() - interval '14 days'` and check for `cant_remove_manager` in the bodies — zero means no old client is still offering removal on an approver's page.

### `group_owner` push code on old clients (informational)

- **Added:** 2026-07-28
- **Reason:** New push code, sent when a group changes hands: succession on account deletion (`app_delete_cleanup`) and an explicit `app_transfer_owner`. Purely additive.
- **Old shape (kept alive):** Nothing. The title and body are rendered server-side (`PUSH_TITLE` in `supabase/functions/global.ts`), so an old build shows the notification correctly; it just does not deep-link on tap, because `group_owner` is not in its `GROUP_CODES` set, and the tap lands on home.
- **New shape (preferred):** `GROUP_CODES` in `mobile/app/home.tsx` includes `group_owner`, so the tap opens that group.
- **Safe to remove after:** the build whose `GROUP_CODES` carries `group_owner` is the live floor.
- **How to remove:** drop this entry.
- **Verify before removing:** check the live mobile version distribution.

### `relations.page1` / `relations.page2` — being replaced by the `watch` table

- **Added:** 2026-08-02 (migrations `watch_table`, `watch_model`, `watch_sync_function`, `the_viewer_list_is_derived`)
- **Reason:** page1 and page2 are not two views of one relation, they are two independent single-slot mailboxes with nothing making them agree, and they did not: live on the day this landed, all NINE page2 "it ended" messages had no page1 counterpart (one inviter sat in four different people's page2 with his own board empty, one of them naming an account that no longer exists), and a real user's whole profile was filed as a viewer of another real user three weeks after she stopped watching him. `public.watch` is one row per "A is looking at B", with the game's own rule ("you are looking at one person") as a unique index instead of as discipline spread across 34 functions.
- **Old shape (kept alive):** `users.relations.page1` and `users.relations.page2`, byte-identical to what they have always been. The published app reads them over Realtime and from the RPC response body and is completely unaffected. `page2.profiles[]` is now DERIVED (recomputed from the watchers' own page1 by the `users_watch_sync` trigger) but its shape is unchanged.
- **New shape (preferred):** `public.watch` (`watcher_id`, `target_id`, `state` ∈ watching/invited/chat/ended, the clocks, per-side slot and clear stamps, last-known profile for a deleted counterpart), plus `users.seeking` and `users.discoverable` — the two ACCOUNT-level facts the boards were smuggling ("may the server seed me somebody", "am I shown to anyone"). `public._watch_pages(user_id)` projects a user's boards from them, proven against every live board: page1 84/84 identical, page2 83/84 with the single difference being the stale viewer it deliberately drops.
- **Safe to remove after:** the mobile build that reads the watch-shaped relations is the live floor. **This is the user's stated end state: page1/page2 must disappear from the app entirely, including the vocabulary in `CLAUDE.md`.**
- **How to remove:**
  - convert the remaining `app_*` writers to write `watch` (staged, one at a time; the sync trigger keeps both coherent meanwhile)
  - install the projection trigger so `relations.page1/page2` are written only by `_watch_pages`
  - then: drop both keys from `relations`, drop `users_watch_sync`, `_watch_sync`, `_watch_sync_tg` and `app_refresh_snapshots` (projecting IS refreshing), and delete the ~40 `page1*`/`page2*` derived consts in `mobile/app/home.tsx`, `deriveCompat` + the legacy shapes in `mobile/src/stores/userStore.ts`, and the page1/page2 paragraphs in `CLAUDE.md`
  - the replacement vocabulary is the one the client already invented: `match` (who is in front of me) and `watchers` (who is looking at me)
- **Verify before removing:** check the live mobile version distribution in the Play Console.

## Removed (changelog)

- **`app_cancel` credit precondition (cancel costs 1 heart)** — added 2026-05-22, **reverted 2026-05-31** (migration `restore_invite_credit_hold`). The "cancelling costs 1 heart, inviting is free" model was reverted to the hold/refund/forfeit invite model (cost on send, cancel forfeits). The 2026-05-22 informational entry pointed at a missing client-side affordability gate on the cancel button; both sides of that gate are now obsolete (the precondition is gone, and the new client gates the invite button instead). Old mobile builds that pre-date the disabled-cancel-button shim see the same cosmetic "1" badge they always did — harmless, self-corrects on update.

- **`page1.profile` mirror of `page1.profiles[0]` (page1 candidate stack)** — added 2026-05-19, **reverted 2026-05-22** (migration `20260522000000_revert_page1_stack`) before the stack-aware mobile build ever reached the live floor. The candidate-stack experiment produced a stuck-card bug and the user chose to return to the single-profile model, so the Expand shim never needed a Contract. `page1.profiles[]` / `app_skip` / `_page1_pick` are gone; page1 is back to the single `page1.profile`.
