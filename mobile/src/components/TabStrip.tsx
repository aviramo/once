import { useEffect } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import Animated, {
  useAnimatedStyle, useSharedValue,
  withRepeat, withSequence, withTiming, Easing,
  type SharedValue,
} from 'react-native-reanimated'
import { Text } from './AppText'
import { WHITE, WHITE_MID, PRIMARY } from '../colors'
import { FONT_SCALE } from '../fonts'
import { tap } from '../lib/haptics'
import { SINGLE, RADII, TEXT, WEIGHT, ICON } from '../tokens'

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
// container also gets a subtle 1.0 → 1.04 scale lift on top of the fade.
//
// Chips (unread / viewer counts / pending-invite alerts) and the menu-tab
// pause indicator stay un-animated — they carry semantic state and should
// be equally readable whether or not their tab is selected.

const AnimatedText = Animated.createAnimatedComponent(Text)

export type TabChip = {
  value: string | number
  bg?: string
  fg?: string
}

export type TabSpec = {
  label: string
  /** When provided, replaces the text label with an icon (e.g. "✕" for the
   * menu tab while the profile sheet is open). The render fn receives the
   * coral fg color so the icon matches the labels. */
  renderIcon?: (color: string) => React.ReactNode
  chip?: TabChip | null
  /** Small status indicator rendered next to the label when no chip is
   * present. Used by the menu tab to flag pause mode with a coral pause
   * icon; coexists with chip by deferring to chip when both are set (chip
   * is more informative). */
  indicator?: React.ReactNode
  /** Pulses the chip or indicator opacity for ~3s to draw attention. */
  alerting?: boolean
}

const ROW_HEIGHT = 32
const CHIP_HEIGHT = 18

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
  useEffect(() => {
    if (spec.alerting) {
      alertOpacity.value = withRepeat(
        withSequence(
          withTiming(0.15, { duration: 300, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 300, easing: Easing.inOut(Easing.sin) }),
        ),
        6,
        false,
      )
    } else {
      alertOpacity.value = withTiming(1, { duration: 150 })
    }
  }, [spec.alerting])
  const pulseAnim = useAnimatedStyle(() => ({ opacity: alertOpacity.value }))

  const stackStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - index)
    const t = Math.max(0, 1 - d)
    return { transform: [{ scale: 1 + t * 0.04 }] }
  })
  const activeStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - index)
    const t = Math.max(0, 1 - d)
    return { opacity: t }
  })
  const mutedStyle = useAnimatedStyle(() => {
    const d = Math.abs(progress.value - index)
    const t = Math.max(0, 1 - d)
    return { opacity: 1 - t }
  })

  const chipBg = spec.chip?.bg ?? WHITE
  const chipFg = spec.chip?.fg ?? PRIMARY

  return (
    <Pressable style={styles.tab} onPress={onPress} hitSlop={SINGLE}>
      {spec.chip != null ? (
        <Animated.View
          style={[
            styles.chip,
            { backgroundColor: chipBg },
            pulseAnim,
          ]}
        >
          <Text
            style={[styles.chipText, { color: chipFg }]}
            maxFontSizeMultiplier={FONT_SCALE.ui}
            numberOfLines={1}
          >
            {String(spec.chip.value)}
          </Text>
        </Animated.View>
      ) : spec.indicator != null ? (
        <Animated.View style={pulseAnim}>{spec.indicator}</Animated.View>
      ) : null}
      {spec.renderIcon ? (
        spec.renderIcon(WHITE)
      ) : (
        <Animated.View style={[styles.labelStack, stackStyle]}>
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
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  outer: { width: '100%' },
  row: { flexDirection: 'row', height: ROW_HEIGHT },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: RADII.sm,
    paddingHorizontal: RADII.sm,
  },
  labelStack: {
    position: 'relative',
  },
  label: {
    fontSize: TEXT.base,
    // Force the text line-box to match the icon size so flex center-alignment
    // lands the label's visual center at the same Y as a sibling icon. Without
    // this the default lineHeight makes the text-box taller than the icon, and
    // Hebrew glyphs sit in its upper portion, making the icon read as "too low".
    lineHeight: ICON.sm,
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
  chip: {
    minWidth: CHIP_HEIGHT,
    height: CHIP_HEIGHT,
    paddingHorizontal: RADII.sm,
    borderRadius: RADII.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: TEXT.tiny,
    fontWeight: WEIGHT.extrabold,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
})
