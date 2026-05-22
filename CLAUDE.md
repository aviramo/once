# Project Instructions

## Operational autonomy (whole project)

Claude has blanket upfront permission for every action it can perform locally or via available tooling. Don't pause to ask "should I run X?" — run it. Reserve questions for steps that are genuinely impossible without the user.

**Default rule: anything Claude can do alone, Claude does alone.** If the action is technically executable with the tools and credentials Claude already has, execute it. Do not narrate intent, do not request confirmation, do not hand back instructions for the user to run. Asking the user to do something Claude could have done is the failure mode — preferable to act and report than to defer and wait.

**Examples of what to do without asking:**

- Edit/write any file in the repo, including config (`app.json`, `eas.json`, `package.json`, `CLAUDE.md`).
- Run `npm install` / `npm uninstall` / dependency upgrades.
- Run `eas build` / `eas submit` / `eas env:*` / `eas credentials` (interactive prompts, route via terminal as last resort).
- **Publish / release on demand.** If the user says "פרסם" / "תפרסם" / "release" / "publish" / "upload" / "ship it" or any equivalent (with or without naming a platform), run the release command yourself — do not hand back instructions. Default is both platforms via `cd mobile; npm run release` (= `eas build --platform all --profile production --auto-submit --non-interactive --no-wait`). For a single platform, use `npm run release:android` or `npm run release:ios`. The configured submit targets are TestFlight (iOS) and the **`production`** track (Android — public Play Store; flipped from Closed testing `alpha` on 2026-05-18 for the public launch). After kicking off, report the build + submission URLs and stop — do not poll or wait.
- Run any git operation except destructive ones called out below.
- Apply Supabase migrations and deploy edge functions (see "Server-side autonomy" below for the full list).
- Hit any REST API with credentials Claude already has access to.
- Long-running commands (EAS builds, deploys) → run in background (`run_in_background: true`) and continue working; only flag the user when their input is needed.

**When to ask:** the action is impossible without the user — browser-only portal flows (Apple Developer Center, App Store Connect web UI, Google Play Console web UI, Firebase Console, GCP Console enabling APIs), 2FA codes coming to the user's phone, physical-device interaction, or destructive actions on shared/production data (truncating live tables, force-pushing main, dropping columns with user data). For these, hand the user the exact link/step and continue with anything else that's parallelizable.

**Don't ask for confirmation as a courtesy.** "Ready to proceed?" / "Should I run X?" / "Do you want me to also do Y?" are time-tax on the user. Just do it and report.

## Project task queue (Trello)

The canonical queue of every actionable request from the user lives on the Trello board **Once Dev** (`https://trello.com/b/3PkwSFiR/once-dev`). `TODO.md` has been retired — Trello is now the only source of truth. **All card content, list names, and labels are in Hebrew.** Proper product/service names (Apple, Sign in with Apple, Google Play, Supabase, TestFlight, etc.) stay in their original Latin form inside Hebrew sentences.

- **Order of operations: Trello first, work second.** When the user gives an actionable request, the very first thing Claude does is create the Trello card (in `לעשות`, or `בתהליך` once work begins) — *before* reading files, planning, editing code, or running tools to solve the task. This guarantees the queue captures the request even if the session is interrupted mid-solve, and gives the user a visible record of what Claude is about to work on. Only after the card exists does Claude start on the solution. The single exception is the "work already complete inline" path below: trivial fixes that resolve in one or two tool calls may be solved first and then logged to `בדיקות` in the same response — but the moment a request looks like it needs more than that, create the card first.
- **Every actionable request the user makes becomes a new Trello card** — large features, small chores, bugs, deployment milestones. Do this automatically, without being asked. The list the card lands in depends on whether the work is already done by the time the card is created:
  - **If the work is still pending** (not yet started, or in progress) → create in `לעשות`.
  - **If the work is already complete in the same response** (typical for small fixes Claude resolves inline) → create directly in `בדיקות` so the user knows it's ready for manual verification, not still on the queue. Pass `-List 'בדיקות'` to `create-card`.
  Pure questions and information lookups ("what files do we have?") don't count. The `בתכנון` list is a user-managed parking lot for ideas not yet promoted to active work; do **not** drop new tasks there unless the user explicitly asks.
- **One topic = one card. Follow-ups in the same conversation are comments, not new cards.** As long as the user keeps talking about the same topic — refinements, corrections, additional details, "also do X" tied to the same goal, retries after a bug, related sub-asks — do **not** open another card. Instead, append a Hebrew comment to the existing card via `& .\.claude\scripts\trello.ps1 comment -Id <cardId> -Text "<עדכון בעברית>"`. Remember the `cardId` from the create call (or the most recent comment) for the rest of the conversation. Only open a **new** card when the user pivots to a genuinely different topic (different bug, different feature, different surface). When in doubt — if the new ask shares a noun with the previous one (same screen, same flow, same fix) — comment. Why: the board fragments into duplicate cards otherwise, and the conversation history about a task lives on the card it belongs to, not scattered across siblings.
- **New cards land at the top of the list** (`pos = 'top'`). Most-recent request appears first when the user opens the board, so the queue reads newest-first. The `trello.ps1 create-card` helper applies this automatically — do not override.
- **Every card MUST carry all three labels, chosen by Claude.** Never create a card without labels. The `trello.ps1 create-card` helper enforces this and refuses to create an untagged card; if you ever see a card on the board with zero labels, that's a bug to fix immediately by attaching the right three (Claude's responsibility, not the user's). One label per axis. Label names are in Hebrew with a Hebrew prefix:
  - `טכני:<תחום>` — the technical area touched. Examples: `שרת`, `מסד-נתונים`, `מובייל`, `אימות`, `הפצה`, `תשתית`, `נוטיפיקציות`, `צ'אט`, `i18n`, `קונפיג`. Blue.
  - `חוויה:<משטח>` — the product surface the user encounters. Examples: `התחברות`, `אונבורדינג`, `התאמות`, `צ'אט`, `פרופיל`, `בטיחות`, `זמינות`, `גילוי`, `רגולציה`, `נוטיפיקציות`. Green.
  - `עסקי:<ערך>` — the user value the task delivers. Examples: `אמון` (user confidence in safety/integrity), `מעורבות` (gets users using the app more), `איכות-התאמה` (improves who-meets-who outcomes), `בטיחות` (protects users from harm/abuse), `שימור` (keeps existing users coming back), `רכישה` (lets new users find/install), `הכנסות` (revenue). Orange.

  The lists are seeds — add new labels when none fit. The helper auto-creates missing labels (blue for `טכני:*`, green for `חוויה:*`, orange for `עסקי:*`).
