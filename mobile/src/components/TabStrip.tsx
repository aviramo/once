import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Pressable, I18nManager } from 'react-native'
import Animated, {
  useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withTiming,
  FadeInDown, FadeOutUp, FadeIn, FadeOut, LinearTransition,
  type SharedValue,
} from 'react-native-reanimated'
import { Text } from './AppText'
import {
  WHITE, WHITE_MID, HEADER_TEXT_SHADOW,
  HEADER_PILL_FILL, HEADER_PILL_BORDER, HEADER_PILL_SHADOW,
} from '../colors'
import { FONT_SCALE } from '../fonts'
import { tap } from '../lib/haptics'
import { XS, SM, LG, RADII, TEXT, WEIGHT, TAB } from '../tokens'

// Global tab strip used at the top of the home shell. Three tabs (Menu |
// Home | Side).
//
// SELECTED INDICATOR — two layers, both driven by the ONE live pager value:
//      1. ONE flat translucent-white chip (no gradient), a real moving
//      element (not per-tab opacity) that **spans the selected tab's full
//      width and resizes per tab**. Absolutely positioned, `left:0`. ONE
//      live, linear, LAYOUT-driven motion (user choices 2026-05-17 —
//      "translate AND grow/shrink TOGETHER", "perfectly linear in the pager
//      position", "the radius must always stay the same"): position AND size
//      both interpolate from the SAME live `progress` (= tabProgress, from
//      PagerView onPageScroll on the UI thread — the RN analogue of a
//      CSS/native constraint, not a JS-thread loop), so the slide and the
//      resize are one synced motion exactly linear in the swipe. Size is the
//      real layout `width`/`height` — NOT `scaleX`/`scaleY`: a non-uniformly
//      scaled rounded rect cannot keep a constant-looking corner, so there
//      is no scale at all and `borderRadius` is a single CONSTANT
//      (TAB.indicatorRadius) that never lerps or distorts. RTL is unchanged:
//      position is derived from tab WIDTHS in logical/child order (never an
//      `x`/`measureInWindow`); this app RTL-swaps `left` so `left:0` lands
//      at the row's start and `translateX = isRTL ? −logicalLeft :
//      +logicalLeft` (the proven `marginStart = logicalLeft` equivalence);
//      `transform` is immune to the RTL swap so the sign is the only
//      directional term — and there is NO `Math.max(0,…)` clamp on it (the
//      clamp once froze the centre mid-screen toward a narrow tab). The chip
//      is box-centred on the mainRow then nudged down by
//      TAB.chipBaselineNudge (a static, declarative Y offset) so it centres
//      on the tab's optical ink. HEIGHT is per-tab: a tab with a sub-label
//      (invite countdown / broadcast status word) targets the TALL 2-line
//      shape so the chip ENCLOSES the timer sitting just above the name;
//      every other tab targets the SHORT capsule. Per-tab height lives in
//      the hs[i] shared values (CHIP_SHORT/CHIP_TALL — instant first,
//      withTiming(collapseDuration) when a selected tab gains/loses its
//      timer in place: the "invite arrives while already on the side tab"
//      case); the chip's live height interpolates those by the live pager,
//      same as width. The chip box is bottom-anchored (static `bottom`), so
//      a taller height grows it UPWARD only and the name's Y never moves
//      (iron rule). (2026-05-17, replacing the old "timer floats as a
//      caption ABOVE the chip".)
//      2. On top of the chip, the typographic cross-fade below — this one
//      IS still driven 1:1 by the continuous swipe `progress` (opacity-only,
//      no layout, so it stays smooth tracking the finger).
//
// Each label reads its own selectedness from `progress`
// (`t = max(0, 1 - |progress - index|)`) and renders two stacked layers
// that cross-fade as you swipe into the tab:
//   - active layer: extrabold (800), full WHITE,   opacity = t
//   - muted  layer: semibold  (600), WHITE_MID,     opacity = 1 - t
// The active (heavier) layer drives the natural width so the muted overlay
// can't widen the row mid-transition. fontWeight itself can't be animated
// (it changes the font face, not a numeric value), so the cross-fade is the
// only way to morph weight continuously while keeping the swipe 1:1. The
// cross-fade is the ONLY selection effect on the label — there is no scale or
// any other transform tied to selection, so the label's position is constant
// and it never moves vertically as the chip arrives/leaves. (The only offset
// is the constant `-TAB.labelLift` glyph-centring nudge, applied as a STATIC
// `styles.labelNudge` transform on a wrapper separate from the animated press
// scale — see that style's comment.)
//
// Tab labels never move. The mainRow has a fixed TAB.rowHeight and that's
// the only thing in the natural layout flow — the whole strip's bounding
// box stays constant whether a sub-label (live timer) is showing or not.
// The sub-label is rendered ABSOLUTELY just above the mainRow, INSIDE the
// grown pill (bottom = rowHeight + timerGap; on an unselected timer tab
// there is no pill yet so it overflows into the container's PRIMARY-colored
// top padding as plain text — when that tab becomes selected the chip grows
// up to embrace it). Entering: FadeInDown drops the timer from above into
// its slot while fading in (reads as the pill opening up to reveal it).
// Exiting: FadeOutUp lifts it back out while the pill collapses. So the
// name stays locked at the same Y; only the timer and the pill's TOP move.
//
// Counts: the unread-chat count is chained into the side-tab label itself
// (`${label} ${n}`) by the caller — there is no separate chip badge. The
// viewer count is different: in the ambient (icon-only) side-tab states
// (broadcast / visible) the caller passes it as the `subLabel`, so it rides
// as a small number ABOVE the collapsed icon in the EXACT slot the live
// timer uses. A `subLabel` therefore NO LONGER forces the tab to flex width
// — a tab with no `label` stays compact (icon-only) whether or not it has a
// sub-label; the sub-label just floats above the icon (matching the
// `subLabelPulsing` doc's "rides above an icon-only tab"). `subLabel` is
// still flex on the timer-bearing tabs only because those also carry a
// `label`.
//
// Indicator icons (pause / inbox / close) cross-fade with the tab's label —
// they're status glyphs and should feel like part of the muted label cluster
// when the tab isn't selected.
//
// `alerting` is a finite attention pulse (3 blinks). While it runs, the tab
// behaves as if it were selected for typography/color purposes — the active
// (bold WHITE) layer is forced fully visible and the muted (semibold WHITE_MID)
// layer is hidden, regardless of swipe progress. Without this, the pulse would
// only fade the already-muted layer on an unselected tab and read as barely a
// flicker. All visible content in the tab — main label, sub-label/timer, and
// any indicator/leading icon — pulses together so the whole tab blinks as one.

