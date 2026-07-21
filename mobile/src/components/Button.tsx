import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from './AppText'
import { Spinner } from './Spinner'
import { FONT_SCALE } from '../fonts'
import { SM, RADIUS, BUTTON_MIN_HEIGHT, TEXT, WEIGHT } from '../tokens'
import { WHITE, WHITE_SOFT, WHITE_STRONG, BLACK, PRIMARY, BLACK_SOFT, BLACK_STRONG, PREMIUM } from '../colors'

// App-wide button. Every pressable primary/secondary action goes
// through this component so the appearance and disabled state stay identical
// everywhere.
//
// No press animation: a tap fires onPress without any visual cue beyond the
// natural touch responder semantics. Loading replaces the start-position icon
// with a spinner painted in the label's color; the fill never shifts.
//
// Tap target is built on raw View responder callbacks rather than Pressable:
// RN 0.81's Pressability has an aggressive cancel-on-movement threshold that
// drops single taps as "pressIn + pressOut without onPress" on buttons inside
// ScrollViews (settings reset, week-start toggle) — the bare responder flow below
// fires onPress on every clean release. Termination is NOT refused, so a
// ScrollView ancestor can still steal the gesture on an actual scroll.

type Variant = 'primary' | 'secondary' | 'soft' | 'dark' | 'premium' | 'onPrimary' | 'onPrimaryGhost'
type Size = 'lg' | 'md'
// Accent tone layered on top of `primary`. Keeps the rest of the button
// spec intact (shape, text color, pressed fade) and only swaps the fill.
type Tone = 'positive'

