import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { BLACK, BLACK_STRONG } from '../colors'
import { ROUND_BUTTON_SIZE } from '../tokens'
import { FONT_SCALE } from '../fonts'
import { GlyphScale } from './icons'

// Round icon-button primitive. Single source of truth for every circular tap
// target in the app:
//   - large hero-overlay affordances on MatchCard (heart / X / add-photo)
//   - small action buttons inside StatusCard (cancel / accept / reject)
//   - any future round-button surface
//
// Implementation: a plain Pressable. The original RNGH Gesture.Tap version
// was introduced to escape the RNGH ScrollView's pan recognizer while the
// action stack lived INSIDE MatchCard's PullScrollView. The stack now sits
// as a sibling to the ScrollView (see MatchCard's actionStackOverlay), so
// the cancel-on-movement issue no longer applies. We additionally observed
// that an inner Gesture.Tap inside a disabled outer GestureDetector (the
// cardPan wrapper around the home-pane match card, disabled outside the
// watching state) wasn't firing on Android — disabled-but-mounted parent
// gestures appear to swallow touches in that path. Pressable on a sibling
// of the ScrollView avoids both pitfalls.
//
// Visual axes are props, never a forked second component.

export type RoundButtonProps = {
  size?: number
  bg?: string
  borderColor?: string
  borderWidth?: number
  shadow?: boolean
  onPress: () => void
  disabled?: boolean
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number }
  accessibilityLabel?: string
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

export function RoundButton({
  size = ROUND_BUTTON_SIZE,
  // Same dark translucent scrim the on-photo Chip uses (Chip's `onPhoto`
  // background = BLACK_STRONG), so round overlay buttons and the profile
  // chips read as one consistent fabric over the photo. Single source: the
  // shared BLACK_STRONG token.
  bg = BLACK_STRONG,
  borderColor,
  borderWidth,
  shadow = true,
  onPress,
  disabled,
  hitSlop = 12,
  accessibilityLabel,
  children,
  style,
}: RoundButtonProps) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
        },
        borderColor != null && borderWidth != null ? { borderColor, borderWidth } : null,
        shadow && styles.shadow,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {/* The diameter above is a plain dp and does NOT follow the OS font
          scale, so neither may the glyph inside it — otherwise the same
          button reads crowded on a device with a bumped font scale and lost
          on one without. Pinning the ceiling to `ui` keeps the single
          ROUND_BUTTON_GLYPH_RATIO true on every device. */}
      <GlyphScale cap={FONT_SCALE.ui}>
        <View pointerEvents="none" style={styles.inner}>{children}</View>
      </GlyphScale>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shadow: {
    shadowColor: BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
})