const AnimatedText = Animated.createAnimatedComponent(Text)
// The whole tab is an Animated component so a `layout` transition can carry
// the expand/collapse reflow: when the side tab loses/gains its label it
// flips between flex:1 (labeled) and flex:0 (icon-only compact, like Menu),
// every tab's width/X shifts, and LinearTransition animates each tab's frame
// to its new spot instead of snapping — so "Once" glides back to centre.
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export type TabSpec = {
  /** Optional text label. When omitted, the tab is icon-only and shrinks to
   * its content width (no flex), so the remaining tabs absorb the freed
   * space. Use `renderIndicator` to supply the icon — it gets the same
   * selected/muted cross-fade as a label would. */
  label?: string
  /** Small status indicator rendered next to the label. Used by the menu
   * tab to flag pause mode and by the side tab for inbox / pause glyphs.
   * Receives the color it should render in so the icon can fade with the
   * tab's selection state (WHITE → WHITE_MID via two stacked layers, same
   * pattern as the label). */
  renderIndicator?: (color: string) => React.ReactNode
  /** Status glyph rendered BEFORE the label in markup, so in LTR it sits to
   * the left of the label and in RTL to the right. Used for the broadcast
   * "live" dot on the side tab. Unlike `renderIndicator`, the glyph keeps a
   * fixed color (it carries its own meaning) and only its opacity dims with
   * tab selection. */
  renderLeading?: () => React.ReactNode
  /** Fires a finite attention pulse across every visible element in the tab
   * — label, sub-label, indicator. While the pulse runs, the tab is forced
   * to render in its "selected" typography (bold WHITE) regardless of
   * whether the user is currently on this pane, so the blink is legible on
   * an unselected tab too. Blink count is `alertCount` (default
   * `TAB.pulseCount` = 3). */
  alerting?: boolean
  /** Number of blinks for the `alerting` pulse. Defaults to
   * `TAB.pulseCount`. The side tab passes `TAB.viewerPulseCount` (2) for the
   * "a viewer just joined your list" double-tick so it reads lighter than a
   * chat-unread / incoming-invite alarm. Constant per use site. */
  alertCount?: number
  /** Optional sub-label rendered ABSOLUTELY above the main label / icon
   * (same column, smaller type). Used to surface live timers (pending-invite
   * countdown) AND the ambient side tab's viewer-count number — both ride in
   * the same slot. Does NOT change the tab's layout box (the main row stays
   * locked at the same Y whether it is showing or not) and does NOT widen
   * the tab: a tab with no `label` stays compact (icon-only) with the
   * sub-label floating above the glyph. Animates in with FadeInDown (drops
   * from above) and out with FadeOutUp (lifts back up). Cross-fades with
   * selection state exactly like the label. */
  subLabel?: string
  /** Optional small glyph rendered just BEFORE the `subLabel` text, inside
   * the same sub-label cluster, getting the SAME selection active/muted
   * cross-fade (and the finite `alerting` force) as the text — two stacked
   * WHITE/WHITE_MID copies, exactly like `renderIndicator`. Used by the Menu
   * tab to put a star glyph next to the stars balance. Optional; absent =
   * the sub-label stays text-only and byte-identical to before. Size the
   * glyph at TAB.timerFontSize so it stays inside the sub-label line-box
   * (the CHIP_TALL derivation assumes that height). */
  subLabelIcon?: (color: string) => React.ReactNode
  /** Slow opacity heartbeat applied to the entire sub-label cluster. Used
   * for "live ongoing state" status words (e.g. "בשידור" / "צופים בי")
   * that ride above an icon-only tab — the gentle pulse signals the
   * status is active without competing with the icon below for attention. */
  subLabelPulsing?: boolean
  /** Continuous gentle "alive" heartbeat applied to the `renderIndicator`
   * glyph (same beat as `subLabelPulsing`). Used by the collapsed side tab
   * while broadcasting so the megaphone breathes. Selection-gated: it only
   * animates while this tab is NOT the selected pane; on the selected pane
   * the glyph holds steady (you're already here — no need to pull you back). */
  indicatorPulsing?: boolean
  /** Optional second label that cross-fades OVER `label`, driven 1:1 by
   * `altProgress` (0 = show `label`, 1 = show `altLabel`). Used by the Home
   * tab to morph "Once" → "My profile" as the profile-preview sheet rises:
   * the swap is tied to the sheet's position (the SAME shared value that
   * slides the selected-chip onto this tab), so dragging the sheet part-way
   * down leaves the word part-morphed and snaps back if released. Rides ON
   * TOP of the normal selection active/muted cross-fade — the four resulting
   * layer opacities always sum to 1 so there is no flicker. Both words are
   * centred in the full (flex) tab box, so the longer one never clips and
   * the tab width never reflows as it morphs. Requires `label` too. */
  altLabel?: string
  altProgress?: SharedValue<number>
  /** Optional alternate for the BASE word: cross-fades the `label` text ⇄
   * this GLYPH by `pauseProgress` (0 = `label` word, 1 = the glyph). Used by
   * the Home tab to swap "Once" → a pause icon when game mode is paused. The
   * glyph is rendered as the same active(WHITE)/muted(WHITE_MID) two-layer
   * pair as the rest of the label, so it cross-fades with selection too.
   * Orthogonal to the `altLabel`/`altProgress` morph: it splits ONLY the
   * base layers (the morph still cross-fades that result ⇄ `altLabel`). The
   * split partitions the base opacity by `pauseProgress`, so the total of
   * all rendered layers stays exactly 1 — no flicker, same invariant as the
   * 4-layer morph. Only meaningful on a morph tab (Home). Absent ⇒ the base
   * renders as the original single text pair, byte-identical to before. */
  pauseIcon?: (color: string) => React.ReactNode
  pauseProgress?: SharedValue<number>
  /** Whole-tab opacity fade driven 1:1 by a shared value (0 = fully visible,
   * 1 = fully hidden). Used to fade the side tab out as the profile-preview
   * sheet rises: the SAME shared value that morphs the Home word and slides
   * the chip, so the fade tracks the sheet's drag position and snaps back if
   * released. Folded into the mainRow + sub-label opacity (NOT the
   * AnimatedPressable, which carries `layout` — Reanimated forbids an animated
   * opacity on a view that also runs a layout animation). Optional; a stable
   * zero fallback keeps every non-dimmed tab byte-identical. */
  dimProgress?: SharedValue<number>
  /** Pull-synced name VERTICAL SLIDE (Home tab while the page1 deck is being
   * skipped). `nameSwapProgress` 0→1 tracks the skip pull: the current name
   * (`label`) slides DOWN out the bottom and `nameSwapNext` (the next
   * card's name) slides in from the TOP, clipped to the tab — 1:1 with the
   * finger. Both optional; absent ⇒ p≡0, current at rest, byte-identical. */
  nameSwapProgress?: SharedValue<number>
  nameSwapNext?: string
  /** Rise-synced name slide (Home tab, fresh-search first card). Mirror of
   * the skip slide, OPPOSITE direction, time-driven (synced to the card's
   * SlideInDown via the shared MOTION.base). While `nameRiseFrom` is set,
   * the OLD label (`nameRiseFrom`) slides UP/out and the NEW label
   * (`nameRiseTo`, the live name — `label` is held to the OLD text by the
   * caller during the rise so no stray render leaks the new name early)
   * enters from the BOTTOM, driven by `nameRiseProgress` 0→1. Cleared by
   * the caller on completion ⇒ seamless fall-back to the resting label.
   * Optional; absent ⇒ the skip slide path is used. */
  nameRiseProgress?: SharedValue<number>
  nameRiseFrom?: string
  nameRiseTo?: string
  /** Optional glyph rendered INSIDE the morph band as part of the wordmark,
   * receiving the SAME active(WHITE)/muted(WHITE_MID) two-layer cross-fade as
   * the label so its opacity is byte-identical to the name's in every state
   * (selection, the finite `alerting` blink, the profile-sheet morph fade,
   * the pause split, press) — it sits in the same `morphInner` wrapper as the
   * text. Used by the Home tab to host the game-mode pause glyph. Receives
   * the colour to render in (like `renderIndicator`). `accessoryCenter`
   * toggles placement: false/absent → directly AFTER the name as ONE centred
   * [name · glyph] unit (the watching pause affordance); true → centred over
   * the band, standing in for the wordmark that has faded out via
   * `pauseProgress` (the paused indicator). When `onAccessoryPress` is set
   * the WHOLE tab fires it (the glyph itself is non-interactive — the
   * morph band is `pointerEvents="none"`); the tab's normal navigate-onPress
   * is replaced by it for as long as the glyph is present. Absent ⇒ no
   * accessory, the morph band is byte-identical to before. Only meaningful on
   * a morph tab (requires `altLabel`/`altProgress`). */
  accessory?: (color: string) => React.ReactNode
  onAccessoryPress?: () => void
  accessoryCenter?: boolean
}

// Continuous gentle "alive" heartbeat: the value eases from 1 down to `lo`
// and back on a TAB.subLabelPulsePhaseMs half-cycle, forever, while `active`;
// rests at 1 otherwise. One primitive so every "this is live" pulse in the
// strip shares the exact same beat (the value PresenceDot uses, per the token
// comment). `lo` lets callers pick the swing: the sub-label dims its own
// opacity (TAB.subLabelPulseOpacity floor), the broadcast glyph swings the
// full active↔muted cross-fade (lo = 0).
function useGentlePulse(
  active: boolean | undefined,
  lo: number = TAB.subLabelPulseOpacity,
): SharedValue<number> {
  const v = useSharedValue(1)
  useEffect(() => {
    if (active) {
      v.value = withRepeat(
        withTiming(lo, { duration: TAB.subLabelPulsePhaseMs }),
        -1,
        true,
      )
    } else {
      v.value = withTiming(1)
    }
  }, [active, lo])
  return v
}

// Chip heights, derived ONCE from tokens (no magic literals at call sites).
// SHORT = the single-line capsule (no timer): rowHeight + pad top & bottom,
// so SHORT/2 == TAB.indicatorRadius reads as a true capsule.
//
// TALL = the 2-line rounded-rect wrapping the timer ABOVE the name. The air
// above the timer is DERIVED to EQUAL the air below the name (the user wants
// them identical), not hand-tuned:
//   • Below the name the chip extends (indicatorPadV + chipBaselineNudge)
//     past the name's line-box bottom, AND the name glyph is centred within
//     rowHeight then lifted by labelLift, so it has extra slack
//     NAME_BOTTOM_SLACK = (rowHeight − TEXT.xl)/2 + labelLift below its ink
//     that the tight timer line-box (lineHeight == fontSize) does NOT have.
//   • The chip already sits chipBaselineNudge LOWER than box-centred, which
//     eats chipBaselineNudge off the top — so the top band must add it back
//     once to neutralise that and once more to mirror the bottom's
//     chipBaselineNudge ⇒ 2*chipBaselineNudge — plus NAME_BOTTOM_SLACK to
//     match the name's centring slack.
// CHIP_TOP_BAND is therefore self-correcting if any of those metric tokens
// change; TAB.timerTopPad is only a small residual eyeball nudge (default
// 0). The chip is bottom-anchored, so growing SHORT->TALL extends it UPWARD
// only and the name's Y never changes (iron rule: tab labels never move).
const CHIP_SHORT = TAB.rowHeight + TAB.indicatorPadV * 2
const NAME_BOTTOM_SLACK = (TAB.rowHeight - TEXT.xl) / 2 + TAB.labelLift
const CHIP_TOP_BAND = 2 * TAB.chipBaselineNudge + NAME_BOTTOM_SLACK + TAB.timerTopPad
const CHIP_TALL = CHIP_SHORT + TAB.timerGap + TAB.timerFontSize + CHIP_TOP_BAND

