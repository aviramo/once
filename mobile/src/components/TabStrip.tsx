import { useEffect, useRef } from 'react'
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
import { SM, LG, RADII, TEXT, WEIGHT, TAB } from '../tokens'

// Global tab strip used at the top of the home shell. Three tabs (Menu |
// Home | Side).
//
// SELECTED INDICATOR — two layers, both driven by the one PagerView swipe
// `progress` shared value so they move 1:1 with the finger:
//      1. ONE flat translucent-white chip (no gradient), a real moving
//      element (not per-tab opacity) that **spans the selected tab's full
//      width and resizes per tab** — the state the user preferred, restored.
//      Absolutely positioned, `left:0`. chipStyle animates BOTH `width`
//      (interpolated tab width − inset) and `transform: translateX` (the
//      slide), driven by `pagerProgress`. The ONLY thing changed vs. the
//      original is RTL correctness: position is derived from tab WIDTHS in
//      logical/child order (never an `x`/`measureInWindow`); this app
//      RTL-swaps `left` so `left:0` lands at the row's start and
//      `translateX = isRTL ? −logicalLeft : +logicalLeft` (logicalLeft =
//      interpolated tab-centre − chipW/2) is correct both ways — the proven
//      `marginStart = logicalLeft` equivalence; `transform` is immune to the
//      RTL swap so the sign is the only directional term. (Per-frame `width`
//      is a layout prop; this is the user's chosen trade-off for a
//      full-width resizing chip — see iron rules.)
//   2. On top of the chip, the typographic cross-fade below.
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
// is the constant `-TAB.labelLift` glyph-centring nudge, folded into
// `pressLabelStyle`'s transform array — see that worklet's comment.)
//
// Tab labels never move. The mainRow has a fixed TAB.rowHeight and that's
// the only thing in the natural layout flow — the whole strip's bounding
// box stays constant whether a sub-label (live timer) is showing or not.
// The sub-label is rendered ABSOLUTELY above the mainRow, overflowing into
// the container's PRIMARY-colored top padding. Entering: FadeInDown drops
// the glyph from above into place while fading in. Exiting: FadeOutUp lifts
// it back up while fading out. So the labels stay locked at the same Y,
// and only the timer animates.
//
// Counts (unread messages / viewer counts) are chained into the label itself
// (`${label} ${n}`) by the caller — there is no separate chip badge.
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
  /** Fires a finite attention pulse (3 blinks) across every visible element
   * in the tab — label, sub-label, indicator. While the pulse runs, the tab
   * is forced to render in its "selected" typography (bold WHITE) regardless
   * of whether the user is currently on this pane, so the blink is legible
   * on an unselected tab too. */
  alerting?: boolean
  /** Optional sub-label rendered ABSOLUTELY above the main label (same
   * column, smaller type). Used to surface live timers (pending-invite
   * countdown, broadcast cooldown) without changing the tab's layout box —
   * the main label stays locked at the same Y whether the timer is showing
   * or not. Animates in with FadeInDown (drops from above) and out with
   * FadeOutUp (lifts back up). Cross-fades with selection state exactly
   * like the label. */
  subLabel?: string
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
  /** Whole-tab opacity fade driven 1:1 by a shared value (0 = fully visible,
   * 1 = fully hidden). Used to fade the side tab out as the profile-preview
   * sheet rises: the SAME shared value that morphs the Home word and slides
   * the chip, so the fade tracks the sheet's drag position and snaps back if
   * released. Folded into the mainRow + sub-label opacity (NOT the
   * AnimatedPressable, which carries `layout` — Reanimated forbids an animated
   * opacity on a view that also runs a layout animation). Optional; a stable
   * zero fallback keeps every non-dimmed tab byte-identical. */
  dimProgress?: SharedValue<number>
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