export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  size = 'lg',
  tone,
  silentDisabled,
  disabledHint,
  iconStart,
  footer,
  multiline,
  style,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  // In-flight server wait. Blocks taps like `disabled`. The icon slot at the
  // start of the label morphs into a spinner painted in the label color; no
  // fill change, no shake, no fade.
  loading?: boolean
  variant?: Variant
  size?: Size
  tone?: Tone
  // When true, `disabled` still blocks taps but the button keeps its normal
  // appearance (no fade). Used for sibling buttons that get locked out while
  // another action in the same row is in-flight — we want the lockout, not a
  // visual flicker as the user sees every button go gray for a frame.
  silentDisabled?: boolean
  // "Disabled but explainable": when the button is `disabled` (and not
  // `loading`) AND this is set, the button KEEPS the disabled look (the
  // variant's disabled style, or the global 0.45 fade — do not also pass
  // `silentDisabled`) but stays pressable, and a tap fires this instead of
  // `onPress`. Used for the action buttons that can't be afforded (not enough
  // stars): the real action is blocked, the tap opens an explainer popup.
  // Same intent as SelectFieldRow's `locked`.
  disabledHint?: () => void
  iconStart?: ReactNode
  // Optional strip docked to the bottom edge of the button, full width,
  // clipped to the rounded corners. Used for the page2 broadcast cooldown
  // and the invite waiting timer (small time text + horizontal progress bar)
  // so the timer reads as part of the button itself, not a separate row.
  footer?: ReactNode
  // Allow the label to wrap to two lines. Strings should embed `\n` at the
  // split point. Disables auto-shrink so both lines render at full size.
  multiline?: boolean
  // Per-call container overrides (e.g. a larger borderRadius for hero buttons).
  style?: StyleProp<ViewStyle>
}) {
  const blocked = disabled || loading
  // Disabled-but-explainable: visually disabled, real action blocked, but a
  // tap is captured and routed to `disabledHint` (the explainer popup).
  const hintable = !!disabledHint && !!disabled && !loading

  const base = SIZE[size]
  const skin = VARIANT[variant]
  // Tone only overrides the fill of the primary variant. For
  // secondary and the rest the tone is ignored — they already carry their
  // own semantic color.
  const toneSkin = variant === 'primary' && tone ? TONE[tone] : null
  // Variants on dark surfaces (onPrimary) look muddy under the global
  // opacity:0.45 disabled fade — white-at-45% on pure-black is a dingy grey.
  // When a variant ships its own disabledBtn/disabledText, we use those
  // instead and skip the global fade. Re-tints iconStart to the disabled
  // label color so the icon doesn't fight the new fill.
  const useVariantDisabled = disabled && !loading && !silentDisabled && !!skin.disabledBtn
  const textColor = useVariantDisabled && skin.disabledText ? skin.disabledText.color : skin.text.color
  // While loading, swap the start-position icon (or insert one if none was
  // provided) with a spinner in the label color. End-position icons stay.
  const startIcon = loading
    ? <Spinner color={textColor} />
    : useVariantDisabled && isValidElement(iconStart)
      ? cloneElement(iconStart as ReactElement<{ color?: string }>, { color: textColor })
      : iconStart

  return (
    <View
      style={[
        styles.wrap,
        styles.btn,
        base.btn,
        skin.btn,
        toneSkin?.btn,
        useVariantDisabled ? skin.disabledBtn : (disabled && !loading && !silentDisabled && styles.disabled),
        footer ? styles.btnWithFooter : null,
        style,
      ]}
      onStartShouldSetResponder={() => !blocked || hintable}
      onResponderRelease={() => {
        if (!blocked) onPress()
        else if (hintable) disabledHint!()
      }}
    >
        {/* Label area — sized identically whether or not a footer is present.
            Splitting it from the outer btn means a button-with-footer reads
            as "regular button + extra strip below" rather than "regular button
            with the label squashed up to make room". */}
        <View pointerEvents="none" style={[styles.labelArea, base.labelArea]}>
          <View style={styles.labelRow}>
            {startIcon ? <View>{startIcon}</View> : null}
            <Text
              style={[styles.text, base.text, skin.text, useVariantDisabled && skin.disabledText]}
              numberOfLines={multiline ? 2 : 1}
              adjustsFontSizeToFit={!multiline}
              minimumFontScale={0.85}
              maxFontSizeMultiplier={FONT_SCALE.ui}
            >
              {label}
            </Text>
          </View>
        </View>
        {footer ? (
          <View pointerEvents="none" style={styles.footer}>
            {footer}
          </View>
        ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  // Fill whatever horizontal space the parent grants — lets the bottom bar
  // in home/login span full width, and the dialog row split evenly when
  // wrapped in flex:1 slots.
  wrap: { alignSelf: 'stretch' },
  btn: {},
  disabled: { opacity: 0.45 },
  // The label region of the button. Owns the size invariants (minHeight,
  // paddingVertical) so a button-with-footer keeps the exact same label-area
  // geometry as a plain button — the footer just adds height below.
  labelArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SM * 2,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SM,
  },
  text: {
    letterSpacing: -0.2,
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    flexShrink: 1,
  },
  // Clips the footer strip to the button's rounded corners. No extra padding
  // here — the footer is a sibling of the label area and adds its own height,
  // so the label area stays identical to a plain button.
  btnWithFooter: {
    overflow: 'hidden',
  },
  footer: {
    alignSelf: 'stretch',
  },
})

const SIZE: Record<Size, { btn: object; labelArea: object; text: object }> = {
  lg: {
    btn: { borderRadius: RADIUS },
    labelArea: { minHeight: BUTTON_MIN_HEIGHT, paddingVertical: SM },
    text: { fontSize: TEXT.lg, fontWeight: WEIGHT.extrabold },
  },
  md: {
    btn: { borderRadius: RADIUS },
    labelArea: { paddingVertical: SM },
    text: { fontSize: TEXT.lg, fontWeight: WEIGHT.extrabold },
  },
}

const TONE: Record<Tone, { btn: object }> = {
  positive: {
    btn: { backgroundColor: PRIMARY },
  },
}

const VARIANT: Record<Variant, {
  btn: object
  text: { color: string; fontWeight?: string }
  // Per-variant disabled overrides. When present, replace the global
  // opacity:0.45 fade — used by variants whose default fill turns muddy
  // under low alpha on a dark surface.
  disabledBtn?: object
  disabledText?: { color: string }
}> = {
  primary: {
    btn: { backgroundColor: PRIMARY },
    text: { color: WHITE },
  },
  secondary: {
    btn: { backgroundColor: BLACK_SOFT },
    text: { color: BLACK_STRONG, fontWeight: WEIGHT.semibold },
  },
  soft: {
    btn: { backgroundColor: BLACK_STRONG },
    text: { color: WHITE },
  },
  dark: {
    btn: { backgroundColor: BLACK },
    text: { color: WHITE },
  },
  // Orange fill (the positive hue), so the label is white.
  premium: {
    btn: { backgroundColor: PREMIUM },
    text: { color: WHITE },
  },
  // White button sized for placement on top of a PRIMARY (green) surface.
  // The white fill keeps the CTA legible against the green.
  onPrimary: {
    btn: { backgroundColor: WHITE },
    text: { color: PRIMARY },
    disabledBtn: { backgroundColor: WHITE_SOFT },
    disabledText: { color: WHITE_STRONG },
  },
  // Recessive companion to `onPrimary`: the secondary action when the
  // surface is PRIMARY-colored. Mirrors `secondary` (soft fill + muted
  // weight) but on the white-alpha scale so it sits on a tinted bg.
  onPrimaryGhost: {
    btn: { backgroundColor: WHITE_SOFT },
    text: { color: WHITE, fontWeight: WEIGHT.semibold },
  },
}
