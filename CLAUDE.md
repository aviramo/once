# Project Instructions

This file is the **operational contract** for the project: how to act, publish, and structure the mobile UI. It deliberately does **not** re-document the data model, DB schema, or game logic in full — those live in the code and migrations and are the source of truth there. Introspect the live DB (RPC bodies via `pg_get_functiondef`) and read `supabase/functions/` + `mobile/src/` when you need the exact shape.

## Operational autonomy

Claude has blanket upfront permission for every action it can perform locally or via available tooling. **Anything Claude can do alone, Claude does alone** — edit any file (incl. `app.json`/`eas.json`/`package.json`/`CLAUDE.md`), run `npm`/`eas`/git, apply Supabase migrations, deploy edge functions, hit any API with credentials it already has. Don't narrate intent or ask "should I run X?" — run it and report. Long-running commands (EAS builds, deploys) → run in background and keep working.

**Ask only when the action is impossible without the user:** browser-only portals (Apple Developer, App Store Connect, Google Play Console, Firebase/GCP consoles), 2FA codes, physical-device interaction, or destructive actions on shared/production data (truncating live tables, force-pushing main, dropping columns with user data). Hand the user the exact link/step and continue with anything parallelizable.

## Publish / release

On "פרסם" / "תפרסם" / "release" / "publish" / "upload" / "ship it" (with or without a platform), run the release yourself — do not hand back instructions.

- **Currently Android-only** (user directive 2026-07-05). A release with no platform named → `cd mobile; npm run release:android`. Do **not** build/submit iOS unless the user explicitly asks for iOS this time.
- `npm run release` (both platforms) and `npm run release:ios` still exist and are correct — just not the default. Revert the Android-only default only on explicit instruction.
- Submit targets: TestFlight (iOS), Play **`production`** track (Android, public).
- After kicking off, report the build + submission URLs and stop — do not poll or wait.

**EAS env vars** are read from the EAS `production`/`preview`/`development` environments, not `mobile/.env` (local-only). Push local → EAS: `cd mobile && cp .env .env.local && eas env:push production && rm .env.local`. Missing `EXPO_PUBLIC_SUPABASE_URL`/`EXPO_PUBLIC_SUPABASE_ANON_KEY` crashes the production build on launch (`supabaseUrl is required`).

## Trello — DISABLED

Do not create cards, comment, sweep, or otherwise touch Trello (disabled 2026-06-01). Handle actionable requests directly. There is no task queue for this project.

## Server-side autonomy & backward compatibility

Claude owns the server end-to-end: edge functions, RPCs, migrations, schema. Apply migrations and deploy functions without confirmation; report what was done. Do not ship destructive operations on production **data** (truncating live tables, dropping columns with user data) without first surfacing what will be lost.

**The app is in production; mobile updates roll out over days-to-weeks, the server deploys instantly to 100%.** Every server change must assume the currently-published mobile build is still running on most devices. Adding fields/endpoints/RPCs/columns the client doesn't read is safe. **Breaking** changes (removing/renaming/retyping a field the app reads, changing a response shape, removing an endpoint/RPC/push code the app uses) must be staged **Expand → Migrate → Contract**, and every Expand must add a matching entry to `BACKWARD_COMPAT.md` (the cleanup queue) in the same change. Before shipping, scan `BACKWARD_COMPAT.md` and remove any entry whose mobile-version floor is now below live distribution. When in doubt, treat a change as breaking and stage it.

## UI layout iron rules (`mobile/app/home.tsx`)

Absolute; apply whenever the shell or overlays are touched.

**One screen: page1 (home).** `page1`/`page2` are server data-model terms only — they are **not** separate screens. Everything else rises over home as a full-screen `OverlaySheet`, dismissed by swiping down. There is **no pager, no tab strip, no horizontal navigation.** `TabStrip.tsx`, `HomeCard.tsx`, `WatcherCard.tsx` are deleted — do not resurrect them.

