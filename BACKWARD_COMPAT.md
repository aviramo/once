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

## Removed (changelog)

_(none yet)_
