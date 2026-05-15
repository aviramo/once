import { useEffect } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import Animated, {
  useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withTiming,
  FadeInDown, FadeOutUp,
  type SharedValue,
} from 'react-native-reanimated'
import { Text } from './AppText'
import { WHITE, WHITE_MID } from '../colors'
import { FONT_SCALE } from '../fonts'
import { tap } from '../lib/haptics'
import { SM, RADII, TEXT, WEIGHT, ICON, TAB } from '../tokens'

// Global tab strip used at the top of the home shell. Three equal-width tabs.
// The "selected" indicator is pure typography — no pill, no underline. Each
// label reads its own selectedness from the PagerView swipe `progress` shared
// value (`t = max(0, 1 - |progress - index|)`) and renders two stacked layers
// that cross-fade as you swipe into the tab:
//   - active layer: extrabold (800), full WHITE,   opacity = t
//   - muted  layer: semibold  (600), WHITE_MID,     opacity = 1 - t
// The active (heavier) layer drives the natural width so the muted overlay
// can't widen the row mid-transition. fontWeight itself can't be animated
// (it changes the font face, not a numeric value), so the cross-fade is the
// only way to morph weight continuously while keeping the swipe 1:1. The
// container also gets a subtle 1.0 → TAB.selectedScale lift on top of the fade.
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
  return (
    <View style={styles.outer}>
      <View style={styles.row}>
        {tabs.map((spec, i) => (
          <TabButton
            key={i}
            spec={spec}
            index={i}
            progress={progress}
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
  onPress,
}: {
  spec: TabSpec
  index: number
  progress: SharedValue<number>
  onPress: () => void
}) {
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
  const subPulse = useSharedValue(1)
  useEffect(() => {
    if (spec.subLabelPulsing) {
      subPulse.value = withRepeat(
        withTiming(TAB.subLabelPulseOpacity, { duration: TAB.subLabelPulsePhaseMs }),
        -1,
        true,
      )
    } else {
      subPulse.value = withTiming(1)
    }
  }, [spec.subLabelPulsing])
  // The sub-label cluster carries the continuous heartbeat AND must also
  // ride the finite attention pulse from `alerting` so all text in the tab
  // (main label + timer / sub-label) blinks as one unit. Multiplying the two
  // shared values keeps each effect's logic independent: at rest both are 1,
  // alerting alone yields alertOpacity, heartbeat alone yields subPulse, and
  // if both ever overlap they compose naturally.
  const subPulseAnim = useAnimatedStyle(() => ({
    opacity: subPulse.value * alertOpacity.value,
  }))

  const stackStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - index)
    const t = Math.max(0, 1 - d)
    return { transform: [{ scale: 1 + t * (TAB.selectedScale - 1) }] }
  })
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

  // Compact (flex:0, icon shrinks to its glyph width) only when the tab is
  // purely chrome — no label AND no sub-label text. A sub-label-only tab
  // (icon main row + status word above) needs the full flex column to host
  // the status word, so it stays flex:1 like a labeled tab.
  const iconOnly = spec.label == null && spec.subLabel == null
  return (
    <Pressable
      style={[styles.tab, iconOnly && styles.tabCompact]}
      onPress={onPress}
      hitSlop={SM}
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
      <View style={styles.mainRow}>
        {spec.renderLeading != null ? (
          // Leading slot does NOT cross-fade with selection — the glyph
          // carries its own meaning (e.g. "broadcast live") and must stay
          // visible whether or not the tab is currently selected. Its own
          // animation (continuous pulse) is driven inside the glyph.
          <View style={styles.leadingStack} pointerEvents="none">
            {spec.renderLeading()}
          </View>
        ) : null}
        {spec.label != null ? (
          <Animated.View style={[styles.labelStack, stackStyle, pulseAnim]}>
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
        ) : null}
        {spec.renderIndicator != null ? (
          // Stack two icon copies and cross-fade between WHITE (selected) and
          // WHITE_MID (un-selected) by opacity. Can't animate the icon's color
          // prop directly since it's baked into the SVG at render time, so the
          // layered-opacity trick is the cheap equivalent. The muted layer
          // overlays the active one absolutely so it doesn't widen the row.
          <Animated.View style={[styles.indicatorStack, pulseAnim]}>
            <Animated.View style={activeStyle}>
              {spec.renderIndicator(WHITE)}
            </Animated.View>
            <Animated.View style={[styles.indicatorOverlay, mutedStyle]}>
              {spec.renderIndicator(WHITE_MID)}
            </Animated.View>
          </Animated.View>
        ) : null}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  // overflow: 'visible' is the default on RN View, but call it out — the
  // sub-label rides above the mainRow via absolute positioning and the
  // strip must not clip it into the home shell's PRIMARY-colored top padding.
  outer: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-end' },
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
    paddingHorizontal: SM,
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
  labelStack: {
    position: 'relative',
  },
  // Absolute-positioned slot directly above the mainRow. `bottom` is set
  // just inside the mainRow's top so the clock sits tight against the
  // label glyphs (same -SM overlap the old natural-flow layout produced
  // via marginBottom). Because the slot is absolute, it doesn't add to
  // the tab's natural height — the labels never shift Y when it
  // appears or disappears. The flex row layout lives on the inner
  // wrapper (subLabelRow) so the outer Animated.View can carry the
  // entering/exiting layout animation without colliding with the
  // animated opacity pulse on the inner row.
  subLabelOuter: {
    position: 'absolute',
    bottom: TAB.rowHeight - SM,
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
  },
  subLabelMuted: {
    fontWeight: WEIGHT.semibold,
    color: WHITE_MID,
  },
  label: {
    fontSize: TEXT.xl,
    // Force the text line-box to match the icon size so flex center-alignment
    // lands the label's visual center at the same Y as a sibling icon. Without
    // this the default lineHeight makes the text-box taller than the icon, and
    // Hebrew glyphs sit in its upper portion, making the icon read as "too low".
    lineHeight: ICON.xxl,
    includeFontPadding: false,
    textAlignVertical: 'center',
    textAlign: 'center',
  },
  labelActive: {
    fontWeight: WEIGHT.extrabold,
    color: WHITE,
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
  indicatorStack: {
    position: 'relative',
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