export function TabStrip({
  tabs,
  progress,
  onSelect,
}: {
  tabs: TabSpec[]
  /** Live pager position (0..N-1, from PagerView onPageScroll on the UI
   * thread — the RN analogue of a CSS/native constraint). Drives BOTH the
   * typographic active/muted cross-fade AND the selected chip (position +
   * size), so the chip moves and resizes 1:1 and linearly with the pager.
   * Already includes the profile-sheet blend (it IS `tabProgress`). */
  progress: SharedValue<number>
  onSelect: (idx: number) => void
}) {
  // ONE chip that slides AND resizes 1:1 with the pager as a single linear
  // motion, with a CONSTANT corner radius (user choices, 2026-05-17). It is
  // driven entirely by the live `progress` (= tabProgress); there is no
  // separate decoupled size driver and no `scaleX`/`scaleY` — size is the
  // real layout width/height so the fixed `borderRadius` never distorts.
  // Each tab's geometry is its measured `onLayout` width in child order (the
  // layout engine's box, never measureInWindow / an analytic RTL mirror).
  // RTL: position comes from tab WIDTHS in logical/child order; this app
  // RTL-swaps `left`, so `left:0` lands at the row's start and
  // `translateX = isRTL ? −logicalLeft : +logicalLeft` (the proven
  // `marginStart = logicalLeft` equivalence) is right both ways; `transform`
  // is immune to the swap so the sign is the only directional term. The chip
  // is a single absolutely-positioned leaf in an absolute-fill overlay, so
  // per-frame width/height only re-lays out that one node (see
  // styles.chipOverlay) — the cheap path the overlay exists to provide.
  const isRTL = I18nManager.isRTL
  const n = tabs.length
  const w0 = useSharedValue(0)
  const w1 = useSharedValue(0)
  const w2 = useSharedValue(0)
  const ws = [w0, w1, w2]
  const measuredOnce = useRef([false, false, false])
  // DETERMINISTIC equal-width distribution. Flex auto-distribution
  // (flex:1+flexBasis:0+minWidth:0) repeatedly did NOT yield equal content
  // tabs in practice (the morph "Once" tab vs the labelled page2 tab), so
  // the two flexible tabs are given an EXPLICIT, identical width computed
  // here in JS: each = (row width − Σ compact-tab widths) / (#flexible
  // tabs). `flexW` depends ONLY on the row width and the COMPACT tabs'
  // content widths (never on the flexible tabs' own measured width), so
  // there is no measure→resize→measure feedback loop. Compact tabs stay
  // content-sized. `measW`/`rowW` are React state (settle in ≤2 renders at
  // mount / on tab-config change, then stable).
  const [rowW, setRowW] = useState(0)
  const [measW, setMeasW] = useState<number[]>([0, 0, 0])
  const measWRef = useRef([0, 0, 0])
  const onTabWidth = (i: number, w: number) => {
    if (i > 2 || w <= 0) return
    if (!measuredOnce.current[i]) {
      measuredOnce.current[i] = true
      ws[i].value = w
    } else if (Math.abs(ws[i].value - w) > 0.5) {
      // Width changes on the side tab's expand/collapse — animate it so the
      // chip reflows in lockstep with the tab.
      ws[i].value = withTiming(w, { duration: TAB.collapseDuration })
    }
    if (Math.abs(measWRef.current[i] - w) > 0.5) {
      measWRef.current = measWRef.current.map((p, j) => (j === i ? w : p))
      setMeasW(measWRef.current)
    }
  }
  // Compact (content-sized, flex:0) iff the tab has NO label. A sub-label
  // alone no longer forces flex width: it rides absolutely above the icon
  // (the viewer-count number / a status word) without widening the tab. Must
  // stay byte-identical to TabButton's `iconOnly` so the parent's flexW math
  // and the child's layout agree. A sub-label is absolute (zero layout box),
  // so a compact tab's measured width is still just its glyph — compactSum /
  // flexW are unaffected and the ambient side tab keeps its exact width.
  const compactFlags = tabs.map(s => s.label == null)
  const nFlex = compactFlags.reduce((c, f) => c + (f ? 0 : 1), 0)
  const compactSum = compactFlags.reduce(
    (s, f, i) => s + (f ? measW[i] ?? 0 : 0),
    0,
  )
  const flexW = rowW > 0 && nFlex > 0
    ? Math.max(1, Math.round((rowW - compactSum) / nFlex))
    : 0

  // Per-tab target chip HEIGHT, mirroring the per-tab `ws` width model: a
  // tab with a sub-label (the invite countdown / broadcast status word)
  // wants the TALL 2-line pill so the chip can wrap the timer above the
  // name; every other tab wants the SHORT capsule. The chip's live height
  // interpolates these hs[i] by the live pager (same as width), so it grows
  // UPWARD onto a timer-bearing tab as the swipe arrives, AND grows in place
  // if the SELECTED tab gains/loses its timer (single withTiming on hs[i],
  // pp constant) — the "invite arrives while already on the side tab" case.
  // Driven by spec, not onLayout (it's a binary per tab).
  const h0 = useSharedValue(CHIP_SHORT)
  const h1 = useSharedValue(CHIP_SHORT)
  const h2 = useSharedValue(CHIP_SHORT)
  const hs = [h0, h1, h2]
  const hInit = useRef([false, false, false])
  // Only flips when a tab's timer presence actually changes (not every
  // render — `tabs` is a fresh array literal each parent render).
  const subLabelSig = tabs.slice(0, 3).map(t => (t.subLabel != null ? '1' : '0')).join('')
  useEffect(() => {
    for (let i = 0; i < 3; i++) {
      const target = i < tabs.length && tabs[i].subLabel != null ? CHIP_TALL : CHIP_SHORT
      if (!hInit.current[i]) {
        hInit.current[i] = true
        hs[i].value = target
      } else if (Math.abs(hs[i].value - target) > 0.5) {
        hs[i].value = withTiming(target, { duration: TAB.collapseDuration })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subLabelSig])

  const inset2 = TAB.indicatorInsetX * 2
  const chipStyle = useAnimatedStyle(() => {
    // ONE synced motion, LAYOUT-driven (user choice 2026-05-17 — "translate
    // AND grow/shrink TOGETHER" AND "the radius must always stay the same").
    // Position AND size both ride the SAME live pager value (`progress`, from
    // onPageScroll on the UI thread — the RN analogue of a CSS/native
    // constraint, not a JS-thread loop), so the slide and the resize are one
    // gesture-tracked motion that is perfectly LINEAR in the pager position.
    //
    // Size is the actual LAYOUT `width`/`height` (NOT `scaleX`/`scaleY`): a
    // non-uniformly scaled rounded rect cannot keep a constant-looking
    // corner — scaling is what made the radius visibly change mid-swipe. A
    // plain unscaled element with a FIXED `borderRadius` keeps the corner
    // crisp and identical at every position. The chip is a single
    // absolutely-positioned leaf inside an absolute-fill overlay, so
    // animating its width/height re-lays out ONLY this node (no flex-row
    // reflow — see styles.chipOverlay), the cost the overlay design exists
    // to make cheap. `bottom` is statically anchored, so a taller `height`
    // grows the chip UPWARD only (name Y unchanged — iron rule), no scaleY
    // counter-translate needed.
    //
    // Clamped to [0, n-1] (n = 2 while geo-gated, 3 otherwise).
    const widths = [w0.value, w1.value, w2.value]
    const heights = [h0.value, h1.value, h2.value]
    let sum = 0
    for (let i = 0; i < n; i++) sum += widths[i]
    if (sum <= 0) return { opacity: 0 }
    // Cumulative centre of each tab in child order.
    const centres: number[] = []
    let acc = 0
    for (let i = 0; i < n; i++) {
      centres.push(acc + widths[i] / 2)
      acc += widths[i]
    }
    const lerp3 = (arr: number[], q: number) => {
      const lo = Math.floor(q)
      const hi = Math.min(n - 1, lo + 1)
      return arr[lo] + (arr[hi] - arr[lo]) * (q - lo)
    }
    // Everything from the LIVE pager value → fully linear, fully synced.
    // liveW = full tab width − 2*inset (inset is 0, so the chip spans the
    // whole tab). The two content tabs are forced to an identical explicit
    // width (flexW), so the chip is identical AND full on tab1 and tab2.
    const pp = Math.min(n - 1, Math.max(0, progress.value))
    const centre = lerp3(centres, pp)
    const liveW = Math.max(1, lerp3(widths, pp) - inset2)
    const liveH = Math.max(1, lerp3(heights, pp))
    // No `Math.max(0,…)` clamp: with the real (unscaled) `liveW` this is the
    // true box left; it is exactly `centre − liveW/2` so the visible centre
    // is precisely linear in the pager (the old clamp froze it mid-screen).
    const logicalLeft = centre - liveW / 2
    return {
      opacity: 1,
      width: liveW,
      height: liveH,
      // CONSTANT — never lerped, never scaled, so the corner reads identical
      // at every tab and all through the motion.
      borderRadius: TAB.indicatorRadius,
      transform: [{ translateX: isRTL ? -logicalLeft : logicalLeft }],
    }
  }, [isRTL, n])

  return (
    <View style={styles.outer}>
      <View
        style={styles.row}
        onLayout={e => {
          const w = Math.round(e.nativeEvent.layout.width)
          setRowW(prev => (Math.abs(prev - w) > 0.5 ? w : prev))
        }}
      >
        {/* Single sliding chip. Absolutely positioned (left:0); animated
            width (full tab width) + transform translateX carry the
            resize + slide. pointerEvents none; first child so it paints
            behind the tab labels/icons. */}
        <View pointerEvents="none" style={styles.chipOverlay}>
          <Animated.View style={[styles.indicator, chipStyle]} />
        </View>
        {tabs.map((spec, i) => (
          <TabButton
            key={i}
            spec={spec}
            index={i}
            progress={progress}
            onWidth={onTabWidth}
            // Flexible content tabs get an explicit, identical width so
            // tab1 and tab2 are exactly equal; compact tabs stay
            // content-sized (undefined → falls back to tabCompact/tabFlex).
            fixedWidth={compactFlags[i] || flexW <= 0 ? undefined : flexW}
            onPress={() => { tap(); onSelect(i) }}
          />
        ))}
      </View>
    </View>
  )
}

function TabButton({
  spec,
  index,
  progress,
  onWidth,
  fixedWidth,
  onPress,
}: {
  spec: TabSpec
  index: number
  progress: SharedValue<number>
  onWidth: (index: number, width: number) => void
  /** When set (flexible content tabs), the tab takes this EXACT width so
   * tab1 and tab2 are identical. Undefined → compact (content-sized) or the
   * pre-measurement flex fallback. */
  fixedWidth?: number
  onPress: () => void
}) {
  // Subtle press feedback: the content cluster (label / icon) dips to
  // TAB.pressScale while held, then springs back. The gliding lozenge plus
  // this tactile dip make a tap feel physical without a bounce.
  const pressed = useSharedValue(0)
  // Press feedback ONLY: dips the held cluster to TAB.pressScale, springs
  // back on release. `pressLabelStyle` is now SCALE-ONLY — the constant
  // −labelLift glyph-centring nudge was moved OUT of this worklet to a static
  // StyleSheet transform (`styles.labelNudge`) on a SEPARATE wrapper view,
  // because a worklet-captured constant does not reliably rebuild on Fast
  // Refresh (retuning labelLift looked like a no-op until a full reload) and
  // a constant layout offset does not belong in an animated worklet. Two
  // different views (the static-nudge wrapper vs this animated-scale view) ⇒
  // the RN "a style array REPLACES, never merges, transform" hazard does not
  // apply, so the nudge is not clobbered. The icon nudge (+iconBaselineNudge)
  // got the SAME treatment — moved out to a static `styles.iconNudge` on the
  // icon's outer wrapper — so BOTH `pressLabelStyle` and `pressIndicatorStyle`
  // are now SCALE-ONLY and BOTH nudges hot-reload reliably (one robust pattern
  // for both, so tuning either by a px actually moves on Fast Refresh).
  const pressLabelStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pressed.value * (TAB.pressScale - 1) }],
  }))
  const pressIndicatorStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pressed.value * (TAB.pressScale - 1) }],
  }))

  const alertOpacity = useSharedValue(1)
  // 0 = normal selection-driven cross-fade between active (bold WHITE) and
  // muted (semibold WHITE_MID) layers. 1 = force the active layer fully
  // visible and the muted layer fully hidden — so an unselected tab still
  // reads in its "selected" typography/color while the alert pulse runs.
  // Without this, a 3-blink attention pulse on an unselected tab only fades
  // the muted gray-ish layer, which is barely noticeable. Driven by spec.alerting.
  const alertActive = useSharedValue(0)
  useEffect(() => {
    if (spec.alerting) {
      alertActive.value = 1
      alertOpacity.value = withRepeat(
        withSequence(
          withTiming(TAB.pulseOpacity),
          withTiming(1),
        ),
        spec.alertCount ?? TAB.pulseCount,
        false,
      )
    } else {
      alertActive.value = withTiming(0)
      alertOpacity.value = withTiming(1)
    }
  }, [spec.alerting, spec.alertCount])
  const pulseAnim = useAnimatedStyle(() => ({ opacity: alertOpacity.value }))

  // Continuous heartbeat applied to the sub-label cluster when it carries
  // a live ongoing status word ("בשידור" / "צופים בי"). Separate animation
  // from `alerting` (which is a finite attention pulse on the main label
  // cluster) so the two can coexist without stepping on each other.
  const subPulse = useGentlePulse(spec.subLabelPulsing)

  // Whole-tab dim. `spec.dimProgress` (0 → 1) fades the entire tab out 1:1
  // with the profile-preview sheet's rise (same shared value that morphs the
  // Home word + slides the chip, so it tracks the live drag and snaps back if
  // released). Applied to the mainRow cluster AND folded into the sub-label
  // opacity below, never to the AnimatedPressable (it carries `layout`, and
  // Reanimated forbids an animated opacity on a view that also runs a layout
  // animation). Stable zero fallback → non-dimmed tabs are byte-identical.
  const zeroDim = useSharedValue(0)
  const dimSV = spec.dimProgress ?? zeroDim
  const dimStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(1, Math.max(0, dimSV.value)),
  }), [dimSV])

  // Pull-synced name VERTICAL SLIDE (Home tab, page1 skip — user: "the old
  // name slides down inside the tab and the new one replaces it from the
  // top, a slide like the card but inside the tab"). Same stable-zero
  // fallback as dimProgress: absent ⇒ swapSV≡0 ⇒ current name at rest
  // (translateY 0) and next name parked one row ABOVE (clipped, invisible)
  // — byte-identical for every other tab/state. As swapSV 0→1 the current
  // name slides DOWN by rowHeight (out the bottom) and the next name slides
  // from −rowHeight to 0 (in from the top); a `morphNameClip` wrapper with
  // overflow:hidden clips both to the row so neither bleeds past the tab.
  // The pause glyph is decoupled (its own fixed side slot) and does NOT
  // slide — it stays put through the skip.
  const zeroSwap = useSharedValue(0)
  const swapSV = spec.nameSwapProgress ?? zeroSwap
  const nameSlideCurrentStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, swapSV.value))
    return { transform: [{ translateY: p * TAB.rowHeight }] }
  }, [swapSV])
  const nameSlideNextStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, swapSV.value))
    return { transform: [{ translateY: (p - 1) * TAB.rowHeight }] }
  }, [swapSV])
  // Rise-synced name slide (mirror of the skip slide, OPPOSITE direction —
  // time-driven 0→1 on a fresh search, synced to the card's SlideInDown via
  // the shared MOTION.base). The OLD label (spec.nameRiseFrom) slides UP and
  // out the top; the NEW label (spec.label) enters from the BOTTOM. Same
  // `morphNameClip` clip. Rendered only while spec.nameRiseFrom is set
  // (home clears it on completion ⇒ falls back to the skip pair, which sits
  // at rest showing spec.label — seamless hand-off).
  const zeroRise = useSharedValue(0)
  const riseSV = spec.nameRiseProgress ?? zeroRise
  const nameRiseOldStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, riseSV.value))
    return { transform: [{ translateY: -p * TAB.rowHeight }] }
  }, [riseSV])
  const nameRiseNewStyle = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, riseSV.value))
    return { transform: [{ translateY: (1 - p) * TAB.rowHeight }] }
  }, [riseSV])

  // The sub-label cluster carries the continuous heartbeat AND must also
  // ride the finite attention pulse from `alerting` so all text in the tab
  // (main label + timer / sub-label) blinks as one unit. Multiplying the two
  // shared values keeps each effect's logic independent: at rest both are 1,
  // alerting alone yields alertOpacity, heartbeat alone yields subPulse, and
  // if both ever overlap they compose naturally. The whole-tab dim multiplies
  // in too so the floating timer fades out with the rest of the side tab.
  const subPulseAnim = useAnimatedStyle(() => ({
    opacity: subPulse.value * alertOpacity.value * (1 - Math.min(1, Math.max(0, dimSV.value))),
  }), [dimSV])

  // Same gentle beat, but for the broadcast megaphone the pulse is NOT an
  // alpha dim — it oscillates the glyph between its normal *unselected* look
  // (muted WHITE_MID layer) and its *selected* look (active WHITE layer),
  // i.e. it drives the exact active/muted cross-fade that selection (and the
  // finite `alerting`) drive, just continuously. `lo = 0` so the heartbeat
  // value swings 1↔0; `p = 1 - beat` is therefore a 0↔1 "force-selected"
  // amount, used identically to `alertActive` (`a`) in the layer math below.
  // At rest (not pulsing) beat = 1 → p = 0 → the math collapses to plain
  // selection behaviour, so every other tab's indicator is byte-identical to
  // before. Selection itself needs no extra gate: on the selected pane t = 1
  // already pins active = 1 / muted = 0 regardless of p, so the glyph holds
  // steady there and only breathes while the pane is unselected.
  const indicatorBeat = useGentlePulse(spec.indicatorPulsing, 0)

  // NOTE: the label cluster carries NO selection-driven transform. Selection
  // emphasis is opacity/weight/colour/shadow only (activeStyle/mutedStyle +
  // the labelActive shadow) — none of which change layout — so the label's Y
  // is rock-constant whether or not the chip is over it. A previous version
  // animated `scale: 1 → TAB.selectedScale` here per swipe frame; scaling a
  // <Text> every frame re-rasterizes the glyph with rounding and made the
  // label visibly jitter up/down as the chip arrived/left. The only vertical
  // offset is the CONSTANT `-TAB.labelLift`, applied as a STATIC
  // `styles.labelNudge` transform on a wrapper SEPARATE from the animated
  // press-scale view (so the RN transform-array replace hazard doesn't apply
  // and it hot-reloads); it never varies with selection so it can't move the
  // text.
  // Selection drives the cross-fade by default. While `alertActive` ramps to 1
  // (during alerting), the active layer is force-blended to full opacity and
  // the muted layer is force-blended to 0 — so an unselected tab still reads
  // in WHITE/extrabold typography while the 3-blink pulse runs. Sum of the
  // two layer opacities stays 1 throughout the transition, so no flicker.
  const activeStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - index)
    const t = Math.max(0, 1 - d)
    const a = alertActive.value
    return { opacity: t + (1 - t) * a }
  })
  const mutedStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - index)
    const t = Math.max(0, 1 - d)
    const a = alertActive.value
    return { opacity: (1 - t) * (1 - a) }
  })

  // ── Position-driven label morph ("Once" → "My profile") ────────────────
  // When the tab supplies `altLabel`+`altProgress`, the label cluster shows
  // TWO words cross-faded by `altProgress` (0 = base, 1 = alt) ON TOP of the
  // normal selection active/muted cross-fade. Four layers:
  //   base·active: A·(1−altT)   base·muted: M·(1−altT)
  //    alt·active: A·altT        alt·muted: M·altT
  // where A = activeStyle's opacity (t + (1−t)·alert) and M = mutedStyle's
  // ((1−t)·(1−alert)). A + M ≡ 1, and (1−altT) + altT ≡ 1, so the four
  // opacities always sum to 1 → no flicker at any morph/selection point.
  // Driven by the SAME shared value that blends the selected-chip onto this
  // tab (see home.tsx), so the word and the chip move together and both
  // track the sheet's drag position 1:1. `altProgress` is optional, so a
  // stable zero fallback keeps the worklets valid on non-morph tabs (where
  // this whole cluster is never rendered anyway).
  const zeroSV = useSharedValue(0)
  const altSV = spec.altProgress ?? zeroSV
  const baseActiveStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(progress.value - index))
    const a = alertActive.value
    const m = Math.min(1, Math.max(0, altSV.value))
    return { opacity: (t + (1 - t) * a) * (1 - m) }
  }, [altSV])
  const baseMutedStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(progress.value - index))
    const a = alertActive.value
    const m = Math.min(1, Math.max(0, altSV.value))
    return { opacity: ((1 - t) * (1 - a)) * (1 - m) }
  }, [altSV])
  // Base-word PAUSE split. When the tab supplies `pauseLabel`+`pauseProgress`
  // the base word itself cross-fades `label` ⇄ `pauseLabel` by `p`. This
  // PARTITIONS the base opacity (it does not add to it): the normal pair is
  // ×(1−p), the pause pair ×p. normalActive+normalMuted+pauseActive+pauseMuted
  // = baseActive+baseMuted, so together with the unchanged alt pair the grand
  // total is still exactly 1 — same no-flicker invariant as the 4-layer
  // morph, just 6 layers. `pauseProgress` is optional; a stable zero fallback
  // keeps `p` at 0 so the normal pair equals the original baseActive/baseMuted
  // exactly and the pause pair is 0 (and is not even rendered — see render).
  const zeroPause = useSharedValue(0)
  const pauseSV = spec.pauseProgress ?? zeroPause
  const baseNormalActiveStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(progress.value - index))
    const a = alertActive.value
    const m = Math.min(1, Math.max(0, altSV.value))
    const p = Math.min(1, Math.max(0, pauseSV.value))
    return { opacity: (t + (1 - t) * a) * (1 - m) * (1 - p) }
  }, [altSV, pauseSV])
  const baseNormalMutedStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(progress.value - index))
    const a = alertActive.value
    const m = Math.min(1, Math.max(0, altSV.value))
    const p = Math.min(1, Math.max(0, pauseSV.value))
    return { opacity: ((1 - t) * (1 - a)) * (1 - m) * (1 - p) }
  }, [altSV, pauseSV])
  const basePauseActiveStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(progress.value - index))
    const a = alertActive.value
    const m = Math.min(1, Math.max(0, altSV.value))
    const p = Math.min(1, Math.max(0, pauseSV.value))
    return { opacity: (t + (1 - t) * a) * (1 - m) * p }
  }, [altSV, pauseSV])
  const basePauseMutedStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(progress.value - index))
    const a = alertActive.value
    const m = Math.min(1, Math.max(0, altSV.value))
    const p = Math.min(1, Math.max(0, pauseSV.value))
    return { opacity: ((1 - t) * (1 - a)) * (1 - m) * p }
  }, [altSV, pauseSV])
  const altActiveStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(progress.value - index))
    const a = alertActive.value
    const m = Math.min(1, Math.max(0, altSV.value))
    return { opacity: (t + (1 - t) * a) * m }
  }, [altSV])
  const altMutedStyle = useAnimatedStyle(() => {
    const t = Math.max(0, 1 - Math.abs(progress.value - index))
    const a = alertActive.value
    const m = Math.min(1, Math.max(0, altSV.value))
    return { opacity: ((1 - t) * (1 - a)) * m }
  }, [altSV])
  const isMorph = spec.altLabel != null && spec.altProgress != null
  // Only split the base word into normal⇄pause when BOTH are supplied; else
  // the base renders as the original single pair (byte-identical).
  const hasPauseSwap = spec.pauseIcon != null && spec.pauseProgress != null
  // Accessory glyph (Home game-mode pause). Two placements:
  //  • trailing (watching) — rendered AS PART OF the wordmark, directly after
  //    the name as one centred [name · glyph] unit.
  //  • centred (paused) — stands in for the wordmark that faded out via
  //    pauseProgress.
  // Both live INSIDE the morph band's morphInner, so the glyph inherits the
  // exact opacity treatment of the label in every state (selection cross-fade,
  // the finite `alerting` blink, press, nameSwap) — "opacity like the text".
  const hasTrailingAccessory = spec.accessory != null && !spec.accessoryCenter
  const hasCenterAccessory = spec.accessory != null && spec.accessoryCenter === true
  // The base-word opacity styles (already fold in selection × alert × the
  // profile-sheet morph × the pause split). The adjacent glyph reuses these
  // verbatim so its opacity is byte-identical to the name's in every state.
  const baseWordActiveStyle = hasPauseSwap ? baseNormalActiveStyle : baseActiveStyle
  const baseWordMutedStyle = hasPauseSwap ? baseNormalMutedStyle : baseMutedStyle
  // Indicator-only variants of activeStyle/mutedStyle that fold the broadcast
  // heartbeat into the same `max(a, …)` force-select blend. `p = 1 - beat`
  // continuously eases 0→1→0 while pulsing-and-unselected, cross-fading the
  // glyph muted↔active; `max(alertActive, p)` lets a finite alert still win.
  // Two-layer opacities always sum to 1 (t + (1-t)b + (1-t)(1-b)) → no flicker.
  const indicatorActiveStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - index)
    const t = Math.max(0, 1 - d)
    const blend = Math.max(alertActive.value, 1 - indicatorBeat.value)
    return { opacity: t + (1 - t) * blend }
  })
  const indicatorMutedStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - index)
    const t = Math.max(0, 1 - d)
    const blend = Math.max(alertActive.value, 1 - indicatorBeat.value)
    return { opacity: (1 - t) * (1 - blend) }
  })

  // Compact (flex:0, icon shrinks to its glyph width) whenever the tab has
  // no label. A sub-label (the ambient side tab's viewer-count number, or a
  // status word) rides ABSOLUTELY above the icon — zero layout box — so it
  // does NOT need a flex column and the tab stays icon-only width. (This
  // realigns with the `subLabelPulsing` doc's "rides above an icon-only
  // tab".) MUST match the parent's `compactFlags` rule exactly.
  const iconOnly = spec.label == null
  return (
    <AnimatedPressable
      style={[
        styles.tab,
        iconOnly
          ? styles.tabCompact
          : fixedWidth != null
            ? { width: fixedWidth }
            : styles.tabFlex,
      ]}
      // The tab ALWAYS navigates on tap (user: "only a tap on the pause
      // glyph performs pause, not the whole tab"). The pause action is
      // wired to a dedicated transparent hit-area overlaid ONLY on the
      // glyph (rendered below, outside the pointerEvents:none morph band)
      // so it's the deepest responder there; everywhere else the tap falls
      // through to this navigate-onPress. Byte-identical for every tab
      // without an accessory.
      onPress={onPress}
      onPressIn={() => { pressed.value = withTiming(1) }}
      onPressOut={() => { pressed.value = withTiming(0) }}
      onLayout={e => onWidth(index, e.nativeEvent.layout.width)}
      hitSlop={SM}
      layout={LinearTransition.duration(TAB.collapseDuration)}
    >
      {/* Sub-label is rendered ABSOLUTELY above the mainRow so the tab's
          natural layout flow (and therefore every wrapper above it) stays at
          exactly TAB.rowHeight whether the timer is showing or not — the
          label never shifts vertically when the timer appears or disappears.
          The glyph overflows upward into the home shell's PRIMARY-colored
          top padding (no clipping). Entering: FadeInDown drops the timer
          from above into place while fading in. Exiting: FadeOutUp lifts it
          back up while fading out.

          The row mirrors mainRow's flex layout 1:1 — sub-label text + an
          invisible spacer the exact size of mainRow's indicator — so flex
          centering lands the sub-label at the same X as the label (not at
          the X of the label+indicator group center). When mainRow has no
          indicator (home tab), no spacer renders and the row collapses to a
          single centered child, matching mainRow's single-child case. */}
      {spec.subLabel ? (
        // Outer wrapper owns the FadeInDown/FadeOutUp layout animation, inner
        // wrapper owns the `subPulseAnim` opacity heartbeat. Reanimated warns
        // when a single view carries both a layout-animation prop and an
        // animated `opacity` style, because the layout animator wants
        // exclusive control of opacity during entry/exit. Splitting them
        // gives each Animated.View one responsibility.
        <Animated.View
          key="sub"
          entering={FadeInDown.duration(TAB.timerSlideDuration)}
          exiting={FadeOutUp.duration(TAB.timerSlideDuration)}
          style={styles.subLabelOuter}
        >
          <Animated.View style={[styles.subLabelRow, subPulseAnim]}>
            {/* Optional leading glyph (the stars star) + the count, as one
                horizontal cluster centred above the Menu glyph. The glyph is
                two-layer active/muted so it cross-fades with selection like
                the count. There is NO numeric +/- delta element any more — a
                wallet change is signalled by RECOLOURING the glyph itself
                (green added / red removed; the colour is decided by the
                caller's subLabelIcon) plus the finite `alerting` blink. */}
            <View style={styles.subLabelContent}>
              {spec.subLabelIcon != null ? (
                <View style={styles.subLabelStack} pointerEvents="none">
                  <Animated.View style={activeStyle}>
                    {spec.subLabelIcon(WHITE)}
                  </Animated.View>
                  <Animated.View style={[styles.indicatorOverlay, mutedStyle]}>
                    {spec.subLabelIcon(WHITE_MID)}
                  </Animated.View>
                </View>
              ) : null}
              <View style={styles.subLabelStack}>
                <AnimatedText
                  style={[styles.subLabel, styles.subLabelActive, activeStyle]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={FONT_SCALE.ui}
                >
                  {spec.subLabel}
                </AnimatedText>
                <AnimatedText
                  style={[styles.subLabel, styles.subLabelMuted, styles.labelOverlay, mutedStyle]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={FONT_SCALE.ui}
                >
                  {spec.subLabel}
                </AnimatedText>
              </View>
            </View>
            {spec.renderIndicator != null && spec.label != null ? (
              <View style={[styles.indicatorStack, styles.subLabelSpacer]} pointerEvents="none">
                {spec.renderIndicator(WHITE)}
              </View>
            ) : null}
          </Animated.View>
        </Animated.View>
      ) : null}
      <Animated.View style={[styles.mainRow, dimStyle]}>
        {spec.renderLeading != null ? (
          // Leading slot does NOT cross-fade with selection — the glyph
          // carries its own meaning (e.g. "broadcast live") and must stay
          // visible whether or not the tab is currently selected. Its own
          // animation (continuous pulse) is driven inside the glyph.
          <View style={styles.leadingStack} pointerEvents="none">
            {spec.renderLeading()}
          </View>
        ) : null}
        {/* Label and indicator clusters mount/unmount as the side tab
            expands (gains a label) or collapses (drops to icon-only). The
            outer Animated.View owns ONLY the FadeIn/FadeOut so the label
            and the icon cross-dissolve while the AnimatedPressable's
            LinearTransition animates the width — both keyed off the one
            TAB.collapseDuration so the swap and the reflow finish together.
            The outer wrapper carries the layout animation, the inner stack
            keeps the pulse opacity (Reanimated forbids a layout-animation
            prop and an animated opacity on the same view — same split as the
            sub-label above; the inner stack has no selection transform, so
            the label's Y never moves). Menu/Home tabs
            never toggle these props, so their wrappers stay mounted and
            never fade. Skipped on a morph tab — its label lives in the
            absolute morph band below so both words can use the full tab
            width (see `isMorph`). */}
        {spec.label != null && !isMorph ? (
          // Outer wrapper carries the STATIC −labelLift nudge
          // (styles.labelNudge) + the FadeIn/FadeOut mount animation; the
          // inner view carries the animated press scale. Separate views so
          // the static transform is never clobbered by the worklet transform.
          <Animated.View
            key="label"
            style={styles.labelNudge}
            entering={FadeIn.duration(TAB.collapseDuration)}
            exiting={FadeOut.duration(TAB.collapseDuration)}
          >
            <Animated.View style={[styles.labelStack, pulseAnim, pressLabelStyle]}>
              <AnimatedText
                style={[styles.label, styles.labelActive, activeStyle]}
                numberOfLines={1}
                maxFontSizeMultiplier={FONT_SCALE.ui}
              >
                {spec.label}
              </AnimatedText>
              <AnimatedText
                style={[styles.label, styles.labelMuted, styles.labelOverlay, mutedStyle]}
                numberOfLines={1}
                maxFontSizeMultiplier={FONT_SCALE.ui}
              >
                {spec.label}
              </AnimatedText>
            </Animated.View>
          </Animated.View>
        ) : null}
        {spec.renderIndicator != null ? (
          // Stack two icon copies and cross-fade between WHITE (selected) and
          // WHITE_MID (un-selected) by opacity. Can't animate the icon's color
          // prop directly since it's baked into the SVG at render time, so the
          // layered-opacity trick is the cheap equivalent. The muted layer
          // overlays the active one absolutely so it doesn't widen the row.
          <Animated.View
            key="ind"
            style={styles.iconNudge}
            entering={FadeIn.duration(TAB.collapseDuration)}
            exiting={FadeOut.duration(TAB.collapseDuration)}
          >
            <Animated.View style={[styles.indicatorStack, pulseAnim, pressIndicatorStyle]}>
              <Animated.View style={indicatorActiveStyle}>
                {spec.renderIndicator(WHITE)}
              </Animated.View>
              <Animated.View style={[styles.indicatorOverlay, indicatorMutedStyle]}>
                {spec.renderIndicator(WHITE_MID)}
              </Animated.View>
            </Animated.View>
          </Animated.View>
        ) : null}
      </Animated.View>
      {/* Morph band — only on a tab that supplies altLabel+altProgress
          (the Home tab while the profile-preview sheet exists). Absolutely
          overlaid on the (empty, for this tab) mainRow band: left/right:0
          spans the FULL flex-tab width so the longer word ("My profile")
          never clips and the tab width never reflows as it morphs. Text
          layers fill the band (`styles.label`'s textAlign +
          lineHeight==rowHeight). pulseAnim + the SAME pressLabelStyle the
          normal label cluster uses make alert/press feel identical AND fold
          in the identical −labelLift nudge, so the morph "Once" lands on the
          EXACT same Y as a normal tab's name (without the shared lift it sat
          labelLift px lower — the asymmetry bug).

          The game-mode pause GLYPH lives INSIDE this band but is DECOUPLED
          from the wordmark: leading → a FIXED slot pinned to the tab's
          leading side, the name sliding independently beside it (watching);
          centred → the glyph standing in for the word that faded out via
          pauseProgress (paused). It still reuses the wordmark's own opacity
          styles so its opacity is byte-identical to the text in every state.
          The band is pointerEvents:none; the pause TAP is a separate
          transparent `morphAccessoryHit` overlaid only on the glyph (the
          whole tab no longer pauses — user decision), and a tap elsewhere
          on the tab navigates. */}
      {isMorph ? (
        // Outer = static geometry + STATIC −labelLift nudge
        // (styles.labelNudge), pointerEvents none. Inner = absolute-fill
        // carrying the animated pulse opacity + press scale. Split so the
        // static nudge transform is not clobbered by the worklet transform
        // (same pattern as the normal label cluster); the layers fill the
        // inner exactly as they filled the band before.
        <View
          pointerEvents="none"
          style={[styles.labelMorphBand, styles.labelNudge]}
        >
          {/* The pause glyph does NOT fade or move during a skip (user: it
              must STAY — fixed on the SIDE of the tab, decoupled from the
              name). The names SLIDE vertically inside a clipped window: the
              current name down/out, the next name in from the top. On
              promote the deck advances and spec.label becomes the next
              name (swap resets to 0). */}
          <Animated.View style={[styles.morphInner, pulseAnim, pressLabelStyle]}>
          {hasTrailingAccessory ? (
            // Watching: the name SLIDES (current down / next from the top)
            // inside `morphNameClip` (overflow:hidden, clipped to the row so
            // a sliding name never bleeds past the tab). The pause glyph is
            // a SEPARATE fixed slot pinned to the trailing side
            // (styles.morphSideAccessory) — NOT part of the wordmark and NOT
            // sliding (user: "the pause must be fixed on the side of the tab
            // and not attached to the text"). Both name groups still use the
            // SAME baseWord* opacity as the no-accessory base word, so the
            // selection cross-fade / finite alerting blink / profile-sheet
            // morph are unchanged; the glyph reuses it too so its opacity
            // stays byte-identical to the name in every state. The basePause
            // glyph slot is replaced by this fixed slot, so spec.pauseIcon
            // is not drawn here (Home's pauseIcon is ()=>null anyway).
            <>
              <View style={styles.morphNameClip}>
                {spec.nameRiseFrom != null ? (
                  // RISE pair (fresh-search first card). OLD label
                  // (nameRiseFrom) slides UP and out the top; NEW label
                  // (nameRiseTo — the live name; spec.label is held to the
                  // OLD text by the caller during the rise so no other
                  // render can leak the new name early) enters from the
                  // BOTTOM. Exact mirror of the skip slide, synced to the
                  // card's SlideInDown.
                  <>
                    <Animated.View style={[StyleSheet.absoluteFill, nameRiseOldStyle]}>
                      <AnimatedText
                        style={[styles.label, styles.labelActive, styles.labelOverlay, baseWordActiveStyle]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={FONT_SCALE.ui}
                      >
                        {spec.nameRiseFrom}
                      </AnimatedText>
                      <AnimatedText
                        style={[styles.label, styles.labelMuted, styles.labelOverlay, baseWordMutedStyle]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={FONT_SCALE.ui}
                      >
                        {spec.nameRiseFrom}
                      </AnimatedText>
                    </Animated.View>
                    <Animated.View style={[StyleSheet.absoluteFill, nameRiseNewStyle]}>
                      <AnimatedText
                        style={[styles.label, styles.labelActive, styles.labelOverlay, baseWordActiveStyle]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={FONT_SCALE.ui}
                      >
                        {spec.nameRiseTo ?? spec.label}
                      </AnimatedText>
                      <AnimatedText
                        style={[styles.label, styles.labelMuted, styles.labelOverlay, baseWordMutedStyle]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={FONT_SCALE.ui}
                      >
                        {spec.nameRiseTo ?? spec.label}
                      </AnimatedText>
                    </Animated.View>
                  </>
                ) : (
                  <>
                    {/* SKIP pair. current name — slides DOWN (0 → +rowHeight)
                        out the bottom as the skip pull progresses. */}
                    <Animated.View style={[StyleSheet.absoluteFill, nameSlideCurrentStyle]}>
                      <AnimatedText
                        style={[styles.label, styles.labelActive, styles.labelOverlay, baseWordActiveStyle]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={FONT_SCALE.ui}
                      >
                        {spec.label}
                      </AnimatedText>
                      <AnimatedText
                        style={[styles.label, styles.labelMuted, styles.labelOverlay, baseWordMutedStyle]}
                        numberOfLines={1}
                        maxFontSizeMultiplier={FONT_SCALE.ui}
                      >
                        {spec.label}
                      </AnimatedText>
                    </Animated.View>
                    {/* next name — parked one row ABOVE at rest (clipped,
                        invisible) and slides in to 0 from the top
                        (−rowHeight → 0). Absent ⇒ only the current name. */}
                    {spec.nameSwapNext != null ? (
                      <Animated.View style={[StyleSheet.absoluteFill, nameSlideNextStyle]}>
                        <AnimatedText
                          style={[styles.label, styles.labelActive, styles.labelOverlay, baseWordActiveStyle]}
                          numberOfLines={1}
                          maxFontSizeMultiplier={FONT_SCALE.ui}
                        >
                          {spec.nameSwapNext}
                        </AnimatedText>
                        <AnimatedText
                          style={[styles.label, styles.labelMuted, styles.labelOverlay, baseWordMutedStyle]}
                          numberOfLines={1}
                          maxFontSizeMultiplier={FONT_SCALE.ui}
                        >
                          {spec.nameSwapNext}
                        </AnimatedText>
                      </Animated.View>
                    ) : null}
                  </>
                )}
              </View>
              {/* Pause glyph — FIXED on the LEADING side of the tab,
                  vertically centred in the band, sitting on the standard
                  tab-icon optical line via morphGlyphLine (the SAME line the
                  centred/paused glyph uses, so the pause symbol is on the
                  exact same Y in both states). Non-interactive here — the
                  tap is handled by the separate morphAccessoryHit overlay
                  (glyph-only pause). Opacity-only entering/exiting on the
                  OUTER (absolute position is layout, not transform, so it
                  is never clobbered). */}
              <Animated.View
                key="acc"
                style={styles.morphSideAccessory}
                entering={FadeIn.duration(TAB.collapseDuration)}
                exiting={FadeOut.duration(TAB.collapseDuration)}
              >
                <View style={[styles.indicatorStack, styles.morphGlyphLine]}>
                  <Animated.View style={baseWordActiveStyle}>
                    {spec.accessory!(WHITE)}
                  </Animated.View>
                  <Animated.View style={[styles.indicatorOverlay, baseWordMutedStyle]}>
                    {spec.accessory!(WHITE_MID)}
                  </Animated.View>
                </View>
              </Animated.View>
            </>
          ) : hasPauseSwap ? (
            // Base word split into normal⇄pause. The four opacities partition
            // the base total by `pauseProgress` (see baseNormal*/basePause*),
            // so the grand total with the alt pair is still exactly 1.
            <>
              <AnimatedText
                style={[styles.label, styles.labelActive, styles.labelOverlay, baseNormalActiveStyle]}
                numberOfLines={1}
                maxFontSizeMultiplier={FONT_SCALE.ui}
              >
                {spec.label}
              </AnimatedText>
              <AnimatedText
                style={[styles.label, styles.labelMuted, styles.labelOverlay, baseNormalMutedStyle]}
                numberOfLines={1}
                maxFontSizeMultiplier={FONT_SCALE.ui}
              >
                {spec.label}
              </AnimatedText>
              {/* Pause side is a GLYPH, not text — rendered as the same
                  active(WHITE)/muted(WHITE_MID) two-layer pair, centred in
                  the band (absolute-fill + center). Opacities are the same
                  basePause* partition, so the Once-word ⇄ pause-glyph
                  cross-fade and the no-flicker sum invariant are unchanged. */}
              <Animated.View
                pointerEvents="none"
                style={[styles.labelOverlay, styles.morphIconCenter, basePauseActiveStyle]}
              >
                {spec.pauseIcon!(WHITE)}
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[styles.labelOverlay, styles.morphIconCenter, basePauseMutedStyle]}
              >
                {spec.pauseIcon!(WHITE_MID)}
              </Animated.View>
            </>
          ) : (
            <>
              <AnimatedText
                style={[styles.label, styles.labelActive, styles.labelOverlay, baseActiveStyle]}
                numberOfLines={1}
                maxFontSizeMultiplier={FONT_SCALE.ui}
              >
                {spec.label}
              </AnimatedText>
              <AnimatedText
                style={[styles.label, styles.labelMuted, styles.labelOverlay, baseMutedStyle]}
                numberOfLines={1}
                maxFontSizeMultiplier={FONT_SCALE.ui}
              >
                {spec.label}
              </AnimatedText>
            </>
          )}
          {/* Paused: the glyph stands in for the wordmark that faded out
              via pauseProgress. Centred over the band, two-layer
              active/muted so its opacity follows selection exactly like the
              label would ("opacity like the text"). Non-interactive — the
              band is pointerEvents none and the whole-tab onPress is a no-op
              while paused (no onAccessoryPress). */}
          {hasCenterAccessory ? (
            <Animated.View
              key="acc-c"
              pointerEvents="none"
              style={StyleSheet.absoluteFill}
              entering={FadeIn.duration(TAB.collapseDuration)}
              exiting={FadeOut.duration(TAB.collapseDuration)}
            >
              <Animated.View
                style={[styles.labelOverlay, styles.morphIconCenter, styles.morphGlyphLine, activeStyle]}
              >
                {spec.accessory!(WHITE)}
              </Animated.View>
              <Animated.View
                style={[styles.labelOverlay, styles.morphIconCenter, styles.morphGlyphLine, mutedStyle]}
              >
                {spec.accessory!(WHITE_MID)}
              </Animated.View>
            </Animated.View>
          ) : null}
          <AnimatedText
            style={[styles.label, styles.labelActive, styles.labelOverlay, altActiveStyle]}
            numberOfLines={1}
            maxFontSizeMultiplier={FONT_SCALE.ui}
          >
            {spec.altLabel}
          </AnimatedText>
          <AnimatedText
            style={[styles.label, styles.labelMuted, styles.labelOverlay, altMutedStyle]}
            numberOfLines={1}
            maxFontSizeMultiplier={FONT_SCALE.ui}
          >
            {spec.altLabel}
          </AnimatedText>
          </Animated.View>
        </View>
      ) : null}
      {/* Pause-glyph-ONLY hit area (user: "a tap on the pause glyph
          performs pause, not the whole tab"). A transparent touch target
          overlaid exactly on the trailing glyph zone, rendered OUTSIDE the
          pointerEvents:none morph band (and after it, so it's on top) — it
          is the deepest responder over the glyph ⇒ tapping there pauses;
          a tap anywhere else on the tab falls through to the plain
          navigate-onPress above. Only present while an interactive
          accessory is wired (the watching pause); the paused/centred glyph
          passes no onAccessoryPress and stays non-interactive. */}
      {spec.onAccessoryPress != null ? (
        <Pressable
          style={styles.morphAccessoryHit}
          onPress={spec.onAccessoryPress}
          hitSlop={SM}
        />
      ) : null}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  // overflow: 'visible' is the default on RN View, but call it out — the
  // sub-label rides above the mainRow via absolute positioning and the
  // strip must not clip it into the home shell's PRIMARY-colored top padding.
  outer: { width: '100%' },
  // `width:'100%'` makes the row's main size definite so the flexible tabs'
  // flexGrow has real free space to distribute (without it, indefinite main
  // size collapses them to content width and the two content tabs end up
  // unequal — the page1 "Once"/morph tab vs the page2 name+timer tab).
  row: { flexDirection: 'row', alignItems: 'flex-end', width: '100%' },
  // Plain absolute-fill overlay (coordinate space = the row). The chip is
  // absolutely positioned inside it (NOT a flex child) so animating its
  // width only re-lays the chip itself — not a per-frame flexbox reflow of
  // the overlay, which is what made the flex-child version janky.
  chipOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  // Flat translucent-white selected-tab chip (no gradient). ONE element
  // spanning the selected tab's full width, resizing per tab. Anchored
  // physical `left:0`; this app RTL-swaps `left` so it lands at the row's
  // start (proven correct with the `isRTL ? − : +` sign in chipStyle).
  // chipStyle animates `width`, `height` (SHORT capsule <-> TALL 2-line
  // rounded-rect — grows UPWARD to wrap the timer above the name) and
  // `borderRadius` (lerps capsule<->rounded-rect with the height), plus the
  // `translateX` slide. Only `bottom` is static here — the fixed bottom
  // anchor is precisely WHY height growth extends upward and never moves the
  // name (iron rule). `borderCurve: 'continuous'` so the grown rounded-rect
  // reads soft (no-op for the SHORT capsule).
  indicator: {
    position: 'absolute',
    left: 0,
    // Box-centred on the mainRow, then nudged DOWN by chipBaselineNudge so
    // the capsule centres on the tab's optical ink (the glyph renders low in
    // its line-box and the label is itself lifted by -labelLift). A purely
    // declarative static offset — the single Y-centring knob, never computed.
    // This is also the fixed anchor the chip grows UPWARD from when tall.
    bottom: -TAB.indicatorPadV - TAB.chipBaselineNudge,
    // width / height / borderRadius are animated by chipStyle.
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: HEADER_PILL_BORDER,
    backgroundColor: HEADER_PILL_FILL,
    boxShadow: HEADER_PILL_SHADOW,
  },
  // Fixed-height tab: only mainRow is in the natural flow, so the tab's
  // layout box is always exactly TAB.rowHeight whether or not a timer is
  // showing above. The timer is rendered absolutely (see subLabelRow below).
  // Shared tab base — NO flex/basis here on purpose. The flex behaviour is
  // split into tabFlex vs tabCompact and applied EXCLUSIVELY (ternary in
  // TabButton), so the equal-width treatment can never leak onto a compact
  // tab (it once did: flexBasis:0 here + flex:0 from tabCompact collapsed
  // the icon tabs to zero width and the end glyphs went asymmetric).
  tab: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: RADII.sm,
  },
  // PRE-MEASUREMENT FALLBACK ONLY. The real equal-width guarantee is the
  // explicit `flexW` width applied to flexible tabs (see TabStrip) — flex
  // auto-distribution (even flex:1+flexBasis:0+minWidth:0) repeatedly did
  // NOT come out equal in practice for the morph "Once" tab vs the labelled
  // page2 tab. This style is used for ~1 frame before `rowW`/compact widths
  // are measured and `flexW` is known; after that flexible tabs switch to
  // `{ width: flexW }` and are exactly identical. minWidth:0 + flexBasis:0
  // keep even the fallback frame from biasing toward the wider-content tab.
  tabFlex: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  // Icon-only tab: content-sized (flex:0 → uses its glyph width, NOT a
  // zeroed basis). Wider horizontal padding gives the small glyph an honest
  // tap target. Both end tabs (Menu, ambient side) use this identical style
  // so they sit symmetrically from the screen edges.
  tabCompact: {
    flex: 0,
    paddingHorizontal: LG,
  },
  // Main row keeps a fixed TAB.rowHeight so label + indicator stay anchored
  // at exactly the same Y regardless of whether a sub-label is present below.
  mainRow: {
    height: TAB.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SM,
  },
  // Anchor for the absolutely-positioned muted overlay layer. The −labelLift
  // nudge is NOT here and NOT in the press worklet anymore — it is a static
  // transform on the OUTER wrapper (styles.labelNudge), a different view from
  // the one carrying the animated press scale, so the RN "array replaces
  // transform" hazard does not apply and the value hot-reloads. Keep this
  // style transform-free (the animated press scale lives on this view).
  labelStack: {
    position: 'relative',
  },
  // STATIC constant glyph-centring nudge (−TAB.labelLift) for the label.
  // Lives on a wrapper that carries NO animated transform (the press scale
  // is on a child view), so it is never clobbered and — being a plain
  // StyleSheet value, not a worklet-captured constant — actually reflects
  // token edits on Fast Refresh. Shared by the normal label cluster AND the
  // morph band so "Once" and a normal name share the exact same Y. THE
  // single knob for label-vs-icon vertical alignment (value in TAB.labelLift).
  labelNudge: {
    transform: [{ translateY: -TAB.labelLift }],
  },
  // Absolute-fill inside the morph band's outer (static-nudge) wrapper. The
  // four morph text layers (styles.labelOverlay) fill THIS, exactly as they
  // filled the band before the outer/inner split; carries the animated pulse
  // opacity + press scale.
  morphInner: {
    ...StyleSheet.absoluteFillObject,
  },
  // Centres the pause glyph inside the absolute-fill morph band so it lands
  // on the same optical centre the "Once" wordmark uses.
  morphIconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The morph band carries `labelNudge` (translateY: −labelLift = +|labelLift|
  // down), tuned for the WORDMARK's optical centre. A GLYPH inside the band
  // must instead sit on the standard tab-icon optical line (where every
  // renderIndicator glyph sits: +iconBaselineNudge from the mainRow, which
  // the band overlays). Net extra it needs ON TOP of the band's labelNudge
  // is therefore `iconBaselineNudge − (−labelLift)` = `iconBaselineNudge +
  // labelLift`. Used by BOTH the side (watching) glyph and the centred
  // (paused) glyph so the pause symbol lands on the EXACT same Y line in
  // both states (user: "same line in both states"). Replaces the raw
  // `iconNudge` on the side glyph (that double-counted: band + full
  // iconNudge ⇒ too low) and is ADDED to the centred glyph (which had no
  // nudge ⇒ slightly high). Both now resolve to the standard icon line.
  morphGlyphLine: {
    transform: [{ translateY: TAB.iconBaselineNudge + TAB.labelLift }],
  },
  // Absolute-positioned slot just ABOVE the mainRow, sitting INSIDE the
  // grown pill (no longer a caption floating above it). `bottom = rowHeight
  // + timerGap` places the timer's box a tight timerGap above the name line;
  // the TALL chip height is derived to wrap exactly this band with a top pad
  // symmetric to the bottom one (see CHIP_TALL). Still absolute, so it adds
  // nothing to the tab's natural height — the name never shifts Y when the
  // timer appears/disappears (iron rule); only the pill grows up to embrace
  // it. The flex row layout lives on the inner wrapper (subLabelRow) so the
  // outer Animated.View can carry the entering/exiting (FadeInDown/FadeOutUp,
  // the timer dropping into / lifting out of the pill) without colliding
  // with the animated opacity pulse on the inner row.
  subLabelOuter: {
    position: 'absolute',
    bottom: TAB.rowHeight + TAB.timerGap,
    left: 0,
    right: 0,
  },
  subLabelRow: {
    // Mirror mainRow's flex children layout so the sub-label horizontally
    // aligns with the labelStack, not with the tab center. The invisible
    // indicator spacer rendered next to the sub-label takes up the same
    // width + gap as the real indicator in mainRow, so flex centering
    // produces an identical label X on both rows.
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SM,
  },
  subLabelStack: {
    position: 'relative',
  },
  // Horizontal cluster holding the optional star glyph, the count, and the
  // optional transient delta. A single child of subLabelRow (so it still
  // centres above the icon exactly like the old lone text stack); the gap
  // matches CreditCost's glyph↔number gap so the currency reads the same
  // wherever it appears.
  subLabelContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: XS,
  },
  subLabelSpacer: {
    opacity: 0,
  },
  subLabel: {
    // TAB.timerFontSize (== the timer-line term in CHIP_TALL) so the pill
    // always grows to wrap the glyph exactly; bump that one token to resize.
    fontSize: TAB.timerFontSize,
    lineHeight: TAB.timerFontSize,
    includeFontPadding: false,
    textAlignVertical: 'center',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  subLabelActive: {
    fontWeight: WEIGHT.semibold,
    color: WHITE,
    // Faint warm depth, only on the active (white) cross-fade layer, so the
    // timer gains a subtle emboss exactly as its tab becomes selected.
    textShadowColor: HEADER_TEXT_SHADOW,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  subLabelMuted: {
    fontWeight: WEIGHT.semibold,
    color: WHITE_MID,
  },
  label: {
    fontSize: TEXT.xl,
    // Static tracking on BOTH stacked layers (active + muted) — identical
    // value, so the absolute muted overlay still registers exactly on the
    // active layer and the active layer keeps driving natural width (no
    // thrash). Gives the wordmark a refined, "set" feel against the chip.
    letterSpacing: TAB.labelTracking,
    // lineHeight == mainRow height so the text's line-box exactly fills the
    // row; the font then centres the glyph within that box (RN splits
    // lineHeight − glyph evenly), so the glyph's visual centre lands on the
    // mainRow centre — which is exactly the selected-chip's centre — at any
    // resolution / font scale. A tighter lineHeight (e.g. == fontSize) makes
    // the glyph ride high in a cramped box, so the chip looked like it sat
    // below the text. The Home watching tab co-renders a name with a
    // side-pinned pause glyph (styles.morphSideAccessory) — they share an
    // optical line because both centre against THIS rowHeight box (the name
    // via lineHeight, the glyph via its fixed slot's center + iconNudge).
    // Every other tab is icon-only (Menu / collapsed-Side) or label-only
    // (Home base / labelled-Side), so icon alignment elsewhere is still
    // handled independently via indicatorStack/iconBaselineNudge.
    lineHeight: TAB.rowHeight,
    includeFontPadding: false,
    textAlignVertical: 'center',
    textAlign: 'center',
  },
  labelActive: {
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
    // Soft emboss behind the selected wordmark — lifts the white text off
    // the deep-wine header. Only on the active layer, so the depth fades
    // in/out 1:1 with the selection cross-fade (textShadow doesn't affect
    // layout, so it can't widen the row mid-swipe).
    textShadowColor: HEADER_TEXT_SHADOW,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  labelMuted: {
    fontWeight: WEIGHT.semibold,
    color: WHITE_MID,
  },
  labelOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Full-width band overlaying the (empty) mainRow on a morph tab. bottom:0
  // + height:rowHeight pins it where mainRow sits (the tab is a flex-end
  // column, mainRow is its bottom-most rowHeight block, the sub-label floats
  // absolutely above it). That ALONE does NOT match a normal label's Y (a
  // normal label is additionally lifted by −labelLift), so this band's OUTER
  // wrapper also carries styles.labelNudge (the same static −labelLift the
  // normal label cluster uses) — the two then share the EXACT same Y.
  // left/right:0 on the flex:1 tab gives both words the full tab width to
  // render and centre in — no clip, no width reflow.
  labelMorphBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB.rowHeight,
  },
  // Clipped name-slide window (the watching accessory). Absolute-fill over
  // the morph band (same pin as the text layers) so it NEVER changes the
  // tab's measured width — the iron-rule no-reflow / no-clip guarantee is
  // intact. overflow:hidden clips the two stacked name groups (current +
  // next) to exactly the row height: as the skip pull progresses the
  // current name translates DOWN out the bottom and the next slides in from
  // the top, neither ever bleeding past the tab. Each group is an
  // absolute-fill carrying styles.label text (textAlign:center +
  // lineHeight==rowHeight ⇒ centred), so the name's resting Y is unchanged.
  morphNameClip: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  // Pause glyph FIXED on the tab's trailing side, DECOUPLED from the name
  // (user: "fixed on the side of the tab, not attached to the text"). `end`
  // pins it to the trailing edge (RTL-aware); top/bottom:0 + center keeps it
  // on the band's vertical centre (the inner stack adds the same
  // +iconBaselineNudge every glyph uses to sit on the label's optical line).
  // It does NOT slide during a skip — it stays put.
  // Pinned to the LEADING side (user: "the pause glyph should be on the
  // other side of the tab"). `start` is RTL-aware like `end` was.
  morphSideAccessory: {
    position: 'absolute',
    start: SM,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Transparent touch target covering ONLY the leading pause-glyph zone
  // (sibling of the morph band, in the tab's own coord space). `bottom:0 +
  // height:rowHeight` matches the band's vertical extent (where the glyph
  // lives); `start:0 + width` spans the leading region the glyph (at
  // start:SM) sits in, comfortably wider than the glyph + a SM hitSlop. No
  // background — purely a hit area; the visible glyph stays in the band.
  morphAccessoryHit: {
    position: 'absolute',
    start: 0,
    bottom: 0,
    height: TAB.rowHeight,
    width: LG * 2,
  },
  // See labelStack/labelNudge: the +TAB.iconBaselineNudge centring nudge is
  // NOT here and NOT in the press worklet anymore — it is a static transform
  // on the icon's OUTER wrapper (styles.iconNudge), a different view from the
  // animated press scale, so it isn't clobbered and it hot-reloads. Keep
  // this style transform-free.
  indicatorStack: {
    position: 'relative',
  },
  // STATIC constant glyph-centring nudge (+TAB.iconBaselineNudge) for the
  // icon — the icon-side twin of styles.labelNudge, same robust mechanism:
  // plain StyleSheet on a wrapper with no animated transform, so it never
  // gets clobbered and reflects token edits on Fast Refresh.
  iconNudge: {
    transform: [{ translateY: TAB.iconBaselineNudge }],
  },
  // Leading glyph slot (e.g. broadcast "live" dot). No vertical nudge — the
  // 7px dot already centers cleanly against the label glyphs via flex.
  leadingStack: {
    position: 'relative',
  },
  indicatorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
})
