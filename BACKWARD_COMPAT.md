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

### `page1.profile` mirror of `page1.profiles[0]` (page1 candidate stack)

- **Added:** 2026-05-19
- **Reason:** page1 moved from a single watched candidate (`relations.page1.profile`) to a STACK (`relations.page1.profiles[]`, Tinder/Bumble; up to `STACK_SIZE`=10) so the client can render the next card already in place and skipping is instant. The deployed mobile build reads `page1.profile` (and `relations.match` derived from it). Removing/renaming it would break every published app. Staged Expand → Migrate → Contract.
- **Old shape (kept alive):** while `page1.state='watching'` the server writes BOTH `page1.profiles: Profile[]` AND `page1.profile = profiles[0]` (the visible top, back-compat mirror). Old builds read `page1.profile` and skip via `app/ignore`; `app_ignore` now delegates to `app_skip` (advances the single top) so old builds keep working unchanged — they just don't get the stack. `_kick_page1_at`, `app_refresh_snapshots` keep the `page1.profile` mirror in sync with `profiles[0]`.
- **New shape (preferred):** stack-aware build reads `relations.stack` (= `page1.profiles`), renders `stack[0]` with `stack[1]` statically behind, and skips via `POST /app/skip {skipped_id}` (idempotent; pops the front, 24h-ignores it, moves the viewer registration to the new top, and tops the stack back to 10 in the **same** call — no separate refill request).
- **Safe to remove after:** mobile version that ships the stack UI (`relations.stack` + `app/skip`) is the floor across live users.
- **How to remove:**
  - `app_find` / `app_skip` / `_kick_page1_at` / `app_refresh_snapshots` (live bodies, latest = migration `20260519140000_page1_stack` + `..._skip_topup`) — stop writing/syncing the `page1.profile` mirror while watching; keep `profiles[]` only. Non-watching states keep the single `profile` (unchanged — the stack is watching-only).
  - `mobile/src/stores/userStore.ts` — `deriveCompat` can drop the `page1.profile` fallback for `match`/`stack` (read `profiles[]` only).
  - `supabase/functions/app/index.ts` `chat` case reads `page1.profile.user_id` for the partner — that's `chat` state (single profile, NOT the stack) so it is unaffected; no change needed.
- **Verify before removing:** check the live mobile version distribution; confirm the floor build reads `relations.stack` and calls `app/skip` (grep the `log` table for `key='skip'` vs `key='ignore'` — once `ignore` hits ≈0 the old single-profile readers are gone).

## Removed (changelog)

_(none yet)_
