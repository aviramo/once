# Project Instructions

## Operational autonomy (whole project)

Claude has blanket upfront permission for every action it can perform locally or via available tooling. Don't pause to ask "should I run X?" — run it. Reserve questions for steps that are genuinely impossible without the user.

**Default rule: anything Claude can do alone, Claude does alone.** If the action is technically executable with the tools and credentials Claude already has, execute it. Do not narrate intent, do not request confirmation, do not hand back instructions for the user to run. Asking the user to do something Claude could have done is the failure mode — preferable to act and report than to defer and wait.

**Examples of what to do without asking:**

- Edit/write any file in the repo, including config (`app.json`, `eas.json`, `package.json`, `CLAUDE.md`).
- Run `npm install` / `npm uninstall` / dependency upgrades.
- Run `eas build` / `eas submit` / `eas env:*` / `eas credentials` (interactive prompts, route via terminal as last resort).
- **Publish / release on demand.** If the user says "פרסם" / "תפרסם" / "release" / "publish" / "upload" / "ship it" or any equivalent (with or without naming a platform), run the release command yourself — do not hand back instructions. Default is both platforms via `cd mobile; npm run release` (= `eas build --platform all --profile production --auto-submit --non-interactive --no-wait`). For a single platform, use `npm run release:android` or `npm run release:ios`. The configured submit targets are TestFlight (iOS) and Closed testing track `alpha` (Android). After kicking off, report the build + submission URLs and stop — do not poll or wait.
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
Fixed 3-page layout:
`[settings(slot 0), home(slot 1), side(slot 2)]`

There is no separate Settings overlay any more — Menu is just slot 0 of the same PagerView. No directional swipe-to-open / swipe-to-close gestures. The user reaches Menu by tapping its tab or swiping from Home toward the Menu side.

Slot 2 renders `ChatPage` when `chatAvailable` (`state === 'chat'`), page2 content otherwise.
No slot is added or removed — only the content of slot 2 changes.

