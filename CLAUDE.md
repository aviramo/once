# Project Instructions

## Operational autonomy (whole project)

Claude has blanket upfront permission for every action it can perform locally or via available tooling. Don't pause to ask "should I run X?" — run it. Reserve questions for steps that are genuinely impossible without the user.

**Default rule: anything Claude can do alone, Claude does alone.** If the action is technically executable with the tools and credentials Claude already has, execute it. Do not narrate intent, do not request confirmation, do not hand back instructions for the user to run. Asking the user to do something Claude could have done is the failure mode — preferable to act and report than to defer and wait.

**Examples of what to do without asking:**

- Edit/write any file in the repo, including config (`app.json`, `eas.json`, `package.json`, `CLAUDE.md`).
- Run `npm install` / `npm uninstall` / dependency upgrades.
- Run `eas build` / `eas submit` / `eas env:*` / `eas credentials` (interactive prompts, route via terminal as last resort).
- **Publish / release on demand.** If the user says "פרסם" / "תפרסם" / "release" / "publish" / "upload" / "ship it" or any equivalent (with or without naming a platform), run the release command yourself — do not hand back instructions. **Currently we publish to ANDROID ONLY (user directive 2026-07-05).** So when a release is requested without naming a platform, run `cd mobile; npm run release:android` — do NOT build/submit iOS unless the user explicitly asks for iOS this time. The `npm run release` (both platforms) and `npm run release:ios` commands still exist and are correct, but are not the default right now. Revert this Android-only default only on an explicit user instruction. The configured submit targets are TestFlight (iOS) and the **`production`** track (Android — public Play Store; flipped from Closed testing `alpha` on 2026-05-18 for the public launch). After kicking off, report the build + submission URLs and stop — do not poll or wait.
- Run any git operation except destructive ones called out below.
- Apply Supabase migrations and deploy edge functions (see "Server-side autonomy" below for the full list).
- Hit any REST API with credentials Claude already has access to.
- Long-running commands (EAS builds, deploys) → run in background (`run_in_background: true`) and continue working; only flag the user when their input is needed.

**When to ask:** the action is impossible without the user — browser-only portal flows (Apple Developer Center, App Store Connect web UI, Google Play Console web UI, Firebase Console, GCP Console enabling APIs), 2FA codes coming to the user's phone, physical-device interaction, or destructive actions on shared/production data (truncating live tables, force-pushing main, dropping columns with user data). For these, hand the user the exact link/step and continue with anything else that's parallelizable.

**Don't ask for confirmation as a courtesy.** "Ready to proceed?" / "Should I run X?" / "Do you want me to also do Y?" are time-tax on the user. Just do it and report.

## Project task queue — DISABLED

Trello integration was disabled at the user's request (2026-06-01). Do **not** create cards, comment, sweep, attach images, or otherwise touch Trello for actionable requests. The `trello.ps1` helper and `.claude/secrets/trello.json` are left in place for possible future re-enablement; do not invoke them.

Treat actionable requests directly — read files, plan, edit, run tools — without any queue step. There is no task queue for this project.

## Server-side code (supabase/functions/ and database)

Claude owns the server side end-to-end: edge functions, RPCs, migrations, schema. The two-board rewrite is complete (server + client). Further work is incremental features, not a rewrite.

### Server-side autonomy

Specific instances of the general autonomy rule above:

- Deploying edge functions and creating new `.ts` files under `supabase/functions/`.
- Applying DB migrations: DDL/DML, new tables/columns/indexes/triggers/cron jobs, new RPCs (any signature), modifying existing RPCs, dropping schema objects, data backfills.

No confirmation is required for any of the above — proceed and report what was done.

### Required discipline (still enforced)

- `CLAUDE.md` is the source of truth for the data model. Every schema change (new or removed table/column/index/trigger/RPC/cron) must be reflected in the "Database schema" section of this file in the same change. If code and this file disagree, treat this file as correct and update the code.
- Do not ship destructive operations on production data (truncating live tables, dropping columns with user data) without first surfacing what will be lost. Autonomy covers schema/code work; data destruction still warrants a heads-up.
- `BACKWARD_COMPAT.md` is the cleanup queue for shims kept alive to support older published mobile builds. Every breaking server change shipped via Expand → Migrate → Contract must add an entry there in the same change, and entries must be removed once their mobile-version floor falls below the live distribution. See the "Backward compatibility with the deployed mobile app" section below for the full rules.

### Backward compatibility with the deployed mobile app (production)

The app is in production on the stores. Mobile updates take days-to-weeks to roll out (users update at their own pace; some never do). The server, by contrast, deploys instantly to 100% of users. **Every server change must assume the currently-published mobile build is still running on most devices.**

Before shipping any server change, ask: *"Will the currently-published app still function correctly after this deploy?"* If no, the change is breaking and must be staged.

**Safe by default (ship freely):**
- Adding a new field to `users.relations`, `users.data`, or any JSONB blob — old clients ignore unknown keys.
- Adding a new endpoint or new RPC — old clients don't call it.
- Adding a new column to a table that the client doesn't read.
- Adding a new push code — old clients fall through to a default route.
- Internal refactors to RPC bodies that preserve the input/output contract.

**Breaking (must be staged):**
- Removing or renaming a field the app reads (e.g., `page1.state`, `page1.profile`, anything inside `Profile`).
- Changing the type or semantics of an existing field (e.g., string → object, enum value rename).
- Removing or renaming an endpoint, RPC, or push code the app calls / handles.
- Changing the response shape of an existing endpoint.
- Tightening a precondition so a call the app currently makes starts failing.
- Schema-level changes that ripple into Realtime payloads the app subscribes to.

**Staging pattern for breaking changes:**
1. **Expand:** ship the new shape *alongside* the old one. Server writes both; reads accept either. Old app keeps working on the old shape; new app uses the new shape.
2. **Migrate the app:** publish a mobile build that consumes the new shape. Wait for adoption (typically weeks; check version distribution before proceeding).
3. **Contract:** once the old shape has no live readers, remove it.

**Every Expand step must add a matching entry to `BACKWARD_COMPAT.md`** (the cleanup queue) in the same change. The entry records what shim was kept alive, why, and the mobile-version floor at which the Contract step becomes safe. If you ship an Expand without writing the entry, the cleanup will never happen and dead-code rot accumulates.

Before shipping any server change, also scan `BACKWARD_COMPAT.md`: any entry whose mobile-version floor is now below the live distribution can (and should) be removed in the same session.

If a breaking change cannot reasonably be staged, surface that explicitly and discuss with the user before shipping — options include a force-update gate (return `426 Upgrade Required` from `/app/start` for versions below `min_supported_version`) or accepting that old-version users will see degraded behavior for a window.

When in doubt about whether a change is breaking, default to treating it as breaking and staging it. Cheap to be cautious; expensive to brick the field.

## UI layout iron rules (mobile/app/home.tsx)

These rules are absolute and must be applied any time the shell or the overlays are touched.

Rewritten 2026-07-19. The previous incarnation described a 3-slot `PagerView` (`settings | home | side`) under a global `TabStrip`, and ran ~70 lines deep on tab-chip geometry. All of it is gone. Users did not understand the pager: nothing signalled that three screens sat side by side, the side slot silently swapped between page2 and chat, and the tab row carried five unrelated kinds of state (viewer counts, invite timers, hearts, visibility glyphs, pause). The replacement is deliberately Tinder-plain.

### The shape

**One screen: page1 (home).** Everything else rises over it as a full-screen `OverlaySheet` and is dismissed by swiping down. There is no pager, no tab strip, and no horizontal navigation of any kind. `TabStrip.tsx`, `HomeCard.tsx` and `WatcherCard.tsx` are deleted; do not resurrect them.

### One swipe-down implementation

The pull family lives in **`mobile/src/components/PullPane.tsx`**: `PullContext` / `PullCtx` / `PullScrollView` / `usePullCtx` / `usePullBehavior` / `PullPane`. It is THE "drag a surface down with the finger" mechanism. page1's pull-to-skip, the invite's pull-to-decline and every overlay's swipe-to-close are the same code — that identity is the point, and it is what the user asked for. **Never hand-roll a second `Gesture.Pan` for a swipe-down.**

`usePullBehavior`'s `axis` option decides which way the surface leaves. `'y'` (default) is down, off the bottom: every card surface and every sheet but one. `'x'` is sideways, off the START edge, and exists solely for the **menu drawer** (2026-07-19) — it enters from the edge its own hamburger sits on, so it must leave by the same edge. The gesture is still THIS one, extended, not a second `Gesture.Pan`. `pullY` carries the drag MAGNITUDE and is always ≥ 0; only `PullPane`'s transform knows the physical direction, via a single `AXIS_X_SIGN` that flips under RTL. On the `'x'` axis the `scrollAtTop` gate is skipped — a horizontal drag never competes with a vertical scroll, so the body scrolls at any offset and only a sideways-dominant drag takes the surface.

`usePullBehavior`'s `commit` option decides what crossing the threshold does:
- `'slideOff'` (default) — ride the surface off-screen, then `onCommit`. The surface is going away.
- `'snapBack'` — fire `onCommit` FIRST, then spring home, and never latch `slidOut`. The committed drag is a *request* whose handler decides. This is what lets the invite card open a confirm dialog over a card that stays put.

(`BottomSheet.tsx` keeps its own, separate swipe-to-dismiss. That is for small bottom-anchored dialogs and uses the `SWIPE_DISMISS_PX` threshold family; this one is for full surfaces and uses `PULL_COMMIT_FRACTION`. They are deliberately different gestures — do not merge them.)

### `OverlaySheet` — the only bottom-up surface

`mobile/src/components/OverlaySheet.tsx` composes `PullPane` + `usePullBehavior` + `RisingCard` + `SheetHeader` (close X, optional centred title, optional trailing control). Five call sites, no exceptions:

| Surface | `activation` | `axis` | `commit` | header | notes |
|---|---|---|---|---|---|
| Menu (`SettingsPage`) | `sheet` | **`x`** | `dismiss` | floating | the drawer; never gated |
| Profile preview (`PreviewFieldPage`) | `sheet` | `y` | `dismiss` | floating | stacks on the menu |
| Chat (`ChatPage`) | `sheet` | `y` | `dismiss` | bar, titled | `dragFrom="header"` |
| Incoming invite | `scrollPan` | `y` | `confirm` | floating | swipe = decline request |
| Dead invite | `scrollPan` | `y` | `dismiss` | floating | close = `app/free2` |

Three details that are load-bearing; each one was a real bug before it was fixed:

- **Reset on open.** A `'slideOff'` close parks `pullY` at the screen height. Without `pull.reset()` on every open, a reopened sheet mounts translated fully off-screen and is never seen.
- **`dragFrom="header"` for chat.** The sheet arbitration is `if (!scrollAtTop && !inHeader) fail()`, and `scrollAtTop` defaults true. Chat's `FlatList` is `inverted`, so "at top" is meaningless — without seeding it false, every drag in the message list is stolen by the dismiss pan.
- **`isTop`.** A stacked sheet disables its parent's pan, so two live sheets never arbitrate against each other. Swiping the profile sheet must return to the menu, not close both.

`PreviewFieldPage` takes an `onBack` but renders **no control for it** (its X used to be the Menu tab). Any sheet hosting it must supply the close affordance — hence `floatingHeader`, not `chromeless`.

### Overlay state: stacked vs derived

```ts
type Overlay = 'menu' | 'chat' | 'profile'
const [overlays, setOverlays] = useState<Overlay[]>([])
```

**Stacked** (in that state) = surfaces the user opens and closes: menu, the profile sheet on top of it, and chat.

**Derived** (NOT in that state) = the incoming-invite / dead-invite card:

```ts
const inviteOverlayOpen = !overlaysGated && !!(page2PendingInvite || page2DeadInvite)
```

Its lifetime belongs to the server, so putting it in the stack would be a second copy of state that can disagree with `relations`. Deriving it is also what makes an invitation outrank the watched card — it simply paints above — and why a cold start from an `invite-in` push needs no routing at all. **Do not move it into the stack.**

`overlaysRef` is assigned **during render**, not in an effect: the `BackHandler` registers once with `[]` deps and reads it, so an effect-synced ref lags a render and back exits the app instead of popping.

### Paint order

`home < invite < chat < menu < profile sheet` (`OVERLAY.z` in tokens.ts).

Menu sits above everything on purpose: it is the one surface that stays reachable while the availability gate is on.

### BackHandler priority

1. an open `ConfirmDialog` / `BottomSheet` (they own their own dismiss)
2. the topmost stacked overlay pops (profile → menu → chat)
3. the invite overlay: pending declines through its confirm; dead is **swallowed** so back cannot dismiss a card the server still owns
4. → `false` (leave the app)

### Home chrome