- **Card description format (Hebrew):** lead with `**נוסף:** YYYY-MM-DD`, then `**למה:** <user value or trigger>`, then `**הערות:** <links, file paths, blocked-by, follow-ups>`.
- **Attach user-sent images to the card.** Any image the user pastes or sends in the same message that produces a card must be attached to that card. Do this automatically right after `create-card`, without asking. Images are usually the bug evidence or the design reference — losing them defeats the point of the card.

  **Pasted images (Ctrl+V in the chat) are NOT files on disk.** Claude Code embeds them as base64 inside the current session log at `~\.claude\projects\<project-key>\<sessionId>.jsonl`. The `attach-file -Path` form will not work for them — Claude has no path to pass. Use the dedicated verb that reads the most-recent user message from the session log, decodes every base64 image found there, and uploads each one to the card:

  `& .\.claude\scripts\trello.ps1 attach-pasted -Id <cardId>`

  Run it **once per card**, immediately after `create-card`. It handles multi-image messages automatically (one upload per image). Decoded files land in `%TEMP%\trello-pasted\` so they're inspectable if the upload fails.

  For images the user provided as a literal file path (e.g., a screenshot they saved to `c:\tmp\foo.png` and named in the message), keep using the path-based form, once per image:

  `& .\.claude\scripts\trello.ps1 attach-file -Id <cardId> -Path <imagePath>`
- **Status = list:** `בתכנון` = parking lot (user-managed), `לעשות` = open, `בתהליך` = in progress, `בדיקות` = manual testing/review state. Move cards between lists with `trello.ps1 move-card -Id <id> -List <name>`. **Two archive triggers:**
  1. **Explicit close** — the user says "סגור" / "נסגר" / "מאשר" / "close it" / "done" / "approved". Archive immediately via `trello.ps1 archive-card -Id <id>`.
  2. **Due-complete checkmark** — the user marks the card's due-date checkbox (green ✓ on the board). This is their own explicit "I'm done with this" signal. Archive it on sight.
  Do not auto-archive on your own judgement that the work looks finished; only the two signals above qualify. Archived cards stay in Trello's archive (recoverable), no separate "Done" list.
- **Ongoing sweep:** every time you touch Trello (any verb other than `ping`/`lists`/`labels`), first run `& .\.claude\scripts\trello.ps1 sweep-complete` so any due-complete card the user ticked since the last interaction gets archived. The sweep is idempotent and cheap — one board-cards GET plus one PUT per complete card. Don't skip it.
- **Session start:** no auto-listing of open tasks at session start. The user does not want a status dump on every conversation; Claude only fetches tasks via `trello.ps1 list-open` when the user explicitly asks ("מה במשימות", "show me the queue", etc.) or when context requires it.
- **Helper CLI:** `.claude/scripts/trello.ps1` with verbs `list-open`, `create-card`, `move-card`, `archive-card`, `comment`, `attach-file`, `attach-pasted`, `sweep-complete`, `recent-activity`, `get-card`, `lists`, `labels`, `ping`. Examples:
  - Create a new task: `& .\.claude\scripts\trello.ps1 create-card -Name "<כותרת>" -Desc "<גוף>" -Labels @('טכני:שרת','חוויה:פרופיל','עסקי:איכות-התאמה')`
  - Comment on the active card (same-topic follow-up): `& .\.claude\scripts\trello.ps1 comment -Id <cardId> -Text "<עדכון בעברית>"`
  - Move to In progress: `& .\.claude\scripts\trello.ps1 move-card -Id <cardId> -List 'בתהליך'`
  - Close: `& .\.claude\scripts\trello.ps1 archive-card -Id <cardId>`
- **PowerShell 5.1 + Hebrew gotcha:** PS 5.1 reads `.ps1` files without a UTF-8 BOM as Windows-1252, so Hebrew string literals embedded directly in script source get mangled. When new Hebrew content is needed at script time (e.g., bulk card create/update), write the Hebrew strings to a JSON data file and have the PS script read it via `[System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))` and `ConvertFrom-Json`. The `trello.ps1` helper itself uses Unicode escape sequences (`[char]0x05D8`...) for the Hebrew prefixes so it stays ASCII-safe in source.
- **Credentials:** API key + token live in `.claude/secrets/trello.json` (gitignored via `.claude/` blanket rule). Template at `.claude/secrets/trello.json.example`.

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

These rules are absolute and must be applied any time the PagerView layout or pane navigation is touched.

### Pane mapping
- **Settings (Menu pane)** is a full PagerView slot — embedded `SettingsPage` with no internal `ScreenHeader`.
- **Page 1 (Home pane)** always maps to `page1` data.
- **Page 2 (Viewers pane)** always maps to `page2` data.

### Page 2 rendering
- `page2` is an **array** → show viewers list.
- `page2` is an **object** → show incoming invitation card (with timer + approve/decline buttons).

### Visual order (immutable)
RTL right→left: **Menu | Home | Side(page2/chat)**.
Logical pane constants (never change): `SETTINGS=0, HOME=1, PAGE2=2, CHAT=2`

`PAGE2_PANE === CHAT_PANE === 2` — they share the same physical slot.

### PagerView layout
Default 3-page layout:
`[settings(slot 0), home(slot 1), side(slot 2)]`

There is no separate Settings overlay any more — Menu is just slot 0 of the same PagerView. No directional swipe-to-open / swipe-to-close gestures. The user reaches Menu by tapping its tab or swiping from Home toward the Menu side.

Slot 2 renders `ChatPage` when `chatAvailable` (`state === 'chat'`), page2 content otherwise.
No slot is added or removed by the chat↔page2 toggle — only the *content* of slot 2 changes there.

**The one exception is the geo-availability gate.** While `geoGated` the pager renders **only 2 children** `[settings, home]` — slot 2 is not rendered at all (`...(geoGated ? [] : [<side/>])` spread in the children array; spread an empty array, never a falsy child). This is deliberate and supersedes the earlier "onPageSelected snaps back" mechanism: react-native-pager-view has no per-page swipe lock, so a 3-child pager always lets a finger reach slot 2 and the snap-back could only bounce it back *after* it was already on screen — which the user (correctly) reads as "still accessible". Removing the child is the only way to make page2/chat truly unreachable while keeping Home↔Menu swipeable. `initialPage` is clamped to `min(initialPane, HOME_PANE)` when gated so a stale chat/page2 notification can't seat the pager on the now-nonexistent index 2. The `onPageSelected` snap-back and the `geoGated` effect that pulls paneIndex back to HOME are kept as defense-in-depth for the 3→2 children transition (gate flipping on while the user is on slot 2). See "Geo-availability gate".

### Global TabStrip
- A single `<TabStrip>` lives at the top of the home shell, inside the safe area, **above** the PagerView.
- It is the only chrome with a title; `HomeHeader` / top-level `ScreenHeader` are no longer rendered inside page1, page2, or `SettingsPage` (when embedded).
- Three tabs in pager-slot order: **icon-only Menu** (chrome, not a destination), `home.tabs.home` (always "Once"), and the **side tab** (page2 / chat).
- The Menu tab carries no text label — it's a single glyph (`HeartIcon` normally, `CloseBoldIcon` while the profile-preview sheet is open, as the sheet's close affordance). It does **not** swap for pause: the game-mode pause/resume control lives on the **home pane's center circle** (see the "Home-pane pause button" bullet) — the settings `GameModeCard` button was removed at the user's request (2026-05-19). It has `flex: 0` (shrinks to glyph width with `paddingHorizontal: SM`) so the content tabs absorb the freed flex and read wider. A labeled tab keeps `flex: 1`. Mechanism: `TabSpec.label` is optional; an absent label triggers the compact icon-only tab style **regardless of `subLabel`** (a `subLabel` no longer forces flex width — it rides absolutely above the glyph, zero layout box, so an icon-only tab can still carry the viewer-count number / a status word above it; `iconOnly`/`compactFlags` are `label == null` only and MUST stay byte-identical to each other). **Equal-width guarantee — EXPLICIT, not flex:** flex auto-distribution (even `flex:1`+`flexBasis:0`+`minWidth:0`) repeatedly did **not** yield equal content tabs in practice (the morph "Once" tab vs the labelled page2 tab kept diverging). So the two flexible content tabs are given an **explicit identical width** computed in `TabStrip`: `flexW = round((rowW − Σ compact-tab widths) / #flexible-tabs)`, where `rowW` (the `styles.row` width) and the compact tabs' content widths are React state from `onLayout`. `flexW` depends ONLY on `rowW` + the *compact* widths (never on the flexible tabs' own measured width) ⇒ no measure→resize→measure loop; it settles in ≤2 renders then is stable. Flexible tabs render `{ width: flexW }` (the `AnimatedPressable`'s `LinearTransition` animates the change when the side tab expands/collapses); compact tabs stay content-sized; `styles.tabFlex` (`flex:1+flexBasis:0+minWidth:0`) is now only the ~1-frame pre-measurement fallback. Net: tab1 and tab2 are byte-identical width whenever page2 carries a profile, and `TAB.indicatorInsetX = 0` so the chip spans the FULL tab. Styles are still applied exclusively as `[styles.tab, iconOnly ? styles.tabCompact : (fixedWidth!=null ? {width} : styles.tabFlex)]` — never put `flexBasis:0` on the shared `styles.tab` (it once leaked onto compact tabs: `flexBasis:0`+their `flex:0` collapsed the icon tabs to zero width, end glyphs went asymmetric).
- **The side tab is labeled ONLY when slot 2 is dedicated to a single counterpart** — an incoming-invite card (`page2PendingInvite`) or a dead-invite "what happened" card (`page2DeadInvite`); the label is that person's name. In every ambient state (live chat, or self-visibility: broadcast / visible / hidden) there is no 1:1 person to name, so the side tab **collapses to an icon-only compact tab exactly like Menu** (`flex: 0`), freeing flex so "Once" recenters between the two compact end tabs. Expand ↔ collapse is animated by `TabStrip` itself: every tab is an `AnimatedPressable` with `layout={LinearTransition.duration(TAB.collapseDuration)}` (the width/X reflow) and the label/icon clusters carry `FadeIn`/`FadeOut` of the same `TAB.collapseDuration`, so the content cross-dissolve and the reflow finish together. Menu/Home never toggle these props so their wrappers stay mounted and never fade.
  - Collapsed-state glyph: `chatAvailable` → `ChatIcon`; otherwise the visibility glyph via the shared `VISIBILITY_ICON` map (`broadcast` → `MegaphoneIcon`, `visible` → `EyeOpenIcon`, `hidden` → `EyeOffIcon`) — the **same** map the in-page `VisibilityToggle` segments use, so a given state always reads as the same icon. Icon size = `ICON.xxl` (matches Menu; `ICON.xxl` is the single default glyph size app-wide).
  - **Viewer-count number (collapsed):** in the ambient icon-only side states **broadcast / visible**, when the viewer list (`watchers` / `page2.profiles[]`) is non-empty the count rides as a `subLabel` **number above the glyph** — the EXACT slot the live timer uses on the labeled branch — without widening the still-compact tab (`showViewerCount = !sideTabName && !chatAvailable && watchersCount > 0`; chat has no viewer list and hidden kicks every watcher so `> 0` already excludes both — no explicit hidden guard). When the count **rises** (a new watcher joined; increase-only, post-baseline so a cold mount that loads with viewers does not pulse) the whole tab fires the **short 2-blink** attention pulse (`TAB.viewerPulseCount = 2`, `TAB.viewerPulseTimeoutMs`) via `viewersAlerting` + `TabSpec.alertCount` — the same finite `alerting` machinery as chat-unread / incoming-invite but two blinks instead of the default `TAB.pulseCount` 3, so it reads as a light double-tick, not an alarm. Same single-dep coalescing/timeout pattern as the chat-unread pulse (a burst of new viewers within the window = one double-tick). Chat-unread on the collapsed chat icon still uses the default 3-blink `sideAlerting`.
  - **Broadcast pulse:** while broadcasting, the collapsed megaphone glyph runs a continuous gentle "alive" heartbeat on the `TAB.subLabelPulsePhaseMs` half-cycle (the same beat the sub-label status word and `PresenceDot` use), driven by `TabSpec.indicatorPulsing` through the shared `useGentlePulse` hook (called with `lo = 0`). The pulse is **not an alpha dim** — it oscillates the glyph between its normal *unselected* rendering (muted `WHITE_MID` layer) and its *selected* rendering (active `WHITE` layer), i.e. it continuously drives the exact active/muted layer cross-fade that selection and the finite `alerting` already drive. Implemented as indicator-only `indicatorActiveStyle` / `indicatorMutedStyle` that substitute `max(alertActive, 1 - indicatorBeat)` for `alertActive` in the standard layer math; the two layer opacities always sum to 1 (no flicker). It is inherently **selection-gated**: on the selected pane the tab's own selectedness `t = max(0, 1 - |pagerProgress - index|)` is `1`, which pins active = 1 / muted = 0 regardless of the beat, so the glyph holds steady there and only breathes while the pane is unselected — fading smoothly across the swipe rather than snapping. When `indicatorPulsing` is false `indicatorBeat` rests at `1` so the substitution collapses to plain selection behaviour and every other tab's indicator is byte-identical to before.
- Counts: the **unread-chat count** is **chained directly into the side-tab label** as `${label} ${n}` — there is no separate chip badge — but only in the labeled (pending/dead-invite) states. The **viewer count** is instead surfaced as the collapsed side tab's `subLabel` number (see "Viewer-count number (collapsed)" above), so the ambient icon-only states are no longer count-free. One piece of text reads cleaner at small tab size and avoids the extra circle competing with the word. `TabSpec` has no `chip` field; callers build the full label string themselves. The label still pulses on alerting transitions (the pulse is applied to the label stack), and `chatAvailable && chatUnread > 0` still alerts via the tab-level pulse on the collapsed chat icon even though the number is no longer drawn.
  - `page2PendingInvite` → labeled with the inviter's name, alerts on arrival via the tab-level pulse, and the live countdown rides under the label as `subLabel`.
  - `page2DeadInvite` → labeled with the other user's name and, when the lock came from `expire`, the timer stays frozen at 00:00 under the label — together they communicate "this side is finished" without an extra pause icon, which read as noise next to the name.
- **Home-pane pause button (2026-05-22, user request — SUPERSEDES the former "Home-tab pause/resume accessory"; everything in the REST of this bullet, including the Watching/Paused sub-bullets, describes the removed tab-accessory and is DEAD — do not implement it).** The game-mode pause control was **moved off the Home tab onto the home pane's center circle**. During a skip the match card slides off and the round center `Pressable` in the empty page1 pane (the `permAvatar` circle between the headline and the radar rings — previously the user's own avatar, see the `page1Profile` render branch in `home.tsx`) is revealed as a **pause button**: a `PauseIcon` in a white circle (`pausing` → `Spinner`). Tapping it calls **`runPauseFromSkip`** (`home.tsx`) — there is **no confirm dialog** (user wants an immediate stop; pause is recoverable from the center play button). It must STOP the search and never surface a new profile, **even one the server already found** (the "Loading profile data" state): (1) it aborts the skip pipeline client-side via `skipAbortedRef` — a ref checked by the remote→displayed sync effect, `startPreload`, and `onPreloadReady` so no candidate is ever promoted — and tears down the radar / hidden preloader / loading copy; (2) it fires `app/pause` **chained after any in-flight `app/find`|`app/ignore`** (tracked in `inflightSkipRef`) so the server commits `app_pause` LAST and page1 ends `locked`, never re-overwritten back to `watching` by a late `app_find`. `runFind`/`runIgnore` reset `skipAbortedRef` and populate `inflightSkipRef`. The Home tab now **always reads "Once"** (still morphs to "My profile" with the profile sheet) and passes **no `accessory`/`onAccessoryPress`/`accessoryCenter`/`pauseIcon`/`pauseProgress`** — those `TabSpec` props remain in `TabStrip` as unused optional capability. The `useGameMode` hook + its `ConfirmDialog` and the `settings.gameMode.offConfirm*` i18n keys were **removed** (no consumer left); the settings `GameModeCard` pause/play button was removed earlier (2026-05-19). There is still no dedicated in-app resume affordance — the center play button re-enters the game via `app/find`. Original (now-dead) tab-accessory design follows. `TabSpec` carries `accessory?: (color: string) => ReactNode` (a **colour function** like `renderIndicator`, NOT a `ReactNode` — so TabStrip can give the glyph the SAME active(`WHITE`)/muted(`WHITE_MID`) two-layer cross-fade as the wordmark) + `onAccessoryPress?: () => void` + `accessoryCenter?: boolean`. **The accessory is no longer a separate `Pressable`/`box-none` band — it is rendered INSIDE the morph band as part of the wordmark**, in the same `morphInner` wrapper that carries `pulseAnim`+`pressLabelStyle`, under the `nameSwapDimStyle` group, under the `labelMorphBand`+`labelNudge` outer. Consequences of living in `morphInner`: the glyph inherits the wordmark's pulse (finite `alerting` blink), press-scale, nameSwap fade and the shared `−labelLift` automatically. **Glyph-ONLY tap = the action (2026-05-19, user reversal of the earlier whole-tab rule):** the tab's `AnimatedPressable` `onPress` is plain `onPress` (always navigate). The pause action is wired to a dedicated **transparent `styles.morphAccessoryHit` `Pressable`** overlaid ONLY on the glyph zone, rendered as a sibling AFTER the `pointerEvents="none"` morph band (so it is the deepest responder there): a tap **on the glyph** fires `spec.onAccessoryPress`, a tap **anywhere else on the tab** falls through to the navigate-onPress. It's rendered only when `spec.onAccessoryPress` is set (the watching pause; the paused/centred glyph passes none ⇒ stays non-interactive). The glyph is pinned to the **LEADING** side (`styles.morphSideAccessory` `start: SM`; user moved it from trailing). Every other tab passes no `onAccessoryPress` ⇒ plain navigate, byte-identical. Two placements via `accessoryCenter`:
  - **Watching** (`gameMode.visible && state==='watching'`, `accessoryCenter:false` ⇒ `hasTrailingAccessory`): the base name + glyph render as **ONE centred unit** — `styles.morphNameUnit` (absolute-fill row, `justifyContent:center`, `alignItems:center`, `gap:XS` so the glyph is snug/"צמוד" to the text). The name is a relative `labelStack` (active text drives the cluster width, muted is the `labelOverlay` overlay); the glyph is a relative `indicatorStack` (active drives width, muted is `indicatorOverlay`). **BOTH the text and the glyph use the SAME `baseWord*` opacity styles** (`baseNormalActiveStyle`/`baseNormalMutedStyle` for a pause-swap tab — Home — else `baseActiveStyle`/`baseMutedStyle`), so the glyph's opacity is **byte-identical to the name's in every state** (selection cross-fade, `alerting`, the profile-sheet morph `×(1-m)`, the pause split `×(1-p)`, press, nameSwap). The unit is absolute-fill ⇒ it never changes the tab's measured width (iron-rule no-reflow/no-clip intact); `flexW`/the chip are untouched. The glyph co-centres against the name's `lineHeight==rowHeight` box via `alignItems:center` (NO per-glyph `iconNudge`/`labelNudge` any more — the unit as a whole rides the band's shared `−labelLift` like every wordmark). The `pauseIcon` (basePause) slot is NOT drawn in this branch (the unit replaces it; Home's `pauseIcon` is `()=>null` anyway). Glyph wrapped in `FadeIn/FadeOut(collapseDuration)`. Tap → `app/pause` (the hook opens the shared destructive-ripple `ConfirmDialog` — `gameMode.confirm`, same copy as the visibility-toggle popups — when broadcasting / watchers / pending / a watching partner apply, else commits directly).
  - **Paused** (`gameMode.visible && gameMode.paused`, `accessoryCenter:true` ⇒ `hasCenterAccessory`): the glyph is centred over the band (`styles.labelOverlay`+`styles.morphIconCenter`) as a two-layer pair driven by `activeStyle`/`mutedStyle` (pure selection cross-fade — "opacity like the text"), standing in for the wordmark that has faded out via `pauseProgress` (the base word still fades via the unchanged baseNormal/basePause path). User decision 2026-05-19: the paused glyph is a pause symbol, NOT a play symbol, and is **deliberately NON-interactive** ("non-clickable when in pause mode") — home.tsx passes **no** `onAccessoryPress` while paused, so `onPress` falls back to the plain navigate (a no-op-ish; the glyph is status-only). Glyph wrapped in `FadeIn/FadeOut(collapseDuration)`.
  The glyph is therefore ALWAYS a `PauseIcon` (passed as `(color)=>…`); only placement + opacity-driver differ. **The earlier "separate interactive overlay rendered at constant `WHITE` regardless of selection" / `styles.accessoryBand`/`accessoryCenter`/`accessoryTrailing` / `styles.iconNudge` on the accessory / `dimStyle` split are GONE**; the only new style is `styles.morphNameUnit`. Decision logic is unchanged: the shared **`useGameMode()` hook** (`mobile/src/hooks/useGameMode.tsx`) is the single source of truth — `{visible, paused, busy, onPress, confirm}`; `visible=!hidden` (hidden in transient waiting/pending/chat), `paused=isOff` (both pages locked, no partner/invite); `onPress` calls `tap()`/`tapWarning()` itself. The Home-tab `pauseIcon` stays `() => null`. **Consequences (known, accepted per the user's directives):** (1) there is no in-app resume affordance — the settings button was removed and the paused glyph is non-interactive, so `app/resume` is not reachable from the UI as currently specced (revisit if wanted; supersedes the earlier "resume reachable only here" design). (2) While watching, a tap on the Home tab **pauses** instead of navigating to Home — intentional per the user's explicit "ברגע שיש את הסמל פאוז אז לחיצה על כל הטאב תגרור לפעולה"; benign because you are already on the Home pane while watching (navigation was a no-op), and you still leave Home by swiping or tapping Menu/Side.
- Container background is a **flat solid `PRIMARY`** (pure black `#000000`) header — **no gradients anywhere and no drop-shadow** (the user explicitly removed both). `backgroundColor: PRIMARY`, seamless with the PRIMARY status bar (`StatusBar style="light" backgroundColor={PRIMARY}`); the *only* separation from the white content below is the black color contrast (no `boxShadow`, no elevation). The bottom edge is **square and full-width** (no `borderRadius`, no `overflow: 'hidden'`). The container carries a snug `paddingHorizontal: SM + XS` (originally a tighter `SM`; bumped a touch at the user's request — composed from tokens, not a literal). It is symmetric, so it only narrows the row equally on both sides; `TabStrip` recomputes its equal `flexW` from the new `rowW` and the chip stays centred per tab, so tab structure/symmetry are untouched. The chip↔glyph breathing room is a *separate* concern owned by `tabCompact.paddingHorizontal (LG) − TAB.indicatorInsetX` inside the row, so the edge margin and the inner padding tune independently. `paddingTop` is `topInset + XL` (not `MD`): the sub-label timer floats as a caption *above* the selected-tab chip, so the header needs real top breathing room to keep the timer clear of the status bar. Paused (`gameModeOff`) swaps the solid `PRIMARY` for flat `BLACK_MID`. There is intentionally **no conditional / scroll-driven header shadow** — it was built once and then removed at the user's request; do not reintroduce it.
- The "selected" indicator is **two layers driven by two SEPARATE values** (this split is the 2026-05-17 change — the user explicitly revisited the old "both driven by `pagerProgress`, 1:1 with the finger" model because the chip's per-frame width recompute dragged on the pager's release-settle):
  1. **ONE flat translucent-white chip** (`HEADER_PILL_FILL` solid `rgba` — *not* a gradient — plus `HEADER_PILL_BORDER` / `HEADER_PILL_SHADOW`), a single moving element (*not* per-tab opacity) that **spans the selected tab's full width** (minus `TAB.indicatorInsetX` each side) and **resizes** between the unequal tabs. **It is ONE live, linear, LAYOUT-driven motion** (user choices 2026-05-17 — "translate AND grow/shrink TOGETHER", "perfectly linear in the pager position", "the radius must always stay the same"): position AND size both interpolate from the **same live `progress`** (= `tabProgress`, PagerView `onPageScroll` on the UI thread — the RN analogue of a CSS/native constraint, not a JS-thread loop; it already folds in the `profileSheetProgress` blend toward `HOME_PANE`, so opening the profile sheet still slides the chip Settings→Home). The slide and the resize are one synced motion that is *exactly linear* in the swipe. **Size is the real layout `width`/`height`, NOT `scaleX`/`scaleY`** — a non-uniformly scaled rounded rect cannot keep a constant-looking corner (scaling was what made the radius visibly change mid-swipe), so there is no scale at all, no decoupled `chipProgress`/`chipPane`, and `borderRadius` is a single CONSTANT (`TAB.indicatorRadius`) that never lerps or distorts. The chip is a single absolutely-positioned leaf in an absolute-fill overlay, so per-frame `width`/`height` re-lays out ONLY this node (no flex-row reflow — that is exactly why the overlay exists; the original settle-stutter was the *pager-coupled* model, not this single absolute leaf). It is `position:absolute` inside a plain absolute-fill overlay (`styles.chipOverlay`, `pointerEvents="none"`, first child so it paints behind the labels), anchored physical **`left:0`**, box-centred on the mainRow then nudged DOWN by **`TAB.chipBaselineNudge`** (a static, declarative `bottom` offset — the single Y-centring knob — so the capsule centres on the tab's optical ink rather than reading high above it). **RTL is unchanged and still the one delicate bug:** position comes from tab **widths** (`w0/w1/w2`, from each `TabButton`'s `onLayout` — never an `x`/`measureInWindow`/analytic mirror) in logical/child order: `logicalLeft = centre − liveW/2` (both from the live pager: `centre` = live-interpolated tab centre, `liveW` = live-interpolated tab width − `2*indicatorInsetX`), applied as `translateX = isRTL ? −logicalLeft : +logicalLeft`. **No `Math.max(0,…)` clamp on `logicalLeft`** — toward a narrow tab it can legitimately go slightly negative; a clamp to 0 once froze the visual centre mid-screen and made the chip "stick then snap onto the tab" instead of moving linearly. With the real (unscaled) `liveW` the centre is exactly `centre`, i.e. precisely linear in the pager. This app RTL-swaps `left`, so `left:0` lands at the row's start and that sign (the proven-correct `marginStart = logicalLeft` equivalence) is right in both directions; `transform` is immune to the RTL swap so the sign is the only directional term. The interpolation is generalized to `tabs.length` (2 while geo-gated, 3 otherwise) and clamps the live `progress` to `[0, n-1]`. opacity 0 until measured; widths animate over `TAB.collapseDuration` on side-tab expand/collapse. **Do NOT** reintroduce `measureInWindow`/analytic-RTL-mirror/`start:0`/flex-child-`marginStart` (each broke RTL or stuttered), do NOT replace with per-tab opacity (not real movement), and **do NOT reintroduce `scaleX`/`scaleY` for the resize** (it makes the constant `borderRadius` visibly distort mid-swipe — the exact bug this layout-driven model fixed) — unless the user explicitly asks to revisit again. **The chip GROWS UPWARD to enclose the sub-label timer** (user choice 2026-05-17, replacing the old "timer floats as a caption *above* the chip" — that prior rule is dead). Two heights: `CHIP_SHORT = TAB.rowHeight + 2*TAB.indicatorPadV` (single-line capsule, `borderRadius = TAB.indicatorRadius` = half that → true capsule) when the tab has no sub-label; `CHIP_TALL = CHIP_SHORT + TAB.timerGap + TAB.timerFontSize + CHIP_TOP_BAND` (a 2-line rounded-rect wrapping the timer line, which renders at `TAB.timerFontSize` and sits `TAB.timerGap` above the name) when it does. **`CHIP_TOP_BAND` is DERIVED in `TabStrip`, not hand-tuned**, so the air above the timer equals the air below the name *by construction*: `CHIP_TOP_BAND = 2*TAB.chipBaselineNudge + NAME_BOTTOM_SLACK + TAB.timerTopPad`, where `NAME_BOTTOM_SLACK = (TAB.rowHeight − TEXT.xl)/2 + TAB.labelLift` mirrors the name glyph's centring+lift slack (the tight timer line-box has none) and `2*TAB.chipBaselineNudge` both neutralises the chip's optical down-shift eating the top and mirrors the bottom's nudge. It self-corrects if any of those metric tokens change; `TAB.timerTopPad` is only a 0-default residual eyeball nudge. `TAB.timerGap` may be **negative** (pulls the timer down into the name row's empty top slack); `TAB.timerFontSize` (= `styles.subLabel` font+lineHeight, currently `20` — deliberately between `TEXT.lg` and the name's `TEXT.xl`) and `TAB.timerTopPad` feed `CHIP_TALL` so the pill auto-regrows to keep wrapping the timer and the top air stays symmetric — bump those single tokens to resize the timer / add top room. **Height is per-tab exactly like width**: per-tab `h0/h1/h2` shared values target `CHIP_TALL` iff `tabs[i].subLabel != null` else `CHIP_SHORT`, set instantly on first run and `withTiming(TAB.collapseDuration)` on change (so a selected tab gaining/losing its timer grows/shrinks in place — the "invite arrives while already on the side tab" case). The chip's live height is the real layout `height`, interpolated from the `hs[i]` by the same live pager as width (so it grows in lockstep with the slide). The chip box is **bottom-anchored** (`bottom: -TAB.indicatorPadV - TAB.chipBaselineNudge`, the only static geometry left), so a taller `height` extends the chip **upward only** and the name's Y never moves (iron rule: tab labels never move) — no `scaleY`, no counter-`translateY` needed. `borderRadius` is the single CONSTANT `TAB.indicatorRadius` (with `borderCurve: 'continuous'`) — identical at SHORT (reads as a capsule) and TALL (a taller rounded-rect with the same 22 corner) and unchanging through the whole motion; there is no `indicatorRadiusTall` and no height-lerp. The timer (`subLabelOuter.bottom = TAB.rowHeight + TAB.timerGap`) now sits *inside* the grown pill, just above the name (still absolute → adds nothing to natural height, name Y constant); `FadeInDown`/`FadeOutUp` read as the pill opening up to reveal / collapsing to hide it. **Do NOT** revert the chip to a fixed single-line capsule with the timer floating above, do NOT reintroduce `scaleX`/`scaleY` for the resize (distorts the constant radius), and do NOT re-add a height-lerped or per-tab `borderRadius` (the user requires it constant) — unless the user explicitly asks to revisit again.
  2. **On top of the chip, the typographic cross-fade.** Each label reads `t = max(0, 1 - |pagerProgress - index|)` inside `useAnimatedStyle` and renders two stacked layers: an **active** layer (`fontWeight: WEIGHT.extrabold`, `color: WHITE`, `opacity = t`) drives the natural width, and a **muted** layer (`fontWeight: WEIGHT.semibold`, `color: WHITE_MID`, `opacity = 1 - t`) overlays it via `position: absolute` + `textAlign: center`. The active layer additionally carries a faint `HEADER_TEXT_SHADOW` emboss (fades 1:1 with selection, `textShadow` doesn't affect layout). **The label cluster carries NO selection-driven transform** — opacity/weight/colour/shadow are the only selection effects, none of which change layout, so the label's position is rock-constant and it never moves vertically as the chip arrives/leaves. (A former `TAB.selectedScale` grow was removed: animating `scale` on the `<Text>` every swipe frame re-rasterized the glyph and made the label jitter up/down — the iron-rule "Tab labels never move" is literal. `TAB.selectedScale` no longer exists.) The only vertical offset is the **constant** `-TAB.labelLift` glyph-centring nudge (matched by `+TAB.iconBaselineNudge` on the icon cluster), folded into the per-cluster press worklets' `transform` array (`pressLabelStyle` / `pressIndicatorStyle`) — **not** as a static `transform` on `styles.labelStack` / `styles.indicatorStack`, because a RN/Reanimated style array *replaces* (never merges) `transform`, so a static wrapper transform is silently clobbered by the animated press transform and the nudge never applies (the label then renders low on Android and sits below the icons). It is constant and never selection-driven; only the press `scale` is dynamic. `fontWeight` can't be animated continuously (it swaps the font face), so the cross-fade is the only way to morph weight 1:1 with the swipe without width thrash.
- The label carries a **static `letterSpacing: TAB.labelTracking`** applied equally to BOTH stacked layers. The earlier "no letterSpacing" rule was *only* about animating it (width thrash vs. the weight cross-fade); a constant value identical on both layers is safe — the active layer still drives natural width and the absolute muted overlay registers exactly on it.
- Press feedback: each tab's content cluster (label / icon) dips to `TAB.pressScale` while held (`onPressIn`/`onPressOut` → `withTiming` on a `pressed` shared value), springing back on release. Tactile, not a bounce.
- `pagerProgress` is driven by PagerView `onPageScroll(position + offset)` and feeds `tabProgress` (= `pagerProgress` blended toward `HOME_PANE` by `profileSheetProgress`), which drives **both** the label/typography cross-fade **and** the selected chip (position + size) — one live, linear, synced motion (see the indicator bullet).
- Tab labels use `TEXT.base` + `maxFontSizeMultiplier={FONT_SCALE.ui}` so all three fit on accessibility large-text devices.

### Chat transition animation
When `state` transitions to `'chat'`:
1. `chatAvailable` becomes true → slot 2 flips from page2 to `ChatPage` automatically.
2. `setPage(2)` via `requestAnimationFrame` — navigates to slot 2 if not already there.
3. If already on slot 2 (user just approved from page2), `setPage(2)` is a no-op; content flips in place.

When `state` transitions away from `'chat'`:
1. `setPageWithoutAnimation(HOME_PANE=1)` — instant snap to home.
2. Slot 2 flips back to page2 content automatically.

### BackHandler priority
inner sub-page → shell sub-page → profile sheet → non-home pane (pager → `HOME_PANE`) → false.

---

## Mobile native UI — use the `building-native-ui` skill

Any time the work touches mobile/Expo/React Native UI (a screen, component, navigation, animation, sheet, icon, native control, visual effect), **consult the `building-native-ui` skill before writing the UI** — read its `SKILL.md` and the relevant file under `references/` for the API in question. The skill is installed (gitignored) at `.agents/skills/building-native-ui/`, symlinked into `.claude/skills/building-native-ui/`; reinstall with `npx skills add expo/skills --skill building-native-ui` if missing.

Scope: this applies only to mobile native-UI work. Server/DB/edge-function/Trello/config tasks do **not** invoke it.

Conflict rule (absolute): the skill is a general Expo best-practice guide; **this CLAUDE.md overrides it on every conflict.** Specifically — DRY/central theme tokens win over the skill's "inline styles, no tokens" advice; the "UI layout iron rules (mobile/app/home.tsx)" PagerView contract is never restructured to match the skill's route/tabs suggestions; the i18n no-em-dash rule and existing file-naming stand. Take from the skill the *native API techniques* (SF Symbols via `expo-image source="sf:"`, `expo-glass-effect` liquid glass, form sheets, Reanimated patterns, `expo-audio`/`expo-video`, safe-area via `contentInsetAdjustmentBehavior`), not its architecture/styling opinions.

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

`start`, `location`, `focus`, `find`, `ignore`, `cancel`, `invite`, `extend`, `remove`, `add`, `approve`, `decline`, `leave`, `block`, `report`, `logout`, `delete`, `cron`, `clear1`, `clear2`, `free2`, `set_tier`.

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
  - **Lazy:** `approve` / `extend` / `decline` check `expires_at > now()` inside the transaction. If expired, they fail with the appropriate `locked` + `message` landing. `find` (`app_find`) also lazily expires a stale `page2.state='pending'` (whose `expires_at <= now()`) right before its precondition guard, so an orphaned/expired incoming invite can never permanently no-op the page1 Play button.
  - **Eager (pg_cron, every minute):** `app_expire_sweep` runs **two passes**. Pass 1 (inviter-driven): scans `waiting` page1 entries with `expires_at <= now()`, and per pair atomically sets both sides to `locked` with `message = 'expire'`. Pass 2 (invitee-driven catch-all): scans any remaining `page2.state='pending'` with `page2.expires_at <= now()` and locks that page2 (`message='expire'`), regardless of the inviter's current page1 state. Pass 2 exists because an inviter can leave `waiting` for reasons **other than the invitee responding** (matched with someone else via `approve`, `app_pause`, etc.), which orphans the invitee's `page2` at `pending` forever — pass 1 alone (being inviter-`waiting`-driven) can never reach it. Both passes preserve profiles so the message card has data and `clear2` still works, and fire the `expired-out` / `expired-in` pushes (pass 2 fires only `expired-in`, since the inviter already moved on).

Client drives countdown off `expires_at`. If the sweeper runs late (up to 60s slack), the lazy path catches any early access and realtime corrects the UI.

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

- `cancel`: `A.page1` → `locked` (no message — A initiated). `B.page2` → `locked` + `message = 'cancel'`, profile preserved so B sees who cancelled. B clears via `clear2`. **Costs A 1 heart** (`app_cancel` charges `_credits_cost('cancel')`; inviting is free, backing out is not — see "Credits economy").
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
| `invite-fail` | ✅ | my own invite attempt failed | `page1 = {state: locked, message: invite}` | `PUSH_TITLE.invite-fail` (= `home.ended.fail.invite`) | page1 |
| `approve-fail` | ✅ | my own approve attempt failed | `page1 = {state: locked, message: approve}` | `PUSH_TITLE.approve-fail` (= `home.ended.fail.approve`) | page1 |
| `kick-invitee` | ❌ | mass: target got invited by someone else | `page1 = {state: locked, message: invite}` | — | — |
| `kick-match` | ❌ | mass: target matched with someone else | `page1 = {state: locked, message: matched}` | — | — |
| `area-open` | ✅ | an area covering me became active (scheduled time arrived, or admin enabled it) | `relations.availability.state` → `available` | `PUSH_BODY.area-open` | page1 (home) |
| `area-closed` | ✅ | the area covering me was disabled/removed (admin) | `relations.availability.state` `available → unavailable` | `PUSH_BODY.area-closed` | page1 (home) |

Push codes are lowercase kebab-case and are sent as `data.type` inside the push payload. The `collapseId` field uses the relevant other-user id where applicable, so an older push is superseded by a newer one for the same pair.

### `start` endpoint — auto-find

`POST /app/start` is called on every app launch (after permissions are granted). In addition to persisting location + push token, it triggers auto-find iff `A.page1.state === 'free'` (see "Auto-find behavior" above). Any other state — `locked` (with or without message), `watching`, `waiting`, `chat` — triggers a snapshot refresh only; the user sees whatever screen their current state owns until they tap an action button.

### `start` / `location` / `focus` — first-viewer seeding (2026-05-23, migration `app_seed_viewer`)

At the end of every `start`/`location`/`focus` (after the synchronous `app_availability` recompute AND after the auto-find block), the edge dispatcher calls **`app_seed_viewer(me_id)`** when the caller is visible with no viewers yet. The intent: a freshly-visible user should not sit with an empty viewer list — seed one top-relevance candidate so the page2 surface has something to show. Same `candidate` push the broadcast (`app_add`) path fires, so the seeded user learns they have been pulled in.

Preconditions (any failing turns it into a no-op — never an error):
- `relations.availability.state === 'available'` (gate passes — geo / group-membership / push).
- `page2.state === 'free'` (visible / discoverable).
- `page2.profiles[]` is empty or missing (zero existing viewers).
- A candidate exists in `others(me, true)` with `relevance > 0` AND `page1.state === 'free'` (idle on page1, NOT paused — `'locked'` is excluded so a paused user is never resurrected, and `watching`/`waiting`/`chat` are skipped so an active interaction is never disrupted).

Transaction (single `SELECT … FOR UPDATE` on `[me, candidate]` ordered by `user_id` — same locking discipline as `app_add` / `app_find`):
- Re-verify all preconditions under lock (`page2.state` still free, viewer list still empty, candidate's `page1.state` still `'free'`).
- `B.page1 := {state:'watching', profile: make_profile(A, dist)}`.
- `A.page2.profiles[] += make_profile(B, dist)` (state stays `'free'`).
- Returns `{user, notify:[{user_id:B, code:'candidate', actor_id:A}]}` — the dispatcher's existing `firePush` loop sends the candidate push automatically (`PUSH_BODY.candidate`).

Not user-initiated, so it costs no credits and does not touch `last_add_at` (no broadcast-cooldown consumed). Fully additive — old mobile builds receive the same Realtime `relations` UPDATE they already render the viewer count from, plus the `candidate` push exactly like an `app_add`-seeded viewer. No mobile change required.

Wired in [supabase/functions/app/index.ts](supabase/functions/app/index.ts) in the `start`/`location`/`focus` case, after the auto-find block. Skipped automatically when not `available` or when `page2` already has viewers; the inner RPC re-verifies under lock so two concurrent calls (e.g. `start` + `focus` arriving milliseconds apart) cannot seed twice.

### Client / mobile assumptions

- Realtime is wired: the mobile app subscribes to its own `users` row and re-renders when `relations` changes. Server endpoints should not echo state into the HTTP response as a synchronization mechanism — Realtime is the channel. (Echoing for convenience is fine, but the client treats Realtime as truth.)
- The server writes the canonical v2 shape (`state` ∈ the enums above + optional `message`), but `userStore.ts` still runs a `deriveCompat()` shim on every server update to synthesize the legacy UI state strings (`'watching'` / `'waiting'` / `'chat'` / `'missed'` / `'fail'` / `null`) plus `match` / `watchers` / a legacy `page2` shape (array when free, `Page2Invite` object when pending or locked-with-message). The shim maps `page1.state = 'locked'` + `message ∈ {invite, approve, extend}` to `'fail'` (A's own action failed) and any other locked-with-message to `'missed'`. Locked without message → `null`. The home/page1 and page2 panes branch on these synthesized values.
- The PagerView has 2 slots `[home, side]`; slot 1 renders chat when `state === 'chat'`, page2 content otherwise. See "UI layout iron rules" above.

### Pending mobile work

- **Mobile shim removal:** drop `deriveCompat` from `userStore.ts`; rewrite the home/page1 + page2 UI to consume v2 `state` + `message` directly, using the gray-vs-green button rule from "UI button mapping". This is the last meaningful gap between the deployed server and the mobile codebase.
- **Dead code cleanup:** `setVisibility`, `app/visibility`, OFF mode, reveal/hide confirm dialogs, `showOffScreen`, `offButton` are still in `home.tsx` but unreachable at runtime. Can be removed when convenient.
- **EAS environment variables:** `mobile/.env` is local-only. EAS builds read from the `production` (and `preview` / `development`) environment on EAS, not from `.env`. Pushing the local file: `cd mobile && cp .env .env.local && eas env:push production && rm .env.local`. If `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` are missing in EAS, the production build crashes on launch with `[Error: supabaseUrl is required.]` followed by an expo-router `TypeError: Cannot read property 'ErrorBoundary' of undefined` (the supabase module fails at import time, returns undefined, expo-router then chokes loading the layout). This was the May 2026 launch-crash incident on both iOS Beta Review and Play Internal Testing.

  Vars currently set across `development` / `preview` / `production`:
  - `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase
  - `FAL_KEY` — fal.ai inference (avatar/photo processing)
  - `EXPO_PUBLIC_GOOGLE_PLACES_KEY` — Google Places Autocomplete + Place Details for the location-picker popup in settings. Same key as Firebase (`mobile/google-services.json`). Requires Places API to be enabled in the GCP project that hosts the app. The key is exposed to the client (it's already shipped via google-services.json), so the GCP API-key restrictions should pin it to the app's Android package + iOS bundle ID — never leave the key wide-open.

### `report` (shipped — public-launch requirement, migration `reports` `20260518050000_reports.sql`)

Built for the public store launch (Apple Guideline 1.2 / Google UGC: a public social/dating app MUST let users report another user, block abusive users, and let the operator act within 24h). Block already existed; this adds report + a moderation record.

- **`public.reports`** — one row per report (plain `uuid` columns, **no FK**, mirroring `restrictions` so a moderation record survives account deletion). RLS enabled, **no policies** → service-role only (edge + web admin), same as `areas`/`groups`/`restrictions`. See "Database schema → `reports`".
- **`POST /app/report`** → `app_report(me_id, reported_id, p_reason, p_note)`. `reported_id` comes from the client (the user on screen); `reason`/`note` optional. Single `SELECT … FOR UPDATE` transaction (ordered by user_id, like `app_block`). It **always** (a) inserts the `reports` row and (b) inserts a **permanent `block` restriction** reporter→reported (`others()` already treats `key='block'` as permanent + bidirectional, so the pair can never rematch). Then it tears the live link down per detected surface, **reusing the existing message/push conventions so the reported user just sees a normal ending, never "you were reported"**: `chat` → mirror `app_block` (push `left`); `waiting` → mirror `app_cancel` (push `cancelled-in`); `pending` → mirror `app_decline` (push `declined`); `watching` → silently drop (no push); `unknown` → report + block only. **No new push code** (reuses `left`/`cancelled-in`/`declined`), so `global.ts`/client unchanged.
- **Mobile:** the chat actions (X) menu's Report row was a no-op stub; it now calls `invoke('app/report', { user_id, reason:'chat' })` via the existing `ConfirmDialog` (`chatConfirmAction === 'report'`). Copy updated to state the user is blocked + chat ends (`chat.report*` he+en). Watching-surface report is a possible follow-up (chat is the UGC-critical surface; profiles are pre-moderated).
- **Admin:** `/admin/reports` (nav tab `reports`, between Groups and Areas) — Pending/Handled tabs, each report shows reporter/reported names + context + reason/note + time, with a `setReportHandled` toggle (bookkeeping only; ejecting a user globally is done via Groups/the gate). i18n `admin.nav.reports` + `admin.reports.*` (he+en).
- Additive / NOT breaking: new table, new RPC, new endpoint the deployed app never calls; reused push codes; admin-only.

### Open questions (need user decision before implementation)

_None outstanding._

---

## Credits economy

A per-user credit wallet at `relations.credits` gates the spend-y actions. State shape: `{balance:int, tier:'free'|'pro', granted_on:'YYYY-MM-DD'|null, next_grant_at:timestamptz|null}`. It is a sibling of `last_add_at`/`availability` (economy state, not profile data) and is mutated atomically inside the same `SELECT … FOR UPDATE` transaction as the state transition that spends it. Credits are private (never embedded by `make_profile`, so they don't leak into other users' snapshots).

**Tiers (SQL `_credits_tier_cfg`):** `free` (a.k.a. "Basic") = 3/day, cap 3. `pro` = 10/day, cap 10. New users start `free`. (Was free 5/5 until 2026-05-22, lowered to 3/3 at the user's request.) The switch is now **one-way: free → Pro only** (user request — the downgrade button was removed from the settings hearts/package popup; a Pro user gets no switch button, the popup is informational for them). `POST /app/set_tier` → `app_set_tier(me_id, new_tier)` still validates `new_tier ∈ {free,pro}`. **Upgrading to Pro immediately tops the wallet to the Pro cap (max = 10 stars)** — `app_set_tier` forces `tier='pro'` then reuses `_credits_reset_to_cap` (the admin-reset helper), so the resulting `credits` is `{balance:10, tier:'pro', granted_on:<grant day>, next_grant_at:<next 20:00>}`. The `tier='free'` branch is unchanged and non-destructive (flips only `credits.tier`; `balance`/`granted_on`/`next_grant_at` preserved verbatim — kept sane even though the UI no longer triggers it). "Max accumulation" == the tier's daily amount, i.e. the grant is `LEAST(cap, balance + daily)` (for `free`, effectively a daily reset to 3; for a freshly-upgraded Pro user already at cap 10 the next grant is a no-op `LEAST(10, 10+10)=10`). Additive/backward-compatible: brand-new RPC + endpoint, the deployed mobile build never calls it; response shape `{user, notify:[]}` unchanged.

**Daily grant:** `app_credits_grant()` is called every minute by `/ext/cron` (alongside `app_expire_sweep`/`app_area_resync`). It is idempotent per grant day — the grant "day" is the date of the most recent **20:00 Asia/Jerusalem** boundary (`_credits_grant_day()`); a user is topped up at most once per grant day (rows where `credits.granted_on <> grant_day`). It also writes `next_grant_at` (`_credits_next_grant_at()`, the next 20:00 Asia/Jerusalem as an absolute instant) so the client can show the next-grant time without any client-side timezone math. No push (silent top-up). The per-minute call updates 0 rows except on the first tick at/after 20:00.

**Costs (SQL `_credits_cost`):** `approve` 1, `broadcast` 1, `cancel` 1. **Inviting is free** — there is no SQL `invite` cost (`_credits_cost('invite')` falls through to `ELSE 0`); `mobile/src/lib/credits.ts` keeps `CREDIT_COST.invite = 0` as a **display-only** constant so the send-invite button can show a "0" badge (the user sees inviting is free). **Cancelling a sent invite costs the inviter 1 heart** (`app_cancel`, user request 2026-05-22): inviting is free, the charge is the price of backing out. **`app_cancel` enforces a credit precondition** (user request 2026-05-22, migration `app_cancel_credit_precondition`): `_credits_balance < _credits_cost('cancel')` → `{error:'no_credits'}` (HTTP 400), no state change. A 0-heart user who already sent an invite is therefore **blocked from cancelling** and stays in `waiting` until the invite expires (10 min) or the invitee responds — cancelling IS the exit and it costs a heart. The mobile client mirrors this: the waiting-card cancel button is rendered `disabled` (no-op on press, no explainer popup) when the balance can't cover the cost. (This reverses the earlier "`_credits_charge` floors at 0 so a 0-balance user can always cancel" design — the user explicitly chose to block it.) The action costs (and the `3`/`10` tier amounts) are mirrored in places that MUST stay in sync: the SQL `_credits_*` helpers (source of truth + enforcement), `mobile/src/lib/credits.ts` (`CREDIT_COST`, display only), and the `defaultRelations` seed in `supabase/functions/user.ts` (`balance:3`). Change them together. (Same discipline as the 30-minute broadcast window.)

**Broadcasting → accepting is free (user decision 2026-05-18).** While the approver is **currently broadcasting** (`relations.last_add_at` parses to a timestamp `> now() - interval '30 minutes'`, the same window as `app_add`), `app_approve`'s effective cost is **0**, not `_credits_cost('approve')` — the user already paid 1 star to broadcast, so receiving/accepting an invitation during that window costs nothing. Implemented as a local `v_approve_cost` in `app_approve` (computed once from the FOR-UPDATE-locked `me_row`) used for both the precondition balance check and the `_credits_charge`. Because a 0 cost can never fail the `balance < cost` guard, a broadcasting user can always accept. The mobile accept CTA mirrors this: `ReplyingInviteCard.costCredits = broadcastActive ? 0 : CREDIT_COST.approve` and `affordable = broadcastActive || …` — the `CreditCost` badge stays visible showing **0** (deliberately not hidden, so the user sees it's free). This adds **two more inline copies** of the 30-minute broadcast-window predicate (in `app_approve`, and the `others()` credits-gate exemption below) to the lockstep set in the "Broadcast relevance boost" sync note — change all of them together if the window ever changes. Additive / not breaking: `app_approve`'s response shape is unchanged; an older mobile build just renders the static "1" badge while the server charges 0 (cosmetic, self-corrects on app update).

**No hold / refund (removed 2026-05-22, migration `remove_credit_hold_cancel_cost`).** The inviter never pays for an invite, so there is nothing to hold or refund. The former hold/refund/forfeit/consume machinery — the `credits.held` field, the `_credits_refund` / `_credits_clear_hold` helpers, and `_credits_charge`'s `hold` flag — was **deleted**. It had been dormant since 2026-05-22 anyway (invite cost 0 ⇒ `held` always 0 ⇒ every refund was a no-op), so the removal is behavior-preserving for production. `_credits_charge` is now 2-arg (`rel, amount`) and only ever debits `balance`. The only invite-flow spend is `app_cancel` charging 1 (see "Costs"); `decline` / `expire` / `_kick_page1_at` of a `waiting` user no longer touch the inviter's credits at all, and `app_pause` / `app_logout_cleanup` / `app_approve` just carry the existing `credits` blob forward via `_credits_ensure`.

**Findability gate.** `others()` drops any candidate whose `balance < _credits_cost('approve')` (= 1) under `only_available` (the clause `app_find`/`app_add` always pass), so nobody is shown a user who can't afford to accept — **except a currently-broadcasting candidate**, who bypasses the balance gate (`NULLIF(other.relations->>'last_add_at','')::timestamptz > now() - interval '30 minutes'` OR `balance >= cost`). Without this exemption a user who broadcast with their last star would sit at balance 0 and vanish from the pool *during their own paid broadcast* — self-defeating, since broadcasting's whole purpose is to be found and invited (and their accept is free anyway). Additive/no-op for the deployed app (others() is internal-only; no output column changed; backfill gave every existing user 5).

**Preconditions / failure landings.** `app_invite` has **no credit precondition** (inviting is free); the `page1=locked,message=invite` (`invite-fail`) landing remains only for non-credit invite failures. `app_cancel` has a credit precondition (migration `app_cancel_credit_precondition`): `_credits_balance < _credits_cost('cancel')` → `{error:'no_credits'}` (HTTP 400), **no state change** (the user stays in `waiting`) — see "Costs" above. `app_approve` `balance < v_approve_cost` → `page2=locked,message=approve` (`approve-fail`); `app_add` `balance < 1` → `{error:'no_credits'}` (HTTP 400). No new push codes.

**Relations-rebuild RPCs preserve credits.** `app_approve`, `app_pause`, `app_resume`, `app_logout_cleanup` rebuild `relations` with `jsonb_build_object`; each carries `credits` forward via `_credits_ensure`. New users are seeded `{balance:3,tier:'free'}` by `user.ts`; `granted_on`/`next_grant_at` fill on the next cron tick (≤60s); `_credits_ensure` defensively seeds any credit-touching RPC that meets a credit-less row.

**Relations-rebuild RPCs also preserve the gate keys (migration `pause_resume_keep_availability` `20260519140000`).** `app_pause` / `app_resume` previously rebuilt `me`'s `relations` carrying only `credits` — silently **dropping `availability`, `push`, `join_request`**. Bug: a gated user (not in any enabled group, or push-blocked) who paused→resumed lost the gate (the mobile client defaults a missing `availability` to `available` ⇒ `geoGated=false` ⇒ the play button reappears, and the edge resume auto-find guard `availabilityState==='available'` also passes ⇒ candidates returned). Both now merge, on top of the page1/page2 skeleton, `jsonb_strip_nulls(jsonb_build_object('credits',…, 'availability', public.user_availability(me_id, location), 'push', relations->'push', 'join_request', relations->'join_request'))` — `availability` **recomputed** (the membership/push gate re-asserts immediately), `push`/`join_request` carried verbatim (`strip_nulls` ⇒ no `"key":null` when absent). Same discipline `app_admin_reset` already follows. Verified: post-pause and post-resume a no-group user keeps `{state:'unavailable',reason:'group'}`. Additive / response shape unchanged. (`app_approve`/`app_logout_cleanup` end the user in chat/logged-out states where the gate is moot, so they were left as-is; revisit if a gate-relevant rebuild is added there.) **Update 2026-05-22:** `app_pause` no longer rebuilds `relations` at all — it now does a page1-only `jsonb_set` (migration `20260522040000_app_pause_keep_visibility`), which preserves `availability`/`push`/`join_request`/`credits`/`page2` verbatim by construction, so this gate-key concern now applies only to `app_resume`.

**Admin reset resets the package to Basic (free).** All three `app_admin_reset*` RPCs — `app_admin_reset()` (global no-arg), `app_admin_reset(p_group_ids uuid[])` (role/group-scoped, the web reset-popup entry point), and `app_admin_reset_user(p_user_id)` (per-user "Danger zone") — rebuild `relations.credits = _credits_default()`: **`tier` → `free`** (the package is reset to Basic regardless of the user's pre-reset tier — a Pro user **is** demoted), `balance` = the free cap (3), `granted_on`/`next_grant_at` refreshed to the current grant day (already at cap ⇒ the next 20:00 grant is a no-op `LEAST(cap,cap+daily)=cap`). User decision 2026-05-22: "an admin reset of a user resets their package to Basic" — this **reverses** the 2026-05-18 decision (which preserved the tier and topped to the per-tier cap via `_credits_reset_to_cap`; migration `admin_reset_credits_to_basic`). `_credits_reset_to_cap` is kept in the DB — `app_set_tier`'s free→Pro upgrade still uses it (forcing the pro tier + pro cap is correct there). `app_admin_reset*` is admin/service-role only (web admin → `resetUsersByRoles` / the user-detail Danger zone); mobile never calls it, so this is additive / not breaking.

**UI.** The cost rides as an in-button badge (`CreditCost`: a rounded capsule with a heart glyph and the number) in place of the old icon: the page1 "send invite" prompt and the page2 approve accept CTA (both `ReplyingInviteCard`), the broadcast confirm popup, and the cancel-invite confirm popup (the latter two via `ConfirmDialog.confirmIconStart`, a deliberate opt-in exception to the "buttons carry no icon" rule). **The page1 "send invite" badge reads "0"** — inviting is free, and the badge is shown (not hidden) on purpose so the user sees it costs nothing (`ReplyingInviteCard.costCredits = CREDIT_COST.invite = 0`). The cancel badge sits on **both** the popup's confirm button and the waiting-card cancel button (`InviteTimerCard`, via `Button.iconStart` — user request 2026-05-22, so the 1-heart cost is visible on the button itself, including while it is disabled where it doubles as the "why" hint). **Unaffordable actions disable their button** (user request 2026-05-22) — there is **no "not enough hearts" explainer popup** (the former `insufficientCost` `ConfirmDialog` + the `stars.insufficient.*` i18n keys were removed): when the user can't cover an action's cost the relevant button renders `disabled` (faded, no-op on press). For **cancel** that is the waiting-card cancel button (`InviteTimerCard.disabled`); for **approve** the `ReplyingInviteCard` accept CTA (`affordable=false` ⇒ disabled, the former `onUnaffordable` tap-to-explainer was dropped); for **broadcast** — whose trigger is the visibility toggle, not a plain button — the broadcast confirm popup **still opens** and its confirm button is disabled via the new `ConfirmDialog.confirmDisabled` prop, so the popup stays informative (the cost badge shows) but the action can't be taken. The balance rides as the Menu tab's `subLabel` number (same slot as the side tab's viewer count; suppressed while the profile sheet is open). Settings has a dimmed, inert `קרדיטים` row under the Account row showing the balance and, as a small subtitle, the next-grant time (`formatNextGrant`).

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
| `data` | jsonb, default `{}` | Flat profile fields: `images: Image[]`, `bio?: string`, `family?: FamilyData` (`{hasKids, kids?, schedule?, isForKids?}`). Plus `weekStart`, `os`, `lang`, `appearance`, `push_token`, `role`, `location_type`, `location_custom`, `location_label`. Distance unit is no longer stored: the client derives it from device locale (`getLocales().regionCode`); see `mobile/src/lib/units.ts`. Legacy `data.units` may exist on rows written by older builds and is ignored. `location_type: 'device' \| 'home' \| 'work'` is the anchor the stored `location` point represents. `location_custom: boolean` is the legacy pre-typed flag kept in sync (`home`/`work` ⇒ `true`, `device` ⇒ `false`) for backward compat with mobile builds that predate `location_type`; rows last written by such a build carry only `location_custom` and `location_type` is derived as `home` when `location_custom=true`, else `device`. `location_label: string \| null` is the human-readable address for `home`/`work` (null for `device`). While `location_type ≠ 'device'` (≡ `location_custom=true`) the client suppresses location permission prompts and skips periodic GPS updates (the `location` column is whatever was last written from the manual pick). |
| `relations` | jsonb | `Pages` (see Game Logic) plus a top-level `last_add_at` (ISO timestamp; 30-minute cooldown for the page2 "Show me to people" / broadcast button — see `app_add`), a top-level `availability` (geo-gate state; see "Geo-availability gate" below), a top-level `credits` (`{balance:int, tier:'free'\|'pro', granted_on:'YYYY-MM-DD'\|null, next_grant_at:timestamptz\|null}`; see "Credits economy" below), and a top-level `push` (`{perm?:'granted'\|'denied'\|'undetermined', token?:bool, dead?:bool, checked_at?:timestamptz}`; notification-presence signal, see "Notification-presence gate" below). Source of truth for page1/page2. |

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

### `areas` (geo-availability zones; admin-managed)

Admin-defined geographic zones that gate where the app is usable. Managed from the web admin (`/admin/areas`). No RLS policies — service-role only (edge function + web admin). Read model `public.areas_list` (a `security_invoker` view) explodes `center` into `lat`/`lng` for the dashboard; writes go to this base table.

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

### `roles` (role catalog; admin-managed) + `user_roles` (membership)

Admin-managed role system. Managed from the web admin (`/admin/roles` for the catalog; the per-user checklist on `/admin/users/[userId]`). No RLS policies on either table — service-role only (edge function + web admin), identical pattern to `areas`. Independent of the legacy free-form `users.data.role` string (only ever set to `'TEST'` by the seed script, read by nothing) — that field is left untouched and is **not** the source of truth here.

**Naming:** internally and in the DB the concept is `roles`/`user_roles` (tables, RPCs, routes, code symbols, i18n keys all stay `role*`). The **user-facing term is "Groups" / "קבוצות"** — only the i18n string *values* (he + en) say group/קבוצה. Do not "fix" this mismatch by renaming tables/routes/keys; it is deliberate (a copy-only rename requested after the feature shipped).

`public.roles`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | primary key, default `gen_random_uuid()` |
| `created_at` | timestamptz | default `now()` |
| `name` | text | **unique**, not null |
| `enabled` | boolean | not null, default `true`. `false` = disabled → every member is gated (see below). |

`public.user_roles` (many-to-many; a user may hold several roles — the admin UI is a checklist):

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | not null, FK → `users(user_id)` **ON DELETE CASCADE** (deleting a user cleans up assignments) |
| `role_id` | uuid | not null, FK → `roles(id)` **ON DELETE RESTRICT** (a role with members cannot be dropped — DB backstop; the web UI also disables delete while member count > 0) |
| `created_at` | timestamptz | default `now()` |

Primary key `(user_id, role_id)`. Index `user_roles_role_idx` on `(role_id)` (membership counts + the gate query).

**Admin user filter by role.** The users dashboard advanced filters include a Role select alongside page1/page2 state. `?role=` is a role uuid (restrict to its members via `.in(user_id)`), the sentinel `__none__` ("No role" / `filterRoleNone` — users with no `user_roles` row, applied as `.not(user_id,in,…)`), or empty (any). Every filter option (and the "any" option) shows a global `(n)` facet count and the options are ordered by that count descending; the counts come from one RPC `public.admin_user_facet_counts() → jsonb` (`{total, groups_none, p1:{state:n}, p2:{state:n}, groups:{group_id:n}, avail:{state:n}, tier:{free|pro:n}, seg:{seg:n}}`, `sql stable security definer`, EXECUTE revoked from anon/authenticated — admin/service-role only, same pattern as `app_admin_reset`). EVERY filter dropdown and every option in it carries a global `(n)`: p1/p2/groups are ordered by count descending; avail/tier/seg carry their `(n)` too but stay in declared order (the seg recency buckets read better chronologically). The avail/tier/seg counts mirror `applySecondary()` 1:1 (today = 00:00 Asia/Jerusalem via SQL `date_trunc … at time zone`; online 5m / 7d / 30d / broadcast 30m windows; tier `free` folds null; avail `unknown` = state null; `role_gated` = holds ≥1 disabled group). The role-scoped reset popup (`ResetAllButton`) exposes explicit **select-all** and **deselect-all** actions over the role checklist.

**Role-disable folds into the geo-availability gate.** A user holding **any** disabled role is treated **exactly** like a geo-gated user: same `relations.availability.state = 'unavailable'`, same mobile gate UI (gate message + side-tab removal), same `area-closed`/`area-open` push via `app_area_resync`, same exclusion from every other user's match pool. **No mobile change exists or is needed** — it reuses the deployed gate end-to-end. Helpers:

- `public.role_blocked(uid uuid) → boolean` — true iff the user holds ≥1 disabled role. `language sql stable security definer` so the planner inlines it into `others()`.
- `public.user_availability(uid uuid, loc geography) → jsonb` — **single source of truth** for a user's effective availability. **Live precedence (2026-05-19, see "Group-membership gate" below — this is the authoritative definition):** (1) `push_blocked(uid)` ⇒ `unavailable`; (2) `loc IS NULL` ⇒ `available` (onboarding escape hatch); (3) `in_enabled_group(uid)` ⇒ `available`; (4) else `unavailable`. `role_blocked`/`group_blocked`/`area_state` are **no longer consulted here** — membership replaced the geo + disabled-group + allowlist logic.

Every site that persisted `area_state(location)` into `relations.availability` now calls `user_availability(user_id, location)` instead: `app_availability`, `app_area_resync`, `app_area_launch_sweep`, `app_admin_reset`. `others()` carries the candidacy clause `AND (NOT only_available OR public.in_enabled_group(other.user_id))` (the membership gate) plus the preserved `push_blocked` and credits clauses; the former `role_blocked`/`area_available`/`allowlist` clauses were removed (see "Group-membership gate"). Admin group mutations (enable/disable, assignment toggle) fire-and-forget POST `/functions/v1/ext/resync` via the shared `web/src/lib/resync.ts` helper (same helper the area mutations use), so an affected user's availability flips immediately (Realtime + push), both directions. Create/rename and delete-when-empty don't change anyone's availability and skip the resync.

**Group-membership gate (2026-05-19, migrations `group_membership_gate` `20260519000000` + fix-forward `membership_gate_keep_push` `20260519010000`).** Supersedes the 2026-05-18 allowlist-flag model. User decision: *"delete the Approved group; if a user is not in at least one ACTIVE group, they are disabled."* The whole allowlist-flag mechanism was removed — `groups.allowlist` column, `groups_allowlist_idx`, `allowlist_active()`, `group_allowed()`, and the `/admin/roles` Approved-group UI (`setRoleAllowlist`, badge, banner, the 5 `admin.roles.*` allowlist i18n keys) are all gone. The dedicated "מאושרים" group was deleted.

- `public.in_enabled_group(uid) → boolean` (`sql stable security definer`) — true iff the user holds ≥1 **enabled** group. Inlinable into `others()`.
- `user_availability(uid, loc)` **live precedence**: **(1)** `push_blocked(uid)` ⇒ `unavailable` (Notification-presence gate — a *separate* feature; `push_blocked` is FALSE when `loc IS NULL`, so onboarding stays safe); **(2)** `loc IS NULL` ⇒ `available` (onboarding / pre-permission escape hatch); **(3)** `in_enabled_group(uid)` ⇒ `available`; **(4)** else `unavailable`. (The fix-forward migration re-added case 1 — `group_membership_gate` wholesale-replaced the function and had dropped it.)
- `others()`: the old `area_available` + `group_blocked` + `allowlist` candidacy clauses were replaced by a **single** `AND (NOT only_available OR public.in_enabled_group(other.user_id))`. The `push_blocked` clause and the credits-affordability clause are **preserved verbatim**. Signature unchanged ⇒ CREATE OR REPLACE (no dependent-RPC breakage).
- **Consequences (intended):** a user in no enabled group is `unavailable` — *"disabled until I enable them"*, with the Groups panel as the single control. **Brand-new users are the exception since 2026-05-22**: they auto-join the enabled "חדשים" group on signup (see "New-users default group" below). **Geo/areas no longer gate**: `area_state`/`area_available` remain defined but are **not consulted** by `user_availability`/`others()` — membership fully replaced location-based gating. `group_blocked()` remains defined but **unused** — to block a user you remove them from every enabled group (or disable their group); a disabled group simply grants no access (it is no longer a denylist that hard-blocks even cross-group members).
- Admin: `/admin/roles` reverted to plain enable/disable/rename/delete. Adding/removing a user↔group, or enabling/disabling a group, still fires the shared `triggerResync()` (Realtime + push, both directions; per-minute cron is the safety net). `admin.roles.subtitle`/`disabledHint` + `admin.userDetail.rolesHint` (he+en) rewritten to the "must be in ≥1 active group" semantic.
- Additive / NOT breaking: mobile reads only `relations.availability.state` (still `available`/`unavailable`, handled end-to-end). No `BACKWARD_COMPAT.md` entry.

**New-users default group (2026-05-22, migration `new_users_default_group` `20260522050000`).** Every newly created user is auto-assigned to the enabled group **"חדשים"** (`6dc77337-2837-45fe-b493-4fdacdd899fd`) so they are `available` immediately and never need the join-request flow. Mechanism: an `AFTER INSERT FOR EACH ROW` trigger `users_assign_new_user_group` on `public.users` runs `public.assign_new_user_group()` (`plpgsql security definer`, `search_path=''`), which looks the group up by name and inserts a `user_groups` row (`on conflict (user_id, group_id) do nothing`). Trigger-based (not in `user.ts`) so it covers **every** insert path — edge `user.ts`, `app_review_seed`, admin — regardless of the inserting role; the group is resolved by name so no generated id is hardcoded. Consequence: `in_enabled_group` is always true for a new user ⇒ `user_availability` ⇒ `available` ⇒ the mobile `reason:'group'` gate and join-request CTA never appear for new signups, so `app/join_request` is effectively dead for them. The join-request flow (`app_join_request` RPC, `/app/join_request` endpoint, `app_admin_clear_join_request`, the admin `JoinRequestCard`, the mobile gate CTA) is **left intact in the codebase** — now inert for new signups, not removed. An admin can still disable a user by removing them from every enabled group (including "חדשים"), or gate all future signups by disabling "חדשים" itself. **Pre-existing gated users are not retroactively added** — this only affects users created after the migration. Additive / NOT breaking — mobile unchanged.

**App-review login (2026-05-19, migration `app_review_seed` `20260519020000` + edge function `review-login`).** The app is passwordless **and** membership-gated, so a store reviewer signing up fresh is gated and can't review — a near-certain rejection. Solution: a fixed reviewer **email + code** that signs into a dedicated, pre-approved demo account.

- **Edge function `review-login`** (`verify_jwt=false` — pre-auth, has its own code gate). Constants `REVIEW_EMAIL='review@once.app'`, `REVIEW_CODE='once-review-7Fq2'`. Validates the pair, `auth.admin.createUser` (idempotent) the dedicated review auth user, `auth.admin.generateLink({type:'magiclink'})` to mint a fresh single-use `email_otp` (no email is sent), calls `app_review_seed`, returns `{email, otp}`.
- **`public.app_review_seed(p_user_id uuid)`** (`security definer`, EXECUTE revoked from anon/authenticated) — idempotently upserts a complete onboarded `public.users` row (name `App Review`, profile/images **cloned from a real onboarded user** so every screen renders, stranger's `push_token` stripped, forced non-empty `data.bio` since the app routes to `/home` iff a profile row has a non-empty bio — `mobile/app/_layout.tsx`), clean free/free `relations`, and ensures membership in the enabled **`בדיקה`** group (id created 2026-05-19) so `user_availability` ⇒ `available`. Runs **after** the auth user exists (FK `users.user_id → auth.users`).
- **Mobile:** `login.tsx` `signInWithReview(code)` POSTs `review-login` then `supabase.auth.verifyOtp({email, token:otp, type:'email'})`. `LoginForm.tsx`: typing `REVIEW_EMAIL` in the email field reveals a "Review code" input (no magic link sent); a real user would never type that address. i18n `auth.reviewCodePlaceholder`/`auth.reviewSubmit` (he+en). Ships in mobile **1.0.2** (versionCode 21 / iOS build 18).
- Security: the only static secret is `REVIEW_CODE`; it leads solely to a sandbox review account (no admin powers, only its own state) — the standard expected demo-account pattern. Additive / not breaking.

**Gate reason + join-request flow (2026-05-19, migration `gate_reason_and_join_request` `20260519120000`).** So the mobile gate UI can show the right message/CTA per cause, and a not-in-any-group user can ask to be let in:

- `public.user_availability(uid, loc)` now returns `{state, reason?, join_requested?}` — **state semantics byte-identical** to the live group-membership precedence above (deployed app reads only `.state`); `reason` is added only when `state='unavailable'`: `'push'` (Notification-presence gate) or `'group'` (not in any enabled group). The `else→unavailable` (case 4) branch also adds `join_requested:true` when `public.join_requested(uid)` (i.e. `relations.join_request` is set).
- `public.join_requested(uid uuid) → boolean` — true iff `relations.join_request` is set.
- `relations.join_request = {at: timestamptz}` — set by `public.app_join_request(me_id)` (`plpgsql security definer`; records the key then recomputes `relations.availability` so `join_requested` flips live via response + Realtime; idempotent — a repeat press refreshes `at`). Exposed as **`POST /app/join_request`** in the `app` dispatcher; **deliberately excluded from `requiresPresence`** (it is the gated user's only way forward). **The key IS cleared by admin action (2026-05-19, supersedes the earlier "not cleared on approval / stale key is harmless"):** `public.app_admin_clear_join_request(p_user_id uuid) → jsonb` (`plpgsql security definer`, EXECUTE revoked from anon/authenticated — admin/service-role only, same pattern as `app_admin_reset`) does `relations - 'join_request'` then strips the now-stale `join_requested` **sub-field** from the existing `relations.availability` blob (if present) and persists. **It deliberately does NOT recompute or flip the availability `state`** (migration `20260519170000_clear_join_request_no_state_flip`, user request 2026-05-19 "send a push when a user becomes available via group/area"). Why: the `area-open` push is fired **solely** by `app_area_resync`, and only when `relations.availability.state` actually *changes*. The earlier body recomputed+persisted `availability = user_availability(...)` → on a group-assign it pre-flipped the user to `{state:'available'}` itself, so the subsequent `triggerResync` → `app_area_resync` saw no state diff and never queued `area-open`: a user **not** in the app got no notification (Realtime flip only). Leaving the state untouched here keeps the `unavailable → available` transition detectable by `app_area_resync` (immediate via `triggerResync`; per-minute cron resync as the ≤60s safety net even if the edge call fails), so the push fires. Idempotent (a missing `join_request` key / missing `availability` is a harmless no-op). Two callers, both web-admin: (a) the **explicit "remove request" button** on `/admin/users/[userId]` (server action `clearJoinRequest` in `users/actions.ts` → revalidate + `triggerResync`) — the user stays gated (not in any enabled group), `state` is left as the stored `unavailable` with `reason:'group'` and only `join_requested` stripped (byte-identical outcome to the old recompute for a still-gated user), and their app's `centerNotice` reverts to the "request to join" CTA (pre-request state); (b) **auto-cleanup in `setUserRoleAssignment`** — assigning the user to *any* group (the admin acting on them) fires the RPC best-effort (a lingering key is harmless: an `available` user is already excluded from the `?seg=join_requested` queue, so a cleanup hiccup must never block the assignment; `triggerResync` afterward — now the *sole* owner of the state flip — performs the `unavailable → available` transition **and fires the `area-open` push**).
- **Operator email alert (2026-05-19, user request).** Every successful `POST /app/join_request` fire-and-forgets an email to `SUPPORT_EMAIL` (`once.app.support@gmail.com`) so the admin knows to approve the user into a group (otherwise they sit gated until someone notices). Sent from the edge handler via `EdgeRuntime.waitUntil(sendJoinRequestEmail(...))` — never on the critical path, mirrors `firePush`; a slow/failed send never delays or fails the user's request. Generic sender is `Tools.email(entry, {from,to,subject,html})` (Resend `POST https://api.resend.com/emails`, `RESEND_API_KEY` env, same fire-and-forget+LogEntry contract as `Tools.notify`). Config constants live once in `global.ts`: `SUPPORT_EMAIL`, `EMAIL_FROM` (`Once <onboarding@resend.dev>` — Resend's shared no-domain-verification sender; delivers to the Resend account's own address, which is `once.app.support@gmail.com == SUPPORT_EMAIL`. Swap to a `once.app` address once that domain is Resend-verified), `ADMIN_USER_URL(userId)` (single source of truth for the deep-link: **locale-less** `https://once-lake.vercel.app/admin/users/<id>` — every internal admin link is `/admin/...` and the Next middleware adds the locale via rewrite; a `/he/admin/...` form both 404s (double prefix) and bypasses the middleware auth guard whose check is `pathname.startsWith("/admin")`). Body is RTL Hebrew with the user's (escaped) name + that link. `RESEND_API_KEY` is set as an edge secret (test send confirmed 2026-05-19); until/unless it's missing, `Tools.email` logs `RESEND_API_KEY not set` and returns `{ok:false}` (swallowed — no user impact). **Admin login-redirect chain (so the email link works when the operator isn't signed in):** middleware (`web/src/proxy.ts`) appends `?next=<intended path+search>` when bouncing an unauthenticated `/admin/*` request to `/admin/login`; the login page (`/admin/login`) reads & validates it, honors it in the already-signed-in `redirect(next)`, and forwards it to `LoginForm`, which sets the Google OAuth `redirectTo` to `/auth/callback?next=<encoded>`; `/auth/callback` redirects there post-exchange. All four validate the param through the single `web/src/lib/safeNext.ts` `safeNextPath()` (same-origin absolute path only — must start with one `/`, never `//`; the callback's prior inline check was replaced by it, DRY). Additive / not breaking (old mobile builds still call the same endpoint; server just additionally emails). Logged as the `email:join_request` LogEntry.
- `others()`: added `AND (NOT only_available OR other.location IS NOT NULL)` (user decision 2026-05-19, Q2) — a user with no location (permission denied → location nulled, or onboarding) is never surfaced as a candidate, consistent with "presence required". Rest of the body = the live group-membership body verbatim; signature unchanged ⇒ CREATE OR REPLACE.
- Web admin: `?seg=join_requested` on `/admin/users` (`SEG_VALUES` + `applySecondary`: `relations->>join_request not null AND relations->availability->>state <> 'available'` — the actionable pending queue) + `segStates.join_requested` he/en label. The matching facet count `seg.join_requested` was missing from `admin_user_facet_counts()` (the gate-reason migration added the segment to `applySecondary`/`SEG_VALUES`/i18n but not the RPC, so the dropdown rendered `(0)`); migration `20260519150000_facet_join_requested` adds it, mirroring `applySecondary` 1:1 (SQL `<>` like PostgREST `.neq`). **Approval** is the per-user group checklist on `/admin/users/[userId]` (assigning an enabled group ⇒ `available` ⇒ auto-clears `join_request`, see above). A new **`JoinRequestCard`** section on that page (rendered only when `relations.join_request` is set; `admin.userDetail.joinRequest*` he/en) shows when they requested + a **"Remove request"** button (server action `clearJoinRequest` → `app_admin_clear_join_request`) to dismiss the request *without* approving.
- **Repo↔live migration-file drift (housekeeping note, not functional):** the local `supabase/migrations/` filenames/timestamps do not match the live applied history (e.g. live has `group_membership_gate`/`membership_gate_keep_push` with no local file; local has differently-timestamped `allowlist_groups` etc.). CLAUDE.md (this section) + the live DB are the source of truth; new migrations are authored against the **live** function bodies (introspected via `pg_get_functiondef`), not the stale repo files. Reconciling the migration folder with live history is a separate housekeeping task.
- **Mobile (implemented 2026-05-19, `home.tsx`):** the ~5 permission `ConfirmDialog`/`isPermMode` popups were removed and unified into a single `centerNotice` object (one source of truth: `{text, icon, onPress, busy, disabled}|null`; priority = permission/connectivity (notif/loc/net) first, then the server `availability` gate). It feeds the **existing** `permCenterGroup` — `HeadlineArea` text + the round center `Pressable` that already rendered play/pause/`HeartIcon` now renders the per-reason icon **as the action button** (Bell/MapPin/WifiOff for permissions; `MailIcon` = request-to-join → `POST /app/join_request`; `InboxIcon` = waiting-for-approval / no-action gate). `noticeOverridesCard = (geoGated||isPermMode) && state∉{waiting,chat}` nulls `displayedCardMode` (the existing "empty pane" path — no iron-rule/pager change: `showHiddenPlaceholder` flips, PullPane goes non-interactive) and gates the `RisingCard` render, so the profile/card is removed and the notice takes center (waiting/chat preserved). **Page2** mirrors it non-destructively (Q1 = display-hidden): when a notice is active and page2 isn't a pending invite/chat, the side slot renders the **same** `centerNotice` (shared styles `permScreen/permCenterGroup/permAvatar/permSlidersButton` + `HeadlineArea`) instead of the viewers list — **no `app_lock2`** (no watcher kick / restriction); auto-reverts when the permission is granted. `geoGated` never reaches the side slot (it's dropped), so page2's notice is the permission cases only. Loc-perm-loss (non-custom) → debounced `POST /app/location {location:null}`. i18n: `home.joinGate.requestText`/`waitingText` (he+en). `tsc --noEmit` clean.

### `users_map` (read model; web admin live users map)

`public.users_map` is a `security_invoker` view (same pattern as `areas_list`) that explodes `users.location` into `lat`/`lng` and surfaces `data->images[0]->normal` as `image`, so the web admin live map (`/admin/map`) can plot users without parsing PostGIS blobs server-side. Columns: `user_id`, `name`, `last_seen`, `image` (filename or null), `lat`, `lng`, `location_type` (`device`|`home`|`work`; derived `coalesce(data->>'location_type', location_custom ? 'home' : 'device')` so pre-typed legacy rows still resolve — the map shows a home/work badge on the marker for non-`device` anchors). Only rows with a non-null `location` are exposed (a user with no location can't be placed). `security_invoker = on` ⇒ the web admin's service-role client sees every located user; anon/auth would get only their own row (harmless). The map's **live** updates do NOT read this view: the admin browser subscribes to `postgres_changes` UPDATE on `public.users` directly (allowed by the `admins read all` RLS policy) and decodes the raw `location` EWKB-hex point client-side. The view is only the server-side initial-load read.

### Admin dashboard (web admin home)

`/admin` is the **dashboard / hub**, not the users list. The users list moved to `/admin/users` (its `[userId]`/`with` sub-routes are unchanged; `backHref` is now `/admin/users`, the role-scoped reset action + its `ResetResult` type live at `web/src/app/[lang]/admin/users/actions.ts`, revalidating `/[lang]/admin/users`). `AdminNav` (`active: 'dashboard'|'users'|'roles'|'areas'|'map'`) declares its tabs once in a single `NAV_ITEMS` array rendered by both the desktop and mobile layouts — adding a tab is one edit. The shell logo and every "logged-in" redirect (`[lang]/page.tsx`, `/admin/login`, `auth/callback`) land on the dashboard.

The dashboard is a server component that pulls one RPC `public.admin_dashboard_metrics() → jsonb` (`sql stable security definer set search_path=''`, EXECUTE revoked from anon/authenticated — admin/service-role only, same pattern as `admin_user_facet_counts`). It returns a point-in-time, **global** product/business KPI snapshot grouped as `{users, engagement, availability, credits, areas, roles, funnel_7d}` (base size & growth, live game-state counts, geo/role gate health, credits economy, areas/roles catalogs, a 7-day signup→invite→approve→message funnel). "today" is Asia/Jerusalem (same boundary the credits grant uses). **Every tile deep-links to the actual filtered list** that owns the number — no tile points at an unfiltered page. The users list (`/admin/users`) was extended with new query filters beyond `q`/`p1`/`p2`/`role`: `avail` ∈ {available,unavailable,not_yet,unknown} (`relations->availability->>state`, `unknown` = null), `tier` ∈ {free,pro} (`relations->credits->>tier`; `free` also matches null via `.or`), and a single multi-purpose `seg` ∈ {online,active_today,active_7d,active_30d,new_today,new_7d,new_30d,located,broadcasting,held,role_gated}. The recency segs filter `last_seen`/`created_at` against a JS-computed ISO boundary (`*_today` = 00:00 Asia/Jerusalem, DST-correct via live `Intl` offset); `broadcasting` = `relations->>last_add_at` ≥ 30-min-ago (lexicographic ISO compare); `held` = credits.held not-null & ≠ '0'; `role_gated` = holds ≥1 disabled role (id set via `user_roles ⨝ roles!inner enabled=false`, applied like the `role` filter). All six secondary filters are applied through ONE `applySecondary<T extends Filterable<T>>(q)` helper (a self-referential structural builder type — no `any`, no copy-paste per query branch). `SearchControls` renders all six dropdowns from one declarative `filters` array (single `FilterSelect` element, variants by props); the new three now also carry a facet `(n)` (added to `admin_user_facet_counts` as `avail`/`tier`/`seg` blocks), kept in declared order. The whole filter panel is a fixed `grid grid-cols-2` (≤2 filters per row at every width — usable on mobile, not a 6-up cram), clear button below the grid. `/admin/areas` gained `?mode=active|scheduled|disabled` and `/admin/roles` gained `?status=enabled|disabled`, so the catalog tiles land on the matching subset (the nav tab returns to the full set). Tile map: engagement → `?p1=…|p2=…`, availability → `?avail=…`, credits tier/held → `?tier=…`/`?seg=held`, growth/recency → `?seg=…`, areas → `?mode=…`, disabled-roles → `?status=disabled`, role-gated users → `?seg=role_gated`. Reusable `CardGrid`/`NavTile`/`Stat` primitives live in `_components/ui.tsx` (`Stat` accents reuse the shared `Tone` palette). Additive + admin-only — no mobile/back-compat impact.

### Geo-availability gate

> **SUPERSEDED 2026-05-19 — read "Group-membership gate" above first.** Geo/areas **no longer gate** availability: `user_availability`/`others()` were rebuilt to use `in_enabled_group` (membership) instead of `area_state`/`area_available`. The mechanics below (`area_state`, areas modes, `app_area_resync`, the `not_yet` state, the `area-open`/`area-closed` pushes, the mobile gate UI) all still **exist and run**, but the gate decision itself is now membership-driven, so `area_state`/`area_available` are defined-but-unconsulted. Kept for reference and in case geo gating is reintroduced; the mobile `relations.availability.state` UI/enforcement is unchanged (it's the same gate, just fed by membership).

`relations.availability` is `{state, starts_at?}` where `state ∈ {available, unavailable, not_yet}`, written by `app_availability(me_id)` (= `user_availability(me_id, me.location)` — the geo `area_state` result, OR a hard `{state:'unavailable'}` when the user holds any disabled role; see "`roles` + `user_roles`"):

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
- **`others(me, only_available)`:** a geo-gated candidate is dropped from everyone's pool via `AND (NOT only_available OR public.area_available(other.location))`, a role-disabled candidate via the sibling clause `AND (NOT only_available OR NOT public.role_blocked(other.user_id))`, and a push-unreachable candidate via the sibling clause `AND (NOT only_available OR NOT public.push_blocked(other.user_id))` (see "Notification-presence gate"). `app_find` always passes `only_available = true`, so an in-region user is never matched against someone who can't respond. With no enabled areas / no disabled roles / nobody push-blocked all three clauses are no-ops (byte-identical matching).
- **Mobile (`home.tsx`):** when `relations.availability.state` is `unavailable`/`not_yet` (and the user is not in an active chat), the rotating-headline slot shows a single **short** fixed gate message (`home.geoGate.unavailable` / `home.geoGate.notYet`; `notYet` interpolates `{date}` = the launch moment formatted **short** `DD/MM HH:MM` from `availability.starts_at`). The copy is kept brief on purpose: it shares the `SkipHintLabel` slot which is tuned for brief phrases — a long string overflows/clips there. The find/play button is suppressed and the **side tab is removed**, so page2/chat is unreachable. The pager itself stays swipeable — **Home↔Menu(settings) must keep working by swipe while gated** — and the side slot is made unreachable by **not rendering it at all**: while gated the pager has only 2 children `[settings, home]` (the side slot is dropped from the children array via a conditional spread), so a swipe physically cannot reach it. (This replaced an earlier "render 3 slots, let `onPageSelected` snap back from slot 2 to Home" approach — react-native-pager-view has no per-page swipe lock, so the snap-back could only bounce slot 2 back *after* it was already on screen, which still read as accessible. See "PagerView layout".) `initialPage` is clamped to Home when gated; `goToPane` still swallows programmatic nav to the side slot, and the `onPageSelected` snap-back + `geoGated`→Home effect remain as defense-in-depth for the 3→2 children transition. `not_yet` lifts itself client-side when `starts_at` passes (reconfirmed on the next `start`/`focus`), and the `area-open` push arrives if the app was closed. An active chat is never gated (non-destructive: a user who matched before being gated keeps the conversation).

Helper SQL: `area_state(loc geography) → jsonb` (mode-driven; **defined but no longer consulted by the gate** — see "Group-membership gate"), `area_available(loc geography) → boolean` (likewise defined-but-unused by the gate), `role_blocked(uid uuid) → boolean` / `group_blocked(uid uuid) → boolean` (≥1 disabled group; defined but unused by the gate), `push_blocked(uid uuid) → boolean` (positively-known no-notifications; see "Notification-presence gate"), `in_enabled_group(uid uuid) → boolean` (holds ≥1 **enabled** group — the live gate input; see "Group-membership gate"), `user_availability(uid uuid, loc geography) → jsonb` (the single source of truth: **(1)** push-block override, **(2)** null-loc escape hatch, **(3)** `in_enabled_group` ⇒ available, **(4)** else unavailable; every availability writer goes through this), `app_availability(me_id uuid) → jsonb` (`{user, notify}` envelope), `app_area_launch_sweep() → jsonb` (`{processed, notify}`, cron). Note: `app_refresh_snapshots` does **not** recompute availability — location only changes via `start`/`location`/`focus`, and admin area changes / `not_yet` expiry propagate within ~60s via the next periodic `/app/location`, on app `focus`/launch, or the per-minute launch sweep + `area-open` push.

### Notification-presence gate

The app **requires presence**: a user who does not actually receive push notifications cannot respond to an invite/match, so matching anyone to them wastes both sides. Such a user is therefore made **unavailable to everyone**, folded into the exact same gate as the geo / disabled-group blocks (no separate mobile path — it reuses the deployed `relations.availability` gate end-to-end). User decision 2026-05-18: "people who don't get notifications => unavailable".

**What we can/can't know (verified against live data 2026-05-18).** Server-side alone we **cannot** reliably tell whether a user receives pushes: Expo returns `ticket.status='ok'` even when the OS has notifications muted (a silent push looks identical to a real one), and bare "no `data.push_token` on the row" is a **false signal** — 40 of 45 located users (all active in the last 24h) carry no token in this base (simulator/dev/seed sessions where `getExpoPushTokenAsync` yields nothing). Gating on missing-token would have bricked ~90% of the base. So the gate fires **only on positive evidence of non-delivery**, and `relations.push.token` is recorded for observability **but is NOT a gate input**.

- **`public.push_blocked(uid uuid) → boolean`** (`sql stable security definer`, inlinable into `others()`/`user_availability`): TRUE iff the user has `location IS NOT NULL` **AND** (`relations.push.perm = 'denied'` **OR** `relations.push.dead = true`). `location IS NULL` ⇒ never blocked (onboarding / pre-permission escape-hatch tier, mirrors `area_state(null)`). `'undetermined'` perm is **not** blocked (not-yet-prompted ≠ denied). Deliberately conservative: starts at ~0 impact (0/49 at deploy) and tightens as the perm-reporting build rolls out + dead tokens are detected — staged Expand, never a base-wide outage.
- **Two positive signals feed `relations.push`:**
  1. **Client-reported OS permission (near-realtime).** Mobile sends `notif_perm ∈ {granted,denied,undetermined}` in the `/app/start` and `/app/focus` bodies AND, for the realtime path, via a dedicated lean **`POST /app/notif`** heartbeat. The edge `recordPushPresence(user, body)` (called in the `start`/`location`/`focus` **and `notif`** cases, **before** persist + `app_availability`) merges `{perm, token:!!data.push_token, checked_at}` into `relations.push`; a fresh `push_token` in the body or `perm='granted'` also clears `dead`. `/app/notif` does **only** `recordPushPresence` → persist → `app_availability` (no auto-find / no extra work) so it's cheap enough to fire around every permission toggle; the synchronous `app_availability` means the response + the Realtime `relations` change carry the new gate state immediately. **The OS emits no permission-change event**, so the mobile freshness mechanism is: (a) on every `AppState`→`active` (return from Settings = the #1 change moment) report immediately, un-throttled; (b) a **3 s foreground poll** of `getNotifPermission()` (same cost class as the existing 2 s location-services poll) catches in-app revokes (Android shade long-press) and any `/app/focus` 30 s-throttle gap. Both go through a **change-debounced** `reportNotifPerm` (`lastReportedPermRef`) so steady state is zero network / zero re-render; the server is updated within ~3 s of any change. **Old builds never send `notif_perm` / never call `/app/notif` ⇒ `relations.push` stays absent ⇒ never gated** (additive, not breaking — new endpoint, old clients don't call it).
  2. **Expo `DeviceNotRegistered`.** `Tools.notify()` returns `{ok,error}`; `firePush` (both `app` and `ext`) on `error==='DeviceNotRegistered'` fires `EdgeRuntime.waitUntil(app_push_dead(target))`. **`public.app_push_dead(p_user_id uuid) → jsonb`** (`plpgsql security definer`, EXECUTE revoked from anon/authenticated) clears `data.push_token` (→ jsonb null), sets `relations.push={dead:true,token:false,checked_at}`, and recomputes `relations.availability = user_availability(uid, location)` so the user drops out of every pool immediately (Realtime delivers it; the per-minute `app_area_resync` is the safety net for the reverse direction once a working token re-registers). Returns the `{user, notify:[]}` envelope (no push queued — the user just lost notifications).
- **Enforcement** is the existing gate: `user_availability` precedence **case 1** (see "Group-membership gate" precedence list — `push_blocked` is the top hard-block, above the null-loc hatch and the membership check) + the `others()` sibling clause `AND (NOT only_available OR NOT public.push_blocked(other.user_id))` (push-gated user not found by others) **and the symmetric edge-handler initiation block** (push-gated user cannot `find`/`invite`/`add`/`approve` — see the Geo-availability gate "Edge handler (initiation block)" enforcement bullet; it keys off `relations.availability.state`, so geo / disabled-group / no-notifications are all blocked identically, both directions). A push-gated user sees the deployed `relations.availability.state='unavailable'` gate UI (the side tab is removed, find suppressed) — the gate **message copy still reads as the geo "not available in your area"** string (`home.geoGate.unavailable`); functionally correct, wording is a known minor UX gap, not blocking.
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

Indexes: partial `reports_unhandled_idx on (created_at desc) where not handled` (the admin queue); `reports_reported_idx on (reported_id)`. Written by `app_report`; read/triaged by the web admin `/admin/reports`.

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
`app_find` (returns `{user, notify}`; picks the single most-relevant candidate via `others()` ranked `LIMIT 1`, writes `page1={state:'watching', profile:…}`, registers the actor as a viewer on that candidate's `page2.profiles[]`, detaches from the previous target), `app_seed_viewer(me_id)` (called fire-and-go from the `start`/`location`/`focus` edge handler after the auto-find block; seeds ONE top-relevance viewer onto a visible user with zero existing viewers — see "`start` / `location` / `focus` — first-viewer seeding". No-op when not `available` / `page2.state ≠ 'free'` / viewer list non-empty / no candidate whose `page1.state='free'`. Queues a `candidate` push via the standard `{user, notify}` envelope), `app_add` (page2 "Show me to people" / broadcast button: pulls up to 2 most-relevant candidates into `A.page2.profiles[]` and sets each candidate's `page1` to watching A. Preconditions: `A.page1.state ≠ 'chat'` AND `A.page2.profile` is missing (no live incoming invite) AND last call > 30 minutes ago. Existing `page2.profiles[]` watchers are preserved (never kicked) — broadcast appends new candidates on top of them — but a user who is **already viewing A** is excluded from candidate selection so a current viewer is never re-added: `app_add` builds `viewer_ids` from `A.page2.profiles[]` and the candidate query carries `AND NOT (o.user_id = ANY(viewer_ids))` (alongside the pre-existing defensive `NOT EXISTS` clause that drops anyone whose `page1` is currently `watching` A). When `page2.state` was already `'free'`, the existing `profiles[]` is preserved; when `'locked'`, page2 auto-resets to `{state: 'free', profiles: []}` (so a resting state becomes discoverable in the same call). Writes `A.relations.last_add_at = now()` even when zero candidates are returned, so an empty-pool press still consumes the cooldown), `app_cancel_add` (clears `A.relations.last_add_at`; used by the toggle's "exit broadcast" confirmation and by tapping "Visible" while broadcasting — since page2.state is already free during broadcast, `app_free2` would be a no-op). `app_ignore`, `app_clear1`, `app_clear2`, `app_invite`, `app_extend`, `app_cancel`, `app_approve`, `app_decline`, `app_leave`, `app_block`, `app_remove`, `app_free2` (transitions `A.page2.state` from `locked` → `free`; called by the page2 premium "show my profile again" tile), `app_lock2` (premium "hide me" action; transitions `A.page2.state` from `free` → `locked` with no profile/profiles AND strips `A.relations.last_add_at` so the visibility toggle exits broadcast mode atomically. In the same transaction also kicks every watcher in `A.page2.profiles[]`: each watcher's `page1` → locked + `message='remove'` (only if still pointing at A in 'watching'), per-pair `remove` restriction inserted, `removed` push queued. Equivalent to N `app_remove` calls + a final state flip + cooldown reset, collapsed into one round trip. Mobile UI confirms with the user before calling since the action is destructive. No cooldown), `app_pause` (the page1 skip-pause button — the round centre circle revealed when a skip slides the card off; `runPauseFromSkip` in `home.tsx`. Stops an active page1 **watch** ONLY and **deliberately does NOT touch page2 / visibility** — user request 2026-05-22, migration `20260522040000_app_pause_keep_visibility`: no watcher-kick, no `page2` lock, no `last_add_at` strip. Acts only when `page1.state='watching'` (any other state ⇒ no-op — the button is unreachable elsewhere): detaches the actor from the watched user's `page2.profiles[]` and sets `A.page1={state:'locked'}` via `jsonb_set`, so `page2`, `last_add_at`, `credits`, `availability`, `push`, `join_request` are all preserved verbatim. No restriction, no push. The green play button then re-enters the game via `find`), `app_resume` (legacy "Game mode → Active" inverse of the old two-page `app_pause`; sets both pages to free, guarded on both being `locked`. **No longer reachable from the mobile UI** — the play button re-enters via `find`, and `app_pause` no longer locks `page2` so the guard rarely holds. Dead but harmless, left in place), `app_expire_sweep` (called by pg_cron every minute), `app_delete_cleanup` (called by the `delete` endpoint before row deletion), `app_logout_cleanup` (called by the `logout` endpoint: kicks page2 viewers to `logout`, clears page2), `app_refresh_snapshots` (see below), `app_save_profile` (called by the `profile` endpoint: accepts `{images?, bio?, family?, is_for_kids?}` payload. Only the keys present are written; passing `null` on `bio`/`family` clears that field), `app_availability` (called synchronously by `start`/`location`/`focus`: recomputes `relations.availability = area_state(me.location)` and returns the `{user, notify}` envelope so the response + Realtime carry the gate state — see "Geo-availability gate"), `app_area_launch_sweep` (called every minute by `/ext/cron` alongside `app_expire_sweep`: flips `not_yet` users whose area opened to `available` and returns `{processed, notify:[{user_id, code:'area-open'}]}` so the cron handler fires the launch push), `app_admin_reset` (admin reset — **two overloads**, resolved by arity / by PostgREST on the presence of the `p_role_ids` arg. (a) No-arg `app_admin_reset()`: the original GLOBAL reset — deletes all `chat` + non-null-user `log` + all `restrictions`, then for every user sets `last_seen=now()` and `relations = {page1:{state:'locked'}, page2:{state:'free', profiles:[]}, availability: user_availability(user_id, location)}`. Kept in the DB, **no longer the web entry point**. (b) `app_admin_reset(p_role_ids uuid[])`: the ROLE-SCOPED reset the web flow now uses — only users holding **≥1 of the selected roles** are touched; every DELETE/UPDATE is bounded to that target set (chat as sender/recipient, log, restrictions issued/received, relations rebuild). Empty/null array ⇒ `{users:0}` no-op (never falls through to global). Both rebuild `availability` via `user_availability(user_id, location)` (not `area_state`) so the geo **and** role-disable gate stays correct immediately after the reset, and rebuild `credits` via `_credits_default()` — **tier reset to `free` (Basic), balance = free cap (3), grant fields refreshed** (see "Credits economy → Admin reset resets the package to Basic"). **Recomputing `availability` AND `credits` per row is the whole point**: an earlier handler overwrote `relations` with a literal that had no `availability` key (wiping the gate until the user's next `start`/`location`/`focus`) and no `credits` key (silently demoting every `pro` user to `free`/5 on the next credit RPC). Both SECURITY DEFINER, EXECUTE revoked from anon/authenticated. **Triggered only from the web admin** users dashboard: a popup with a role checklist + select-all/deselect-all (`ResetAllButton`) → `web/src/app/[lang]/admin/actions.ts → resetUsersByRoles(roleIds)` via the service role, not the mobile app. The legacy free-form `users.data.role` values in the wild (`TEST`, `ADMIN`) were backfilled into `roles`/`user_roles` by migration `20260517240000_backfill_roles_from_data_role` (created roles ENABLED so the backfill never silently gates anyone; `data.role` itself left intact, read by nothing).

`app_credits_grant` (daily credit top-up; called every minute by `/ext/cron` alongside `app_expire_sweep`/`app_area_resync`; idempotent per 20:00 Asia/Jerusalem grant day; no push — see "Credits economy"). `app_set_tier(me_id, new_tier)` (user-initiated tier switch from the settings hearts popup via `POST /app/set_tier`, now **one-way free → Pro**; validates `new_tier ∈ {free,pro}`. `tier='pro'`: forces `tier='pro'` then `_credits_reset_to_cap` rebuilds `credits` at the Pro cap → `{balance:10, tier:'pro', grant fields refreshed}` (upgrade tops the wallet to max). `tier='free'`: `_credits_ensure` then writes ONLY `credits.tier`, balance/grant preserved (non-destructive; UI no longer triggers it). Returns `{user, notify:[]}`; additive, no backward-compat concern). The credits-touching RPCs spend / preserve credits per "Credits economy": `app_approve` and `app_add` charge via `_credits_charge`, `app_cancel` charges 1 (the only invite-flow spend), `app_invite` is free, and `app_resume`/`app_logout_cleanup`/`app_admin_reset` carry `credits` forward via `_credits_ensure` (`app_pause` preserves the whole `credits` blob automatically — it now does a page1-only `jsonb_set` and never rebuilds `relations`). The former hold/refund machinery (`_credits_refund` / `_credits_clear_hold` / `credits.held` / `_credits_charge`'s `hold` flag) was removed (migration `remove_credit_hold_cancel_cost`). `app_admin_clear_join_request(p_user_id uuid) → jsonb` (admin/service-role only, `migration 20260519160000`; body fixed by `20260519170000_clear_join_request_no_state_flip`) removes `relations.join_request` and strips the `join_requested` **sub-field** of `relations.availability` but **does NOT recompute/flip the availability state** (so the `unavailable → available` group-assign transition stays detectable by `app_area_resync`, which is the sole firer of the `area-open` push); called by the web-admin "Remove request" button and auto on group-assign — see "Gate reason + join-request flow". `app_admin_reset_user(p_user_id uuid) → jsonb` (the per-user counterpart of the role-scoped `app_admin_reset(uuid[])`; SECURITY DEFINER, EXECUTE revoked from anon/authenticated, migration `20260522010000_app_admin_reset_user`) — wipes one user's `chat`/`log`/`restrictions` and rebuilds `relations` to the clean-slate shape (`page1` locked, `page2` free, `availability` via `user_availability`, `credits` via `_credits_default()` — tier reset to Basic/free). Like `app_admin_reset` it does **not** tear down non-reset partners' live links (the user still exists, so their partners' snapshots stay fresh via `app_refresh_snapshots`). Triggered by the **"Danger zone"** on the web admin user-detail page (`UserDangerZone` → `users/actions.ts → resetUser`). Its sibling **delete** control (`deleteUser`, same file) needs no new RPC: it runs the existing `app_delete_cleanup` (partner teardown), deletes the user's `log` + `restrictions` rows, then `auth.admin.deleteUser` (cascades `users → chat` + `user_groups`; `reports` deliberately kept). Both admin-only / additive — the deployed mobile app never calls them. `app_admin_release_page1(p_user_id uuid) → jsonb` / `app_admin_release_page2(p_user_id uuid) → jsonb` (admin/service-role only, SECURITY DEFINER, EXECUTE revoked from anon/authenticated, migrations `app_admin_release_pages` + `app_admin_release_page1_to_free`) — reset **one page** of a single user back to a **discoverable** state (`page1 → {state:'free'}`, `page2 → {state:'free', profiles:[]}`) **without touching the other page**. The page1 target is `'free'`, not `'locked'` (user request 2026-05-23): the admin "release" semantic is "make this user available again", which only holds when the page lands in a discoverable state — `locked` would have left the user inert until they themselves pressed play. `app_admin_reset_user` (the wider clean-slate wipe) still ends page1 at `locked` because it is the punitive reset, not a release. `jsonb_set` on the single page key preserves the sibling page + `credits`/`availability`/`push`/`last_add_at` verbatim. State-aware counterparty teardown so no related user is left orphaned — release-page1 `watching` → detach from the watched user's `page2.profiles[]`; `waiting` → close the invitee's `pending` page2 (`message='cancel'`); `chat` → end the partner's chat side (`page1` locked, `message='leave'`). release-page2 `pending` → close the inviter's `waiting` page1 (`message='decline'`); `free` → kick every viewer (their `page1` locked, `message='remove'`). Mirrors the teardown shapes of `app_cancel`/`app_leave`/`app_decline`/`app_lock2`/`app_pause` but **without the cooldown `restrictions`** (a clean admin reset, not a punitive user action) and **without push** (Realtime reconciles open apps). Triggered from the web admin only — per-user quick actions and bulk actions on the users list.

Helper functions: `make_profile`, `_remove_from_page2`, `_kick_pointing_at`, `_add_restriction`, `schedule_overlap` (see "Schedule overlap" below), `kids_preference_match` (see "Kids preference match" below), `area_state` / `area_available` / `role_blocked` / `push_blocked` / `user_availability` (geo-gate + role-disable + notification-presence gate; see "Geo-availability gate", "`roles` + `user_roles`", and "Notification-presence gate"), `_apply_availability(uid, av)` (the single availability-persist helper used by `app_area_resync` + `app_availability`; also drops page1 `watching` → `free` and removes the user from the watched user's `page2.profiles[]` when `av.state='unavailable'` — see "Availability resync"), the `app_push_dead(p_user_id)` RPC (dead-token cleanup, called fire-and-forget from the push pipeline on Expo `DeviceNotRegistered`), and the credits helpers `_credits_tier_cfg` / `_credits_cost` / `_credits_grant_day` / `_credits_next_grant_at` / `_credits_default` / `_credits_ensure` / `_credits_balance` / `_credits_charge` / `_credits_reset_to_cap` (see "Credits economy"). `others(me, only_available)` carries an extra `area_available(other.location)` candidacy clause (no-op when no enabled areas), a `NOT role_blocked(other.user_id)` candidacy clause (no-op when no disabled roles; see "`roles` + `user_roles`"), a `NOT push_blocked(other.user_id)` candidacy clause (no-op when nobody is push-unreachable; see "Notification-presence gate"), a credits-balance candidacy clause (`balance >= _credits_cost('approve')` under `only_available`; see "Credits economy → Findability gate"), and a `relevance_broadcast` factor folded into the final `relevance` product (see "Broadcast relevance boost" below).

**Auto-return-to-free policy.** Users return to `page2.state = 'free'` at the end of every page2 process unless they explicitly hid via `app_lock2`. Concretely:
- `app_decline` — decliner's `page2` → `{state: 'free', profiles: []}` (the inviter's profile is dropped immediately; no "you declined" card surfaces on the decliner).
- `app_leave` / `app_block` — both leaver and partner end up at `page2 = {state: 'free', profiles: []}`. Previously only the leaver was reset; the partner stayed locked-no-message.
- `app_clear2` — when there's a `message` to acknowledge (cancel / expire / approve-fail / etc.), this endpoint now flips `page2` all the way back to `{state: 'free', profiles: []}` instead of merely stripping the message. Effectively merges with `free2` for the message-ack path. The explicit-hide case (locked + no message) is intentionally not touched.

The "Back to the game" button on the dead-invite card calls `app/free2` directly. Net effect: every page2 ending — declined, expired, cancelled, approve-fail, chat-ended — returns the user to the discoverable pool without an extra step. Only `app_lock2` (the explicit "Hide my profile" tile in the visibility popup) keeps the user out of the pool.

### `app_refresh_snapshots(me_id)` — keeping snapshots fresh

The `Profile` snapshot stored inside `relations` (via `make_profile`) freezes the entire profile — `name`, `title`, `images`, `bio`, `family`, `is_male`, `last_seen`, `distance`, `location_custom` — at write time. Without active refresh, a chat partner or watcher would keep showing whatever values were captured at match/view-start time, not the current ones.

`location_type` (and the back-compat `location_custom`) is only embedded when the snapshotted user's anchor is `home`/`work`; `device` mode omits both keys. The mobile distance chip is driven by **B's** (the snapshotted side's) `location_type`: `device` → PinIcon, `home` → HomeIcon, `work` → WorkIcon. The chip **text** is a binary live-vs-anchored signal: it stays "ממך"/"away" only when **both** the viewer (A) and the subject (B) are `device` (true live proximity); the moment either side is `home`/`work` it switches to the passive "מהמיקום שהוגדר"/"from the set location" (the number is anchored to a fixed address, not live proximity). So the icon answers "what is B's point" and the text answers "is this number live". Old mobile builds (pre-typed) ignore `location_type` and keep using `location_custom` for the legacy binary PinIcon↔HomeIcon + passive-text swap; see `BACKWARD_COMPAT.md`.

`app_refresh_snapshots(me_id)` is called from the handler (behind `EdgeRuntime.waitUntil`) on every endpoint **except** `delete` (the row is gone). (The old admin `reset` endpoint is also gone — global reset moved to the web admin via `app_admin_reset()`; see below.) It rebuilds every snapshot using a fresh `make_profile(...)` so all observable Profile fields stay live over Realtime — not just `last_seen` and `distance`, but also `name`, `images`, `bio`, `family`, `is_male`, `title`. So a user editing their bio, swapping a photo, or updating family/schedule propagates immediately to anyone holding their profile inside `relations`. Stripping rules:

- **state ≠ chat AND message is null** → snapshot has full live profile, including `distance` and `last_seen`.
- **state = 'chat'** → strip `distance` (kept stripped, never re-added). Two users in chat shouldn't surface live distance to each other.
- **message IS NOT NULL** (locked-with-message state) → strip BOTH `distance` AND `last_seen`. The "what happened" card has no use for those volatile fields, and surfacing them after the interaction ended is misleading (e.g. a partner's `last_seen` ticking forward after they left chat).
- Rules apply additively to all four snapshot slots that can carry a message: outward `B.page1.profile`, outward `B.page2.profile`, inward `A.page1.profile`, inward `A.page2.profile`. `page2.profiles[]` (watcher list) is only populated when `state='free'` with no message, so neither rule applies and the full snapshot is kept fresh there.

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

### Broadcast relevance boost (`others.relevance_broadcast`)

Added 2026-05-17, migration `relevance_broadcast_boost`. A constant **×2** multiplier in `others()` for any candidate who is **currently broadcasting** — i.e. pressed "Show me to people" / `app_add` and is still inside the broadcast window: `other.relations->>'last_add_at'` parses to a timestamp `> now() - interval '30 minutes'`. Not broadcasting (key absent/empty, or older than 30 min) → **1.0** (neutral).

- Surfaced as the `relevance_broadcast double precision` output column (parallel to `relevance_schedule` / `relevance_kids`) and multiplied into the final `relevance` product alongside age/location/time/watchers/schedule/kids.
- **2.0 is deliberate**: it matches the codebase's existing "maximum boost" magnitude (`schedule_overlap` and `kids_preference_match` both cap at 2.0). Multiplicative, not an override — a broadcaster who is otherwise a poor fit (wrong age band, far, stale) still loses to a strong nearby active match. Broadcasting signals "I want to be seen now"; it lifts, it doesn't bypass suitability.
- The **30-minute window MUST stay in sync** across **all** its inline copies: `app_add` / `app_cancel_add` / `app_lock2` (the broadcast cooldown), `others.relevance_broadcast` (this boost), `app_approve` (broadcasting → free accept, `v_approve_cost`), and the `others()` credits-gate exemption (broadcasting candidate bypasses the balance gate). Each inlines `interval '30 minutes'`; the codebase deliberately does not extract this interval. If that cooldown ever changes, change every one of these predicates in lockstep.
- Not breaking for the deployed app: `others` is internal-only (called by `app_find` / `app_add`, which select named columns), the edge functions never read `relevance_*`, and mobile never sees it. Adding the output column changed the function's composite return type, so the migration `DROP`s then recreates `others` (safe: no positional consumers; Postgres doesn't track SQL-body function→function deps so dependent RPCs are untouched).