export function TabStrip({
  tabs,
  progress,
  onSelect,
}: {
  tabs: TabSpec[]
  progress: SharedValue<number>
  onSelect: (idx: number) => void
}) {
  // ONE chip that physically slides AND spans the selected tab's full width
  // (resizes per tab). This is the state the user liked best — restored. The
  // chip is absolutely positioned, anchored physical `left:0`. Per frame it
  // animates BOTH `width` (interpolated tab width − inset → full-tab-width,
  // resizing) and `transform: translateX` (the slide). RTL is the *only*
  // thing fixed vs. the original: instead of the unreliable measureInWindow
  // physical mapping, position comes from tab WIDTHS in logical/child order
  // and the proven sign flip — this app RTL-swaps `left`, so `left:0` lands
  // at the row's start and `translateX = isRTL ? −logicalLeft : +logicalLeft`
  // (equivalent to the proven-correct `marginStart = logicalLeft`) is right
  // in both directions; `transform` is immune to the swap so the sign is the
  // only directional term. (Per-frame `width` is a layout prop; the user
  // explicitly preferred this state — if its release-settle ever feels rough
  // that is the known trade-off of full-width-resize, not a regression.)
  const isRTL = I18nManager.isRTL
  const w0 = useSharedValue(0)
  const w1 = useSharedValue(0)
  const w2 = useSharedValue(0)
  const ws = [w0, w1, w2]
  const measuredOnce = useRef([false, false, false])
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
  }

  const inset2 = TAB.indicatorInsetX * 2
  const chipStyle = useAnimatedStyle(() => {
    const a = w0.value
    const b = w1.value
    const c = w2.value
    if (a + b + c <= 0) return { opacity: 0 }
    // Logical centre + width of each tab (cumulative in child order).
    const centres = [a / 2, a + b / 2, a + b + c / 2]
    const widths = [a, b, c]
    const p = Math.min(2, Math.max(0, progress.value))
    const lo = Math.floor(p)
    const hi = Math.min(2, lo + 1)
    const f = p - lo
    const centre = centres[lo] + (centres[hi] - centres[lo]) * f
    const chipW = Math.max(1, (widths[lo] + (widths[hi] - widths[lo]) * f) - inset2)
    const logicalLeft = Math.max(0, centre - chipW / 2)
    return {
      opacity: 1,
      width: chipW,
      transform: [{ translateX: isRTL ? -logicalLeft : logicalLeft }],
    }
  }, [isRTL])

  return (
    <View style={styles.outer}>
      <View style={styles.row}>
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
  onPress,
}: {
  spec: TabSpec
  index: number
  progress: SharedValue<number>
  onWidth: (index: number, width: number) => void
  onPress: () => void
}) {
  // Subtle press feedback: the content cluster (label / icon) dips to
  // TAB.pressScale while held, then springs back. The gliding lozenge plus
  // this tactile dip make a tap feel physical without a bounce.
  const pressed = useSharedValue(0)
  // Press feedback dips the held cluster to TAB.pressScale. The per-cluster
  // CONSTANT glyph-centring nudge (label lifted by −labelLift, icons pushed by
  // +iconBaselineNudge so both visual centres land on the mainRow centre) is
  // folded INTO this same transform array — it must NOT live as a separate
  // `transform` on the static labelStack/indicatorStack wrappers. A RN /
  // Reanimated style array does not MERGE `transform`: the animated (press)
  // transform REPLACES any static one, so a static translateY on the wrapper
  // is silently clobbered by this worklet and the nudge never applies (the
  // label then renders low on Android and sits below the icons — the bug this
  // fixes). The nudge is constant, never selection-driven, so the label's Y is
  // still rock-constant as the chip arrives/leaves — only `scale` is dynamic.
  // Three variants: label (−labelLift), indicator (+iconBaselineNudge), and a
  // plain scale-only one for the morph band (it centres via lineHeight ==
  // rowHeight, so it needs no translateY nudge).
  const pressLabelStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -TAB.labelLift },
      { scale: 1 + pressed.value * (TAB.pressScale - 1) },
    ],
  }))
  const pressIndicatorStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: TAB.iconBaselineNudge },
      { scale: 1 + pressed.value * (TAB.pressScale - 1) },
    ],
  }))
  const pressStyle = useAnimatedStyle(() => ({
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
        TAB.pulseCount,
        false,
      )
    } else {
      alertActive.value = withTiming(0)
      alertOpacity.value = withTiming(1)
    }
  }, [spec.alerting])
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
  // offset is the CONSTANT `-TAB.labelLift` folded into `pressLabelStyle`'s
  // transform array (a fixed glyph-centring nudge vs. icons — see that
  // worklet's comment for why it can't live on the static wrapper); it never
  // varies with selection so it can't move the text.
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

  // Compact (flex:0, icon shrinks to its glyph width) only when the tab is
  // purely chrome — no label AND no sub-label text. A sub-label-only tab
  // (icon main row + status word above) needs the full flex column to host
  // the status word, so it stays flex:1 like a labeled tab.
  const iconOnly = spec.label == null && spec.subLabel == null
  return (
    <AnimatedPressable
      style={[styles.tab, iconOnly && styles.tabCompact]}
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
          <Animated.View
            key="label"
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
          never clips and the tab width never reflows as it morphs. All
          four text layers fill the band and centre via `styles.label`'s
          textAlign + lineHeight==rowHeight, so the glyph centre lands on
          the exact same Y as a normal tab's label. pulseAnim + pressStyle
          match the normal cluster so alert/press feel identical. */}
      {isMorph ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.labelMorphBand, pulseAnim, pressStyle]}
        >
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
      ) : null}
    </AnimatedPressable>
  )
}