### Global TabStrip
- A single `<TabStrip>` lives at the top of the home shell, inside the safe area, **above** the PagerView.
- It is the only chrome with a title; `HomeHeader` / top-level `ScreenHeader` are no longer rendered inside page1, page2, or `SettingsPage` (when embedded).
- Three tabs in pager-slot order: **icon-only Menu** (chrome, not a destination), `home.tabs.home` (always "Once"), and the **side tab** (page2 / chat).
- The Menu tab carries no text label — it's a single glyph (`SlidersIcon` settings glyph normally, `PauseIcon` when `gameModeOff`, `CloseBoldIcon` while the profile preview sheet is open). It has `flex: 0` (shrinks to glyph width with `paddingHorizontal: SM`) so the content tabs absorb the freed flex and read wider. A labeled tab keeps `flex: 1`. Mechanism: `TabSpec.label` is optional; an absent label (and no `subLabel`) triggers the compact icon-only tab style. **Equal-width guarantee:** the flex behaviour is split into THREE exclusive styles applied as `[styles.tab, iconOnly ? styles.tabCompact : styles.tabFlex]`: `styles.tab` is the shared base (NO flex/basis), `styles.tabFlex` = `flex:1 + flexBasis:0 + minWidth:0` (content tabs only), `styles.tabCompact` = `flex:0 + paddingHorizontal:LG` (icon tabs only); `styles.row` is `width:'100%'`. This is load-bearing, not cosmetic: a flex item defaults to `min-width:auto` (min-content), so without `minWidth:0` the page2 side tab (name + timer content) keeps a wider content floor than the page1 tab (whose label sits in the absolute morph band, leaving its in-flow `mainRow` empty), and page2's chip renders visibly wider than page1's. With `minWidth:0`+`flexBasis:0`+definite row width the two flexible content tabs distribute the row purely by `flexGrow` and come out exactly equal → page1 and page2 chips match whenever page2 carries a profile. **The split is mandatory:** putting `flexBasis:0` on the shared `styles.tab` once leaked it onto the compact tabs (`flexBasis:0` + their `flex:0` collapsed the icon tabs to zero width and the end glyphs went asymmetric from the screen edges). Keep `flexBasis:0`/`minWidth:0` on `tabFlex` only, never on `tab`/`tabCompact`.
- **The side tab is labeled ONLY when slot 2 is dedicated to a single counterpart** — an incoming-invite card (`page2PendingInvite`) or a dead-invite "what happened" card (`page2DeadInvite`); the label is that person's name. In every ambient state (live chat, or self-visibility: broadcast / visible / hidden) there is no 1:1 person to name, so the side tab **collapses to an icon-only compact tab exactly like Menu** (`flex: 0`), freeing flex so "Once" recenters between the two compact end tabs. Expand ↔ collapse is animated by `TabStrip` itself: every tab is an `AnimatedPressable` with `layout={LinearTransition.duration(TAB.collapseDuration)}` (the width/X reflow) and the label/icon clusters carry `FadeIn`/`FadeOut` of the same `TAB.collapseDuration`, so the content cross-dissolve and the reflow finish together. Menu/Home never toggle these props so their wrappers stay mounted and never fade.
  - Collapsed-state glyph: `chatAvailable` → `ChatIcon`; otherwise the visibility glyph via the shared `VISIBILITY_ICON` map (`broadcast` → `MegaphoneIcon`, `visible` → `EyeOpenIcon`, `hidden` → `EyeOffIcon`) — the **same** map the in-page `VisibilityToggle` segments use, so a given state always reads as the same icon. Icon size = `ICON.xxl` (matches Menu; `ICON.xxl` is the single default glyph size app-wide).
  - **Broadcast pulse:** while broadcasting, the collapsed megaphone glyph runs a continuous gentle "alive" heartbeat on the `TAB.subLabelPulsePhaseMs` half-cycle (the same beat the sub-label status word and `PresenceDot` use), driven by `TabSpec.indicatorPulsing` through the shared `useGentlePulse` hook (called with `lo = 0`). The pulse is **not an alpha dim** — it oscillates the glyph between its normal *unselected* rendering (muted `WHITE_MID` layer) and its *selected* rendering (active `WHITE` layer), i.e. it continuously drives the exact active/muted layer cross-fade that selection and the finite `alerting` already drive. Implemented as indicator-only `indicatorActiveStyle` / `indicatorMutedStyle` that substitute `max(alertActive, 1 - indicatorBeat)` for `alertActive` in the standard layer math; the two layer opacities always sum to 1 (no flicker). It is inherently **selection-gated**: on the selected pane the tab's own selectedness `t = max(0, 1 - |pagerProgress - index|)` is `1`, which pins active = 1 / muted = 0 regardless of the beat, so the glyph holds steady there and only breathes while the pane is unselected — fading smoothly across the swipe rather than snapping. When `indicatorPulsing` is false `indicatorBeat` rests at `1` so the substitution collapses to plain selection behaviour and every other tab's indicator is byte-identical to before.
- Counts (unread chat messages, viewer counts) are **chained directly into the side-tab label** as `${label} ${n}` — there is no separate chip badge — but only in the labeled (pending/dead-invite) states; collapsed states show the icon alone (no count). One piece of text reads cleaner at small tab size and avoids the extra circle competing with the word. `TabSpec` has no `chip` field; callers build the full label string themselves. The label still pulses on alerting transitions (the pulse is applied to the label stack), and `chatAvailable && chatUnread > 0` still alerts via the tab-level pulse on the collapsed chat icon even though the number is no longer drawn.
  - `page2PendingInvite` → labeled with the inviter's name, alerts on arrival via the tab-level pulse, and the live countdown rides under the label as `subLabel`.
  - `page2DeadInvite` → labeled with the other user's name and, when the lock came from `expire`, the timer stays frozen at 00:00 under the label — together they communicate "this side is finished" without an extra pause icon, which read as noise next to the name.