**One swipe-down implementation: `mobile/src/components/PullPane.tsx`** (`PullContext`/`PullScrollView`/`usePullBehavior`/`PullPane`). It is THE "drag a surface with the finger" mechanism — page1's pull-to-skip, the invite's pull-to-decline, and every overlay's swipe-to-close are the same code. **Never hand-roll a second `Gesture.Pan` for a swipe-down.**
- `usePullBehavior` `axis`: `'y'` (default) = off the bottom; `'x'` = off the START edge, used **only** by the menu drawer (enters and leaves by its hamburger's edge). `pullY` is always ≥ 0 magnitude; only `PullPane`'s transform knows physical direction (`AXIS_X_SIGN`, flips under RTL).
- `commit`: `'slideOff'` (default) rides the surface off then fires `onCommit`; `'snapBack'` fires `onCommit` first then springs home (lets the invite open a confirm over a card that stays put).
- `BottomSheet.tsx` keeps its own separate swipe-to-dismiss for small bottom-anchored dialogs — deliberately a different gesture; do not merge them.

**`OverlaySheet.tsx` is the only bottom-up surface** (`PullPane` + `usePullBehavior` + `RisingCard` + `SheetHeader`). **Four** call sites: Menu (`SettingsPage`, axis `x`, the drawer, never gated), Profile preview (`PreviewFieldPage`, stacks on the menu), Chat (`ChatPage`, `dragFrom="header"`, header trailing = "End chat"), and the Invite (single sheet; incoming + dead invite branch on `page2PendingInvite`). Load-bearing details: `pull.reset()` on every open (a slid-off close parks `pullY` off-screen); `dragFrom="header"` for chat (its `FlatList` is inverted so "at top" is meaningless); `isTop` disables a parent sheet's pan so stacked sheets don't arbitrate against each other.

**Overlay state.** Stacked = `useState<('menu'|'chat'|'profile')[]>` (surfaces the user opens/closes). The incoming/dead-invite card is **derived**, not stacked: `inviteOverlayOpen = !overlaysGated && !!(page2PendingInvite || page2DeadInvite)`. Its lifetime belongs to the server — do not move it into the stack. `overlaysRef` is assigned **during render** (the `BackHandler` reads it with `[]` deps).

**Paint order** `home < invite < chat < menu < profile sheet` (`OVERLAY.z` in `tokens.ts`). Menu sits above everything so it stays reachable while gated. **BackHandler priority:** open ConfirmDialog/BottomSheet → topmost stacked overlay pops → invite (pending declines via confirm, dead is swallowed) → leave app.

**Home chrome.**
- **Floating hamburger** top-START (`position:absolute`, `start:MD`, `top:topInset+OVERLAY.chromeGap`), rendered after the card layers so it doesn't translate when a card is pulled off.
- **Drag anywhere on the shell to open the menu** (`menuDragGesture`) — an ancestor pan on the page1 subtree (NOT an edge band: Android gesture-nav owns the screen edges), arbitrated by `manualActivation` + a sideways-dominance ratio. The drawer **tracks the finger** while opening exactly as while closing (one continuous `pullY`), is **never mounted/unmounted** (`keepMounted`, parked at `pullY=screenSpan`), and its drag is gated by a shared value, not `.enabled()`. `menuPull` is created in `home.tsx` and passed to the sheet via OverlaySheet's `pull` prop.
- **Report lives at top-END** (`topEndOverlay` in `MatchCard.tsx`): the report flag at the screen edge (a `RoundButton` with filled `ShieldIcon` → shared report `ConfirmDialog`). Report is a card-level affordance on **every** match card. Top-START on a card belongs to the shell — nothing else may claim it. The **shared-group chip is NOT here** (moved 2026-07-21): a group in common is something you *read* about the person, so it sits with the bio (`aboutGroups`, under the bio text on the same surface), not in the chrome.
- **In chat state the card's action button opens the chat**; ending is the explicit "End chat" text button in the chat sheet header → leave/block `BottomSheet` (stays in `home.tsx` with `runAction`).
- **Nothing else on home**: no credits count, no viewer count/list, no visibility control, no broadcast (all settings-only).

**Invitation countdowns** render **inside the status card** that announces the invitation (`StatusTimer` in `home.tsx`): outgoing → `InviteTimerCard`, incoming → `ReplyingInviteCard`, expired → frozen `EventMessageCard`. Never put a countdown back into shell chrome. The tick lives in `StatusTimer` so a second re-renders one card, not all of home.

**Gate.** While `overlaysGated` (`geoGated || isPermMode`) the chat and invite overlays are unreachable and an open chat is force-closed. **The menu is never gated** — the user must still reach settings to change location while waiting.

> **Open launch crash (Android New Arch, 2026-07-20):** `addViewAt: failed to insert view … child already has a parent` — a Fabric mount race, reproducible on clean `HEAD`, **not** caused by the drawer work. Debug one action at a time on a cleared logcat; `runOnJS(console.log)` no-ops inside a worklet (use a named `useCallback`).

## Mobile native UI — use the `building-native-ui` skill

Any mobile/Expo/React-Native UI work (screen, component, navigation, animation, sheet, icon, native control): read `.claude/skills/building-native-ui/SKILL.md` + the relevant `references/` file **before** writing the UI. **This CLAUDE.md overrides the skill on every conflict** — DRY/central tokens win over its "inline styles" advice; the single-screen + OverlaySheet contract is never restructured to match its route/tabs/form-sheet suggestions; the i18n em-dash rule and file naming stand. Take native API *techniques* from it, not its architecture/styling opinions. Server/DB/edge-function/config work does not invoke it.

## Keyboard avoidance in popups/sheets

Single source of keyboard height: the **`useKeyboardHeight()`** hook (`mobile/src/hooks/useKeyboardHeight.ts`, 0 when hidden). A RN `Modal` doesn't resize on either platform, so a bottom sheet must be nudged per-screen.
- **Do NOT** reintroduce a `BottomSheet`-wide keyboard lift (no `keyboardAvoiding` prop, no global `Keyboard` listener, no `KeyboardAvoidingView`) — it double-applies with the per-screen nudge and overshoots. (`BottomSheet` still calls `Keyboard.dismiss()` on close — the only `Keyboard` use left there, and fine.)
- Never hand-roll a popup from a raw `Modal` + `KeyboardAvoidingView`. Compose `BottomSheet` (or `ConfirmDialog`). Add a text field via `ConfirmDialog`'s `noteInput` prop (auto-nudges via the hook), not a bare `TextInput`.
- A brand-new sheet composer with its own focusable input: `const kb = useKeyboardHeight()` then `cardWrapStyle={kb > 0 ? { marginBottom: kb } : undefined}`. The fix for a covered field is always this per-screen nudge, never a reinstated global lift.

## i18n text style

Do **not** use em dashes (—) in any i18n string (`mobile/src/i18n/he.ts`, `en.ts`). Use a period, comma, or colon.

## DRY (single source of truth)

Every value and every UI element is defined **exactly once** and imported everywhere else.
- **Values:** any meaningful literal — sizes, colors, spacing, radii, durations, easings, z-indexes, gesture thresholds, velocity cutoffs, storage/query keys, route names, event/push codes, restriction keys, magic strings/numbers — lives in one named constant (design + motion tokens in the central theme module / `tokens.ts`; keys in a constants module). No inline literals at call sites. Two things that should "feel the same" reference the same token, not a re-typed `withTiming(..., {duration:350,...})`.
- **Elements:** every UI element exists once as a parameterized component. "Same thing with small differences" = one component with props, not two near-duplicates. Variants (size/tone/state) are props, never a forked component.
- **Behaviors:** animations, gestures, transitions, press feedback, swipe-to-dismiss, mount/unmount choreography are implemented once in a base component/hook and composed. No screen reimplements a behavior that already exists.
- **Timing:** prefer framework defaults (`withTiming(value)` with no config, `scrollTo({animated:true})`) over invented durations. Chain via completion callbacks, not `setTimeout` matched to a duration. Only add a named `MOTION.*` token in `tokens.ts` when a real choreography demands a non-default number, and reference it everywhere.
- Before writing a literal or a JSX block, search for an existing constant/component. Treat duplication you encounter as a bug to fix in the same change.

## Performance principles (server)

User-facing latency is the top priority. **Await only the critical path** (auth, the atomic state transaction, building the response body); everything else — `log`/`restrictions` inserts, push notifications, derived writes — runs via `EdgeRuntime.waitUntil(...)`. Each atomic transition is a **single RPC** (`BEGIN; SELECT … FOR UPDATE ordered by user_id; UPDATE; COMMIT`), not a sequence of `supabase.from(...)` calls; the ordered lock prevents deadlocks and replaces optimistic-retry loops. Push notifications are always fire-and-forget behind `waitUntil` — a failed push must never delay or fail the HTTP response.

## Logging

**Invariant: every HTTP request that reaches the edge function writes exactly one `log` row**, regardless of outcome. Missing rows are bugs. Funnel all DB access through `Tools.invoke(action, task, query)` (never call `Tools.supabase.*` directly from handler code — it bypasses the log). Every rejected precondition must go through `action.error(...)` so it appears as a log entry, not a silent 4xx. Wrap each atomic transaction as a single RPC / single `Tools.invoke` so it's one log entry.

## Data model (pointer)

The two-board game logic lives entirely in `users.relations` (JSONB): `page1` and `page2` state machines plus top-level `last_add_at` / `availability` / `credits` / `push`. `page1`/`page2` are internal state, not UI screens. All actions are `POST /app/<action>` → one `app_*` RPC each, dispatched in `supabase/functions/app/index.ts`. The DB schema, RPC bodies, credits economy, availability gates (geo / notification-presence / test-user partition), and push-notification catalog are the source of truth **in the code/migrations** — introspect the live functions (`pg_get_functiondef`) and read the migrations rather than trusting a prose copy. Local `supabase/migrations/` filenames don't always match live applied history; author new migrations against the **live** function bodies. Reflect any schema/RPC change in the code and `BACKWARD_COMPAT.md`, per the backward-compatibility rules above.