const styles = StyleSheet.create({
  // overflow: 'visible' is the default on RN View, but call it out — the
  // sub-label rides above the mainRow via absolute positioning and the
  // strip must not clip it into the home shell's PRIMARY-colored top padding.
  outer: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
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
  // chipStyle animates both `width` (interpolated tab width) and
  // `translateX` (slide). Single-line; the sub-label timer floats above.
  indicator: {
    position: 'absolute',
    left: 0,
    bottom: -TAB.indicatorPadV,
    // width is animated by chipStyle (interpolated tab width).
    height: TAB.rowHeight + TAB.indicatorPadV * 2,
    borderRadius: TAB.indicatorRadius,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: HEADER_PILL_BORDER,
    backgroundColor: HEADER_PILL_FILL,
    boxShadow: HEADER_PILL_SHADOW,
  },
  // Fixed-height tab: only mainRow is in the natural flow, so the tab's
  // layout box is always exactly TAB.rowHeight whether or not a timer is
  // showing above. The timer is rendered absolutely (see subLabelRow below).
  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: RADII.sm,
  },
  // Icon-only tab: shrinks to content width so the labeled tabs absorb the
  // freed flex. Wider horizontal padding gives the small glyph an honest tap
  // target without bloating the visual footprint.
  tabCompact: {
    flex: 0,
    // Wide padding so the compact end tab is comfortably wider than its
    // glyph; the fixed-width chip (TAB.indicatorWidth, centred on the tab)
    // then sits around the glyph with even breathing room and stays clear
    // of the screen edge. Not a screen-edge margin per se — the chip width
    // is the constraint, this just gives it room.
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
  // Anchor for the absolutely-positioned muted overlay layer. The CONSTANT
  // upward glyph-centring nudge (−TAB.labelLift) is intentionally NOT set
  // here: it is folded into `pressLabelStyle`'s transform array, because a RN /
  // Reanimated style array REPLACES (never merges) `transform`, so the press
  // worklet would silently clobber a static transform on this wrapper and the
  // nudge would never apply. Keep this style transform-free.
  labelStack: {
    position: 'relative',
  },
  // Absolute-positioned slot ABOVE the mainRow. `bottom` is set so the
  // sub-label (timer) clears the selected-tab chip's top edge with a clean
  // gap: chip top = rowHeight + indicatorPadV above the tab bottom, so
  // anchoring the timer at chip-top + SM keeps it floating just above the
  // pill as a caption, never clipped by it. Because the slot is absolute it
  // doesn't add to the tab's natural height — the labels never shift Y when
  // it appears or disappears. The flex row layout lives on the inner wrapper
  // (subLabelRow) so the outer Animated.View can carry the entering/exiting
  // layout animation without colliding with the animated opacity pulse on
  // the inner row.
  subLabelOuter: {
    position: 'absolute',
    bottom: TAB.rowHeight + TAB.indicatorPadV + SM,
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
  subLabelSpacer: {
    opacity: 0,
  },
  subLabel: {
    fontSize: TEXT.md,
    lineHeight: TEXT.md,
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
    // below the text. No tab ever co-renders a label with a sibling icon
    // (Menu/collapsed-Side are icon-only; Home/labelled-Side are label-only —
    // see home.tsx tabSpecs), so this does not affect icon alignment, which
    // is handled independently via indicatorStack/iconBaselineNudge.
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
  // + height:rowHeight pins it exactly where mainRow sits (the tab is a
  // flex-end column, mainRow is its bottom-most rowHeight block, the
  // sub-label floats absolutely above it) so the morphing word shares the
  // normal label's Y. left/right:0 on the flex:1 tab gives both words the
  // full tab width to render and centre in — no clip, no width reflow.
  labelMorphBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: TAB.rowHeight,
  },
  // See labelStack: the +TAB.iconBaselineNudge centring nudge is folded into
  // `pressIndicatorStyle`'s transform array, not set here, so the press
  // worklet's transform can't clobber it.
  indicatorStack: {
    position: 'relative',
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