- Container background is a **flat solid `PRIMARY`** (pure black `#000000`) header — **no gradients anywhere and no drop-shadow** (the user explicitly removed both). `backgroundColor: PRIMARY`, seamless with the PRIMARY status bar (`StatusBar style="light" backgroundColor={PRIMARY}`); the *only* separation from the white content below is the black color contrast (no `boxShadow`, no elevation). The bottom edge is **square and full-width** (no `borderRadius`, no `overflow: 'hidden'`). The container carries a tight `paddingHorizontal: SM` (the user wants the row close to the screen edges); the chip↔glyph breathing room is a *separate* concern owned by `tabCompact.paddingHorizontal (LG) − TAB.indicatorInsetX` inside the row, so the edge margin and the inner padding tune independently. `paddingTop` is `topInset + XL` (not `MD`): the sub-label timer floats as a caption *above* the selected-tab chip, so the header needs real top breathing room to keep the timer clear of the status bar. Paused (`gameModeOff`) swaps the solid `PRIMARY` for flat `BLACK_MID`. There is intentionally **no conditional / scroll-driven header shadow** — it was built once and then removed at the user's request; do not reintroduce it.
- The "selected" indicator is **two layers driven by two SEPARATE values** (this split is the 2026-05-17 change — the user explicitly revisited the old "both driven by `pagerProgress`, 1:1 with the finger" model because the chip's per-frame width recompute dragged on the pager's release-settle):
  1. **ONE flat translucent-white chip** (`HEADER_PILL_FILL` solid `rgba` — *not* a gradient — plus `HEADER_PILL_BORDER` / `HEADER_PILL_SHADOW`), a single moving element (*not* per-tab opacity) that **spans the selected tab's full width** (minus `TAB.indicatorInsetX` each side) and **resizes** between the unequal tabs. **Its position is DECLARATIVE, NOT pager-driven.** The chip has exactly N rest states, one per tab; each rest state's geometry IS that tab's measured layout frame. It has **two drivers** (user explicitly revisited 2026-05-17 — "the indicator should move *together with* the pager, via a layout/native constraint, not JS"): **(a) POSITION (`translateX`) is bound to the LIVE pager value** (`progress` = `tabProgress`, from PagerView `onPageScroll` on the UI thread). That UI-thread transform binding is the RN equivalent of a CSS/native constraint (NOT a JS-thread per-frame loop): the chip slides 1:1 with the finger and rides the pager's own settle curve, glued to the pages. **(b) SIZE (`width`/`height`/`borderRadius`) stays on the DECOUPLED `chipProgress`** — a self-contained value (`home.tsx`: `chipPane` `withTiming`s to the *committed* `paneIndex` on every commit (swipe settle via `onPageSelected` / tab tap via `goToPane`), over `TAB.collapseDuration`; `chipProgress` then blends toward `HOME_PANE` by `profileSheetProgress`, the SAME shape as `tabProgress`, so the profile-sheet Settings→Home slide is preserved). `translateX` is the only pure GPU transform; `width`/`height` are layout props, and recomputing THOSE every `onPageScroll` frame slaved to the pager's deceleration was the original release-settle "drag" — so size settles on the commit tween (one clean curve, crisp border) while position tracks the pager. It is `position:absolute` inside a plain absolute-fill overlay (`styles.chipOverlay`, `pointerEvents="none"`, first child so it paints behind the labels), anchored physical **`left:0`**, box-centred on the mainRow then nudged DOWN by **`TAB.chipBaselineNudge`** (a static, declarative `bottom` offset — the single Y-centring knob — so the capsule centres on the tab's optical ink rather than reading high above it). **RTL is unchanged and still the one delicate bug:** position comes from tab **widths** (`w0/w1/w2`, from each `TabButton`'s `onLayout` — never an `x`/`measureInWindow`/analytic mirror) in logical/child order: `logicalLeft = interpolated-tab-centre − chipW/2`, applied as `translateX = isRTL ? −logicalLeft : +logicalLeft`. This app RTL-swaps `left`, so `left:0` lands at the row's start and that sign (the proven-correct `marginStart = logicalLeft` equivalence) is right in both directions; `transform` is immune to the RTL swap so the sign is the only directional term. The interpolation is generalized to `tabs.length` (2 while geo-gated, 3 otherwise) and clamps `chipProgress` to `[0, n-1]`. opacity 0 until measured; widths animate over `TAB.collapseDuration` on side-tab expand/collapse. **Do NOT** reintroduce `measureInWindow`/analytic-RTL-mirror/`start:0`/flex-child-`marginStart` (each broke RTL or stuttered), do NOT replace with per-tab opacity (not real movement), and and do NOT put `width`/`height` back on the live `pagerProgress`/`tabProgress` (recomputing layout props per `onPageScroll` frame is the release-settle "drag" — SIZE must stay on the decoupled `chipProgress`; POSITION tracking the pager is intentional and correct) — unless the user explicitly asks to revisit again. **The chip GROWS UPWARD to enclose the sub-label timer** (user choice 2026-05-17, replacing the old "timer floats as a caption *above* the chip" — that prior rule is dead). Two heights: `CHIP_SHORT = TAB.rowHeight + 2*TAB.indicatorPadV` (single-line capsule, `borderRadius = TAB.indicatorRadius` = half that → true capsule) when the tab has no sub-label; `CHIP_TALL = CHIP_SHORT + TAB.timerGap + TAB.timerFontSize + CHIP_TOP_BAND` (a 2-line rounded-rect wrapping the timer line, which renders at `TAB.timerFontSize` and sits `TAB.timerGap` above the name) when it does. **`CHIP_TOP_BAND` is DERIVED in `TabStrip`, not hand-tuned**, so the air above the timer equals the air below the name *by construction*: `CHIP_TOP_BAND = 2*TAB.chipBaselineNudge + NAME_BOTTOM_SLACK + TAB.timerTopPad`, where `NAME_BOTTOM_SLACK = (TAB.rowHeight − TEXT.xl)/2 + TAB.labelLift` mirrors the name glyph's centring+lift slack (the tight timer line-box has none) and `2*TAB.chipBaselineNudge` both neutralises the chip's optical down-shift eating the top and mirrors the bottom's nudge. It self-corrects if any of those metric tokens change; `TAB.timerTopPad` is only a 0-default residual eyeball nudge. `TAB.timerGap` may be **negative** (pulls the timer down into the name row's empty top slack); `TAB.timerFontSize` (= `styles.subLabel` font+lineHeight, currently `20` — deliberately between `TEXT.lg` and the name's `TEXT.xl`) and `TAB.timerTopPad` feed `CHIP_TALL` so the pill auto-regrows to keep wrapping the timer and the top air stays symmetric — bump those single tokens to resize the timer / add top room. **Height is per-tab exactly like width**: per-tab `h0/h1/h2` shared values target `CHIP_TALL` iff `tabs[i].subLabel != null` else `CHIP_SHORT`, set instantly on first run and `withTiming(TAB.collapseDuration)` on change (so a selected tab gaining/losing its timer grows/shrinks in place — the "invite arrives while already on the side tab" case). `chipStyle` interpolates `height` across tabs by the **same `chipProgress`** as width, so the pill grows up as it slides onto a timer-bearing tab. The chip is **bottom-anchored** (`bottom: -TAB.indicatorPadV - TAB.chipBaselineNudge`, the only static geometry left) — that fixed bottom is precisely why height growth extends **upward only** and the name's Y never moves (iron rule: tab labels never move). `borderRadius` lerps `TAB.indicatorRadius` (capsule) ↔ `TAB.indicatorRadiusTall` (soft rounded-rect, `borderCurve: 'continuous'`) by the height fraction. The timer (`subLabelOuter.bottom = TAB.rowHeight + TAB.timerGap`) now sits *inside* the grown pill, just above the name (still absolute → adds nothing to natural height, name Y constant); `FadeInDown`/`FadeOutUp` read as the pill opening up to reveal / collapsing to hide it. **Do NOT** revert the chip to a fixed single-line capsule with the timer floating above, or animate height via `scaleY` (distorts the border) — unless the user explicitly asks to revisit again.
  2. **On top of the chip, the typographic cross-fade.** Each label reads `t = max(0, 1 - |pagerProgress - index|)` inside `useAnimatedStyle` and renders two stacked layers: an **active** layer (`fontWeight: WEIGHT.extrabold`, `color: WHITE`, `opacity = t`) drives the natural width, and a **muted** layer (`fontWeight: WEIGHT.semibold`, `color: WHITE_MID`, `opacity = 1 - t`) overlays it via `position: absolute` + `textAlign: center`. The active layer additionally carries a faint `HEADER_TEXT_SHADOW` emboss (fades 1:1 with selection, `textShadow` doesn't affect layout). **The label cluster carries NO selection-driven transform** — opacity/weight/colour/shadow are the only selection effects, none of which change layout, so the label's position is rock-constant and it never moves vertically as the chip arrives/leaves. (A former `TAB.selectedScale` grow was removed: animating `scale` on the `<Text>` every swipe frame re-rasterized the glyph and made the label jitter up/down — the iron-rule "Tab labels never move" is literal. `TAB.selectedScale` no longer exists.) The only vertical offset is the **constant** `-TAB.labelLift` glyph-centring nudge (matched by `+TAB.iconBaselineNudge` on the icon cluster), folded into the per-cluster press worklets' `transform` array (`pressLabelStyle` / `pressIndicatorStyle`) — **not** as a static `transform` on `styles.labelStack` / `styles.indicatorStack`, because a RN/Reanimated style array *replaces* (never merges) `transform`, so a static wrapper transform is silently clobbered by the animated press transform and the nudge never applies (the label then renders low on Android and sits below the icons). It is constant and never selection-driven; only the press `scale` is dynamic. `fontWeight` can't be animated continuously (it swaps the font face), so the cross-fade is the only way to morph weight 1:1 with the swipe without width thrash.
- The label carries a **static `letterSpacing: TAB.labelTracking`** applied equally to BOTH stacked layers. The earlier "no letterSpacing" rule was *only* about animating it (width thrash vs. the weight cross-fade); a constant value identical on both layers is safe — the active layer still drives natural width and the absolute muted overlay registers exactly on it.
- Press feedback: each tab's content cluster (label / icon) dips to `TAB.pressScale` while held (`onPressIn`/`onPressOut` → `withTiming` on a `pressed` shared value), springing back on release. Tactile, not a bounce.
- `pagerProgress` is driven by PagerView `onPageScroll(position + offset)` and now feeds **only** the label/typography cross-fade (`tabProgress`) — it no longer drives the chip (see the indicator bullet: the chip rides the decoupled `chipProgress`). The menu-tab pause indicator stays un-animated — it carries semantic state and should be equally readable whether or not its tab is selected.
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
  profile?: Profile;           // present when state ∈ {watching, waiting, chat}, and on locked when carrying a "what happened" message
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

`start`, `location`, `focus`, `find`, `ignore`, `cancel`, `invite`, `extend`, `remove`, `add`, `approve`, `decline`, `leave`, `block`, `logout`, `delete`, `cron`, `clear1`, `clear2`, `free2`.

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

- `cancel`: `A.page1` → `locked` (no message — A initiated). `B.page2` → `locked` + `message = 'cancel'`, profile preserved so B sees who cancelled. B clears via `clear2`.
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
| `birth_date` | date | |
| `age_from` / `age_to` | smallint | preferred age range |
| `range` | integer | preferred max distance (meters) |
| `location` | geography (PostGIS) | `SRID=4326;POINT(lng lat)` |
| `data` | jsonb, default `{}` | Flat profile fields: `images: Image[]`, `bio?: string`, `family?: FamilyData` (`{hasKids, kids?, schedule?, isForKids?}`). Plus `weekStart`, `os`, `lang`, `appearance`, `push_token`, `role`, `location_type`, `location_custom`, `location_label`. Distance unit is no longer stored: the client derives it from device locale (`getLocales().regionCode`); see `mobile/src/lib/units.ts`. Legacy `data.units` may exist on rows written by older builds and is ignored. `location_type: 'device' \| 'home' \| 'work'` is the anchor the stored `location` point represents. `location_custom: boolean` is the legacy pre-typed flag kept in sync (`home`/`work` ⇒ `true`, `device` ⇒ `false`) for backward compat with mobile builds that predate `location_type`; rows last written by such a build carry only `location_custom` and `location_type` is derived as `home` when `location_custom=true`, else `device`. `location_label: string \| null` is the human-readable address for `home`/`work` (null for `device`). While `location_type ≠ 'device'` (≡ `location_custom=true`) the client suppresses location permission prompts and skips periodic GPS updates (the `location` column is whatever was last written from the manual pick). |
| `relations` | jsonb | `Pages` (see Game Logic) plus a top-level `last_add_at` (ISO timestamp; 30-minute cooldown for the page2 "Show me to people" / broadcast button — see `app_add`) and a top-level `availability` (geo-gate state; see "Geo-availability gate" below). Source of truth for page1/page2. |

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

### Geo-availability gate

`relations.availability` is `{state, starts_at?}` where `state ∈ {available, unavailable, not_yet}`, written by `app_availability(me_id)` (= `area_state(me.location)`):

**Default-DENY** (product decision 2026-05-17, supersedes the original "no areas → available" backward-compat default). Usable ONLY where an area actively covers the user; zero active/scheduled areas ⇒ every located user `unavailable` (deliberate gated launch). This is intentionally **not** backward compatible. Rules in order:

- **`location` is null** (onboarding / permission not yet granted) → `available`. The only non-gated escape hatch — onboarding & profile setup work in every location state.
- Inside an `active` area → `available` (regardless of `starts_at`).
- Inside a `scheduled` area with `starts_at <= now()` → `available`.
- Inside a `scheduled` area whose earliest matching `starts_at` is in the future → `not_yet` (+ that `starts_at`).
- **Everything else** — zero active/scheduled areas, or a located user outside all of them → `unavailable`.

**Availability resync (immediate on admin change + cron safety net).** `app_area_resync()` recomputes `area_state(location)` for every user and, on any change to the stored `relations.availability.state`, persists it (Realtime delivers it to open apps **instantly**) and queues a push: any→`available` ⇒ `area-open` ("the game has started"); `available`→`unavailable` ⇒ `area-closed`. (→`not_yet` and the first-ever computation from null are silent.) It is **idempotent** — only changed users are touched, so whoever calls it consumes each transition exactly once. Triggers: (1) every web-admin area mutation (`createArea`/`updateArea`/`deleteArea`/`setAreaMode`) fire-and-forget POSTs `/functions/v1/ext/resync`, so an enable/disable — manual or scheduled-mode edit — updates **all affected users immediately, both directions**; (2) the per-minute `/ext/cron` also calls it (alongside `app_expire_sweep`) as the scheduled-launch trigger + self-heal net. The push reaches users who weren't in the app; those with the app open already got the Realtime flip.

Enforcement:
- **Edge handler:** `start`/`location`/`focus` call `app_availability` synchronously after persist (so the HTTP response + the Realtime `relations` change carry the gate state immediately), and skip the auto-find when not `available`. The other auto-find sites (`account`, `age`/`range`/`preferred_gender`, `profile`, `resume`) also skip when the last-computed availability is not `available`.
- **`others(me, only_available)`:** a geo-gated candidate is dropped from everyone's pool via `AND (NOT only_available OR public.area_available(other.location))`. `app_find` always passes `only_available = true`, so an in-region user is never matched against someone who can't respond. With no enabled areas this clause is a no-op (byte-identical matching).
- **Mobile (`home.tsx`):** when `relations.availability.state` is `unavailable`/`not_yet` (and the user is not in an active chat), the rotating-headline slot shows a single **short** fixed gate message (`home.geoGate.unavailable` / `home.geoGate.notYet`; `notYet` interpolates `{date}` = the launch moment formatted **short** `DD/MM HH:MM` from `availability.starts_at`). The copy is kept brief on purpose: it shares the `SkipHintLabel` slot which is tuned for brief phrases — a long string overflows/clips there. The find/play button is suppressed and the **side tab is removed**, so page2/chat is unreachable. The pager itself stays swipeable — **Home↔Menu(settings) must keep working by swipe while gated** — and the side slot is kept unreachable WITHOUT locking the pager: no side tab, `goToPane` swallows programmatic nav to it, and `onPageSelected` snaps back to Home if a swipe lands there. `not_yet` lifts itself client-side when `starts_at` passes (reconfirmed on the next `start`/`focus`), and the `area-open` push arrives if the app was closed. An active chat is never gated (non-destructive: a user who matched before being gated keeps the conversation).

Helper SQL: `area_state(loc geography) → jsonb` (mode-driven), `area_available(loc geography) → boolean`, `app_availability(me_id uuid) → jsonb` (`{user, notify}` envelope), `app_area_launch_sweep() → jsonb` (`{processed, notify}`, cron). Note: `app_refresh_snapshots` does **not** recompute availability — location only changes via `start`/`location`/`focus`, and admin area changes / `not_yet` expiry propagate within ~60s via the next periodic `/app/location`, on app `focus`/launch, or the per-minute launch sweep + `area-open` push.

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
`app_find`, `app_add` (page2 "Show me to people" / broadcast button: pulls up to 2 most-relevant candidates into `A.page2.profiles[]` and sets each candidate's `page1` to watching A. Preconditions: `A.page1.state ≠ 'chat'` AND `A.page2.profile` is missing (no live incoming invite) AND last call > 30 minutes ago. Existing `page2.profiles[]` watchers are allowed — broadcast appends new candidates on top of them. When `page2.state` was already `'free'`, the existing `profiles[]` is preserved; when `'locked'`, page2 auto-resets to `{state: 'free', profiles: []}` (so a resting state becomes discoverable in the same call). Writes `A.relations.last_add_at = now()` even when zero candidates are returned, so an empty-pool press still consumes the cooldown), `app_cancel_add` (clears `A.relations.last_add_at`; used by the toggle's "exit broadcast" confirmation and by tapping "Visible" while broadcasting — since page2.state is already free during broadcast, `app_free2` would be a no-op). `app_ignore`, `app_clear1`, `app_clear2`, `app_invite`, `app_extend`, `app_cancel`, `app_approve`, `app_decline`, `app_leave`, `app_block`, `app_remove`, `app_free2` (transitions `A.page2.state` from `locked` → `free`; called by the page2 premium "show my profile again" tile), `app_lock2` (premium "hide me" action; transitions `A.page2.state` from `free` → `locked` with no profile/profiles AND strips `A.relations.last_add_at` so the visibility toggle exits broadcast mode atomically. In the same transaction also kicks every watcher in `A.page2.profiles[]`: each watcher's `page1` → locked + `message='remove'` (only if still pointing at A in 'watching'), per-pair `remove` restriction inserted, `removed` push queued. Equivalent to N `app_remove` calls + a final state flip + cooldown reset, collapsed into one round trip. Mobile UI confirms with the user before calling since the action is destructive. No cooldown), `app_pause` (settings "Game mode → Off" toggle: atomically locks BOTH pages. Combines `app_lock2`'s watcher-kick with a full page1 cleanup that handles in-flight interactions: `page1.state='waiting'` → cancel-equivalent (B.page2 → locked+`cancel`, `cancelled-in` push, 24h cooldown); `page1.state='chat'` → leave-equivalent (B.page1 → locked+`leave`, B.page2 → free, `left` push, 14d cooldown); `page2.state='pending'` → decline-equivalent (inviter.page1 → locked+`decline`, `declined` push, 7d cooldown). Also removes self from any other user's `page2.profiles[]`. Final state: `A.page1 = {state:'locked'}`, `A.page2 = {state:'locked'}`, no profile/message on either side. Mobile prompts for confirmation only when side effects exist), `app_resume` (settings "Game mode → Active" toggle: inverse of `app_pause`. Sets both pages to free. Guarded on both pages currently being `locked` so an in-flight chat/waiting can't be wiped by a stray call), `app_expire_sweep` (called by pg_cron every minute), `app_delete_cleanup` (called by the `delete` endpoint before row deletion), `app_logout_cleanup` (called by the `logout` endpoint: kicks page2 viewers to `logout`, clears page2), `app_refresh_snapshots` (see below), `app_save_profile` (called by the `profile` endpoint: accepts `{images?, bio?, family?, is_for_kids?}` payload. Only the keys present are written; passing `null` on `bio`/`family` clears that field), `app_availability` (called synchronously by `start`/`location`/`focus`: recomputes `relations.availability = area_state(me.location)` and returns the `{user, notify}` envelope so the response + Realtime carry the gate state — see "Geo-availability gate"), `app_area_launch_sweep` (called every minute by `/ext/cron` alongside `app_expire_sweep`: flips `not_yet` users whose area opened to `available` and returns `{processed, notify:[{user_id, code:'area-open'}]}` so the cron handler fires the launch push).

Helper functions: `make_profile`, `_remove_from_page2`, `_kick_pointing_at`, `_add_restriction`, `schedule_overlap` (see "Schedule overlap" below), `kids_preference_match` (see "Kids preference match" below), `area_state` / `area_available` (geo-gate; see "Geo-availability gate"). `others(me, only_available)` carries an extra `area_available(other.location)` candidacy clause (no-op when no enabled areas).

**Auto-return-to-free policy.** Users return to `page2.state = 'free'` at the end of every page2 process unless they explicitly hid via `app_lock2`. Concretely:
- `app_decline` — decliner's `page2` → `{state: 'free', profiles: []}` (the inviter's profile is dropped immediately; no "you declined" card surfaces on the decliner).
- `app_leave` / `app_block` — both leaver and partner end up at `page2 = {state: 'free', profiles: []}`. Previously only the leaver was reset; the partner stayed locked-no-message.
- `app_clear2` — when there's a `message` to acknowledge (cancel / expire / approve-fail / etc.), this endpoint now flips `page2` all the way back to `{state: 'free', profiles: []}` instead of merely stripping the message. Effectively merges with `free2` for the message-ack path. The explicit-hide case (locked + no message) is intentionally not touched.

The "Back to the game" button on the dead-invite card calls `app/free2` directly. Net effect: every page2 ending — declined, expired, cancelled, approve-fail, chat-ended — returns the user to the discoverable pool without an extra step. Only `app_lock2` (the explicit "Hide my profile" tile in the visibility popup) keeps the user out of the pool.

### `app_refresh_snapshots(me_id)` — keeping snapshots fresh

The `Profile` snapshot stored inside `relations` (via `make_profile`) freezes the entire profile — `name`, `title`, `images`, `bio`, `family`, `is_male`, `last_seen`, `distance`, `location_custom` — at write time. Without active refresh, a chat partner or watcher would keep showing whatever values were captured at match/view-start time, not the current ones.

`location_type` (and the back-compat `location_custom`) is only embedded when the snapshotted user's anchor is `home`/`work`; `device` mode omits both keys. The mobile distance chip is driven by **B's** (the snapshotted side's) `location_type`: `device` → PinIcon, `home` → HomeIcon, `work` → WorkIcon. The chip **text** is a binary live-vs-anchored signal: it stays "ממך"/"away" only when **both** the viewer (A) and the subject (B) are `device` (true live proximity); the moment either side is `home`/`work` it switches to the passive "מהמיקום שהוגדר"/"from the set location" (the number is anchored to a fixed address, not live proximity). So the icon answers "what is B's point" and the text answers "is this number live". Old mobile builds (pre-typed) ignore `location_type` and keep using `location_custom` for the legacy binary PinIcon↔HomeIcon + passive-text swap; see `BACKWARD_COMPAT.md`.

`app_refresh_snapshots(me_id)` is called from the handler (behind `EdgeRuntime.waitUntil`) on every endpoint **except** `delete` and `reset`. It rebuilds every snapshot using a fresh `make_profile(...)` so all observable Profile fields stay live over Realtime — not just `last_seen` and `distance`, but also `name`, `images`, `bio`, `family`, `is_male`, `title`. So a user editing their bio, swapping a photo, or updating family/schedule propagates immediately to anyone holding their profile inside `relations`. Stripping rules:

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

Compatibility multiplier (0/0.5/1) for `data.family.isForKids` between two users. Used in `others.relevance_kids` and folded into final `relevance`. Server-side ranking only — not displayed in the UI.

Truth table:
- both explicitly set + same value (`true=true` or `false=false`) → **1.0**
- both explicitly set + different values → **0.0**
- one explicitly set, the other not → **0.5**
- neither set (no `family`, or `family` without `isForKids`) → **1.0**

`LANGUAGE sql IMMUTABLE PARALLEL SAFE` — single CASE expression, fully inlinable by the planner.
