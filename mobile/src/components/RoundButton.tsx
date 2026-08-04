import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { PHOTO_CHROME, INK, WHITE } from '../colors'
import { ROUND_BUTTON_SIZE, NOTIFY_DOT_SIZE, NOTIFY_DOT_RING, CARD_SHADOW, PRESSED_OPACITY } from '../tokens'
import { FIXED_BOX_SCALE } from '../fonts'
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
  /** Overlay the notification dot on the button's upper-END arc — "there is
   *  something here for you" (unread messages on the card's chat action,
   *  someone waiting on an answer on home's menu button). */
  badge?: boolean
  /** THE SAME CORNER, ANOTHER MARK (user directive 2026-08-01). One slot on this
   *  button's arc, whatever is standing in it: the dot above says there is
   *  something here, and this says what pressing it SPENDS — the credit gem on
   *  the incoming invitation's accept. Placed by the same 45° geometry, so two
   *  buttons' marks can never sit at two different points; a host that passes
   *  one instead of `badge` is choosing what the corner says, not where it is. */
  marker?: ReactNode
  children: ReactNode
  style?: StyleProp<ViewStyle>
}

export function RoundButton({
  size = ROUND_BUTTON_SIZE,
  // Same translucent bordeaux the on-photo Chip uses, so round overlay buttons
  // and the profile chips read as one consistent fabric over the photo.
  // Single source: the shared PHOTO_CHROME token.
  bg = PHOTO_CHROME,
  borderColor,
  borderWidth,
  shadow = true,
  onPress,
  disabled,
  hitSlop = 12,
  accessibilityLabel,
  badge = false,
  marker,
  children,
  style,
}: RoundButtonProps) {
  // The dot is one fixed size on every button; only its placement is per-size.
  // It sits ON the arc rather than in the empty corner of the square: its
  // centre lands on the 45° point, so the inset off each edge is
  // R - R/√2 - dot/2 — negative on a small button, where the disc straddles
  // the arc with more of it outside. Nothing clips it (no ancestor of a round
  // button hides overflow at that scale).
  const dotInset = (size / 2) * (1 - Math.SQRT1_2) - NOTIFY_DOT_SIZE / 2
  // THE POINT ITSELF, for a marker whose size this button does not know: the 45°
  // point on the arc, with no half-size term because what is pinned to it is a
  // zero-size ANCHOR rather than a box (see styles.marker). Anything standing in
  // the slot is then centred on the same point the dot's centre lands on,
  // whatever its size — one geometry, two marks.
  const markerPoint = (size / 2) * (1 - Math.SQRT1_2)
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
          on one without. Pinning the ceiling to FIXED_BOX_SCALE keeps the single
          ROUND_BUTTON_GLYPH_RATIO true on every device. This is the ONE thing in
          the app that does not take FONT_SCALE, and it is geometry, not type. */}
      <GlyphScale cap={FIXED_BOX_SCALE}>
        <View pointerEvents="none" style={styles.inner}>{children}</View>
      </GlyphScale>
      {marker
        ? (
          <View pointerEvents="none" style={[styles.marker, { top: markerPoint, end: markerPoint }]}>
            {/* OUT OF FLOW, and that is the whole trick: an in-flow child of a
                zero-size box is measured against zero — clamped, or laid out one
                character per line. Yoga measures an ABSOLUTE child with no width
                and no opposing insets at its natural size instead, and still
                places it by the parent's own align/justify. The same anchor the
                dock's markers stand in (OptionStrip). */}
            <View style={styles.markerFree}>{marker}</View>
          </View>
        )
        : badge ? <NotifyDot style={{ top: dotInset, end: dotInset }} /> : null}
    </Pressable>
  )
}

// THE "there is something here for you" marker — one implementation, one size,
// wherever it appears (user directive 2026-07-28): unread messages on the card's
// chat action, someone waiting on an answer on home's menu button, and the
// Circles tile on home's dock. It is the same object in all of them, so it is
// the same component; only WHERE it is pinned is the host's, because that is
// geometry (an arc's 45° point on a circle, a corner on a tile) rather than a
// token. Never hand-roll a second dot beside a control.
export function NotifyDot({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View pointerEvents="none" style={[styles.badge, style]} />
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
  // The app's one lift at double the stop: a white disc floating on a
  // photograph has no card edge to be read against — which is the stop the
  // whole app took on 2026-08-04, so this is the app's one CARD_SHADOW now.
  shadow: { boxShadow: CARD_SHADOW },
  // Solid INK disc in a WHITE ring — the ring is what keeps it off the white
  // button under it and off any photo behind it. Only its offsets are
  // per-button (they follow the diameter's arc); the disc itself is fixed.
  // A mark in the badge's own corner: a POINT, not a box — zero on both axes, at
  // the 45° point of the arc, with its content centred on it both ways. Sizing
  // this to the dot and letting a bigger mark overflow is what put the credit
  // capsule visibly off its own circle (user, 2026-08-01).
  marker: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerFree: { position: 'absolute' },
  badge: {
    position: 'absolute',
    width: NOTIFY_DOT_SIZE,
    height: NOTIFY_DOT_SIZE,
    borderRadius: NOTIFY_DOT_SIZE / 2,
    backgroundColor: INK,
    borderWidth: NOTIFY_DOT_RING,
    borderColor: WHITE,
  },
  disabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: PRESSED_OPACITY,
  },
})