- **Floating hamburger**, `position:absolute`, `start: MD`, `top: topInset + OVERLAY.chromeGap`. Top-START, opposite the group chip the card renders at top-END. It is a sibling rendered AFTER the card layers, so it is the deepest responder in its own bounds and does not translate when a card is pulled off.
- **Drag to open the menu** (`menuDragGesture`, 2026-07-19). A sideways-INWARD drag (from the START edge's direction) **anywhere on the shell** opens the drawer, the gesture twin of the hamburger. Three things are load-bearing; each was a real failure first, verified on the emulator:
  - **It is NOT an edge band.** The obvious design — an invisible strip on the START edge, mirroring where the drawer enters — is dead on arrival: Android gesture navigation (`navigation_mode=2`, the default) owns both screen edges for the system BACK gesture and eats those touches before the view tree sees them. An edge swipe left the app entirely without reaching one JS handler. Do not reintroduce a strip, and do not reach for `setSystemGestureExclusionRects` to force one — that fights the user's own OS back gesture for a gesture that hosts fine away from the edges.
  - **The gesture is an ancestor pan on the page1 subtree.** An ancestor always receives touches alongside its descendants, so there is no hit-testing race and nothing is swallowed. An overlaying view instead loses the race to whatever paints on top (the invite sheet swallowed it) or, if made full-surface, eats every tap. It must wrap the subtree and NOT ride page1's card pan: the card is absent in the empty and gated states, and the drawer has to stay draggable there.
  - **Arbitration is `manualActivation` + a sideways-dominance ratio**, the same shape `usePullBehavior`'s axis-`'x'` close uses — **not** `activeOffsetX` + `failOffsetY`, where whichever axis crosses its slop first wins, so a normal slightly-diagonal swipe fails on Y before it ever activates on X. `dragClaimed` latches the claim because `onTouchesMove` keeps firing after `activate()` and would otherwise re-fire the haptic every frame.

  Live over home AND over the derived invite card (no horizontal gesture there, same reason its hamburger stays tappable); disabled while a stacked overlay is up. Vertical pulls are untouched — page1's pull-to-skip fails on horizontal, so the two are disjoint. It shares `AXIS_X_OPEN_SIGN`, derived from `AXIS_X_SIGN` so open and close cannot disagree under RTL.

- **The drawer TRACKS THE FINGER while opening**, exactly as it tracks it while closing (user decision 2026-07-20: "ממש כמו תפריט צד בכל אפליקציה אחרת"). It is one continuous position, never a gesture that fires a canned animation. Mechanics:
  - **One `pullY`, every path.** `menuPull` is created in `home.tsx` and handed to the sheet through OverlaySheet's `pull` prop, because the two pans live on different views: closing on the sheet, opening on the shell (a closed sheet is off-screen and catches nothing). `pullY` is distance-from-open — 0 out, `screenSpan` hidden — so the opening drag is just `screenSpan - travel`. The hamburger tap (`openMenuByTap`) and the close (`closeMenu`) animate the same value, so **the drawer uses no layout animation at all** (`animateEnter`/`animateExit` both false). With an external pull the host also owns the rest position, so OverlaySheet's reset-on-open is skipped.
  - **`keepMounted`: the drawer is never mounted or unmounted.** It exists from first paint, parked at `pullY = screenSpan`; `open` means interactive, not mounted. A sheet has to already exist to be dragged in, and the version that mounted it on drag-start needed a `menuDragging` flag gating the mount, the entrance animation AND the unmount — which stranded the sheet mounted-but-unclosable the first time an animation was interrupted (the completion callback that cleared the flag never fired). Keeping it mounted deletes that state machine: the drag has nothing to create or destroy, only a position to move. `closeMenu` therefore animates `pullY` out and removes it from `overlays` in the callback, fired even when the animation is interrupted, and Back routes through it rather than popping the stack directly.
  - **The drag gesture is gated by a shared value, not `.enabled()`.** Committing opens the menu, which flips the gate; with `.enabled()` that rebuilds the gesture object mid-drag and makes RNGH reattach the handler. The gesture is built once, for the life of the screen.

> **Unrelated pre-existing crash, still open (2026-07-20).** This branch crashes at LAUNCH on Android New Arch with `addViewAt: failed to insert view [42] into parent [...] at index 1 / The specified child already has a parent` — a Fabric mount race, 100% reproducible, **verified on clean `HEAD` with no local changes**. It is the Android face of the open New-Arch mount race the root `LayoutAnimationConfig skipEntering` in `_layout.tsx` was added for. It is NOT caused by the drawer work, and every menu interaction (tap open, tap close, Back, drag-cancel, drag-commit) was verified crash-free in isolation. Ruled out so far: the drawer's layout animations, `RisingCard`'s subtree-wide `skipEntering={false}` override, and `STATUS_LAYOUT`/`LinearTransition`. Do not attribute a crash to whatever action you performed after launch — clear logcat and test one action at a time, or you will chase the wrong thing (this cost several rounds).

  **Debugging note:** `runOnJS(console.log)` silently no-ops inside a worklet. Two rounds of "the gesture receives nothing" were that, not the gesture — wrap it in a named `useCallback` instead.
- **Top-START on a card belongs to the shell, and nothing else may claim it.** The card's own top chrome is the shared-group chip alone, at top-END (`topEndOverlay` in `MatchCard.tsx`). The **report flag lives at the head of the bottom-left chips column, directly above the name chip** — it reads as "report this person" next to the identity it acts on. It has moved three times: top-start (collided with the hamburger) → the bottom action stack → beside the group chip at top-end → above the name chip (user decision 2026-07-19).
- **`chromeReserve(topInset)`** → `MatchCard`'s `topBlockInset`. The status card (`topBlock`) starts at the card's top edge and would otherwise take the hamburger / a sheet's X on its heading. The reserved band is painted PRIMARY, not left transparent, or the backdrop shows through as a stripe above the card.
- **In chat state the card's action button OPENS the chat.** Ending the conversation lives in the chat sheet's 3-dot menu. The leave/block `BottomSheet` and its confirms stay in `home.tsx` with `runAction`; only the trigger renders inside the sheet. That is not a leak — the sheet *is* home.tsx's tree.
- **Nothing else is displayed on home.** No hearts count (settings only), no viewer count, no viewer list, no visibility control (a settings row), no broadcast.

### Invitation countdowns

Both clocks render **inside the status card that announces the invitation** (`StatusTimer` in `home.tsx`): outgoing → `InviteTimerCard`, incoming → `ReplyingInviteCard`, expired → `EventMessageCard` frozen at 00:00. Never put a countdown back into shell chrome: a clock drawn inside its own card cannot appear before that card, which is what the deleted `waitingChipReady` sequencing existed to fake. The tick lives in `StatusTimer`, so a second re-renders one card rather than all of `HomePage`.

### Gate

While `overlaysGated` (`geoGated || isPermMode`) the chat and invite overlays are unreachable and the chat overlay is force-closed. **The menu is never gated** — the user must still be able to reach settings and change their location while they wait.

## Mobile native UI — use the `building-native-ui` skill

Any time the work touches mobile/Expo/React Native UI (a screen, component, navigation, animation, sheet, icon, native control, visual effect), **consult the `building-native-ui` skill before writing the UI** — read its `SKILL.md` and the relevant file under `references/` for the API in question. The skill is installed (gitignored) at `.agents/skills/building-native-ui/`, symlinked into `.claude/skills/building-native-ui/`; reinstall with `npx skills add expo/skills --skill building-native-ui` if missing.

Scope: this applies only to mobile native-UI work. Server/DB/edge-function/Trello/config tasks do **not** invoke it.

Conflict rule (absolute): the skill is a general Expo best-practice guide; **this CLAUDE.md overrides it on every conflict.** Specifically — DRY/central theme tokens win over the skill's "inline styles, no tokens" advice; the "UI layout iron rules (mobile/app/home.tsx)" single-screen + OverlaySheet contract is never restructured to match the skill's route/tabs/form-sheet suggestions; the i18n no-em-dash rule and existing file-naming stand. Take from the skill the *native API techniques* (SF Symbols via `expo-image source="sf:"`, `expo-glass-effect` liquid glass, form sheets, Reanimated patterns, `expo-audio`/`expo-video`, safe-area via `contentInsetAdjustmentBehavior`), not its architecture/styling opinions.

## Keyboard avoidance for any text input in a popup/sheet (read this — the rule INVERTED 2026-05-19)

**History / why this inverted.** `BottomSheet` used to carry a `keyboardAvoiding?: boolean` prop that listened to `Keyboard` show/hide and lifted the **whole** sheet by the keyboard height via an extra `keyboardOffset` transform. A RN `Modal` + `statusBarTranslucent` does **not** get the activity's window resize (`softwareKeyboardLayoutMode: "resize"` is moot inside the Modal — confirmed, still true), so a bottom-anchored sheet does **not** rise on its own; *something* must nudge it. The bug: `settings.tsx`'s age and location/address sheets had their **own** per-screen `cardWrapStyle` `marginBottom` nudge **and** the global `keyboardOffset` lift — the two **double-applied** and pushed those sheets visibly **too high** (user report 2026-05-19 with screenshot). Fix: the global lift was removed (no `keyboardAvoiding` prop, no `keyboardOffset`, no keyboard listener in `BottomSheet` anymore) so the per-screen nudge is the single mechanism and no longer over-shoots. Side effect that had to be fixed in the same topic: `ConfirmDialog` had **no** per-screen nudge — it relied solely on the now-removed global lift — so its `noteInput` field (the report flow) was left fully behind the keyboard. It now has its own per-component nudge (below).

**Single source of truth for keyboard height: the `useKeyboardHeight()` hook** (`mobile/src/hooks/useKeyboardHeight.ts`) — returns the keyboard height (0 when hidden), iOS `keyboardWillShow/Hide` + Android `keyboardDidShow/Hide`. It replaced two byte-identical inline listener copies in `settings.tsx` and is also used by `ConfirmDialog`. Any sheet that needs a keyboard nudge consumes **this hook**, never a re-implemented listener.

**Rule for any future text field in a popup:**
- **Do NOT reintroduce a BottomSheet-wide keyboard lift** — no `keyboardAvoiding` prop, no `keyboardOffset`/transform offset, no global `Keyboard` listener in `BottomSheet`, no `KeyboardAvoidingView`. A global lift double-applies with the per-screen nudge and over-shoots. (`BottomSheet` still calls `Keyboard.dismiss()` when any sheet closes so the keyboard never lingers over the screen behind — that is the only `Keyboard` use left there and is fine.)
- Never hand-roll a popup with a raw `Modal` + `KeyboardAvoidingView`. Compose `BottomSheet` (or a component that already does, e.g. `ConfirmDialog`). Add a text field to a `ConfirmDialog` via its `noteInput` prop, not by stuffing a bare `TextInput` into `description` — when `noteInput` is set, `ConfirmDialog` auto-nudges via `useKeyboardHeight()` → `cardWrapStyle={{ marginBottom: kbHeight }}` (both platforms, since the Modal doesn't resize on either). No caller wiring needed.
- If a *brand-new* sheet composer has its own focusable `TextInput`, give it the **per-screen** nudge: `const kb = useKeyboardHeight()` then `cardWrapStyle={kb > 0 ? { marginBottom: kb } : undefined}` (and/or a height reduction, as `settings.tsx`'s address sheet does for its scroll list). **Never** push this back into `BottomSheet` as a global concern.
- If a keyboard covers a field again, the fix is the per-screen `cardWrapStyle` nudge (driven by `useKeyboardHeight()`) on that sheet, **not** a reinstated global transform lift.

## i18n text style

Do NOT use em dashes (—) in any i18n string in `mobile/src/i18n/he.ts` or `mobile/src/i18n/en.ts`. Replace with period, comma, or colon depending on context.

## DRY (single source of truth)

Every value and every UI element is defined **exactly once** and referenced everywhere else. No copies, no parallel definitions, no "almost the same" duplicates.

### Values (tokens)

Any literal that has meaning — sizes, colors, spacing, radii, durations, easings, font sizes/weights, z-indexes, opacities, breakpoints, gesture thresholds, velocity cutoffs, animation curves, storage/cache keys, route names, event/push codes, restriction keys, query keys, env var names, magic strings/numbers — lives in **one** named constant and is imported from there. No inline literals at call sites for any of the above.

- Design tokens (colors, spacing, radii, typography) live in the central theme module and are consumed via the theme — never hard-coded in component files.
- Motion tokens (durations, easings, spring configs, gesture thresholds, velocity cutoffs) live alongside the design tokens. Two pieces of UI that should "feel the same" must reference the same motion token, not redefine `withTiming(..., { duration: 350, easing: Easing.out(Easing.cubic) })` inline.
- Keys (storage, query, event codes, push codes, restriction keys, route names) live in a single constants module and are referenced by symbol, never as bare strings.
- If the "same value" appears in two places and could drift, it must be extracted. "It's only used twice" is not an exception.

### Elements (components)

Every UI element exists **once** as a reusable, parameterized component. No element is rewritten, copy-pasted with tweaks, or re-styled inline in a second place.

- If two screens render the "same thing with small differences," that thing is one component with props for the differences — not two near-duplicates.
- A component owns its appearance, layout, **and behavior** (animations, gestures, transitions, focus/press feedback, mount/unmount choreography). Callers pass data and callbacks, not style overrides or re-implementations of the same animation.
- New screens compose existing components. If a needed component doesn't exist yet, create it once and use it everywhere it applies (including refactoring existing callers to use it).
- Variants (size, tone, state) are props on the single component — never a forked second component.

### Behaviors (animations, gestures, transitions)

Behavior is DRY too. If a popup slides up from the bottom with a certain easing and a swipe-to-dismiss threshold, that **entire behavior** — the animation timing, the gesture handler, the dismiss velocity cutoff, the shadow stack — is implemented in one base component (e.g., `BottomSheet`) and every popup composes it. The same applies to:

- Sheet/dialog mount-in and dismiss animations.
- Card slide-down / hero-mount sequences.
- Press feedback (scale, opacity, color fade).
- Swipe-to-dismiss / pull-to-refresh gestures.
- Slider thumb pan logic.
- Tab/pill transition animations.
- Realtime list-insert animations.

No screen reimplements `useSharedValue(...) + withTiming(...) + Gesture.Pan()` for a behavior that already exists. If the behavior doesn't exist yet, build it as a primitive (hook or component) once, then compose it.

### Timing and chaining

Don't invent timing numbers when the system already gives you one, and don't chain animations with `setTimeout` that approximates how long the previous one took. Both patterns silently desync the moment someone tunes the underlying motion.

- **Use system defaults.** `withTiming(value)` (no config) and `scrollTo({ animated: true })` use the framework's tuned durations. Don't pass a literal duration just to make the value visible — that's not DRY, it's two sources of truth for the same number.
- **Chain via completion callbacks, not timers.** When animation B should start (or some UI should appear) after animation A finishes, fire it from A's completion callback (`withTiming(v, cfg, finished => ...)`, `Animated.timing(...).start(() => ...)`, etc.), not from a `setTimeout` matched to A's duration. If A doesn't expose a callback (e.g. RN's `scrollTo` doesn't), prefer running B in parallel — overlapping motion usually reads fine and is robust.
- **Only add a named constant when a real choreography demands it.** If a design genuinely requires a non-default duration or a deliberate gap between two motions, put that single number in `tokens.ts` (`MOTION.*`) and reference it from every call site. Never write a bare `300` / `setTimeout(..., 320)` inline.
- **Components own their timing.** If a child animates, it should also signal completion via a callback prop (e.g. `MatchCard.onTopBlockShown`). Parents subscribe to the callback; they don't replicate the child's duration in their own state machine.

### How to apply

Before writing a literal or a JSX block: search the codebase for an existing constant/component that already represents it. If one exists, use it. If one doesn't but the value/element will plausibly be reused (or already appears elsewhere), create the single definition first, then reference it. Treat any duplication you encounter while working as a bug to fix in the same change.

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

The model has **two boards always available simultaneously**, so a user can be waiting on an invitation they sent (page1) while also receiving a competing invitation from someone else (page2).

### Data model

Everything lives inside `users.relations` (JSONB column) for atomicity and performance. No separate `invitations` / `viewings` tables.

```ts
type Pages = {
  page1: Page1;
  page2: Page2;
};

type Page1 = {
  state: 'free' | 'watching' | 'waiting' | 'chat' | 'locked';
  profile?: Profile;           // the single watched candidate. Present when state ∈ {watching, waiting, chat}, and on locked when carrying a "what happened" message.
  message?: string;            // event code (cancel/decline/expire/...) — set only on locked transitions that need UI feedback
  invited_at?: string;         // ISO, set when state = 'waiting'
  expires_at?: string;         // ISO, set when state = 'waiting'
  extended?: boolean;          // true after the one allowed extend; blocks further extends
};

type Page2 = {
  state: 'free' | 'pending' | 'chat' | 'locked';
  profile?: Profile;           // pending: the inviter; locked-with-message: the dead-invite originator
  profiles?: Profile[];        // free: viewer list (users currently watching me)
  message?: string;            // event code — set only on locked transitions that need UI feedback
  invited_at?: string;         // ISO, set when state = 'pending'
  expires_at?: string;         // ISO, set when state = 'pending'
  extended?: boolean;          // mirrored from inviter's page1.extended
};
```

`state` and `message` are independent: `state` describes whether the page is empty (`free`), in an active interaction (`watching`/`waiting`/`pending`/`chat`), or terminal (`locked`); `message` is the optional event code that triggered the most recent lock and tells the UI which "what happened" card to render. Both `invited_at` and `expires_at` are written atomically on both sides of an invitation. `invited_at` is stable for the life of the invitation. `expires_at` moves forward on each `extend` call. The client-side countdown is driven by `expires_at`.

A brand-new user starts at `page1.state = locked, page2.state = locked` with no `message` on either side. The user exits via the green-button paths described under "UI button mapping" below.

### State vocabulary

- `page1.state ∈ {free, watching, waiting, chat, locked}`
- `page2.state ∈ {free, pending, chat, locked}`
- `message`: optional event code (e.g., `cancel`, `decline`, `expire`). Auto-find triggers (`start`/`location`/`focus`) are never propagated as `message`.
- `profile` (singular) and `profiles` (array of watchers) populations are managed independently of `state` and are not in the transition table below.

### Findability

For `find` to pick candidate P for actor A, P is findable iff:
- `P.page1.state ≠ chat`
- `P.page2.state ∉ {locked, pending}`
- **P has at least one photo** — `P.data.images` has ≥1 element (migration `20260706030000_require_complete_profile_others`, relaxed to images-only by `20260706040000_matchable_require_image_only`). This is an explicit clause in `others(only_available)`, so it also covers `app_add` and `app_seed_viewer` (both pick candidates via `others(me, true)`). Before it, half-onboarded users were kept out of the pool only incidentally — `location` stays NULL through onboarding (written solely by `/app/start|location|focus`, which run only from `/home`, reachable only after a bio exists) and `others(only_available)` already drops NULL-location candidates. That was a side effect, not a guarantee: any future path that writes `location` before a photo is uploaded would have surfaced a blank card. **Bio is intentionally NOT part of this gate** — a profile with an empty bio is still displayable, so gating on bio would wrongly exclude real, fully-usable users whose bio is blank. Only the absence of a photo produces a blank card, so photo presence is the whole guard. Internal-only / not breaking.

### Auto-find behavior

`start`, `location`, `focus` always run on app open / location change / focus to refresh `relations` snapshots (analog of `app_refresh_snapshots`). They additionally trigger auto-find **iff** `A.page1.state === 'free'`. Any other state (`locked`, `watching`, `waiting`, `chat`) → snapshot refresh only, no auto-find.

### UI button mapping (per page, when `state === 'locked'`)

- **`message` present** → page renders the "what happened" card with a **gray "Continue" button**. Tap fires `clear1` / `clear2` to the server, which clears `message` only — `state` stays `locked`.
- **`message` absent** → page renders its default UI with a **green action button**:
  - page1 green button → `find` (transitions `page1.state` from `locked` to `watching` or `free` and runs candidate selection).
  - page2 green button → `free2` (transitions `page2.state` from `locked` to `free`).

A fully-locked-with-message page exits in two taps: gray (clear message) → green (find / free2). page1 has no separate `free1`; `find` covers it.

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
- **`page2.state = locked`** also implies that both `profile` (singular) and `profiles` (watcher array) on that page are cleared as part of the same write. They can re-populate after `free2` returns the page to `free`.
- **`page2.state = free`** (written by `leave/block` and `free2`) clears `profile` and `profiles` as part of the same write.

### State transition table

| page | A.event | page1.state | page2.state |
|------|---------|-------------|-------------|
| | start/location/focus | free/watching (A) | |
| 1 | find/ignore | free/watching (A) | |
| 1 | cancel | locked (A) | locked (B*) |
| 1 | invite | (waiting/chat/locked (A*) / chat (B)) + locked (C*) | pending (B) |
| 1 | extend | locked (A*) | |
| 2 | remove | locked (B*) | |
| 2 | add | watching (C) | |
| 2 | approve | chat (A+B) + locked (C*) | locked (A+B) |
| 2 | decline | locked (B*) | locked (A) |
| 1 | leave/block | locked (A) + locked (B*) | free (A) + locked (B) |
| | logout/delete | locked (A+B*) | locked (A+B*) |
| | cron | locked (A*/B*) | locked (A*/B*) |
| 1 | clear1 | | |
| 2 | clear2 | | |
| 2 | free2 | | free (A) |

`clear1` and `clear2` write only `message = null` on their respective page (state untouched). `free2` writes only `page2.state = free` (no message).

### Event list

`start`, `location`, `focus`, `find`, `ignore`, `cancel`, `invite`, `extend`, `remove`, `add`, `approve`, `decline`, `leave`, `block`, `report`, `logout`, `delete`, `cron`, `clear1`, `clear2`, `free2`, `buy_extra`. (`set_tier` is retained as a server-side no-op for the deployed mobile build — see BACKWARD_COMPAT.md.)

### Worked examples

- **`logout/delete | locked (A+B*) | locked (A+B*)`**: A's page1 → locked (no message — A initiated). Every B referencing A (in `B.page1.profile`, `B.page2.profile`, or `B.page2.profiles[]`) gets their corresponding page → locked + `message = logout` (or `delete`).
- **`invite | (waiting/chat/locked (A*) / chat (B)) + locked (C*) | pending (B)`**: A in watching invites B. Three branches for A.page1: `waiting` (success), `chat` (mutual case where B was already inviting A), or `locked` + `message=invite` (failure). On the mutual branch, B.page1 also goes to `chat`. B.page2 → `pending` with A's profile (no message; the UI shows pending). A.page2 is **not touched** — page1 buttons must not modify the actor's own page2. Every C with B as their watching target → C.page1 = `locked` + `message=invite` ("kicked because target was invited").
- **`approve | chat (A+B) + locked (C*) | locked (A+B)`**: A approves B's pending invite. Both A.page1 and B.page1 → `chat`. Both A.page2 and B.page2 → `locked` with no message and `profile`/`profiles` cleared — once the pair is in chat, page2 has nothing to communicate; the chat itself is the result. Every C watching A or B → C.page1 = `locked` + `message=approve`.

### Endpoints

All live under `POST /app/<action>`. Each executes as a single Postgres transaction: `BEGIN; SELECT ... FOR UPDATE ordered by user_id ascending; UPDATE ...; COMMIT`. The user_id ordering prevents deadlocks when multiple rows are locked. Each endpoint maps 1:1 to a row in the transition table; the underlying RPC names (`app_find`, `app_invite`, ...) are listed in the "Approved removals (already migrated)" section.

Per-endpoint restrictions (rows inserted into `restrictions` behind `waitUntil`, see "Database schema → restrictions" for cooldown durations):
- `ignore` A→B
- `cancel` A→B
- `remove` B→X
- `decline` B→A
- `leave` A→B
- `block` A→B (permanent — `clear1` from chat triggers this)

`invite` precondition: `A.page1.state = 'watching'` AND `B.page2.state = 'free'`. Writes a 10-minute `expires_at` (= `invited_at + 10m`). `extend` is server-only, additive, one-shot per invitation, callable only by A while live (`expires_at > now()`) and not previously extended.

`add` (page2 "Show me to people" / broadcast button) is rate-limited via `relations.last_add_at` (30-minute cooldown, also consumed when zero candidates found). See `app_add` in the "Approved removals" section. The user can exit broadcast early via `app/cancel_add`, which clears `last_add_at` (and ends the visual "in-broadcast" indication) without otherwise touching state. `app/lock2` also clears `last_add_at` atomically so switching to hidden during broadcast doesn't leave the cooldown stuck on.

**Restrictions note:** rows are inserted behind `waitUntil` (off the critical path). The `others` RPC reads them during `find`, but since restrictions only affect the inserting user's future `find` calls, a sub-100ms race is harmless — the restriction will be in place well before the user calls `find` again.

### Invitation timeout and extension

- Initial expiry: `expires_at = invited_at + 10 minutes`.
- **`extend` is additive and one-shot per invitation.** Server-side functionality only. Mobile UI does not surface an extend button; the waiting state shows a full-width cancel. Server adds the requested minutes to `expires_at` on both sides and marks the invitation as extended.
- Only the inviter (A) can extend. Only while the invite is still live (`expires_at > now()`). Only if it has not been extended before (`!page1.extended`).
- Expiration is enforced two ways:
  - **Lazy:** `approve` / `extend` / `decline` check `expires_at > now()` inside the transaction. If expired, they fail with the appropriate `locked` + `message` landing. `find` (`app_find`) also lazily expires a stale `page2.state='pending'` (whose `expires_at <= now()`) right before its precondition guard, so an orphaned/expired incoming invite can never permanently no-op the page1 Play button. `cancel` (`app_cancel`) checks it too — see "Cancel / leave / block policy".
  - **Client-triggered (2026-07-19, migration `lazy_expire_invite`):** the cron alone is too slow for an app that is OPEN. The client's countdown hitting 00:00 was previously a dead end — the card sat there, live cancel button and all, until the next tick (up to 60s), and tapping cancel in that window forfeited the held heart on an invitation that had already expired. Now `useSecsLeft(expiresAt, onZero)` fires once at zero, `StatusTimer` forwards it as `onLapsed`, and `home.tsx`'s `handleInviteLapsed` calls `/app/focus`. The `start`/`location`/`focus` dispatcher case runs **`app_expire_self(me_id)`** when the caller's own relations show a past-due `page1.waiting` or `page2.pending` (cheap in-memory `isInviteLapsed` pre-check, so the common call costs nothing), and Realtime delivers the real `locked`/`expire` state. **Nothing is faked client-side** — a failed call just falls back to the cron. Wired for both directions (outgoing `InviteTimerCard`, incoming `ReplyingInviteCard`).
  - **Eager (pg_cron, every minute):** `app_expire_sweep` runs **two passes**. Pass 1 (inviter-driven): scans `waiting` page1 entries with `expires_at <= now()`. Pass 2 (invitee-driven catch-all): scans any remaining `page2.state='pending'` with `page2.expires_at <= now()`, regardless of the inviter's current page1 state. Pass 2 exists because an inviter can leave `waiting` for reasons **other than the invitee responding** (matched with someone else via `approve`, `app_pause`, etc.), which orphans the invitee's `page2` at `pending` forever — pass 1 alone (being inviter-`waiting`-driven) can never reach it. Both passes delegate the actual per-pair close to `_expire_invite_pair`, so a pair already closed by pass 1 is a no-op in pass 2 and is not double-counted.

**`_expire_invite_pair(p_inviter, p_invitee)`** is the single implementation of "close one expired invitation pair", shared by `app_expire_sweep` (both passes), `app_expire_self` and `app_cancel`'s expiry guard. It locks both rows (`FOR UPDATE`, user_id order; either id may be NULL and that side is skipped), sets the inviter's `page1` → `locked`/`expire` **with the held heart refunded** (`_credits_refund`) and the invitee's `page2` → `locked`/`expire`, preserving profiles so the message card has data and `clear2` still works. **Every write re-checks both `state` AND `expires_at` under the lock**, so the helper is self-guarding — a no-op on a live invite (or one extended concurrently, or already closed) and idempotent under concurrent callers. Returns the notify array, with an entry **only for a side that actually changed**: `expired-out` to the inviter, `expired-in` to the invitee. (The pre-2026-07-19 sweep pass 1 emitted both entries unconditionally, so an invitee whose page2 had already moved on could still get an `expired-in` push.)

Client drives countdown off `expires_at`. The countdown reaching 00:00 now triggers the server itself (see "Client-triggered" above), so the sweeper's 60s slack is only the fallback for closed apps; the lazy paths catch any early access and realtime corrects the UI.

### Skip = `find`

No separate `unview` / `skip` endpoint. Skipping is `find`: the same transaction removes A from the old target's `page2.profiles[]` and picks a new profile. `ignore` is the variant of skip that also records a 24h restriction.

page1 watches **one** candidate at a time — `relations.page1.profile` (a single `Profile`), no stack/array. `app_find` picks the single most-relevant candidate (`others()` ranked, `LIMIT 1`), writes `page1={state:'watching', profile:…}`, registers the actor as a viewer on that candidate's `page2.profiles[]`, and detaches from the previous target. `app_ignore` = record a 24h `ignore` restriction on the current `page1.profile` then delegate to `app_find`. The client (`home.tsx`) renders the single `match` (= `page1.profile`) in `PullPane`; pull-to-skip / the "Not now" button call `app/ignore`.

> A short-lived **candidate STACK** experiment (`page1.profiles[]`, Tinder/Bumble pre-loaded deck; migrations `20260519130000_app_find_lookahead` + `20260519140000_page1_stack`) was reverted on 2026-05-22 (migration `20260522000000_revert_page1_stack`) — it produced a stuck-card bug and the user chose the single-profile model. `app_skip` / `_page1_pick` were dropped; `app_find` / `app_ignore` / `_kick_page1_at` / `app_refresh_snapshots` restored to their pre-stack bodies. Do not reintroduce `page1.profiles[]` without an explicit new decision.

### Match resolution (full `approve` flow)

The inviter's viewers are **not** kicked at invite time — they stay pointed at A in `watching`. They get kicked at **match time**. Similarly, if A has a pending incoming invitation from some X (parallel-state scenario: A invited B while X was inviting A), X's invitation becomes invalid at match time.

The full `approve(B, A)` transaction:
1. `A.page1 = {state: 'chat', profile: B}`
2. `B.page1 = {state: 'chat', profile: A}`
3. `A.page2 = {state: 'locked'}` (no message; `profile`/`profiles` cleared)
4. `B.page2 = {state: 'locked'}` (no message; `profile`/`profiles` cleared)
5. For every C where `C.page1.profile.user_id ∈ {A, B}` and `C.page1.state ≠ 'chat'`: set `C.page1 = {state: 'locked', message: 'approve', profile: <whoever C was watching>}`. This covers A's watching viewers, B's watching viewers, and any X who had a pending invitation to either side.

Rows locked: A, B, and all C matching step 5 (query via index on `relations->'page1'->'profile'->>'user_id'`).

### Cancel / leave / block policy

- `cancel`: `A.page1` → `locked` (no message — A initiated). `B.page2` → `locked` + `message = 'cancel'`, profile preserved so B sees who cancelled. B clears via `clear2`. **Forfeits A's held heart** (`app_cancel` calls `_credits_clear_hold` for `_credits_cost('invite')` — the heart A spent on send stays in the system; see "Credits economy → Hold + refund / forfeit"). **Expiry guard (2026-07-19):** if `page1.expires_at <= now()` under the lock, `app_cancel` delegates to `_expire_invite_pair` instead and returns — the tap lands as an **expire** (heart REFUNDED, both sides `message='expire'`, **no `cancel` restriction**, `expired-out`/`expired-in` pushes), exactly what the sweep would have produced a moment later. A heart must never be forfeited on an invitation that had already run out. A NULL `expires_at` compares to NULL (never true), so a legacy row with no clock still cancels normally.
- `leave`: initiated from chat. `A.page1` → `locked` (no message). `B.page1` → `locked` + `message = 'leave'`. Both `page2`s → `free` (auto-return-to-free).
- `block`: identical to `leave` from B's perspective, but inserts a permanent `block` restriction so the pair will never match again. `A.page1` → `locked` (no message). Triggered by `clear1` from chat.

### Navigating out of the feed

Closing or navigating out of the feed does **not** clear `page1`. State is preserved until the user takes an action.

### Known issues (accepted, not blocking)

- **Ghost viewers:** if a user closes the app without calling any endpoint, they remain in their target's `page2[]`. No cleanup cron. Revisit later.

### Push notifications

All pushes are fire-and-forget (`waitUntil`, never on the critical path). Each push code corresponds to a state transition the receiver observes.

**Default: every transition fires a push, except the two mass-notification ones (`kick-invitee`, `kick-match`)** which stay Realtime-only to avoid spam when many users are affected by a single transition.

#### Title, body, and tap-routing rule

Every push has the same uniform layout: **title = actor's name** (the other user, or `"Once"` fallback) and **body = state text** describing what happened. The state text is sourced from `PUSH_TITLE[lang][code]` in [global.ts](supabase/functions/global.ts) for lifecycle pushes (declined / expired-* / cancelled-in / removed / left / invite-fail / approve-fail) and from `PUSH_BODY[lang][code]` for active-interaction pushes (invite-in / candidate / match / extended / chat). For lifecycle pushes the state text reads identically to the in-app page header for that message — a user who sees "ההזמנה נדחתה" in the body lands on a page whose header is the same.

Tap-routing: lifecycle pushes open the app to the **pageX** that owns the message. Active-interaction pushes open to the page that hosts the live interaction (page2 for `invite-in`/`extended`, page1/chat pane for `match`/`chat`).

| Code | Push | Trigger | Receiver state (v3) | Body source | Tap → |
|---|---|---|---|---|---|
| `invite-in` | ✅ | someone invited me | `page2.state = pending` | `PUSH_BODY.invite-in` | page2 |
| `candidate` | ✅ | someone's `find` pulled me in as a candidate (their search assigned A to my page1) | `page1.state = watching, profile = sender` | `PUSH_BODY.candidate` | page1 |
| `match` | ✅ | I matched (my approve or my invitation accepted) | `page1.state = chat` | `PUSH_BODY.match` | page1 (chat) |
| `extended` | ✅ | inviter extended my incoming-invite timer | `page2.expires_at` updated | `PUSH_BODY.extended` | page2 |
| `chat` | ✅ | new chat message from partner | `page1.state = chat` | `PUSH_BODY.chat` | page1 (chat) |
| `declined` | ✅ | my outgoing invitation was declined | `page1 = {state: locked, message: decline}` | `PUSH_TITLE.declined` (= `home.ended.missed.declined`) | page1 |
| `expired-out` | ✅ | my outgoing invitation timed out | `page1 = {state: locked, message: expire}` | `PUSH_TITLE.expired-out` (= `home.ended.missed.expire`) | page1 |
| `expired-in` | ✅ | my incoming invitation timed out | `page2 = {state: locked, message: expire}` | `PUSH_TITLE.expired-in` (= `home.page2.expire`) | page2 |
| `cancelled-in` | ✅ | the inviter cancelled before I responded | `page2 = {state: locked, message: cancel}` | `PUSH_TITLE.cancelled-in` (= `home.page2.cancel`) | page2 |
| `removed` | ✅ | I was removed from someone's viewer list | `page1 = {state: locked, message: remove}` | `PUSH_TITLE.removed` (= `home.ended.missed.removed`) | page1 |
| `left` | ✅ | my chat partner left (or blocked) me | `page1 = {state: locked, message: leave}` (`block` lands the same way) | `PUSH_TITLE.left` (= `home.ended.missed.leave`) | page1 |
| `invite-fail` | ❌ | my own invite attempt failed | `page1 = {state: locked, message: invite}` | — | — |
| `approve-fail` | ❌ | my own approve attempt failed | `page1 = {state: locked, message: approve}` | — | — |
| `kick-invitee` | ❌ | mass: target got invited by someone else | `page1 = {state: locked, message: invite}` | — | — |
| `kick-match` | ❌ | mass: target matched with someone else | `page1 = {state: locked, message: matched}` | — | — |
| `area-open` | ✅ | an area covering me became active (scheduled time arrived, or admin enabled it) | `relations.availability.state` → `available` | `PUSH_BODY.area-open` | page1 (home) |
| `area-closed` | ✅ | the area covering me was disabled/removed (admin) | `relations.availability.state` `available → unavailable` | `PUSH_BODY.area-closed` | page1 (home) |

Push codes are lowercase kebab-case and are sent as `data.type` inside the push payload. The `collapseId` field uses the relevant other-user id where applicable, so an older push is superseded by a newer one for the same pair.

**Self-push filter.** The `/app` dispatcher skips any notify entry whose `user_id === user.user_id` (the calling user). That's why `invite-fail` / `approve-fail` are ❌: the receiver is the caller, who got the failure synchronously in the HTTP response and learns it from Realtime / the response shape — a push to yourself for an action you just took is noise. The RPCs (`app_invite`, `app_approve`) still emit those notify entries on the failure branches, but the dispatcher drops them before they reach `firePush`. The same filter silently drops the redundant self-`match` entry that `app_invite`'s mutual branch emits for the caller. The cron path (`ext/index.ts`) has no equivalent filter — it ships every entry, which is why `expired-out` reaches the inviter.

### `start` endpoint — auto-find

`POST /app/start` is called on every app launch (after permissions are granted). In addition to persisting location + push token, it triggers auto-find iff `A.page1.state === 'free'` (see "Auto-find behavior" above). Any other state — `locked` (with or without message), `watching`, `waiting`, `chat` — triggers a snapshot refresh only; the user sees whatever screen their current state owns until they tap an action button.

### `start` / `location` / `focus` — first-viewer seeding (2026-05-23, migration `app_seed_viewer`)

At the end of every `start`/`location`/`focus` (after the synchronous `app_availability` recompute AND after the auto-find block), the edge dispatcher calls **`app_seed_viewer(me_id)`** when the caller is visible with no viewers yet. The intent: a freshly-visible user should not sit with an empty viewer list — seed one top-relevance candidate so the page2 surface has something to show. Same `candidate` push the broadcast (`app_add`) path fires, so the seeded user learns they have been pulled in.

Preconditions (any failing turns it into a no-op — never an error):
- `relations.availability.state === 'available'` (gate passes — geo / group-membership / push).
- `page2.state === 'free'` (visible / discoverable).
- `page2.profiles[]` is empty or missing (zero existing viewers).
- A candidate exists in `others(me, true)` with `relevance > 0` AND `page1.state IN ('free', 'locked')` (i.e. not in an active interaction: `watching`/`waiting`/`chat` are excluded so a live interaction is never disrupted). **`locked` is intentionally eligible** — matching `app_add`'s `page1.state IN ('free', 'locked')` filter. The data model cannot distinguish "locked because paused" from other locked-with-no-message cases, so excluding `locked` would starve seeding for every paused user (migration `app_seed_viewer_accept_locked` introduced this fix earlier the same day to cover what was then the post-reset shape too; admin resets have since moved to landing at `free`, see migration `admin_reset_page1_to_free`, but the `locked` eligibility is kept for paused users). The candidate gets `page1` overwritten to `{state:'watching', profile:A}` — same as what `app_add` does when broadcasting onto locked candidates.
- The candidate is NOT the user A is already watching (`A.page1.profile.user_id`). Otherwise the same person lands on **both** of A's surfaces simultaneously: A watches B on page1, AND B watches A (B then shows in A's viewer list). This used to happen reliably because the auto-find inside the same `start`/`location`/`focus` pass runs **immediately before** seed_viewer and could leave A pointed at the very candidate seed_viewer was about to pick (high-relevance pair → both picks resolve to the same user). Mirrors the symmetric `NOT EXISTS … watching me` clause `app_find` already carries against the reverse direction (migration `app_seed_viewer_exclude_my_watch` 2026-05-23).

Transaction (single `SELECT … FOR UPDATE` on `[me, candidate]` ordered by `user_id` — same locking discipline as `app_add` / `app_find`):
- Re-verify all preconditions under lock (`page2.state` still free, viewer list still empty, candidate's `page1.state` still IN `('free', 'locked')`).
- `B.page1 := {state:'watching', profile: make_profile(A, dist)}`.
- `A.page2.profiles[] += make_profile(B, dist)` (state stays `'free'`).
- Returns `{user, notify:[{user_id:B, code:'candidate', actor_id:A}]}` — the dispatcher's existing `firePush` loop sends the candidate push automatically (`PUSH_BODY.candidate`).

Not user-initiated, so it costs no credits and does not touch `last_add_at` (no broadcast-cooldown consumed). Fully additive — old mobile builds receive the same Realtime `relations` UPDATE they already render the viewer count from, plus the `candidate` push exactly like an `app_add`-seeded viewer. No mobile change required.

Wired in [supabase/functions/app/index.ts](supabase/functions/app/index.ts) in the `start`/`location`/`focus` case, after the auto-find block. Skipped automatically when not `available` or when `page2` already has viewers; the inner RPC re-verifies under lock so two concurrent calls (e.g. `start` + `focus` arriving milliseconds apart) cannot seed twice.

#### Re-seed-on-skip (2026-07-06)

Same `app_seed_viewer` mechanism, second trigger: **when a skip empties the skipped user's viewer list, reseed them one fresh viewer** — so a visible user is never left with zero viewers after the one watching them moves on. The rule in one line: *someone skips me and I'm left with no viewers → the server auto-seeds one new viewer, and pushes `candidate` to that viewer* (the newly-seeded viewer, actor = me).

Wired in the dispatcher (`app/index.ts`), NOT in SQL — no `app_find`/`app_ignore` change, no new migration:
- **Capture** (right after the `requiresPresence` gate): `skipReleased` = the caller's pre-skip `page1.profile.user_id`, set only when `key ∈ {find, ignore}` AND the caller's `page1.state === 'watching'` (a real skip releases a watched user; pressing play from free/locked releases nobody).
- **Fire** (right after the `notifyList` push loop, behind `EdgeRuntime.waitUntil` — a third party's surface, never the caller's critical path): `app_seed_viewer(skipReleased)`, then `firePush` each returned notify entry with `actor_id = n.actor_id` (= `skipReleased`), **not** the caller — so it can't ride the normal `notifyList` loop (which fires with actor = caller). Only reached on a successful skip: both find/ignore error paths `return` before the loop.

Why it's safe / self-limiting:
- The **"was the only viewer" condition is `app_seed_viewer`'s own precondition** (`page2.profiles[]` empty) — no extra check in the dispatcher. If the skipped user still has other viewers, the seed no-ops.
- The skipper is **never re-seeded onto the same user**: `app_ignore` writes a synchronous `B→A` `ignore` restriction, and `others()` filters restrictions **bidirectionally**, so `others(A)` excludes B on A's very next candidate pick. (Even on a raw `find` skip with no restriction, B has just moved to `watching` a new target, and `app_seed_viewer` only picks candidates whose `page1.state IN ('free','locked')` — so B is excluded anyway.)
- **Naturally rate-limited**: one seed + one `candidate` push per "last viewer left" event, bounded by the real skip rate. One skip → one seed, no runaway loop, no cron, no throttle.

### Client / mobile assumptions

- Realtime is wired: the mobile app subscribes to its own `users` row and re-renders when `relations` changes. Server endpoints should not echo state into the HTTP response as a synchronization mechanism — Realtime is the channel. (Echoing for convenience is fine, but the client treats Realtime as truth.)
- The server writes the canonical v2 shape (`state` ∈ the enums above + optional `message`), but `userStore.ts` still runs a `deriveCompat()` shim on every server update to synthesize the legacy UI state strings (`'watching'` / `'waiting'` / `'chat'` / `'missed'` / `'fail'` / `null`) plus `match` / `watchers` / a legacy `page2` shape (array when free, `Page2Invite` object when pending or locked-with-message). The shim maps `page1.state = 'locked'` + `message ∈ {invite, approve, extend}` to `'fail'` (A's own action failed) and any other locked-with-message to `'missed'`. Locked without message → `null`. The home/page1 and page2 panes branch on these synthesized values.
- The app is ONE screen (page1 / home). Chat, the menu and the incoming-invite card are full-screen `OverlaySheet`s over it; the invite one is derived from `relations` rather than navigated to. See "UI layout iron rules" above.

### Pending mobile work

- **Mobile shim removal:** drop `deriveCompat` from `userStore.ts`; rewrite the home/page1 + page2 UI to consume v2 `state` + `message` directly, using the gray-vs-green button rule from "UI button mapping". This is the last meaningful gap between the deployed server and the mobile codebase.
- **Client-side dead server calls (2026-07-19):** the client no longer calls `app/add`, `app/cancel_add` or `app/remove` — broadcast and the viewer list were removed from the UI. The RPCs are untouched and still correct; nothing invokes them. `app_resume` was already unreachable before this. Leave them in place until a deliberate server cleanup.
- **EAS environment variables:** `mobile/.env` is local-only. EAS builds read from the `production` (and `preview` / `development`) environment on EAS, not from `.env`. Pushing the local file: `cd mobile && cp .env .env.local && eas env:push production && rm .env.local`. If `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are missing in EAS, the production build crashes on launch with `[Error: supabaseUrl is required.]` followed by an expo-router `TypeError: Cannot read property 'ErrorBoundary' of undefined` (the supabase module fails at import time, returns undefined, expo-router then chokes loading the layout). This was the May 2026 launch-crash incident on both iOS Beta Review and Play Internal Testing.

  Vars currently set across `development` / `preview` / `production`:
  - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase
  - `FAL_KEY` — fal.ai inference (avatar/photo processing)
  - `EXPO_PUBLIC_GOOGLE_PLACES_KEY` — Google Places Autocomplete + Place Details for the location-picker popup in settings. Same key as Firebase (`mobile/google-services.json`). Requires Places API to be enabled in the GCP project that hosts the app. The key is exposed to the client (it's already shipped via google-services.json), so the GCP API-key restrictions should pin it to the app's Android package + iOS bundle ID — never leave the key wide-open.

### `report` (shipped — public-launch requirement, migration `reports` `20260518050000_reports.sql`)

Built for the public store launch (Apple Guideline 1.2 / Google UGC: a public social/dating app MUST let users report another user, block abusive users, and let the operator act within 24h). Block already existed; this adds report + a moderation record.

- **`public.reports`** — one row per report (plain `uuid` columns, **no FK**, mirroring `restrictions` so a moderation record survives account deletion). RLS enabled, **no policies** → service-role only (edge + web admin), same as `areas`/`groups`/`restrictions`. See "Database schema → `reports`".
- **`POST /app/report`** → `app_report(me_id, reported_id, p_reason, p_note)`. `reported_id` comes from the client (the user on screen); `reason`/`note` optional. Single `SELECT … FOR UPDATE` transaction (ordered by user_id, like `app_block`). It **always** (a) inserts the `reports` row and (b) inserts a **permanent `block` restriction** reporter→reported (`others()` already treats `key='block'` as permanent + bidirectional, so the pair can never rematch). Then it tears the live link down per detected surface, **reusing the existing message/push conventions so the reported user just sees a normal ending, never "you were reported"**: `chat` → mirror `app_block` (push `left`); `waiting` → mirror `app_cancel` (push `cancelled-in`, reporter's held heart **forfeited** like cancel); `pending` → mirror `app_decline` (push `declined`, reported user's held heart **refunded** like decline); `watching` → silently drop (no push); `unknown` → report + block only. **No new push code** (reuses `left`/`cancelled-in`/`declined`), so `global.ts`/client unchanged.
- **Mobile:** the chat actions (X) menu's Report row was a no-op stub; it now calls `invoke('app/report', { user_id, reason:'chat' })` via the existing `ConfirmDialog` (`chatConfirmAction === 'report'`). Copy updated to state the user is blocked + chat ends (`chat.report*` he+en). Watching-surface report is a possible follow-up (chat is the UGC-critical surface; profiles are pre-moderated).
- **Admin:** `/reports` (nav tab `reports`, between Groups and Areas) — Pending/Handled tabs, each report shows reporter/reported names + context + reason/note + time, with a `setReportHandled` toggle (bookkeeping only; ejecting a user globally is done via Groups/the gate). i18n `admin.nav.reports` + `admin.reports.*` (he+en).
- Additive / NOT breaking: new table, new RPC, new endpoint the deployed app never calls; reused push codes; admin-only.

### Open questions (need user decision before implementation)

_None outstanding._

---

## Credits economy

A per-user credit wallet at `relations.credits` gates the spend-y actions. State shape (after the tier model was retired 2026-06-01): `{balance:int, extra:int, held:int, granted_on:'YYYY-MM-DD'|null, next_grant_at:timestamptz|null}`. It is a sibling of `last_add_at`/`availability` (economy state, not profile data) and is mutated atomically inside the same `SELECT … FOR UPDATE` transaction as the state transition that spends it. Credits are private (never embedded by `make_profile`, so they don't leak into other users' snapshots). `held` reserves spendable against a live waiting invite — see "Hold + refund / forfeit" below.

**Two pools (SQL `_credits_cap()`).** `balance` is the daily pool, refilled to `_credits_cap()` = 3 every 20:00 Asia/Jerusalem. `extra` is the purchased pool, no cap, bought by the user via `POST /app/buy_extra` (3/10/50). **Total spendable = balance + extra.** Charging deducts `balance` FIRST, then `extra` (user request 2026-06-01); refunds restore `balance` up to the cap and any overflow lands in `extra` so a hold+refund cycle never loses a heart. New users are seeded `{balance:3, extra:0, held:0}` by `supabase/functions/user.ts`. The 3 (cap) and `0` (extra/held) literals MUST stay in sync across: the SQL helpers (`_credits_cap`, `_credits_default` — source of truth + enforcement), `mobile/src/lib/credits.ts` (`CREDIT_CAP`, display only), and the `defaultRelations` seed in `supabase/functions/user.ts`. Change them together. The earlier `free/pro` tier model (2026-05-17 → 2026-06-01) with `_credits_tier_cfg` / `_credits_reset_to_cap` is **dropped** (migration `drop_tier_add_extra_hearts`). The deployed mobile build's call to `POST /app/set_tier` is a NO-OP on the server — see BACKWARD_COMPAT.md "`app/set_tier` endpoint + `credits.tier` reads on the deployed mobile build" for the cleanup queue entry.

**Buy extra (SQL `app_buy_extra(me_id, p_count)` + `POST /app/buy_extra`).** Validates `p_count ∈ {3, 10, 50}` (the three options the mobile picker surfaces), adds `p_count` to `credits.extra` under FOR UPDATE, returns the standard `{user, notify:[]}` envelope. **The RPC validated the stale pre-launch set `{5, 10, 50}` from 2026-06-01 until 2026-07-19** (migration `app_buy_extra_accept_3`), so buying the only enabled option always returned `bad_count` / HTTP 400 — the client, the edge dispatcher and this RPC each carried their own copy of the option set and the RPC's copy was never updated. The mobile UI (`mobile/src/components/BuyExtraPopup.tsx`) currently labels all three options as **"Free"** and **only the 3-heart option is enabled** (10 / 50 render dimmed with a "coming soon" badge — `BUY_EXTRA_OPTIONS[].enabled` in `mobile/src/lib/credits.ts`). When real payments are wired up, receipt verification happens before this RPC is invoked (mobile-side or a separate edge function); the RPC itself stays pure heart-add. The picker is reachable from two places, both in settings since the 2026-07-19 redesign: the hearts popup's confirm button (`stars.popup.buyExtra` = "קניית לבבות אקסטרה"), and the **visibility row** when the user is hidden because they ran out of hearts — tapping it opens the picker instead of calling `app/free2`, which the dispatcher's auto-hide would undo in the same round trip (see "Auto-hide on zero hearts" below).

**Buy throttle: once per grant cycle, only when out (user request 2026-06-01).** Documented from 2026-06-01 but **only actually enforced from 2026-07-19** (migration `app_buy_extra_enforce_throttle`) — until then the live RPC was a pure heart-add with neither gate, and both lived only in the mobile UI, so any direct API call could top up without limit. `app_buy_extra` gates on TWO conditions:
- `_credits_total(rel) > 0` → `{error: 'has_credits'}`. Buying extras is a recovery mechanism, not a power-up — it's only available when the wallet is empty.
- `credits.bought_on = _credits_grant_day()::text` → `{error: 'already_bought_today'}`. Once a buy lands, the server stamps `bought_on` with the **live** grant day (not the user's stored `granted_on`, which can lag the per-minute cron by up to 60s). The gate flips clean at the 20:00 Asia/Jerusalem boundary regardless of cron latency.
On success the RPC writes BOTH `credits.extra += p_count` AND `credits.bought_on = _credits_grant_day()` in a single `jsonb_set` chain. `_credits_ensure` was updated to carry `bought_on` forward so the gate value survives every credits-subtree rebuild. The mobile client mirrors the gate via `buyExtraBlock(profile)` in `mobile/src/lib/credits.ts`, which returns the server's own error code (`'has_credits'` / `'already_bought_today'`) or null; `canBuyExtra` is `buyExtraBlock(...) === null`. The rule is `creditTotal === 0 AND credits.bought_on !== currentGrantDay(wallet)` — **total**, not extra-only: `canBuyExtra` checked `extra === 0` (ignoring the daily balance) until 2026-07-19, which would have let the picker offer a tap the newly-enforcing server rejects with `has_credits`. `BuyExtraPopup` labels the closed gate with the matching reason (`stars.buy.hasHearts` / `stars.buy.alreadyBoughtToday`). `currentGrantDay` is derived from `credits.next_grant_at` minus 24h, formatted in Asia/Jerusalem (mirrors `_credits_grant_day()`). The mobile UI uses it in two places: (a) the settings hearts popup hides the "buy extra" confirm button when `!canBuyExtra` (the sheet becomes purely informational); (b) the home `ViewersStatusCard` hides the in-card buy button when the user is auto-hidden-due-to-zero-hearts but already bought today, and instead appends a `home.watchingMeNoHeartsWait` line ("החבילה תתחדש {when}") under the existing subtitle so the user knows when they get hearts back.

**Auto-hide on zero hearts (dispatcher-level, 2026-06-01).** The edge dispatcher (`supabase/functions/app/index.ts → maybeAutoHide`) runs after every endpoint: if `balance + extra === 0` AND `page2.state === 'free'` AND not in chat, it fires `app_lock2` to flip the user hidden. Idempotent — `app_lock2` is a no-op when `page2.state ≠ 'free'`, so the check is cheap on most calls. Triggered specifically by `app_invite` (hold takes last heart), `app_approve` (charge from extra), and `app_add` (broadcast charge). On the mobile side this surfaces in `home.tsx`'s `ViewersStatusCard`: when `isHidden && outOfHearts` the hidden-state copy switches to `home.watchingMeNoHearts*` ("נגמרו לך הלבבות"), the "go visible" button is REPLACED by a "buy extra hearts" button (`stars.popup.buyExtra`) wired to `setBuyExtraOpen(true)`. After purchase the user has hearts again and the hidden card reverts to its normal "go visible" copy/button.

**Daily grant:** `app_credits_grant()` is called every minute by `/ext/cron` (alongside `app_expire_sweep`/`app_area_resync`). It is idempotent per grant day — the grant "day" is the date of the most recent **20:00 Asia/Jerusalem** boundary (`_credits_grant_day()`); a user is topped up at most once per grant day (rows where `credits.granted_on <> grant_day`). The grant tops `balance` up via `LEAST(cap, balance + cap)` — `extra` is preserved verbatim (purchased pool, not part of the daily replenishment cycle). It also writes `next_grant_at` (`_credits_next_grant_at()`, the next 20:00 Asia/Jerusalem as an absolute instant) so the client can show the next-grant time without any client-side timezone math. No push (silent top-up). The per-minute call updates 0 rows except on the first tick at/after 20:00.

**Costs (SQL `_credits_cost`):** `approve` 1, `broadcast` 1, `invite` 1, `cancel` 0. **Sending an invite costs 1 heart**, held server-side until the invite ends (see "Hold + refund / forfeit"). `app_invite` enforces a credit precondition under the FOR-UPDATE lock: `_credits_total(rel) < _credits_cost('invite')` → `{error:'no_credits'}` (HTTP 400), no state change. **Cancelling a sent invite is free in additional cost** but is the only exit that does NOT refund the held heart — it forfeits it (the heart "stays in the system"). The mobile client mirrors the precondition: the page1 "send invite" CTA is rendered `disabled` (no-op on press, no explainer popup) when `starsBalance < CREDIT_COST.invite` (where `starsBalance` is now `creditTotal(profile)`, i.e. `balance + extra`); the waiting-card cancel button carries no cost badge and is never disabled-on-balance.

**Broadcasting → accepting is free (user decision 2026-05-18).** While the approver is **currently broadcasting** (`relations.last_add_at` parses to a timestamp `> now() - interval '30 minutes'`, the same window as `app_add`), `app_approve`'s effective cost is **0**, not `_credits_cost('approve')` — the user already paid 1 star to broadcast, so receiving/accepting an invitation during that window costs nothing. Implemented as a local `v_approve_cost` in `app_approve` (computed once from the FOR-UPDATE-locked `me_row`) used for both the precondition balance check and the `_credits_charge`. Because a 0 cost can never fail the `balance < cost` guard, a broadcasting user can always accept. The mobile accept CTA mirrors this: `ReplyingInviteCard.costCredits = broadcastActive ? 0 : CREDIT_COST.approve` and `affordable = broadcastActive || …` — the `CreditCost` badge stays visible showing **0** (deliberately not hidden, so the user sees it's free). This adds **two more inline copies** of the 30-minute broadcast-window predicate (in `app_approve`, and the `others()` credits-gate exemption below) to the lockstep set in the "Broadcast relevance boost" sync note — change all of them together if the window ever changes. Additive / not breaking: `app_approve`'s response shape is unchanged; an older mobile build just renders the static "1" badge while the server charges 0 (cosmetic, self-corrects on app update).

**Hold + refund / forfeit.** Sending an invite reserves the inviter's 1 heart on the inviter's row (charge balance first, then extra; `held += 1`) via `_credits_hold(rel, amount)`. The reserved heart's fate depends on how the invite ends:
- **Every non-cancel exit refunds it** (`held -= 1`; restore to `balance` up to `_credits_cap()` = 3 first, overflow into `extra`): `app_decline` on the invitee side, `app_approve` on the inviter (B) side, `app_expire_sweep` in BOTH passes (inviter-driven and invitee-driven catch-all), `_kick_page1_at` when it transitions a `waiting` user to locked (matched elsewhere / kicked by mutual-match propagation), the mutual-match branch of `app_invite` (the *target's* held heart is refunded — A had no hold to refund), `app_logout_cleanup` (refunds anything still in `held`), and both admin release RPCs (`app_admin_release_page1` when releasing a waiting page1, `app_admin_release_page2` when releasing a pending page2). The invariant: at locked / locked rest state, `held = 0`.
- **`app_cancel` forfeits it** via `_credits_clear_hold(rel, _credits_cost('invite'))`: `held -= 1`, balance/extra unchanged. The heart is the user-visible cost of cancelling. `app_cancel` carries NO additional credit precondition (the spend already happened on send) and never charges 1 on top.

Helpers: `_credits_cap()` (constant 3, the daily pool ceiling), `_credits_balance(rel)` (the daily pool only), `_credits_extra(rel)` (the purchased pool only), `_credits_total(rel)` (balance + extra — the affordability check), `_credits_hold(rel, amount)` (charges balance-first-then-extra, then bumps `held` by the same amount), `_credits_refund(rel, amount)` (restores into balance up to cap, overflow into extra, decrements `held`), `_credits_clear_hold(rel, amount)` (held only — the cancel forfeit), `_credits_held(rel)` (reads `held`, 0 default), `_credits_ensure(rel)` (rebuilds the credits subtree, padding missing keys, stripping legacy `tier`).

Two non-credit-touching RPCs still preserve `credits` verbatim by carrying the blob forward: `app_pause` does a `jsonb_set` on `{page1}` only (so the held heart from a still-live waiting invite would not be cleared if someone could pause-from-waiting; in practice pause is only reachable from watching) and `app_resume` rebuilds via `_credits_ensure`.

**Findability gate.** `others()` drops any candidate whose `balance + extra < _credits_cost('approve')` (= 1) under `only_available` (the clause `app_find`/`app_add` always pass), so nobody is shown a user who can't afford to accept — **except a currently-broadcasting candidate**, who bypasses the balance gate (`NULLIF(other.relations->>'last_add_at','')::timestamptz > now() - interval '30 minutes'` OR `balance + extra >= cost`). Without this exemption a user who broadcast with their last star would sit at 0 spendable and vanish from the pool *during their own paid broadcast* — self-defeating, since broadcasting's whole purpose is to be found and invited (and their accept is free anyway). Additive/no-op for the deployed app (others() is internal-only; no output column changed).

**Preconditions / failure landings.** `app_invite` checks `_credits_total(rel) < _credits_cost('invite')` under the FOR-UPDATE lock and returns `{error:'no_credits'}` (HTTP 400) with **no state change** (the user stays in `watching`); the `page1=locked,message=invite` (`invite-fail`) landing remains for non-credit invite failures (target page2 not free, target mismatch under lock, etc.). `app_cancel` has **no credit precondition** (the heart was spent on send; cancelling forfeits it). `app_approve` `_credits_total(rel) < v_approve_cost` → `page2=locked,message=approve` (`approve-fail`); `app_add` `_credits_total(rel) < 1` → `{error:'no_credits'}` (HTTP 400). No new push codes.

**Relations-rebuild RPCs preserve credits.** `app_approve` (the inviter B side), `app_resume`, and `app_logout_cleanup` rebuild `relations` with `jsonb_build_object` and need to carry `credits` forward; `app_approve` (B) and `app_logout_cleanup` actively mutate `credits` (refund B's held heart / refund anything still held respectively), and `app_resume` carries it forward via `_credits_ensure`. `app_pause` no longer rebuilds `relations` at all (page1-only `jsonb_set`, see "Relations-rebuild RPCs also preserve the gate keys"), so `credits.held` survives by construction. New users are seeded `{balance:3, extra:0, held:0}` by `user.ts`; `granted_on`/`next_grant_at` fill on the next cron tick (≤60s); `_credits_ensure` defensively seeds any credit-touching RPC that meets a credit-less row (and pads missing `extra`/`held` to 0 + strips any legacy `tier` key without rebuilding the wallet from scratch).

**Relations-rebuild RPCs also preserve the gate keys (migration `pause_resume_keep_availability` `20260519140000`).** `app_pause` / `app_resume` previously rebuilt `me`'s `relations` carrying only `credits` — silently dropping `availability` and `push`. Bug: a gated user (push-blocked, or in only-disabled groups) who paused→resumed lost the gate (the mobile client defaults a missing `availability` to `available` ⇒ `geoGated=false` ⇒ the play button reappears, and the edge resume auto-find guard `availabilityState==='available'` also passes ⇒ candidates returned). Both now merge, on top of the page1/page2 skeleton, `jsonb_strip_nulls(jsonb_build_object('credits',…, 'availability', public.user_availability(me_id, location), 'push', relations->'push'))` — `availability` **recomputed** (the membership/push gate re-asserts immediately), `push` carried verbatim (`strip_nulls` ⇒ no `"key":null` when absent). Same discipline `app_admin_reset` already follows. Additive / response shape unchanged. (`app_approve`/`app_logout_cleanup` end the user in chat/logged-out states where the gate is moot, so they were left as-is; revisit if a gate-relevant rebuild is added there.) **Update 2026-05-22:** `app_pause` no longer rebuilds `relations` at all — it now does a page1-only `jsonb_set` (migration `20260522040000_app_pause_keep_visibility`), which preserves `availability`/`push`/`credits`/`page2` verbatim by construction, so this gate-key concern now applies only to `app_resume`. (The earlier `join_request` field was retired 2026-05-25 alongside the join-request flow itself.)

**Admin reset zeros the wallet.** All three `app_admin_reset*` RPCs — `app_admin_reset()` (global no-arg), `app_admin_reset(p_group_ids uuid[])` (role/group-scoped, the web reset-popup entry point), and `app_admin_reset_user(p_user_id)` (per-user "Danger zone") — rebuild `relations.credits = _credits_default()` = `{balance: _credits_cap()=3, extra: 0, held: 0, granted_on:<grant day>, next_grant_at:<next 20:00>}`. **Both pools are wiped**: a user with purchased `extra` hearts loses them on reset (user decision 2026-06-01: clean slate). `app_admin_reset*` is admin/service-role only (web admin → `resetUsersByRoles` / the user-detail Danger zone); mobile never calls it, so this is additive / not breaking.

**UI.** The cost rides as an in-button badge (`CreditCost`: a rounded capsule with a heart glyph and the number) in place of the old icon: the page1 "send invite" prompt and the page2 approve accept CTA (both `ReplyingInviteCard`) and the broadcast confirm popup (via `ConfirmDialog.confirmIconStart`, a deliberate opt-in exception to the "buttons carry no icon" rule). **The page1 "send invite" badge reads "1"** — sending an invite costs 1 heart (held server-side until the invite ends; see "Hold + refund / forfeit"). The waiting-card cancel button (`InviteTimerCard`) carries **no badge** — the heart was already spent on send, cancelling adds no new cost (it only forfeits the held heart, which the user sees via the unchanged balance). **Unaffordable actions disable their button** — there is no "not enough hearts" explainer popup: when the user can't cover an action's cost the relevant button renders `disabled` (faded, no-op on press). For **invite** that is the page1 `ReplyingInviteCard` send CTA (`affordable = creditTotal(profile) >= CREDIT_COST.invite`); for **approve** the page2 `ReplyingInviteCard` accept CTA (`affordable = creditTotal(profile) >= CREDIT_COST.approve`). Broadcast was retired from the client on 2026-07-19, so its confirm popup and the "broadcasting makes approve free" client branch are gone — the server still charges 0 inside its 30-minute window, so an in-flight broadcaster sees a "1" badge and is charged nothing until the window lapses. **The hearts count is no longer shown on home at all** (it was the Menu tab's sub-label); the wallet is displayed only in settings. **Settings hearts row**: same `{balance} + {extra}` format in the value column (collapses to bare balance when extra = 0), with the next-grant time as the subtitle. **Settings hearts popup** (`stars.popup.*`): explains balance + extra + next grant, and its single confirm button (`stars.popup.buyExtra` = "קניית לבבות אקסטרה") opens `BuyExtraPopup`. The popup is reusable — `home.tsx` also mounts it for the out-of-hearts auto-hide flow (see "Auto-hide on zero hearts" above).

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
| `birth_date` | date | |
| `age_from` / `age_to` | smallint | preferred age range |
| `range` | integer | preferred max distance (meters) |
| `location` | geography (PostGIS) | `SRID=4326;POINT(lng lat)` |
| `is_test` | boolean | not null default `false`. **Test-environment partition flag.** A test user is matchable ONLY with other test users; a normal user ONLY with normal users. Enforced by a single unconditional clause in `others()` — see "Test-user matching partition". Set per-user or in bulk from the web admin; never read by the mobile app. |
| `data` | jsonb, default `{}` | Flat profile fields: `images: Image[]`, `bio?: string`, `family?: FamilyData` (`{hasKids, kids?, schedule?, isForKids?}`). Plus `weekStart`, `os`, `lang`, `appearance`, `push_token`, `role`, `location_type`, `location_custom`, `location_label`. Distance unit is no longer stored: the client derives it from device locale (`getLocales().regionCode`); see `mobile/src/lib/units.ts`. Legacy `data.units` may exist on rows written by older builds and is ignored. `location_type: 'device' \| 'home' \| 'work'` is the anchor the stored `location` point represents. `location_custom: boolean` is the legacy pre-typed flag kept in sync (`home`/`work` ⇒ `true`, `device` ⇒ `false`) for backward compat with mobile builds that predate `location_type`; rows last written by such a build carry only `location_custom` and `location_type` is derived as `home` when `location_custom=true`, else `device`. `location_label: string \| null` is the human-readable address for `home`/`work` (null for `device`). While `location_type ≠ 'device'` (≡ `location_custom=true`) the client suppresses location permission prompts and skips periodic GPS updates (the `location` column is whatever was last written from the manual pick). |
| `relations` | jsonb | `Pages` (see Game Logic) plus a top-level `last_add_at` (ISO timestamp; 30-minute cooldown for the page2 "Show me to people" / broadcast button — see `app_add`), a top-level `availability` (geo-gate state; see "Geo-availability gate" below), a top-level `credits` (`{balance:int, extra:int, held:int, granted_on:'YYYY-MM-DD'\|null, next_grant_at:timestamptz\|null, bought_on?:'YYYY-MM-DD'\|null}` — no `tier` field after 2026-06-01; `bought_on` is the grant-day of the last `app_buy_extra` call, driving the "once per grant cycle" throttle; see "Credits economy" below), and a top-level `push` (`{perm?:'granted'\|'denied'\|'undetermined', token?:bool, dead?:bool, checked_at?:timestamptz}`; notification-presence signal, see "Notification-presence gate" below). Source of truth for page1/page2. |

**RLS (migration `users_admin_select_policy`):** RLS is enabled; `users` is in the `supabase_realtime` publication. Permissive policies: `owners` (`SELECT` to `authenticated` where `auth.uid() = user_id` — a user reads only its own row; this is what the mobile app's self-row Realtime subscription relies on), `block` (no-op `false`), and `admins read all` (`SELECT` to `authenticated` where `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'`). The admin policy is what lets the web admin panel's **browser** Realtime subscription receive `postgres_changes` for every user row (server-side admin queries use the service role and bypass RLS). `app_metadata` is signed into the JWT by the service role and cannot be forged by a client, so this is safe and additive (non-admin JWTs are unaffected — still own-row only).

**Removed columns (migration applied):** `state`, `other_id`, `is_visible`, `is_avaliable`, `is_for_kids` are gone. The "wants own (more) kids" preference now lives inside `data.family.isForKids` so all kids-related state is captured in one blob. `users.name` is a regular text column (was generated). `data->>'name'` removed. `data.items` (the previous unified ProfileItem array model) was flattened back into `data.images`, `data.bio`, `data.family` and removed.

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
| `key` | text | reason. Cooldown duration depends on the key (see table below). |

Keys and per-event cooldown durations:
- `ignore` — passive skip → cooldown **24h**
- `cancel` — A cancelled an outgoing invite to B → cooldown A→B **24h**
- `remove` — B removed viewer X → cooldown B→X **24h**
- `decline` — B declined A's incoming invite → cooldown B→A **7 days**
- `leave` — chat ended by one side → cooldown **14 days**
- `block` — hard block, **permanent** (no expiry)

The `others` RPC implements per-key durations: `(key='ignore' AND created_at > now() - interval '1 day') OR (key='cancel' AND ...) OR (key='remove' AND ...) OR (key='decline' AND created_at > now() - interval '7 days') OR (key='leave' AND created_at > now() - interval '14 days') OR key='block'`.

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
| `schedule` | jsonb, nullable | Snapshot of the sender's kid schedule at send time: `{anchor: "YYYY-MM-DD" (Sunday), weeks: boolean[w][7]}`. Same shape as `data.family.schedule`. Frozen — later edits to the sender's profile schedule do not change historical chat messages. Server only accepts schedule messages from senders whose `data.family.hasKids === true` and whose schedule has at least one week with at least one marked day. |
| `is_event` | boolean, nullable | true for system event rows |

Storage bucket: `chat-images` (images). Storage bucket: `chat-audio` (voice messages, 10 MB limit, m4a/mp4/aac/mpeg). Both private; same upload/read policy pattern as chat-images. (private, 5 MB limit, jpeg/png/webp). Upload policy: authenticated users may only write to their own folder (`storage.foldername(name)[1] = auth.uid()`). Read policy: uploader or any user referenced in `chat.user_id`/`chat.other_id` for that key.

### `chat_reads` (durable read receipts; migration `20260705000000_chat_reads.sql`)

Durable per-(reader, peer) read-receipt store — the async backstop for the ✓✓ "read" indicator, which until now travelled **only** over ephemeral Supabase Realtime Presence. The sender could observe the receipt **only if subscribed to the presence channel at the exact moment the reader read**; nothing was persisted, so if the two users were never online in the chat simultaneously after the read, the receipt was lost and the sender's messages stayed at single-✓ "sent" forever even though the recipient genuinely read them (the app opens straight onto the chat). Presence remains the live fast-path; this table survives disconnection.

A row means: **`reader_id` has read `peer_id`'s messages up to `last_read_at`.**

| Column | Type | Notes |
|---|---|---|
| `reader_id` | uuid | who did the reading (`auth.uid()` on write) |
| `peer_id` | uuid | whose messages were read (the partner) |
| `last_read_at` | timestamptz | newest partner-message timestamp the reader has seen |
| `updated_at` | timestamptz | default `now()`; stamped by the monotonic trigger |

Primary key `(reader_id, peer_id)`. Index `chat_reads_peer_idx on (peer_id)` (the sender-side "who has read MY messages" lookup, `peer_id = me`).

- **Monotonic clamp:** BEFORE INSERT/UPDATE trigger `chat_reads_monotonic` (`_chat_reads_monotonic()`) — a regressing `last_read_at` on UPDATE is clamped to the stored value, so out-of-order writes (races between presence retrack, the foreground poll, and the durable upsert) can never move the ✓✓ boundary backward. Also stamps `updated_at = now()`.
- **RLS (enabled):** three `to authenticated` policies. SELECT `reader_id = auth.uid() OR peer_id = auth.uid()` (a user reads their own read-state or rows where someone read **their** messages — the `peer_id = auth.uid()` branch is what authorizes the sender's Realtime subscription and drives the sender's ✓✓). INSERT / UPDATE `reader_id = auth.uid()` (a user may only assert their **own** reads). anon has no policy ⇒ fully blocked. Grants reset to the minimum (anon: none; authenticated: select/insert/update), matching the `chat` table's anon revoke.
- **Realtime:** in the `supabase_realtime` publication. The sender subscribes `postgres_changes` INSERT/UPDATE filtered `peer_id=eq.<self>`, checks `reader_id === partner`, and max-merges `last_read_at` into the ✓✓ boundary.
- **Client (mobile [chat.tsx](mobile/app/chat.tsx)):** the reader fire-and-forget upserts `{reader_id, peer_id, last_read_at}` (onConflict `reader_id,peer_id`) whenever the latest partner-message timestamp advances while the chat is active (independent of presence readiness); the sender seeds the boundary from the partner's row on open (`select … where reader_id=partner and peer_id=self`) and keeps it live via the Realtime subscription. All merges are monotonic-max, so presence and the durable path compose without conflict.
- **Additive / not breaking.** New table + new client code. Old mobile builds never read/write it and keep using presence-only (unchanged degraded behaviour, same as before). No server contract changed ⇒ no BACKWARD_COMPAT entry. A new-build sender paired with an old-build reader simply gets no durable receipts from that reader until they update — identical to today.

### `areas` (geo-availability zones; admin-managed)

Admin-defined geographic zones that gate where the app is usable. Managed from the web admin (`/areas`). No RLS policies — service-role only (edge function + web admin). Read model `public.areas_list` (a `security_invoker` view) explodes `center` into `lat`/`lng` for the dashboard; writes go to this base table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | default `gen_random_uuid()` |
| `created_at` | timestamptz | default `now()` |
| `label` | text | human-readable address/name (from the Google Places pick or manual) |
| `center` | geography(Point,4326) | zone centre; inserted as EWKT `SRID=4326;POINT(lng lat)` |
| `radius_m` | integer | zone radius in meters (`> 0`) |
| `starts_at` | timestamptz | when a `scheduled` zone goes live; default `now()`; ignored for `active`/`disabled` |
| `mode` | text | **source of truth**, one of `active` (live now, ignores `starts_at`), `scheduled` (goes live at `starts_at`), `disabled` (ignored). default `scheduled`, CHECK-constrained. |
| `enabled` | boolean | **transitional mirror** of `mode <> 'disabled'`, written by the web actions only so the pre-mode web build's `areas_list.enabled` read keeps working. Not read by `area_state`. See BACKWARD_COMPAT.md. |

Indexes: GIST on `center` (`areas_center_gix`); partial index on `mode` (`areas_mode_idx`, where `mode <> 'disabled'`).

### Web admin routing (2026-05-25 — dropped `/admin` prefix)

The web app no longer has an `/admin/*` URL prefix. The root `/` is auth-aware:

- **Signed-OUT visitors** at `/` → the middleware (`web/src/proxy.ts`) rewrites to the static marketing site at `/public/index.html`. The marketing page header carries a **"Login" link** (id `login-link`) that goes to `/login`; the JS dict has a `login` field per language (he/en/ru) and the page sets the link text at language-switch time.
- **Signed-IN visitors** at `/` → the middleware lets the request through to Next. `[lang]/page.tsx` (the dashboard, formerly `[lang]/admin/page.tsx`) renders the panel. The dashboard's `requireViewerScope()` then admits admins and group managers; anyone else is bounced to `/login?error=not_admin` after sign-out.

Panel sub-routes are at the **top level** of `[lang]/`: `/users`, `/users/[userId]`, `/users/[userId]/with/[otherUserId]`, `/groups` (renamed from `/admin/roles`), `/groups/[groupId]`, `/areas`, `/reports`, `/login`. The middleware's `PROTECTED_PREFIXES` list — `["/users", "/groups", "/areas", "/reports", "/map"]` — gates each one: a signed-out visit redirects to `/login?next=<intended>`. `/login` and `/auth/*` are intentionally public. `/privacy`, `/terms`, `/child-safety`, `/download` continue to rewrite to their static HTML in `/public`.

The IBM Plex Sans Hebrew font that used to live on `[lang]/admin/layout.tsx` was folded into `[lang]/layout.tsx` (the admin layout file was deleted) — every Next-rendered page in this app is the panel now, so a single root layout is enough. The static marketing site at `/index.html` carries its own typography and never reaches the Next layout.

When the URL prefix was dropped, the panel folder `[lang]/admin/roles/` was simultaneously **renamed to `[lang]/groups/`** so the user-facing "Groups" / "קבוצות" terminology matches the URL (see the "Naming" note in `roles` below for what stayed on the DB/RPC side).

### `groups` (group catalog; admin-managed) + `user_groups` (membership)

Admin-managed group system. Managed from the web admin (`/groups` for the catalog; the per-user checklist on `/users/[userId]`). No RLS policies on either table — service-role only (edge function + web admin), identical pattern to `areas`. Independent of the legacy free-form `users.data.role` string (only ever set to `'TEST'` by the seed script, read by nothing) — that field is left untouched and is **not** the source of truth here.

**Naming (updated 2026-05-25):** the whole stack now uses **"group"** end-to-end — DB tables (`groups`, `user_groups`, `group_managers`), RPCs (`app_my_groups`, `app_leave_group`, `app_redeem_invite`, `is_group_manager`, `managed_group_ids`), server actions (`setUserGroupAssignment`, `createGroup`, `renameGroup`, `deleteGroup`, `regenerateInviteCode`), components (`GroupsManager`, `UserGroupsEditor`, `UserGroupsChips`, `GroupInviteCode`, etc.), URL routes (`/groups`, `/groups/[groupId]`), URL params (`?group=`), AdminNav `active` key, and i18n key paths (`admin.groups`, `admin.userDetail.groups`). The earlier "deliberate naming mismatch — do not rename" rule from May 17–19 was overridden by user decision 2026-05-25. The only "role"/"role*" tokens that legitimately survive are (a) `app_metadata.role='admin'` (the Supabase auth JWT field; unrelated concept), (b) `users.data.role` (the legacy free-form text seed field, also unrelated), and (c) historical migration files (`20260517220000_roles_model_and_availability.sql` etc. that pre-date the rename and document the original state — those are history and must not be retroactively edited).

`public.groups`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key, default `gen_random_uuid()` |
| `created_at` | timestamptz | default `now()` |
| `name` | text | **unique**, not null |
| `invite_code` | text | not null, unique. 6-digit code shared by managers / admins; users redeem via `/app/redeem_invite` (`app_redeem_invite`) to join, regenerated via `app_regenerate_invite_code`. Auto-filled on insert by the `groups_fill_invite_code` BEFORE INSERT trigger (`_group_fill_invite_code()` → `_group_generate_invite_code()`) when null/blank, so a plain `INSERT (name)` from the web admin `createGroup` action gets a code without the caller supplying one (an explicitly-passed code still wins). Added 2026-06-04 (migration `groups_auto_invite_code`) — before it, `createGroup` failed the NOT NULL constraint and the admin "add group" form surfaced a Server Components render error. |

> **`groups.enabled` was REMOVED again 2026-07-19** (migration `20260719000000_test_user_partition`), this time for good. Group membership does **not** gate availability: every group is active and a group is organisational only. Isolating a set of users is now done with the per-user `users.is_test` flag (see "Test-user matching partition"), which actually isolates rather than switching users off. The `group_blocked(uid)` and `in_enabled_group(uid)` helpers are dropped, as are the `setGroupEnabled` server action and the whole enable/disable admin UI. History: introduced 2026-05-19, removed `20260525050000_drop_group_disable`, restored `20260526020000_restore_group_disable_gate`, removed here.

`public.user_groups` (many-to-many; a user may hold several groups — the admin UI is a checklist):

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | not null, FK → `users(user_id)` **ON DELETE CASCADE** (deleting a user cleans up assignments) |
| `group_id` | uuid | not null, FK → `groups(id)` **ON DELETE CASCADE** (deleting a group now drops every membership row first via the web action; no FK restriction is needed) |
| `created_at` | timestamptz | default `now()` |

Primary key `(user_id, group_id)`. Index `user_groups_group_idx` on `(group_id)` (membership counts).

### Permissions module — RETIRED 2026-05-25

The earlier `permissions` catalog + `group_permissions` mapping (shipped 2026-05-23) and the `owner` gate (shipped 2026-05-24) were **removed wholesale** at the user's request: *"לקבוצה אין הרשאות מקושרות. ההרשאות היחידות שיש בתוך קבוצה היא המנהלים של הקבוצה"*. The only role concept inside a group is now the per-user `group_managers` row (see "`group_managers` — per-user, per-group manager promotion" below).

Migration `20260525030000_drop_permissions_catalog` drops both tables and the `user_has_permission(uuid, text)` helper. The `setGroupPermission` server action and `web/src/app/[lang]/groups/[groupId]/_components/GroupPermissions.tsx` were deleted; `getOwnerUser` / `userHasPermission` were removed from `web/src/lib/admin-auth.ts`. The admin gate stays JWT-based (`app_metadata.role='admin'`) exactly as before — it never went through these tables.

### `group_managers` — per-user, per-group manager promotion (2026-05-25)

`public.group_managers`:

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | not null, FK → `users(user_id)` **ON DELETE CASCADE** |
| `group_id` | uuid | not null, FK → `groups(id)` **ON DELETE CASCADE** |
| `granted_at` | timestamptz | not null, default `now()` — drives the management-seniority ordering on the group's member list (managers listed first by earliest grant) |

Primary key `(user_id, group_id)`. Index `group_managers_group_idx` on `(group_id)`. RLS enabled, **no policies** → service-role only (admin web actions write here; nobody else). In `supabase_realtime` publication so the admin `RealtimeRefresh` listener (`tables="user_groups,groups,group_managers"` on group detail) re-fetches on promote / demote.

Constraints (enforced via triggers):
- `_gm_ensure_member()` BEFORE INSERT/UPDATE — a manager must already be a member of the group they manage (no composite FK to `user_groups` available, so a trigger is the backstop).
- `_gm_cascade_on_membership_remove()` AFTER DELETE on `user_groups` — removing a membership auto-revokes the manager grant for that pair (otherwise an orphan row would persist that the member-check would reject on every subsequent update).

Helpers (all `SECURITY DEFINER`, EXECUTE revoked from anon/authenticated):
- `public.is_group_manager(p_user_id uuid) → boolean` — true iff the user holds ≥1 manager row.
- `public.managed_group_ids(p_user_id uuid) → uuid[]` — group ids in seniority order (oldest grant first).
- `public.managed_user_ids(p_user_id uuid) → uuid[]` — union of members across every group this user manages.

**Web auth gate (`web/src/lib/admin-auth.ts`).** Two viewer roles are recognised:
- `kind:'admin'` — JWT `app_metadata.role='admin'`. Full power. Sees every tab, can mutate everything.
- `kind:'manager'` — has ≥1 row in `group_managers`. **View-only**, scoped to the union of users in any group they manage. May promote a fellow member of one of their managed groups to `group_manager` (the only write they can do).

The new helpers are `getViewerScope()` (returns `{user, kind:'admin'} | {user, kind:'manager', groupIds, userIds} | null`), `requireAdminUser()` (admin-only screens & server actions), and `requireViewerScope()` (screens managers are allowed to see). Legacy `getAdminUser()` is kept and now delegates to `getViewerScope` returning the admin branch or null. Mutations gate on `getAdminUser()` exactly as before; `promoteGroupManager(fd)` is the one exception — it accepts admin OR manager-of-the-target-group.

**Promote / demote actions** live in `web/src/app/[lang]/groups/actions.ts`:
- `promoteGroupManager(fd)` — `{groupId, userId}`. Allowed by admin (anywhere) and by an existing manager of THAT group. Idempotent upsert (`onConflict:'user_id,group_id', ignoreDuplicates:true`) so re-promote is a no-op and `granted_at` never resets — seniority is stable.
- `demoteGroupManager(fd)` — admin-only by design ("מנהל קבוצה יכול לגרום…" only grants promote, never demote — explicit user decision to avoid peer power struggles).

**Cross-screen scope.** Manager visibility is enforced at the page level:
- `/users` (list) — every query intersects with `secondary.scopeUserIds` (`scope.userIds` when manager, null when admin). Empty managed set → returns zero rows via `NO_MATCH_ID`. The role-filter dropdown's catalog is also clipped to the manager's managed groups.
- `/users/[userId]` — 404 if the target isn't in `scope.userIds`. Inside the page the danger zone, group-chip editor and page-release badges receive `readOnly` and render inert for managers.
- `/groups` (list) — query is restricted via `.in("id", scope.groupIds)`. `RolesManager` is rendered with `readOnly` (no checkbox, no bulk-action bar) and the "create group" form is hidden.
- `/groups/[groupId]` — 404 if not in `scope.groupIds`. Members are server-sorted **managers first** (by `granted_at` asc), then non-managers by name. `GroupHeader` and `GroupDangerZone` are hidden / inert for managers. `GroupMembers` receives `canMutate` (admin only), `canPromote` (admin OR manager-of-this-group), `canDemote` (admin only) and renders the manager badge + promote/demote chips per row.
- `/`, `/areas`, `/reports` — admin-only; managers are redirected to `/users`.

**Nav tabs.** `AdminShell` resolves the scope and passes `visibleKeys` to `AdminNav`: admins see all tabs, managers see only `users` + `roles`. Pure UX — the security gate is per-page.

**Login flow.** `/login` now branches on `getViewerScope()`: a signed-in admin redirects to `next`, a signed-in manager always redirects to `/users` (their only landing screen — defensive against a deep-link `next` pointing at an admin-only surface), neither → sign out + `?error=not_admin`. Replaces the older "JWT admin or bust" check that loops a non-admin Google sign-in forever.

### Per-group invite codes (2026-05-25)

A 6-digit code per group that managers / admins share verbally. The recipient installs the app via the generic install link (no per-group deep link) and enters the code from the settings "My groups" sheet — joining is **additive** (a user may be in any number of groups), and the operation is idempotent.

DB:
- `groups.invite_code` (text NOT NULL, UNIQUE) — backfilled with a random 6-digit code for every existing group at migration time.
- `public._group_generate_invite_code() → text` (SECURITY DEFINER, EXECUTE revoked) — generates a unique 6-digit code with a retry loop (up to 100 attempts, raises on exhaustion). Used by the migration backfill and `app_regenerate_invite_code`.
- `public._my_groups(me_id uuid) → jsonb` (`sql stable`, SECURITY DEFINER, EXECUTE revoked) — emits the caller's group memberships as `[{id, name}, ...]` sorted by name. Embedded as a `groups` sidecar in every group-mutating / reading RPC so the mobile client gets a fresh list in one round trip.

RPCs:
- `public.app_redeem_invite(me_id uuid, p_code text) → jsonb` — `{user, notify:[], groups}` on success; `{error:'invite_invalid'}` for malformed (`^[0-9]{6}$` only) or unknown codes. Idempotent: re-redeeming the same code on an existing membership succeeds. Inserts the `user_groups` row and recomputes `relations.availability` (no-op under the current "groups don't gate" rule, but kept as the single availability writer). Not in `requiresPresence` — a gated user can still redeem.
- `public.app_leave_group(me_id uuid, p_group_id uuid) → jsonb` — `{user, notify:[], groups}`. Idempotent (leaving a group you're not in is a no-op success). The existing `_gm_cascade_on_membership_remove` trigger cascades any `group_managers` grant tied to this membership.
- `public.app_my_groups(me_id uuid) → jsonb` — read-only, same envelope `{user, notify:[], groups}`. Powers the initial fetch in the settings "My groups" sheet.
- `public.app_regenerate_invite_code(p_group_id uuid) → jsonb` — SECURITY DEFINER, EXECUTE revoked. Mints a new unique code (invalidating the old one) and returns `{group_id, invite_code}` or `{error:'group_not_found'}`. Triggered exclusively by the web admin (`regenerateInviteCode` server action) which gates on **admin OR group manager of `p_group_id`** before invoking via the service-role client.

Endpoints (dispatcher cases in `supabase/functions/app/index.ts`):
- `POST /app/redeem_invite { code: "123456" }`
- `POST /app/leave_group { group_id: "<uuid>" }`
- `POST /app/my_groups`

All three set the `rpcGroups` sidecar in the dispatcher, which merges into the standard user-shaped response body as `{...user, groups: [...]}` via `log.success`. The deployed app's `applyServerUser` ignores extra fields, so this is additive / not breaking.

Admin UI (`web/src/app/[lang]/groups/[groupId]/_components/GroupInviteCode.tsx`):
- Renders the current `invite_code` in a big LTR monospace block + a "Copy" button (`navigator.clipboard.writeText`, "Copied" feedback for ~1.8s).
- A "Regenerate code" button (admin OR group manager of this group) opens a confirm dialog and calls `regenerateInviteCode(fd)` → `app_regenerate_invite_code` via the service-role client. The new code updates in place via the action's return value; `revalidatePath` covers the next render.
- Lives in its own `Section` between `GroupHeader` and the members list. `groups.invite_code` is fetched in the page's groups query.

Mobile (onboarding):
- **Onboarding does NOT ask for an invite code** (user decision 2026-07-20). It was step 6 of 6 from 2026-05-25 until then; that screen, the `ob.invite*` i18n keys and the redeem call inside `finishOnboarding` are deleted. Onboarding is 5 steps (gender → name → birthdate → photos → bio) and joining a group is a settings-only action. Do not reintroduce it without an explicit new decision.
- `finishOnboarding` (now fired from step 5, the bio step) order: flush photo uploads → `/app/profile { bio }` → `useUserStore.update({ bio })`, which is what `_layout.tsx` watches to redirect to `/home`. Bio is still held in local state and saved only here, so a mid-flow relaunch re-enters onboarding rather than routing to home with an incomplete profile.

Mobile (settings):
- "My groups" row sits in the `accountLinksCard` directly under the Account row, with a `GroupsIcon` (two silhouettes — distinct from `UserIcon` on the Account row).
- Tap opens `GroupsPopup` (`BottomSheet`). On open it fetches `/app/my_groups`; the list shows one row per group with the group name and a trash-icon leave button (no confirm — the action is reversible if the user still has the code). Below the list, a 6-digit input + "Join" button calls `/app/redeem_invite`. Both mutations consume the returned `groups` sidecar so the list updates in one round trip per action.
- Empty state copy: `settings.groupsEmpty` ("You haven't joined any group yet."). i18n keys live under `settings.groups*` in `mobile/src/i18n/{he,en}.ts`.

Not breaking:
- Old mobile builds never call the new endpoints and ignore the new `groups` sidecar on existing endpoint responses.
- Groups have no `enabled` column (dropped for good 2026-07-19) — the redeem RPC has nothing to filter by. Every group is joinable.

**Admin user filter by role.** The users dashboard advanced filters include a Role select alongside page1/page2 state. `?role=` is a role uuid (restrict to its members via `.in(user_id)`), the sentinel `__none__` ("No role" / `filterRoleNone` — users with no `user_roles` row, applied as `.not(user_id,in,…)`), or empty (any). Every filter option (and the "any" option) shows a global `(n)` facet count and the options are ordered by that count descending; the counts come from one RPC `public.admin_user_facet_counts() → jsonb` (`{total, groups_none, p1:{state:n}, p2:{state:n}, groups:{group_id:n}, avail:{state:n}, tier:{free|pro:n}, seg:{seg:n}}`, `sql stable security definer`, EXECUTE revoked from anon/authenticated — admin/service-role only, same pattern as `app_admin_reset`). EVERY filter dropdown and every option in it carries a global `(n)`: p1/p2/groups are ordered by count descending; avail/tier/seg carry their `(n)` too but stay in declared order (the seg recency buckets read better chronologically). The avail/tier/seg counts mirror `applySecondary()` 1:1 (today = 00:00 Asia/Jerusalem via SQL `date_trunc … at time zone`; online 5m / 7d / 30d / broadcast 30m windows; tier `free` folds null; avail `unknown` = state null; `test`/`not_test` = `users.is_test`). The role-scoped reset popup (`ResetAllButton`) exposes explicit **select-all** and **deselect-all** actions over the role checklist.

**Helpers:**

- `public.user_availability(uid uuid, loc geography) → jsonb` — **single source of truth** for a user's effective availability. **Live precedence (2026-05-31, after geo-gate restoration — migration `restore_geo_gate`):**
  1. `push_blocked(uid)` ⇒ `{state:'unavailable', reason:'push'}`.
  3. `area_state(loc)`:
     - `loc IS NULL` (onboarding / pre-permission) ⇒ `{state:'available'}` — the only non-gated escape hatch, so onboarding & profile setup work in every location state.
     - Inside an `active` area, OR a `scheduled` area whose `starts_at <= now()` ⇒ `{state:'available'}`.
     - Inside a `scheduled` area whose earliest matching `starts_at` is in the future ⇒ `{state:'not_yet', starts_at:…, reason:'geo'}`.
     - Otherwise (located but outside every active/scheduled area; or no areas exist) ⇒ `{state:'unavailable', reason:'geo'}`. Default-DENY: with no active/scheduled areas, every located user is `unavailable`.

  All three gates compose in a single short-circuit chain — first failure wins, `reason` records which one fired. The `area_state` SQL is unchanged from the original 2026-05-19 incarnation; what was rewired is `user_availability` itself.

Every site that persisted availability into `relations.availability` still calls `user_availability(user_id, location)` — same single helper. `others()` carries the `push_blocked` candidacy clause + the `is_test` partition clause + the preserved credits clauses. Group mutations no longer fire `triggerResync` — membership is organisational and gates nothing. The `/functions/v1/ext/resync` endpoint and the per-minute cron `app_area_resync` are the safety net for any transition the synchronous push doesn't cover (push-presence flips Expo doesn't deliver synchronously, plus the eventual `not_yet`/group-enable / scheduled-area-launch race conditions).

**Test-user matching partition (2026-07-19)** (migration `20260719000000_test_user_partition`). Supersedes the group-membership gate, which was removed in the same migration. `users.is_test` splits the matching pool into two mutually exclusive environments:

- a **test** user is matchable ONLY with other test users;
- a **normal** user is matchable ONLY with normal users.

Symmetric by construction — an equality partitions the set, so neither direction can leak. The purpose is running tests against production with real accounts without exposing testers to real users or vice versa. The old mechanism (disable the group ⇒ `group_blocked` ⇒ `unavailable`) did not isolate, it switched users off: members of a disabled group could not play at all.

Wired through:
- `public.users.is_test boolean not null default false` — the flag. `NOT NULL DEFAULT false` makes the partition total by construction: there is no third "unknown" bucket that could leak either way. Partial index `users_is_test_idx ON users (is_test) WHERE is_test` covers the small, selective side.
- **`public.others()` is the ONLY enforcement point**, via the clause `AND other.is_test = COALESCE((me).is_test, false)` placed immediately after the distinct-from-me predicate. It is deliberately **NOT** wrapped in the `NOT only_available OR …` shape the gate clauses use: those are availability gates, this is an identity property, so it must hold for every caller including `only_available = false`. Because `app_find` / `app_add` / `app_seed_viewer` all pick candidates exclusively through `others()`, this single clause covers every match path and none of the three RPCs needed a change. The return type is unchanged ⇒ `CREATE OR REPLACE`, no DROP+recreate.
- `is_test` is deliberately **not** an input to `user_availability`: a test user is fully `available`, just inside a different pool. Nothing in the mobile gate UI reacts to it.
- **Flipping the flag releases both pages.** `others()` governs future candidate selection only, so a user flagged mid-watch / mid-invite / mid-chat would keep a link that now straddles the two pools. Both the per-user and the bulk admin paths call the existing `app_admin_release_page1` + `app_admin_release_page2` after the flip; those are state-aware and repair the counterparty (detach from the watched user's `page2.profiles[]`, close a pending invite, end a chat, kick viewers, refund held hearts). No new SQL.
- `app_review_seed` sets `is_test = true`, so the app-store reviewer plays inside the curated test pool (user decision 2026-07-19). Its old tail joined a group literally named `'בדיקה'`, which never existed (the live group was `'בדיקות'`), so that block had always been a no-op.
- **Admin KPIs exclude test users** (user decision 2026-07-19). `admin_dashboard_metrics`' `blocked` CTE — which previously excluded `group_blocked` users from every KPI and from the 7-day funnel — now selects `WHERE u.is_test`. Same mechanism, new predicate.
- Web admin: per-user toggle (`UserTestToggle`, in the identity card's badge row on `/users/[userId]`) and a bulk pair of actions (`markTest` / `unmarkTest` in `UserActionMenu`, reaching `bulkUserAction` via `{kind:'setTest', value}`). Both go through the shared `flipTest()` helper in `web/src/app/[lang]/users/actions.ts` — one set-based `UPDATE … .in('user_id', ids)`, no RPC, no per-user loop. The users list gained `?seg=test` / `?seg=not_test` (folded into `seg` rather than promoted to its own dropdown, since `SearchControls`' URL writer is hand-written per param) with matching `admin_user_facet_counts` `seg.test` / `seg.not_test` counts, and a `busy`-toned badge on the user card.
- Migration data step: members of the disabled groups "גוגל ואפל" (10) and "בדיקות" (41) were flagged — 51 users, 0 overlap, out of 96 — and both groups were then deleted. Those 51 were exactly the pre-existing `group_blocked` population, so the dashboard totals were unchanged by the swap. The migration asserts the count, asserts each function-body patch anchor, and ends by asserting full disjointness across the live pool (`0 leaks across 589 pairs`); any failure rolls the whole thing back.

**Not breaking** for the deployed mobile build: `others()` is internal-only, the app never reads the column, and no response shape changes. The one visible effect is `"is_test": false` riding along in the `row_to_json(u)` user object every `app_*` RPC returns — the "new field in a blob" case old clients ignore (see "Safe by default"). No `BACKWARD_COMPAT.md` entry.

**Auto-join-on-signup removed (2026-05-25).** The `users_assign_new_user_group` trigger that placed every new signup in the "חדשים" group is dropped (migration `20260525020000_no_group_available_and_drop_join_request`); `public.assign_new_user_group()` is dropped with it. New users sign up with no group and are `available` immediately under rule 4. The "חדשים" group is left in the catalog — admins can delete it manually if desired; existing members stay assigned (this change affects new signups only).

**Join-request flow — REMOVED 2026-05-25.** The "request to join a group" / "waiting for approval" UX was retired entirely at the user's request: *"שלא תהיה אף פעם הודעה ליוזר שהגישה היא באישור הצטרפות לקבוצה. צריך להוריד את זה גם מהאפליקציה (לנקות את המצב הזה)"* and follow-up *"להוריד את האופציות והסכמה הקשורה בשרת"*. Removed:
- DB: `app_join_request(uuid)` RPC dropped. `join_requested(uuid)` helper dropped. `app_admin_clear_join_request(uuid)` dropped. The `relations.join_request` key is stripped from every existing user; `relations.availability` is recomputed under the new rules (no `join_requested` sub-field).
- Edge: `/app/join_request` case removed from the dispatcher (old mobile builds hit 404 — harmless, the action was a no-op under the new gate). `sendJoinRequestEmail` + the `SUPPORT_EMAIL`/`EMAIL_FROM`/`ADMIN_USER_URL` imports are removed from `app/index.ts`.
- Web admin: the planned `JoinRequestCard` / `clearJoinRequest` action were never shipped; the `?seg=join_requested` segment, `admin.userDetail.joinRequest*` and `admin.segStates.join_requested` / `narrative.gate.join_requested` / `events.join_request` i18n keys are removed.
- Mobile (`home.tsx`): the `runJoinRequest` handler, the `JOIN_REQUEST_CONFIRM_TIMEOUT_MS` constant, the `availability.join_requested` branch on the `centerNotice` switch, and the `MailIcon` import are removed. The remaining gate fallback for any `unavailable` state without a more specific reason is the static `home.geoGate.unavailable` message — no actionable CTA. Old mobile builds keep working (the deployed gate UI just never reaches the request/waiting branches because the server never produces that state any more).

**App-review login (2026-05-19, migration `app_review_seed` `20260519020000` + edge function `review-login`).** The app is passwordless **and** membership-gated, so a store reviewer signing up fresh is gated and can't review — a near-certain rejection. Solution: a fixed reviewer **email + code** that signs into a dedicated, pre-approved demo account.

- **Edge function `review-login`** (`verify_jwt=false` — pre-auth, has its own code gate). Constants `REVIEW_EMAIL='review@once.app'`, `REVIEW_CODE='once-review-7Fq2'`. Validates the pair, `auth.admin.createUser` (idempotent) the dedicated review auth user, `auth.admin.generateLink({type:'magiclink'})` to mint a fresh single-use `email_otp` (no email is sent), calls `app_review_seed`, returns `{email, otp}`.
- **`public.app_review_seed(p_user_id uuid)`** (`security definer`, EXECUTE revoked from anon/authenticated) — idempotently upserts a complete onboarded `public.users` row (name `App Review`, profile/images **cloned from a real onboarded user** so every screen renders, stranger's `push_token` stripped, forced non-empty `data.bio` since the app routes to `/home` iff a profile row has a non-empty bio — `mobile/app/_layout.tsx`), clean free/free `relations`, and ensures membership in the enabled **`בדיקה`** group (id created 2026-05-19) so `user_availability` ⇒ `available`. Runs **after** the auth user exists (FK `users.user_id → auth.users`).
- **Mobile:** `login.tsx` `signInWithReview(code)` POSTs `review-login` then `supabase.auth.verifyOtp({email, token:otp, type:'email'})`. `LoginForm.tsx`: typing `REVIEW_EMAIL` in the email field reveals a "Review code" input (no magic link sent); a real user would never type that address. i18n `auth.reviewCodePlaceholder`/`auth.reviewSubmit` (he+en). Ships in mobile **1.0.2** (versionCode 21 / iOS build 18).
- Security: the only static secret is `REVIEW_CODE`; it leads solely to a sandbox review account (no admin powers, only its own state) — the standard expected demo-account pattern. Additive / not breaking.

**Repo↔live migration-file drift (housekeeping note, not functional):** the local `supabase/migrations/` filenames/timestamps do not always match the live applied history. CLAUDE.md (this section) + the live DB are the source of truth; new migrations are authored against the **live** function bodies (introspected via `pg_get_functiondef`).

**Mobile gate UI (`home.tsx`, current).** Permission prompts (notification / location / network) and the server availability gate share a single `centerNotice` object: `{text, icon, onPress?, busy?, disabled?}|null`. Priority is permission/connectivity first, then the server `availability` gate. Under the current (2026-05-25) gate any `unavailable` state without a more specific `reason` ends in a static "not available" message — there is no actionable "request to join" CTA any more.

### `users_map` (read model; web admin live users map)

`public.users_map` is a `security_invoker` view (same pattern as `areas_list`) that explodes `users.location` into `lat`/`lng` and surfaces `data->images[0]->normal` as `image`, so the web admin live map (`/map`) can plot users without parsing PostGIS blobs server-side. Columns: `user_id`, `name`, `last_seen`, `image` (filename or null), `lat`, `lng`, `location_type` (`device`|`home`|`work`; derived `coalesce(data->>'location_type', location_custom ? 'home' : 'device')` so pre-typed legacy rows still resolve — the map shows a home/work badge on the marker for non-`device` anchors). Only rows with a non-null `location` are exposed (a user with no location can't be placed). `security_invoker = on` ⇒ the web admin's service-role client sees every located user; anon/auth would get only their own row (harmless). The map's **live** updates do NOT read this view: the admin browser subscribes to `postgres_changes` UPDATE on `public.users` directly (allowed by the `admins read all` RLS policy) and decodes the raw `location` EWKB-hex point client-side. The view is only the server-side initial-load read.

### Admin dashboard (web admin home)

`/` is the **dashboard / hub**, not the users list. The users list moved to `/users` (its `[userId]`/`with` sub-routes are unchanged; `backHref` is now `/users`, the role-scoped reset action + its `ResetResult` type live at `web/src/app/[lang]/users/actions.ts`, revalidating `/[lang]/users`). `AdminNav` (`active: 'dashboard'|'users'|'roles'|'areas'|'map'`) declares its tabs once in a single `NAV_ITEMS` array rendered by both the desktop and mobile layouts — adding a tab is one edit. The shell logo and every "logged-in" redirect (`[lang]/page.tsx`, `/login`, `auth/callback`) land on the dashboard.

The dashboard is a server component that pulls one RPC `public.admin_dashboard_metrics(p_user_ids uuid[] DEFAULT NULL) → jsonb` (`sql stable security definer set search_path=''`, EXECUTE revoked from anon/authenticated — admin/service-role only, same pattern as `admin_user_facet_counts`; the stale zero-arg overload was dropped 2026-07-05 — one signature now, the web always passes `p_user_ids`). **Every KPI counter is scoped to real (non-test) users only**: the `blocked` CTE originally excluded `group_blocked` users (2026-07-05, migration `dashboard_active_users_only`) and since 2026-07-19 excludes `is_test` users instead — the group gate is gone and testers must not pollute business metrics. The suspended-id set is computed once in a `WITH blocked AS (…)` CTE and threaded into every per-user subquery as `user_id <> ALL(blocked.ids)` (correlated ref, `coalesce`d to `'{}'` so "nobody suspended" is a true no-op); the event-log (`invite`/`approve`/`logout`/`delete`) and chat (`messages`) funnel counters filter the acting `user_id`/sender the same way, so a suspended user's historical activity drops out too. So the displayed totals differ from the raw table counts by exactly the suspended population (e.g. at introduction 51/85 users were suspended → the dashboard counts the other 34). It returns a point-in-time product/business KPI snapshot grouped as `{demographics, users, engagement, availability, credits, areas, groups, funnel_7d}` (base size & growth, live game-state counts, geo/role gate health, credits economy, areas/roles catalogs, a 7-day signup→invite→approve→message funnel, plus a top-of-screen demographics breakdown). "today" is Asia/Jerusalem (same boundary the credits grant uses). **Every tile deep-links to the actual filtered list** that owns the number — no tile points at an unfiltered page. The users list (`/users`) was extended with new query filters beyond `q`/`p1`/`p2`/`role`: `avail` ∈ {available,unavailable,not_yet,unknown} (`relations->availability->>state`, `unknown` = null), `tier` ∈ {free,pro} (`relations->credits->>tier`; `free` also matches null via `.or`), `gender` ∈ {male,female} (`users.is_male`), `os` ∈ {ios,android} (`data->>os`), and a single multi-purpose `seg` ∈ {online,active_today,active_7d,active_30d,new_today,new_7d,new_30d,located,broadcasting,held,extra,no_notif,test,not_test}. The recency segs filter `last_seen`/`created_at` against a JS-computed ISO boundary (`*_today` = 00:00 Asia/Jerusalem, DST-correct via live `Intl` offset); `broadcasting` = `relations->>last_add_at` ≥ 30-min-ago (lexicographic ISO compare); `held` = credits.held not-null & ≠ '0'; `test` / `not_test` = `users.is_test` (see "Test-user matching partition"); `no_notif` mirrors `public.push_blocked(uid)` (`location not null` AND (`relations->push->>perm='denied'` OR `relations->push->>dead='true'`)). All eight secondary filters are applied through ONE `applySecondary<T extends Filterable<T>>(q)` helper (a self-referential structural builder type — no `any`, no copy-paste per query branch). `SearchControls` renders all eight dropdowns from one declarative `filters` array (single `FilterSelect` element, variants by props); each option carries a facet `(n)` (`admin_user_facet_counts` returns `avail`/`tier`/`gender`/`os`/`seg` blocks), kept in declared order. The whole filter panel is a fixed `grid grid-cols-2` (≤2 filters per row at every width — usable on mobile, not a 8-up cram), clear button below the grid. Tile map: demographics → `?gender=…`/`?os=…` (`avg_age` is informational, no link), engagement → `?p1=…|p2=…`, availability → `?avail=…`/`?seg=no_notif`, credits tier/held → `?tier=…`/`?seg=held`, growth/recency → `?seg=…`, test users → `?seg=test`. The **7-day funnel** section tails its acquisition→match→message stages with two churn counts — `funnel_7d.logouts` and `funnel_7d.deletes` (from `log` `key='logout'`/`key='delete'` with `status<400`); no deep-link (logged-out users still exist but aren't filterable by event, deleted users are gone). The former dedicated **Active users** section (`users.online_5m`/`active_today`/`active_7d`) was removed at the user's request (2026-05-24); those counts are still returned by the RPC for callers, and the recency drill-downs remain reachable via `?seg=online|active_today|active_7d` from the users-list filter. Reusable `CardGrid`/`NavTile`/`Stat` primitives live in `_components/ui.tsx` (`Stat` accents reuse the shared `Tone` palette). Additive + admin-only — no mobile/back-compat impact.

### Geo-availability gate

> **RESTORED 2026-05-31** (migration `restore_geo_gate`). User decision: *"רק משתמשים שנמצאים באזורים פעילים יוכלו להתשמש"*. After ~12 days where areas were defined-but-unconsulted (2026-05-19 → 2026-05-31), `user_availability`/`others()` were rewired to consult `area_state`/`area_available` again. The geo gate now composes with the push and group gates as a three-step short-circuit chain — see the precedence in the `user_availability` Helpers bullet above.

`relations.availability` is `{state, starts_at?, reason?}` where `state ∈ {available, unavailable, not_yet}`, written by `app_availability(me_id)` (= `user_availability(me_id, me.location)`):

**Default-DENY** (product decision 2026-05-17, supersedes the original "no areas → available" backward-compat default). Usable ONLY where an area actively covers the user; zero active/scheduled areas ⇒ every located user `unavailable` (deliberate gated launch). This is intentionally **not** backward compatible. Rules in order:

- **`location` is null** (onboarding / permission not yet granted) → `available`. The only non-gated escape hatch — onboarding & profile setup work in every location state.
- Inside an `active` area → `available` (regardless of `starts_at`).
- Inside a `scheduled` area with `starts_at <= now()` → `available`.
- Inside a `scheduled` area whose earliest matching `starts_at` is in the future → `not_yet` (+ that `starts_at`).
- **Everything else** — zero active/scheduled areas, or a located user outside all of them → `unavailable`.

**Availability resync (immediate on admin change + cron safety net).** `app_area_resync()` recomputes `user_availability(user_id, location)` (geo `area_state` + the disabled-role override) for every user and, on any change to the stored `relations.availability.state`, persists it (Realtime delivers it to open apps **instantly**) and queues a push: any→`available` ⇒ `area-open` ("the game has started"); `available`→`unavailable` ⇒ `area-closed`. (→`not_yet` and the first-ever computation from null are silent.) It is **idempotent** — only changed users are touched, so whoever calls it consumes each transition exactly once. Triggers: (1) every web-admin area mutation (`createArea`/`updateArea`/`deleteArea`/`setAreaMode`) **and** every role mutation that can change effective availability (`setRoleEnabled`, `setUserRoleAssignment`) fire-and-forget POST `/functions/v1/ext/resync` (via the shared `web/src/lib/resync.ts`), so an enable/disable — manual or scheduled-mode edit, or a role disable / membership change — updates **all affected users immediately, both directions**; (2) the per-minute `/ext/cron` also calls it (alongside `app_expire_sweep`) as the scheduled-launch trigger + self-heal net. The push reaches users who weren't in the app; those with the app open already got the Realtime flip.

**A user who becomes `unavailable` cannot stay in page1 `watching`** (migration `20260519140000_watching_drop_when_unavailable`; user decision 2026-05-19: "no active group ⇒ also can't be in watching"). Both `app_area_resync` and the synchronous `app_availability` (start/location/focus) now persist availability through **one** shared helper `public._apply_availability(uid, av)` (`plpgsql`, `SELECT … FOR UPDATE` on the row; EXECUTE revoked from anon/authenticated). When `av.state = 'unavailable'` **and** the user's `page1.state = 'watching'`, the helper additionally rewrites `page1 = {state:'free'}` (so the deployed mobile build's `RisingCard` plays its normal `SlideOutDown` — the watching card just slides away, revealing the gate UI underneath) and removes the user from the watched user's `page2.profiles[]` via the existing `_remove_from_profiles(target, uid)`. Covers every gate cause (group / geo / push) since all flow through `user_availability`. Using the same helper in both the change-gated resync path **and** the every-call `app_availability` path closes the ≤60s window where a gated user could otherwise keep a stale watching card until the next cron tick. The only entry into "watching while gated" is the watching→gated transition itself (a gated user can't initiate `find` — 403 — and `others()` excludes them, so nobody pulls them in), which the resync's `is distinct from` change-guard catches; a pre-existing stuck row self-heals on its next `start`/`focus`. Watching has no credits hold and no live counterparty interaction beyond the viewer list, so the drop is clean (this is deliberately scoped to `watching` only — `waiting`/`chat` in-flight interactions are never gate-torn-down, per the gate's teardown-exempt rule). Not breaking: `app_area_resync`/`app_availability` response shapes unchanged; the deployed app already animates a `watching → free` page1 transition (it's the same path `find`-skip / `cancel` / `expire` use), so no mobile change was needed.

Enforcement:
- **Edge handler (auto-find skip):** `start`/`location`/`focus` call `app_availability` synchronously after persist (so the HTTP response + the Realtime `relations` change carry the gate state immediately), and skip the auto-find when not `available`. The other auto-find sites (`account`, `age`/`range`/`preferred_gender`, `profile`, `resume`) also skip when the last-computed availability is not `available`.
- **Edge handler (initiation block — symmetric server-side gate):** the dispatcher rejects the **user-initiated presence-requiring actions** `find` / `invite` / `add` / `approve` with `403 "unavailable"` whenever the caller's `relations.availability.state ≠ 'available'` (the `requiresPresence` list + guard before the `switch`). This is the symmetric counterpart to `others()` dropping a gated user from everyone's pool: a gated user (geo / disabled-group / **no-notifications**) cannot be found *and* cannot actively search / invite / broadcast / accept — a sent invite a no-notifications user could never be told was accepted is a dead end for both sides. **Teardown/exit actions are deliberately NOT gated** (`clear1`/`clear2`, `decline`, `cancel`, `leave`, `free2`, `lock2`, `pause`, `logout`, `ignore`) so a gated user can always clear a stale state and get out. `availabilityState` defaults to `available` when the key is absent ⇒ onboarding users (no gate computed yet) are unaffected. The gate-aware mobile build already hides these CTAs while gated, so a correctly-gated current client never hits the 403; this closes the loop for old builds / direct API calls. Not breaking: a no-op for `available` users; gated users on the published gate-aware build already don't call these.
- **`others(me, only_available)`:** a candidate in the other matching environment is dropped unconditionally via `AND other.is_test = COALESCE((me).is_test, false)` (see "Test-user matching partition"), and a push-unreachable candidate via the clause `AND (NOT only_available OR NOT public.push_blocked(other.user_id))` (see "Notification-presence gate"). `app_find` always passes `only_available = true`, so an in-region user is never matched against someone who can't respond. With no areas / no disabled groups / nobody push-blocked all three clauses are no-ops (byte-identical matching).
- **Mobile (`home.tsx`):** when `relations.availability.state` is `unavailable`/`not_yet` (and the user is not in an active chat), the rotating-headline slot shows a single **short** fixed gate message (`home.geoGate.unavailable` / `home.geoGate.notYet`; `notYet` interpolates `{date}` = the launch moment formatted **short** `DD/MM HH:MM` from `availability.starts_at`). The copy is kept brief on purpose: it shares the `SkipHintLabel` slot which is tuned for brief phrases — a long string overflows/clips there. The find/play button is suppressed. **The center action surface becomes the user's OWN profile photo** (user request 2026-05-31) — `centerNotice.avatarUri = useSelfAvatar()?.uri ?? profileAvatarUrl`, rendered edge-to-edge inside the `permAvatar` circle (no white background, `contentFit:'cover'`, the existing `overflow:'hidden'` border-radius clips to a circle); the `InboxIcon` is now ONLY the fallback when no avatar is resolved yet (fresh install before the first photo finishes downloading). Tapping it calls `openProfileSheet` — the only useful action left in a "you can't play right now" state is review/edit your profile. This applies to ALL three geo/group-gated branches (`reason ∈ {geo, group}` AND `state='not_yet'`). The `reason='push'` branch keeps its `BellIcon` + re-enable-notifications `onPress` since that needs a different fix. **Enforcement is now the overlay gate** (`overlaysGated = geoGated || isPermMode`, 2026-07-19): the chat and invite overlays are not opened while gated, and an already-open chat overlay is force-closed, so page2/chat is unreachable. **The menu is deliberately NOT gated** — the user must still reach settings to change their location while they wait. (Everything the pager-era shell did here is gone: there is no side slot to drop, no `initialPage` to clamp, no `onPageSelected` snap-back and no inert tab spacer to keep the row from reflowing, because there is no pager and no tab row.) `not_yet` lifts itself client-side when `starts_at` passes (reconfirmed on the next `start`/`focus`), and the `area-open` push arrives if the app was closed. An active chat is never gated (non-destructive: a user who matched before being gated keeps the conversation).

Helper SQL: `area_state(loc geography) → jsonb` (mode-driven; live gate input — returns `{state:'available'}` for null loc OR inside an active/scheduled-started area, `{state:'not_yet', starts_at}` inside a scheduled-future area, `{state:'unavailable'}` otherwise), `area_available(loc geography) → boolean` (live shorthand `area_state(loc)->>'state' = 'available'`; consumed by `others()`), `push_blocked(uid uuid) → boolean` (positively-known no-notifications; see "Notification-presence gate"), `user_availability(uid uuid, loc extensions.geography) → jsonb` (the single source of truth, now a single step: push-block ⇒ `unavailable/push`, else `available`; every availability writer goes through this), `app_availability(me_id uuid) → jsonb` (`{user, notify}` envelope), `app_area_launch_sweep() → jsonb` (`{processed, notify}`, cron). Note: `app_refresh_snapshots` does **not** recompute availability — location only changes via `start`/`location`/`focus`, and admin group/area changes propagate within ~60s via the next periodic `/app/location`, on app `focus`/launch, the per-minute `app_area_resync` safety net, plus the immediate `triggerResync` admin actions fire after every mutation.

### Notification-presence gate

The app **requires presence**: a user who does not actually receive push notifications cannot respond to an invite/match, so matching anyone to them wastes both sides. Such a user is therefore made **unavailable to everyone**, folded into the exact same gate as the geo / disabled-group blocks (no separate mobile path — it reuses the deployed `relations.availability` gate end-to-end). User decision 2026-05-18: "people who don't get notifications => unavailable".

**What we can/can't know (verified against live data 2026-05-18).** Server-side alone we **cannot** reliably tell whether a user receives pushes: Expo returns `ticket.status='ok'` even when the OS has notifications muted (a silent push looks identical to a real one), and bare "no `data.push_token` on the row" is a **false signal** — 40 of 45 located users (all active in the last 24h) carry no token in this base (simulator/dev/seed sessions where `getExpoPushTokenAsync` yields nothing). Gating on missing-token would have bricked ~90% of the base. So the gate fires **only on positive evidence of non-delivery**, and `relations.push.token` is recorded for observability **but is NOT a gate input**.

- **`public.push_blocked(uid uuid) → boolean`** (`sql stable security definer`, inlinable into `others()`/`user_availability`): TRUE iff the user has `location IS NOT NULL` **AND** (`relations.push.perm = 'denied'` **OR** `relations.push.dead = true`). `location IS NULL` ⇒ never blocked (onboarding / pre-permission escape-hatch tier, mirrors `area_state(null)`). `'undetermined'` perm is **not** blocked (not-yet-prompted ≠ denied). Deliberately conservative: starts at ~0 impact (0/49 at deploy) and tightens as the perm-reporting build rolls out + dead tokens are detected — staged Expand, never a base-wide outage.
- **Two positive signals feed `relations.push`:**
  1. **Client-reported OS permission (near-realtime).** Mobile sends `notif_perm ∈ {granted,denied,undetermined}` in the `/app/start` and `/app/focus` bodies AND, for the realtime path, via a dedicated lean **`POST /app/notif`** heartbeat. The edge `recordPushPresence(user, body)` (called in the `start`/`location`/`focus` **and `notif`** cases, **before** persist + `app_availability`) merges `{perm, token:!!data.push_token, checked_at}` into `relations.push`; a fresh `push_token` in the body or `perm='granted'` also clears `dead`. `/app/notif` does **only** `recordPushPresence` → persist → `app_availability` (no auto-find / no extra work) so it's cheap enough to fire around every permission toggle; the synchronous `app_availability` means the response + the Realtime `relations` change carry the new gate state immediately. **The OS emits no permission-change event**, so the mobile freshness mechanism is: (a) on every `AppState`→`active` (return from Settings = the #1 change moment) report immediately, un-throttled; (b) a **3 s foreground poll** of `getNotifPermission()` (same cost class as the existing 2 s location-services poll) catches in-app revokes (Android shade long-press) and any `/app/focus` 30 s-throttle gap. Both go through a **change-debounced** `reportNotifPerm` (`lastReportedPermRef`) so steady state is zero network / zero re-render; the server is updated within ~3 s of any change. **Old builds never send `notif_perm` / never call `/app/notif` ⇒ `relations.push` stays absent ⇒ never gated** (additive, not breaking — new endpoint, old clients don't call it).
  2. **Expo `DeviceNotRegistered`.** `Tools.notify()` returns `{ok,error}`; `firePush` (both `app` and `ext`) on `error==='DeviceNotRegistered'` fires `EdgeRuntime.waitUntil(app_push_dead(target))`. **`public.app_push_dead(p_user_id uuid) → jsonb`** (`plpgsql security definer`, EXECUTE revoked from anon/authenticated) clears `data.push_token` (→ jsonb null), sets `relations.push={dead:true,token:false,checked_at}`, and recomputes `relations.availability = user_availability(uid, location)` so the user drops out of every pool immediately (Realtime delivers it; the per-minute `app_area_resync` is the safety net for the reverse direction once a working token re-registers). Returns the `{user, notify:[]}` envelope (no push queued — the user just lost notifications).
- **Enforcement** is the existing gate: `user_availability` precedence **case 1** (see "Group-membership gate" precedence list — `push_blocked` is the top hard-block, above the null-loc hatch and the membership check) + the `others()` sibling clause `AND (NOT only_available OR NOT public.push_blocked(other.user_id))` (push-gated user not found by others) **and the symmetric edge-handler initiation block** (push-gated user cannot `find`/`invite`/`add`/`approve` — see the Geo-availability gate "Edge handler (initiation block)" enforcement bullet; it keys off `relations.availability.state`, which today reduces to the notification-presence gate). A push-gated user sees the deployed `relations.availability.state='unavailable'` gate UI (the side tab is removed, find suppressed) — the gate **message copy still reads as the geo "not available in your area"** string (`home.geoGate.unavailable`); functionally correct, wording is a known minor UX gap, not blocking.
- Migration `20260518060000_push_presence_gate.sql`; types in `supabase/functions/global.ts` (`PushPresence`, `Pages.push?`). Additive / not breaking — see BACKWARD_COMPAT.md.

### `reports` (user reports; moderation queue — admin-managed)

One row per in-app report (see "`report` (shipped)"). Plain `uuid` columns with **no FK** (mirrors `restrictions` so a moderation record survives account deletion). RLS enabled, **no policies** → service-role only (edge function + web admin), same pattern as `areas`/`groups`/`restrictions`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | default `gen_random_uuid()` |
| `created_at` | timestamptz | default `now()` |
| `reporter_id` | uuid | not null; who filed the report |
| `reported_id` | uuid | not null; who was reported |
| `context` | text | `chat`\|`waiting`\|`pending`\|`watching`\|`unknown` (the reporter's relation surface at report time, detected server-side) |
| `reason` | text, nullable | optional short code from the client (currently `'chat'`) |
| `note` | text, nullable | optional freeform from the client |
| `handled` | boolean | not null default `false`; admin moderation triage flag |
| `handled_at` | timestamptz, nullable | set when `handled` flips true |

Indexes: partial `reports_unhandled_idx on (created_at desc) where not handled` (the admin queue); `reports_reported_idx on (reported_id)`. Written by `app_report`; read/triaged by the web admin `/reports`.

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
`app_find` (returns `{user, notify}`; picks the single most-relevant candidate via `others()` ranked `LIMIT 1`, writes `page1={state:'watching', profile:…}`, registers the actor as a viewer on that candidate's `page2.profiles[]`, detaches from the previous target), `app_seed_viewer(me_id)` (called fire-and-go from the `start`/`location`/`focus` edge handler after the auto-find block; seeds ONE top-relevance viewer onto a visible user with zero existing viewers — see "`start` / `location` / `focus` — first-viewer seeding". No-op when not `available` / `page2.state ≠ 'free'` / viewer list non-empty / no candidate whose `page1.state IN ('free','locked')`. Queues a `candidate` push via the standard `{user, notify}` envelope), `app_add` (page2 "Show me to people" / broadcast button: pulls up to 2 most-relevant candidates into `A.page2.profiles[]` and sets each candidate's `page1` to watching A. Preconditions: `A.page1.state ≠ 'chat'` AND `A.page2.profile` is missing (no live incoming invite) AND last call > 30 minutes ago. Existing `page2.profiles[]` watchers are preserved (never kicked) — broadcast appends new candidates on top of them — but a user who is **already viewing A** is excluded from candidate selection so a current viewer is never re-added: `app_add` builds `viewer_ids` from `A.page2.profiles[]` and the candidate query carries `AND NOT (o.user_id = ANY(viewer_ids))` (alongside the pre-existing defensive `NOT EXISTS` clause that drops anyone whose `page1` is currently `watching` A). When `page2.state` was already `'free'`, the existing `profiles[]` is preserved; when `'locked'`, page2 auto-resets to `{state: 'free', profiles: []}` (so a resting state becomes discoverable in the same call). Writes `A.relations.last_add_at = now()` even when zero candidates are returned, so an empty-pool press still consumes the cooldown), `app_cancel_add` (clears `A.relations.last_add_at`; used by the toggle's "exit broadcast" confirmation and by tapping "Visible" while broadcasting — since page2.state is already free during broadcast, `app_free2` would be a no-op). `app_ignore`, `app_clear1`, `app_clear2`, `app_invite`, `app_extend`, `app_cancel`, `app_approve`, `app_decline`, `app_leave`, `app_block`, `app_remove`, `app_free2` (transitions `A.page2.state` from `locked` → `free`; called by the page2 premium "show my profile again" tile), `app_lock2` (premium "hide me" action; transitions `A.page2.state` from `free` → `locked` with no profile/profiles AND strips `A.relations.last_add_at` so the visibility toggle exits broadcast mode atomically. In the same transaction also kicks every watcher in `A.page2.profiles[]`: each watcher's `page1` → locked + `message='remove'` (only if still pointing at A in 'watching'), per-pair `remove` restriction inserted, `removed` push queued. Equivalent to N `app_remove` calls + a final state flip + cooldown reset, collapsed into one round trip. Mobile UI confirms with the user before calling since the action is destructive. No cooldown), `app_pause` (the page1 skip-pause button — the round centre circle revealed when a skip slides the card off; `runPauseFromSkip` in `home.tsx`. Stops an active page1 **watch** ONLY and **deliberately does NOT touch page2 / visibility** — user request 2026-05-22, migration `20260522040000_app_pause_keep_visibility`: no watcher-kick, no `page2` lock, no `last_add_at` strip. Acts only when `page1.state='watching'` (any other state ⇒ no-op — the button is unreachable elsewhere): detaches the actor from the watched user's `page2.profiles[]` and sets `A.page1={state:'locked'}` via `jsonb_set`, so `page2`, `last_add_at`, `credits`, `availability`, `push`, `join_request` are all preserved verbatim. No restriction, no push. The green play button then re-enters the game via `find`), `app_resume` (legacy "Game mode → Active" inverse of the old two-page `app_pause`; sets both pages to free, guarded on both being `locked`. **No longer reachable from the mobile UI** — the play button re-enters via `find`, and `app_pause` no longer locks `page2` so the guard rarely holds. Dead but harmless, left in place), `app_expire_sweep` (called by pg_cron every minute; both passes delegate to `_expire_invite_pair`), `app_expire_self` (closes the CALLER's own past-due invitation in either direction — page1 `waiting` as inviter and/or page2 `pending` as invitee — via `_expire_invite_pair`; standard `{user, notify}` envelope, empty `notify` when nothing was due. SECURITY-wise EXECUTE is revoked from anon/authenticated. Called from the `start`/`location`/`focus` dispatcher case behind the `isInviteLapsed` pre-check, which the mobile client triggers the moment its countdown hits 00:00 — see "Invitation timeout and extension → Client-triggered"), `app_delete_cleanup` (called by the `delete` endpoint before row deletion), `app_logout_cleanup` (called by the `logout` endpoint: kicks page2 viewers to `logout`, clears page2), `app_refresh_snapshots` (see below), `app_save_profile` (called by the `profile` endpoint: accepts `{images?, bio?, family?, is_for_kids?}` payload. Only the keys present are written; passing `null` on `bio`/`family` clears that field), `app_availability` (called synchronously by `start`/`location`/`focus`: recomputes `relations.availability = area_state(me.location)` and returns the `{user, notify}` envelope so the response + Realtime carry the gate state — see "Geo-availability gate"), `app_area_launch_sweep` (called every minute by `/ext/cron` alongside `app_expire_sweep`: flips `not_yet` users whose area opened to `available` and returns `{processed, notify:[{user_id, code:'area-open'}]}` so the cron handler fires the launch push), `app_admin_reset` (admin reset — **two overloads**, resolved by arity / by PostgREST on the presence of the `p_role_ids` arg. (a) No-arg `app_admin_reset()`: the original GLOBAL reset — deletes all `chat` + non-null-user `log`, then for every user sets `last_seen=now()` and `relations = {page1:{state:'free'}, page2:{state:'free', profiles:[]}, availability: user_availability(user_id, location)}`. Kept in the DB, **no longer the web entry point**. (b) `app_admin_reset(p_role_ids uuid[])`: the ROLE-SCOPED reset the web flow now uses — only users holding **≥1 of the selected roles** are touched; every DELETE/UPDATE is bounded to that target set (chat as sender/recipient, log, relations rebuild). Empty/null array ⇒ `{users:0}` no-op (never falls through to global). **`only `block` restrictions and `reports` are preserved by both overloads** (user decision 2026-05-28, migration `admin_reset_preserve_restrictions`; narrowed to `block`-only 2026-07-20, migration `admin_reset_detach`): a reset must keep the SAFETY record intact so anyone who blocked / was blocked / reported / was reported never sees the other side again — but the gameplay COOLDOWNS (`ignore` / `cancel` / `remove` / `decline` / `leave`) are cleared, because a reset that leaves them in place is not a reset. See "Reset detaches counterparties" below. `app_report` inserts a permanent `block` restriction in the same transaction, so leaving `restrictions` untouched also keeps every prior report's mutual hide in effect; `others()` honours the `block` key as permanent + bidirectional. Both rebuild `availability` via `user_availability(user_id, location)` (not `area_state`) so the geo **and** role-disable gate stays correct immediately after the reset, and rebuild `credits` via `_credits_default()` — **tier reset to `free` (Basic), balance = free cap (3), grant fields refreshed** (see "Credits economy → Admin reset resets the package to Basic"). **Both pages land at `state='free'`** (user request 2026-05-23, migration `admin_reset_page1_to_free`): "reset" means "put both pages back into a discoverable state", so a reset user is matchable by the next `find` / seed pass without first having to press Play. Earlier the global + role-scoped resets landed `page1` at `locked`, which left every reset user inert until they themselves re-entered the game. **Recomputing `availability` AND `credits` per row is the whole point**: an earlier handler overwrote `relations` with a literal that had no `availability` key (wiping the gate until the user's next `start`/`location`/`focus`) and no `credits` key (silently demoting every `pro` user to `free`/5 on the next credit RPC). Both SECURITY DEFINER, EXECUTE revoked from anon/authenticated. **Triggered only from the web admin** users dashboard: a popup with a role checklist + select-all/deselect-all (`ResetAllButton`) → `web/src/app/[lang]/admin/actions.ts → resetUsersByRoles(roleIds)` via the service role, not the mobile app. The legacy free-form `users.data.role` values in the wild (`TEST`, `ADMIN`) were backfilled into `roles`/`user_roles` by migration `20260517240000_backfill_roles_from_data_role` (created roles ENABLED so the backfill never silently gates anyone; `data.role` itself left intact, read by nothing).

`admin_log_for_user(p_user_id uuid, p_limit int default 300) → setof log` (admin/service-role only, SECURITY DEFINER, EXECUTE revoked from anon/authenticated, migration `20260523000000_admin_log_for_user`). Returns log rows for the merged user-detail events feed: every row where the user was either the caller (`l.user_id = p_user_id`) **OR** appears anywhere in the request/response payload (`l.log::text ILIKE '%uuid%'`) or the post-transaction snapshot (`l."user"::text ILIKE '%uuid%'`). The substring match captures events OTHER users initiated that affected this user (someone invited them, removed them as a viewer, etc.) — those rows live under the actor's user_id but reference this user's uuid in their log/user jsonb, and the page1-event-only `eq("user_id", uuid)` query the old "activity" section used could never reach them. Capped at 60 days + LIMIT to bound the sequential scan on `log`. Consumed by the web admin user-detail page (`web/src/app/[lang]/users/[userId]/page.tsx`) which feeds the rows into `buildEventCards()` (`web/src/lib/eventCards.ts`) and renders one rich card per row in `UnifiedActivity` (`_components/UnifiedActivity.tsx`) — each card carries the action name, success/fail, page tag (`page1`/`page2`/both, derived from a static map mirroring the state transition table), the affected users (extracted from the JSON), post-event page1+page2 state badges (only when the actor is the user being viewed — the snapshot is the actor's row), and event-specific detail blocks for `location` (coords + Google Maps link, parsed from the request body) and `profile` (Hebrew breakdown of which fields changed: `images` count, `bio` preview, `family` summary, `is_for_kids` yes/no). A search input at the top filters cards by partner name/email (partner emails fetched via `admin.auth.admin.listUsers({page:1, perPage:1000})`). The Danger zone (Reset + Delete) was simultaneously moved INSIDE the identity card at the top of the page, so the critical per-user actions sit next to the identity they affect. The old separate "interactions" + "activity" sections were removed; `fetchPartnerSummaries` is no longer called from the page (the helper + its `extractOtherIds` export remain — `extractOtherIds` is consumed by `eventCards.ts` and the per-pair `/with/[otherUserId]/page.tsx`). Admin-only / additive — no mobile or backward-compat impact.

`app_credits_grant` (daily credit top-up; called every minute by `/ext/cron` alongside `app_expire_sweep`/`app_area_resync`; idempotent per 20:00 Asia/Jerusalem grant day; tops `balance` up to `_credits_cap()` = 3, preserves `extra` verbatim; no push — see "Credits economy"). `app_buy_extra(me_id, p_count)` (user-initiated purchase from the settings hearts popup / home zero-credits CTA via `POST /app/buy_extra`; validates `p_count ∈ {5,10,50}`; adds `p_count` to `credits.extra` under FOR UPDATE; returns `{user, notify:[]}`). `app_set_tier(me_id, new_tier)` survives only as a NO-OP — see BACKWARD_COMPAT.md. The credits-touching RPCs spend / preserve credits per "Credits economy → Hold + refund / forfeit": `app_invite` HOLDS 1 via `_credits_hold` (precondition `_credits_total(rel) >= 1` else `{error:'no_credits'}`); `app_approve` and `app_add` charge via `_credits_charge` (balance first, then extra); `app_cancel` FORFEITS the held heart via `_credits_clear_hold` (no balance/extra change, no precondition); `app_decline` / `app_expire_sweep` (both passes) / `app_approve` (inviter B side) / `_kick_page1_at` (transitioning a `waiting` row) / `app_logout_cleanup` / `app_admin_release_page1` (waiting) / `app_admin_release_page2` (pending) all REFUND via `_credits_refund` (balance up to cap, overflow into extra); `app_resume` / `app_admin_reset*` carry `credits` forward via `_credits_ensure` / rebuild via `_credits_default()` respectively (`app_pause` preserves the whole `credits` blob automatically — page1-only `jsonb_set`). `app_admin_reset_user(p_user_id uuid) → jsonb` (the per-user counterpart of the role-scoped `app_admin_reset(uuid[])`; SECURITY DEFINER, EXECUTE revoked from anon/authenticated, migration `20260522010000_app_admin_reset_user`, behaviour aligned with the bulk reset by `admin_reset_page1_to_free` 2026-05-23) — wipes one user's `chat` + `log` and rebuilds `relations` to the clean-slate shape (`page1` free, `page2` free, `availability` via `user_availability`, `credits` via `_credits_default()` — tier reset to Basic/free). **`block` restrictions and `reports` are preserved** for the same reason as the bulk reset (migration `admin_reset_preserve_restrictions` 2026-05-28, narrowed to `block`-only by `admin_reset_detach` 2026-07-20): a reset must not erase the user's safety history with other users, but it must clear the gameplay cooldowns. It also calls `_admin_reset_detach` — see "Reset detaches counterparties" below. Like `app_admin_reset` it does **not** tear down non-reset partners' live links (the user still exists, so their partners' snapshots stay fresh via `app_refresh_snapshots`). Triggered by the **"Danger zone"** on the web admin user-detail page (`UserDangerZone` → `users/actions.ts → resetUser`). Its sibling **delete** control (`deleteUser`, same file) needs no new RPC: it runs the existing `app_delete_cleanup` (partner teardown), deletes the user's `log` + `restrictions` rows, then `auth.admin.deleteUser` (cascades `users → chat` + `user_groups`; `reports` deliberately kept). Both admin-only / additive — the deployed mobile app never calls them. `app_admin_release_page1(p_user_id uuid) → jsonb` / `app_admin_release_page2(p_user_id uuid) → jsonb` (admin/service-role only, SECURITY DEFINER, EXECUTE revoked from anon/authenticated, migrations `app_admin_release_pages` + `app_admin_release_page1_to_free`) — reset **one page** of a single user back to a **discoverable** state (`page1 → {state:'free'}`, `page2 → {state:'free', profiles:[]}`) **without touching the other page**. The page1 target is `'free'`, not `'locked'` (user request 2026-05-23): the admin "release" semantic is "make this user available again", which only holds when the page lands in a discoverable state — `locked` would have left the user inert until they themselves pressed play. `app_admin_reset` / `app_admin_reset_user` (the wider clean-slate wipes) now share this rule (migration `admin_reset_page1_to_free`, same date): the operator-level intent of both "release" and "reset" is the same — leave the user matchable. They differ in scope (release = one page, reset = whole row + chat/log/restrictions wipe + credits reset to Basic), not in landing state. `jsonb_set` on the single page key preserves the sibling page + `credits`/`availability`/`push`/`last_add_at` verbatim. State-aware counterparty teardown so no related user is left orphaned — release-page1 `watching` → detach from the watched user's `page2.profiles[]`; `waiting` → close the invitee's `pending` page2 (`message='cancel'`); `chat` → end the partner's chat side (`page1` locked, `message='leave'`). release-page2 `pending` → close the inviter's `waiting` page1 (`message='decline'`); `free` → kick every viewer (their `page1` locked, `message='remove'`). Mirrors the teardown shapes of `app_cancel`/`app_leave`/`app_decline`/`app_lock2`/`app_pause` but **without the cooldown `restrictions`** (a clean admin reset, not a punitive user action) and **without push** (Realtime reconciles open apps). Triggered from the web admin only — per-user quick actions and bulk actions on the users list.

### Reset detaches counterparties (2026-07-20, migration `admin_reset_detach`)

`public._admin_reset_detach(p_ids uuid[])` (`plpgsql security definer`, EXECUTE revoked from anon/authenticated) is the shared "make a reset actually reset" step, called by `app_admin_reset_user` and `app_admin_reset(uuid[])` before they rebuild `relations`. `app_admin_reset()` (global) rebuilds every row anyway, so it only runs the restriction delete inline.

**Why it exists.** A reset used to rebuild ONLY the target's own `relations`. Every mechanism that keeps a candidate out of that user's pool lives somewhere else, so all of them survived the reset:

1. **`restrictions`** — a separate table, filtered **bidirectionally** by `others()`. Each skip writes a 24h `ignore`; `cancel`/`remove` are 24h, `decline` 7d, `leave` 14d.
2. **Other users' `page1.profile` still pointing at the reset user** with `state IN ('watching','waiting')` — `app_find` carries `NOT EXISTS (… w.page1.profile = me AND state IN ('watching','waiting'))`, so every stale pointer permanently burns a candidate. Dormant seeded users never clear theirs.
3. **The reset user lingering in other users' `page2.profiles[]`** — `others.relevance_watchers` is `GREATEST(0, (5 - viewers)/5)` and `app_find` filters `relevance > 0`, so a candidate at **5 viewers scores exactly 0** and disappears.

Net symptom (reported 2026-07-20): a user who skipped everyone stayed stuck after "reset user", and the only cure was resetting the OTHER users. The reset was also actively counterproductive — it empties the user's own `page2.profiles[]`, re-arming `app_seed_viewer` to burn another candidate into `watching` on the next `start`/`focus`.

**What it does**, for the set of ids being reset:
- Deletes every restriction in **either** direction **except `key = 'block'`**. `block` is the safety record (`app_report` always writes one) and is preserved, together with `reports` — that is the unchanged part of the 2026-05-28 decision. The gameplay cooldowns are not safety records and are cleared.
- Releases other users' `page1` pointing at a reset user, with landings mirroring `app_admin_release_page1`'s counterparty teardown: `watching` → `{state:'free'}` (silent; the deployed app just slides the card away), `waiting` → held heart refunded via `_credits_refund` + `_page1_locked(…, 'expire')`, `chat` → `_page1_locked(…, 'leave')`.
- Closes other users' `page2.state='pending'` whose inviter is a reset user → `_page2_locked(…, 'cancel')`.
- Strips reset users out of other users' `page2.profiles[]` (only where `page2.state='free'`, matching `_remove_from_profiles`).

Users inside the reset set are skipped by every step (`NOT (u.user_id = ANY(p_ids))`) since their rows are rebuilt immediately after. Admin-only / not breaking: the mobile app never calls these RPCs, and every landing state (`locked`+`expire`, `locked`+`leave`, `locked`+`cancel`, `free`) is one the deployed build already renders.

Helper functions: `make_profile`, `_slim_viewer` (see "Slim viewer snapshots"), `_expire_invite_pair` (the single per-pair invitation-expiry close, shared by `app_expire_sweep` / `app_expire_self` / `app_cancel`; self-guarding and idempotent — see "Invitation timeout and extension"), `_remove_from_page2`, `_kick_pointing_at`, `_add_restriction`, `schedule_overlap` (see "Schedule overlap" below), `kids_preference_match` (see "Kids preference match" below), `push_blocked` / `user_availability` (the live gate stack — see "Notification-presence gate"), `_apply_availability(uid, av)` (the single availability-persist helper used by `app_area_resync` + `app_availability`; also drops page1 `watching` → `free` and removes the user from the watched user's `page2.profiles[]` when `av.state='unavailable'` — see "Availability resync"), the `app_push_dead(p_user_id)` RPC (dead-token cleanup, called fire-and-forget from the push pipeline on Expo `DeviceNotRegistered`), and the credits helpers `_credits_cap` / `_credits_cost` / `_credits_grant_day` / `_credits_next_grant_at` / `_credits_default` / `_credits_ensure` / `_credits_balance` / `_credits_extra` / `_credits_total` / `_credits_held` / `_credits_charge` / `_credits_hold` / `_credits_refund` / `_credits_clear_hold` (see "Credits economy"). `others(me, only_available)` carries the unconditional `is_test` partition clause (see "Test-user matching partition"), a `NOT push_blocked(other.user_id)` candidacy clause (no-op when nobody is push-unreachable; see "Notification-presence gate"), a credits candidacy clause (`balance + extra >= _credits_cost('approve')` under `only_available`; see "Credits economy → Findability gate"), and a `relevance_broadcast` factor folded into the final `relevance` product (see "Broadcast relevance boost" below).

**Auto-return-to-free policy.** Users return to `page2.state = 'free'` at the end of every page2 process unless they explicitly hid via `app_lock2`. Concretely:
- `app_decline` — decliner's `page2` → `{state: 'free', profiles: []}` (the inviter's profile is dropped immediately; no "you declined" card surfaces on the decliner).
- `app_leave` / `app_block` — both leaver and partner end up at `page2 = {state: 'free', profiles: []}`. Previously only the leaver was reset; the partner stayed locked-no-message.
- `app_clear2` — when there's a `message` to acknowledge (cancel / expire / approve-fail / etc.), this endpoint now flips `page2` all the way back to `{state: 'free', profiles: []}` instead of merely stripping the message. Effectively merges with `free2` for the message-ack path. The explicit-hide case (locked + no message) is intentionally not touched.

The "Back to the game" button on the dead-invite card calls `app/free2` directly. Net effect: every page2 ending — declined, expired, cancelled, approve-fail, chat-ended — returns the user to the discoverable pool without an extra step. Only `app_lock2` (the explicit "Hide my profile" tile in the visibility popup) keeps the user out of the pool.

**This was not actually true until 2026-07-20 for a user who does not reopen the app.** Every ending above parks `page2` at `locked` **with a `message`**, and the return to `free` happens only when the user opens the app and taps Continue (`app_clear2`). `others(only_available)` dropped `page2.state = 'locked'` unconditionally, so until that tap the user was **invisible to everyone** — an expired invitation removed the invitee from the pool indefinitely, making the punishment for not answering an invite disappearing from the game. Live pool when found: 12 of the 13 hidden users were in this state, the oldest since 2026-07-05 (13 days). Backlog cleared by migration `others_drop_kids_hard_exclude`; the recurrence is fixed by `_page2_open` below (3 fresh cases accumulated within the hour it took to ship it).

`locked` + message and `locked` + no message are two different things — an unread notification vs. a deliberate hide — and only the second should cost visibility.

### `_page2_open` — the "this page2 accepts discovery" predicate (2026-07-20, migration `page2_open_locked_with_message`)

`public._page2_open(page2 jsonb) → boolean` (`sql immutable`) is the single definition of *open for discovery and invitations*:

| `page2` | open | why |
|---|---|---|
| `free` (or state missing) | ✅ | resting open state |
| `locked` **+ `message`** | ✅ | an unacknowledged "what happened" card — must not cost visibility |
| `locked`, no message | ❌ | a real hide (`app_lock2`) or post-`approve` |
| `pending` | ❌ | a live incoming invite already owns the page |
| `chat` | ❌ | — |

Every matching-path consumer was switched to it, and the set is the point — a half-applied version of this rule is worse than none:

1. **`others()`** candidacy — a locked-with-message user is a valid candidate again.
2. **`app_find`**'s re-check of the pick under the lock.
3. **`app_find`**'s viewer append. Load-bearing: without it the newly-discoverable user accumulates no viewers, so `relevance_watchers` pegs at 1.0 and they rank top for **everyone simultaneously**.
4. **`_remove_from_profiles`** — detaching must be symmetric with (3) or viewers leak.
5. **`app_invite`**'s target precondition. This is why "just show them" is wrong on its own: without it we would surface candidates nobody can invite. The pending write replaces the whole `page2` object, so a live invitation correctly supersedes the stale card.
6. **`app_clear2` / `app_free2`** now carry `profiles` forward instead of hardcoding `[]` — (3) can populate them while the card is up, and tapping Continue must not wipe them.

**The stored shape is unchanged** (`locked` + message, exactly as before), so the deployed mobile build keeps rendering the dead-invite card and `selectIsHidden` — already `page2State === 'locked' && !hasInviteCard` — already agreed with this model. Server-side discoverability only. Not breaking, no `BACKWARD_COMPAT.md` entry.

**The sender's side needs no equivalent change**, and the migration asserts it: `_expire_invite_pair` writes the inviter's `page1` (locked + `expire`, held heart refunded) and the invitee's `page2` — it never touches the inviter's `page2`, and `page1` state has never gated discovery (`others()` only excludes `page1 = 'chat'`). The inviter stays discoverable and invitable throughout, and always did; the whole asymmetry was that page2 gates visibility while page1 does not. `app_cancel` lands the same shape. The migration ends with a guard that raises if `_expire_invite_pair` ever starts writing the inviter's page2, since that would invalidate this reasoning.

One behaviour does change for the sender: expiry writes **no restriction** (only `ignore`/`cancel`/`remove`/`decline`/`leave`/`block` do), so once the invitee is discoverable again the sender can immediately re-invite them. Intended — a missed invite must not permanently block a retry — and self-limiting, since each invite costs a heart out of a daily 3.

### `app_refresh_snapshots(me_id)` — keeping snapshots fresh

The `Profile` snapshot stored inside `relations` (via `make_profile`) freezes the entire profile — `name`, `title`, `images`, `bio`, `family`, `is_male`, `last_seen`, `distance`, `location_custom` — at write time. Without active refresh, a chat partner or watcher would keep showing whatever values were captured at match/view-start time, not the current ones.

`location_type` (and the back-compat `location_custom`) is only embedded when the snapshotted user's anchor is `home`/`work`; `device` mode omits both keys. The mobile distance chip is driven by **B's** (the snapshotted side's) `location_type`: `device` → PinIcon, `home` → HomeIcon, `work` → WorkIcon. The chip **text** is a binary live-vs-anchored signal: it stays "ממך"/"away" only when **both** the viewer (A) and the subject (B) are `device` (true live proximity); the moment either side is `home`/`work` it switches to the passive "מהמיקום שהוגדר"/"from the set location" (the number is anchored to a fixed address, not live proximity). So the icon answers "what is B's point" and the text answers "is this number live". Old mobile builds (pre-typed) ignore `location_type` and keep using `location_custom` for the legacy binary PinIcon↔HomeIcon + passive-text swap; see `BACKWARD_COMPAT.md`.

`app_refresh_snapshots(me_id)` is called from the handler (behind `EdgeRuntime.waitUntil`) on every endpoint **except** `delete` (the row is gone). (The old admin `reset` endpoint is also gone — global reset moved to the web admin via `app_admin_reset()`; see below.) It rebuilds every snapshot using a fresh `make_profile(...)` so all observable Profile fields stay live over Realtime — not just `last_seen` and `distance`, but also `name`, `images`, `bio`, `family`, `is_male`, `title`. So a user editing their bio, swapping a photo, or updating family/schedule propagates immediately to anyone holding their profile inside `relations`. Stripping rules:

- **state ≠ chat AND message is null** → snapshot has full live profile, including `distance` and `last_seen`.
- **state = 'chat'** → strip `distance` (kept stripped, never re-added). Two users in chat shouldn't surface live distance to each other.
- **message IS NOT NULL** (locked-with-message state) → strip BOTH `distance` AND `last_seen`. The "what happened" card has no use for those volatile fields, and surfacing them after the interaction ended is misleading (e.g. a partner's `last_seen` ticking forward after they left chat).
- Rules apply additively to all four snapshot slots that can carry a message: outward `B.page1.profile`, outward `B.page2.profile`, inward `A.page1.profile`, inward `A.page2.profile`. `page2.profiles[]` (watcher list) is only populated when `state='free'` with no message, so neither rule applies — but a separate slimming rule does (see "Slim viewer snapshots" below).

#### Slim viewer snapshots (2026-05-23, migration `slim_viewer_snapshots`)

> **Client note (2026-07-19):** the mobile app no longer renders the viewer list at all — the user does not see who is watching them or how many, and `WatcherCard.tsx` is deleted. Everything below still describes live SERVER behaviour (`page2.profiles[]` is still written and slimmed, and still drives matching); it is simply no longer displayed.

`page2.profiles[]` entries (the viewer list shown on page2) carry a **deliberately reduced** Profile shape — only what `WatcherCard` actually renders: `user_id`, `title` (**name only — no age**, see below), `name`, `is_male`, `last_seen`, and `images: [{hash}]` (single element, blurhash only). `bio`, `family`, `distance`, `location_custom`, `location_type` are stripped; `created_at` was never written by `make_profile` so the "new" badge was always inert. **`page1.profile` and `page2.profile` (the single-counterpart slots used for watching / waiting / pending / dead-invite / chat) keep the FULL snapshot** — those surfaces still need distance / family / etc. The slimming applies only to the viewer-list array.

Mechanism: SQL helper `public._slim_viewer(p jsonb) → jsonb` (`IMMUTABLE`) keeps only the fields above, trims `images` to a one-element `[{hash}]`, **and rewrites `title` to the bare `name`** (dropping the `", <age>"` suffix `make_profile` builds for the watching/waiting/chat surfaces). `page1.profile` / `page2.profile` (the single-counterpart slots) still carry the full `"name, age"` title — the name-only rewrite applies only to the viewer list. Followup migration `slim_viewer_drop_age_from_title`. Every site that writes into `page2.profiles[]` wraps `make_profile()` with `_slim_viewer()`: `app_add`, `app_find` (the picked-target append), `app_seed_viewer`, and the two `app_refresh_snapshots` rewrites that touch `page2.profiles[]` (the "me inside other users' lists" loop and the "rewrite my own list" tail). Backfill in the same migration slimmed every existing array entry; subsequent writes go through the helper.

**Not breaking.** `WatcherCard` was already null-safe on every chip — `formatLastSeen('')` returns `''` (falsy), `{distance ? <Chip/> : null}`, `{familyChipText ? <Chip/> : null}`, `isRecentlyCreated(undefined)` returns false. `home.tsx` sorts watchers by `(b.created_at ?? '').localeCompare(...)` which collapses to a no-op when both are absent. The deployed app silently renders the new viewer card (name + photo + time chip) without any mobile change. The `Profile` TypeScript type still lists the stripped fields as optional — no type churn needed; consumers either already null-guard them or never read them on a watcher entry.

User decision 2026-05-23 (Hebrew chat): "שבכרטיס צופה יהיה רק השם וצ׳יפ הזמן עם תמונת הראש".

Specifically:
- Outward: for every B referencing A in `B.page1.profile`, `B.page2.profile`, or `B.page2.profiles[]`, replace A's snapshot with a fresh `make_profile(A, dist_AB)` then apply the stripping rules above.
- Inward: inside A's own relations, rebuild each referenced user B's snapshot from B's current row via `make_profile(B, dist_AB)` and apply the same stripping rules. If B no longer exists, the previous snapshot is preserved as-is.

Realtime delivers the resulting `users.relations` change to the affected client. Mobile keeps reading every Profile field from the snapshot — name, photos, bio, family, last_seen, distance — and the snapshot is now kept fresh for it on every server call.

### `schedule_overlap(me_data jsonb, other_data jsonb) → double precision`

Anchor-aware kid-free overlap multiplier used in `others.relevance_schedule` and folded into the final `relevance` product. **Asymmetric**: the denominator is `me_data`'s free days (not the full cycle), so the value expresses "out of A's kid-free days, what fraction is B also kid-free". This mirrors the UX semantic of the family chip on mobile, which the viewer reads as "how much of my free time aligns with theirs". Output cases:

| Case | Returns | Meaning |
|---|---|---|
| Either side has `family.hasKids != true` | `1.0` | Fallback. Neutral — unknown compatibility neither boosts nor penalizes. |
| Both have kids but at least one is missing a non-empty `family.schedule.weeks` array | `1.0` | Fallback. Nothing to compare. |
| `me_data` has zero free days in the cycle | `1.0` | No denominator → no signal to rank by. |
| Both have kids + schedule, **0 of A's free days overlap** | `0.0` | Hard exclude. Multiplies `relevance` by 0 → candidate never appears. If B is never free when A is, there's no point matching them. |
| Both have kids + schedule, B covers half of A's free days | `1.0` | Equal to fallback. |
| Both have kids + schedule, B covers all of A's free days | `2.0` | Maximum boost. |
| General formula (both have kids + schedule, `a_free > 0`) | `2.0 * (both_free / a_free)` | Linear in `[0.0, 2.0]`. |

Semantics: "we don't know" = neutral (1.0). "we know B never aligns with A's free time" = excluded (0.0). "we know B always aligns with A's free time" = doubled (2.0). Because it is asymmetric, `schedule_overlap(A,B)` and `schedule_overlap(B,A)` can differ — each direction is computed relative to whoever appears in `me_data`, which is correct: the `others` RPC always passes the searcher as `me_data` so each candidate is ranked from the searcher's perspective.

Algorithm: flatten each user's `data.family.schedule.weeks` (jsonb array of 7-bool arrays, 0=Sun..6=Sat) into a flat `bool[]`. Compute `cycle = LCM(len_a, len_b)` days (≤ 84 with `FAMILY_MAX_WEEKS=4`). For each day `i ∈ [0, cycle)`, map to each side's schedule index using `(current_date - anchor) mod cycle_X` so two schedules saved with different `anchor` Sundays are compared on the real calendar (not naively week-0-vs-week-0). Count A's free days (`a_free`) and days where both sides are kid-free (`both_free`). Return `2.0 * both_free / a_free` (or `1.0` if `a_free = 0`).

The function is `LANGUAGE plpgsql STABLE PARALLEL SAFE`. The jsonb→bool[] conversion runs once per side; the cycle loop is plain integer/array indexing.

### `kids_preference_match(me_data jsonb, other_data jsonb) → double precision`

Compatibility multiplier (0.5/1/2) for `data.family.isForKids` between two users. Used in `others.relevance_kids` and folded into final `relevance`. Server-side ranking only — not displayed in the UI.

Truth table (rescaled 2026-05-17, migration `kids_preference_match_rescale`):
- both explicitly set + same value (`true=true` or `false=false`) → **2.0** (boost)
- both explicitly set + different values → **0.5** (soft penalty, no longer a hard 0.0 exclude)
- one explicitly set, the other not → **1.0** (no signal — neutral)
- neither set (no `family`, or `family` without `isForKids`) → **1.0** (no signal — neutral)

"one set" and "neither set" collapse to the same neutral 1.0. `LANGUAGE sql IMMUTABLE PARALLEL SAFE` — single CASE expression, fully inlinable by the planner. (`schedule_overlap` was intentionally left unchanged in this revision.)

**The rescale was not actually in effect until 2026-07-20** (migration `others_drop_kids_hard_exclude`). The 2026-05-17 migration changed only `kids_preference_match`; `others()` carried a **separate hard `WHERE` clause** dropping any pair whose `isForKids` booleans differ, before `relevance` is ever computed. So the 0.5 soft penalty was dead code for two months and a mismatched pair was still a hard exclude. Measured on the live pool the day it was found: the clause alone cut one user's candidate pool from 16 to 11. The clause is gone; `relevance_kids = 0.5` is now the only expression of the preference, exactly as the 2026-05-17 decision specified. If you are debugging candidate scarcity, check `others()`'s live body against this file first — this is the second time a documented decision turned out to live only in the docs.

### Broadcast relevance boost (`others.relevance_broadcast`)

Added 2026-05-17, migration `relevance_broadcast_boost`. A constant **×2** multiplier in `others()` for any candidate who is **currently broadcasting** — i.e. pressed "Show me to people" / `app_add` and is still inside the broadcast window: `other.relations->>'last_add_at'` parses to a timestamp `> now() - interval '30 minutes'`. Not broadcasting (key absent/empty, or older than 30 min) → **1.0** (neutral).

- Surfaced as the `relevance_broadcast double precision` output column (parallel to `relevance_schedule` / `relevance_kids`) and multiplied into the final `relevance` product alongside age/location/time/watchers/schedule/kids.
- **2.0 is deliberate**: it matches the codebase's existing "maximum boost" magnitude (`schedule_overlap` and `kids_preference_match` both cap at 2.0). Multiplicative, not an override — a broadcaster who is otherwise a poor fit (wrong age band, far, stale) still loses to a strong nearby active match. Broadcasting signals "I want to be seen now"; it lifts, it doesn't bypass suitability.
- The **30-minute window MUST stay in sync** across **all** its inline copies: `app_add` / `app_cancel_add` / `app_lock2` (the broadcast cooldown), `others.relevance_broadcast` (this boost), `app_approve` (broadcasting → free accept, `v_approve_cost`), and the `others()` credits-gate exemption (broadcasting candidate bypasses the balance gate). Each inlines `interval '30 minutes'`; the codebase deliberately does not extract this interval. If that cooldown ever changes, change every one of these predicates in lockstep.
- Not breaking for the deployed app: `others` is internal-only (called by `app_find` / `app_add`, which select named columns), the edge functions never read `relevance_*`, and mobile never sees it. Adding the output column changed the function's composite return type, so the migration `DROP`s then recreates `others` (safe: no positional consumers; Postgres doesn't track SQL-body function→function deps so dependent RPCs are untouched).

### Same-group relevance boost + group chip (`others.relevance_group`, `Profile.group_name`)

Added 2026-05-26, migration `same_group_relevance_boost`. Two coupled changes driven by a single SQL helper:

- **Helper `public._shared_group_name(p_a uuid, p_b uuid) → text`** (`STABLE SECURITY DEFINER`, EXECUTE revoked from anon/authenticated). Returns the name of a group shared between two users, NULL when none. When the pair shares 2+ groups, picks the **smallest** one (`ORDER BY (member_count) ASC, name ASC LIMIT 1` — migration `shared_group_smallest`, user decision 2026-05-26): a small community is a tighter affinity signal than a large one. Name is the deterministic secondary tiebreak so the chosen group is stable across calls. **One source of truth** for "do these two users share a group" — feeds both the relevance boost and the chip text. They can never drift (a candidate showing the chip but not getting the boost, or vice versa).
- **`others.relevance_group`** — constant **×3** when `_shared_group_name((me).user_id, other.user_id) IS NOT NULL`, else **1.0**. Folded into the final `relevance` product alongside age/location/time/watchers/schedule/kids/broadcast. Multiplicative, not an override — a shared-group candidate who is otherwise a poor fit (wrong age band, far, stale) still loses to a strong nearby active match. 3.0 is deliberately above the existing ×2 ceiling (broadcast / schedule / kids): a shared-group match is the strongest "you should meet this person" signal the model expresses today, so it dominates within the suitable pool. The composite return type changed (new column), so the migration `DROP`s then recreates `others` (same safety reasoning as the broadcast boost — no positional consumers).
- **`make_profile(u, dist_m, viewer_id uuid DEFAULT NULL)`** — third arg added. When `viewer_id` is set, the snapshot embeds `group_name` = `_shared_group_name(viewer_id, u.user_id)`; with no viewer (or no shared group) the key is NULL and `jsonb_strip_nulls` drops it, so the output is byte-identical to the old 2-arg shape. The 2-arg overload was **dropped** in the same migration (`DROP FUNCTION public.make_profile(users, integer)`) to avoid ambiguity for callers that still pass 2 args — Postgres can't pick a candidate when a 2-arg signature and a 3-arg-with-default both exist. After the drop, every `make_profile(u, dist)` call resolves cleanly to the 3-arg version with `viewer_id` defaulting NULL.
- **`app_refresh_snapshots` did NOT actually pass `viewer_id` until 2026-07-19** (migration `refresh_snapshots_keep_group_name`) — a repo↔live drift this file asserted was fixed for ~7 weeks. All four single-counterpart rewrites called the 2-arg form, so `viewer_id` defaulted NULL and `group_name` was stripped. `app_find` wrote the chip, the refresh behind the very next request wiped it: the chip flashed and vanished, and only for ACTIVE users (an idle user's snapshot is never rebuilt, so seeded rows kept theirs and looked fine). If the chip regresses again, introspect the live body with `pg_get_functiondef` before trusting this section.
- **6 RPCs updated to pass `viewer_id`** at every call site that writes a snapshot into a single-counterpart slot (`page1.profile` / `page2.profile`): `app_find`, `app_add`, `app_seed_viewer`, `app_invite` (both branches × both directions), `app_approve` (both directions), `app_refresh_snapshots` (every per-slot rewrite, with `viewer_id` = the owner of the slot being refreshed; the inward + outward loops + `my page1/page2.profile` slots all wire the right side). Viewer-list writes (`page2.profiles[]`) stay 2-arg — `_slim_viewer` is an allowlist of `user_id`/`title`/`name`/`is_male`/`last_seen`/`images` that already strips `group_name` by construction, so the chip is **main-photo-only** with no extra guard. The chip will start appearing as `app_refresh_snapshots` rewrites existing snapshots on the affected pairs' next call.
- **Mobile.** `Profile.group_name?: string | null` added to [mobile/src/stores/userStore.ts](mobile/src/stores/userStore.ts). [mobile/src/components/MatchCard.tsx](mobile/src/components/MatchCard.tsx) renders a new on-photo `Chip` overlay at `top: 0, end: 0` (opposite the report flag at `top: 0, start: 0`), `onPhoto` neutral tone, `GroupsIcon` (the same glyph the settings "My groups" row uses) at `ICON.sm` — same chip style as the bottom info chips (age / distance / family). Old mobile builds ignore the new field, so the rollout is non-breaking.
- **Not breaking for the deployed app**: `others` is internal-only (callers select named columns), edge functions never read `relevance_*`, the deployed mobile build ignores the new `group_name` snapshot key, and the dropped 2-arg `make_profile` had only internal RPC callers — all of which were rebuilt against the 3-arg signature in the same migration.
