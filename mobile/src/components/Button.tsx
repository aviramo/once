import { cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native'
import { Text } from './AppText'
import { Spinner } from './Spinner'
import { GlyphSlot } from './GlyphSlot'
// A STACKED BUTTON IS A STRIP OPTION THAT HAPPENS TO BE FILLED, so it takes the
// shape's three values from the strip that owns it rather than restating them
// here — the mark's size, the gap under it and the word's rank (see `stack`).
import { STRIP_GLYPH, STRIP_GLYPH_GAP, STRIP_LABEL } from './OptionStrip'
import { SM, RADIUS, BUTTON_MIN_HEIGHT, TEXT, WEIGHT, DISABLED_OPACITY, PRESSED_OPACITY_BARE, CARD_SHADOW } from '../tokens'
import { INK, INK_WASH, PAGE, SURFACE, WHITE, WHITE_SOFT, WHITE_STRONG, WHITE_MID, INK_PRESSED, INK_DIM, INK_SUBTLE, LINE, PREMIUM } from '../colors'

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

// THE glyph size inside an action button, for the whole app: the icon at the
// start of the label, and the spinner that replaces it while the action is in
// flight. It IS the label's own size (TEXT.md, see BUTTON_LABEL) — literally that
// token, not an ICON tier that happens to match it — so the two read as one
// object. It came down from 24 (a glyph half again the word beside it read as the
// button's subject with the label captioning it) and then from ICON.md/18: 18
// beside a 16dp label is a glyph 12% bigger than the type it labels, standing in
// a `GlyphSlot size={TEXT.md}` that says 16, and next to Hebrew letters — whose
// ink is 0.60 em against Latin's 0.714, with no ascenders to raise the eye's
// reference — it read visibly larger than the label (user report 2026-07-30).
// Exported for the one button that cannot compose <Button> (LoginForm's tiles).
export const BUTTON_GLYPH = TEXT.md

export type Variant = 'primary' | 'secondary' | 'soft' | 'dark' | 'premium' | 'onPrimary' | 'onPrimaryGhost' | 'plain'
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
  stack,
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
  // THE MARK STANDS OVER THE LABEL, NOT BESIDE IT — a glyph with one word under
  // it, which is an `OptionStrip` option's shape (user directive 2026-07-31). For
  // a button standing NEXT TO one of those options: the group popup's purple
  // invitation beside its one quiet option, where the pair must read as the same
  // object differing only in the fill that says which of them is the offer.
  //
  // IT IS THE SHAPE ENTIRE, not the arrangement alone (user report 2026-07-31,
  // "they are not the same component"): the strip's mark size, the strip's gap
  // and the strip's WORD — one rank below the body, not the button's own label
  // type. A big mark over a small word is what makes the mark the subject; the
  // button's 16dp semibold label beside a 24dp glyph inverted that and read as a
  // different control. The glyph also leaves its GlyphSlot — that slot centres a
  // mark on a LINE of text, the wrong question when the text is underneath.
  stack?: boolean
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
  //
  // The BUTTON owns its glyph size, not the call site: the icons' own defaults
  // range from 18 to 24, so which button got which size came down to whichever
  // icon it happened to use, and the call sites that noticed patched it back
  // one by one with `size={ICON.md}` (six of them) while the rest ran a glyph
  // half again the size of the label beside it. Injected here, so every button
  // in the app carries the same object and no call site can forget.
  const glyphSize = stack ? STRIP_GLYPH : BUTTON_GLYPH
  const startIcon = loading
    ? <Spinner color={textColor} size={glyphSize} />
    : isValidElement(iconStart)
      ? cloneElement(iconStart as ReactElement<{ color?: string; size?: number }>, {
          size: glyphSize,
          ...(useVariantDisabled ? { color: textColor } : null),
        })
      : iconStart

  // Held-down feedback: the fill darkens to the variant's pressedBtn (the purple
  // buttons → deep INK_PRESSED). Only a live press on a non-blocked button shows it;
  // a tone override supplies its own pressed fill so it wins over the variant.
  const [pressed, setPressed] = useState(false)
  const pressedBtn = pressed && !blocked ? (toneSkin?.pressedBtn ?? skin.pressedBtn ?? null) : null

  return (
    <View
      style={[
        styles.wrap,
        // THE LIFT IS THE TILE'S, so a variant with no ground casts nothing (see
        // `plain`) — a shadow under nothing paints a smudge on the page.
        skin.flat ? null : styles.btn,
        base.btn,
        skin.btn,
        toneSkin?.btn,
        pressedBtn,
        useVariantDisabled ? skin.disabledBtn : (disabled && !loading && !silentDisabled && styles.disabled),
        footer ? styles.btnWithFooter : null,
        style,
      ]}
      onStartShouldSetResponder={() => !blocked || hintable}
      onResponderGrant={() => { if (!blocked) setPressed(true) }}
      onResponderRelease={() => {
        setPressed(false)
        if (!blocked) onPress()
        else if (hintable) disabledHint!()
      }}
      onResponderTerminate={() => setPressed(false)}
    >
        {/* Label area — sized identically whether or not a footer is present.
            Splitting it from the outer btn means a button-with-footer reads
            as "regular button + extra strip below" rather than "regular button
            with the label squashed up to make room". */}
        <View pointerEvents="none" style={[styles.labelArea, base.labelArea]}>
          <View style={[styles.labelRow, stack && styles.labelStack]}>
            {/* No ceiling of its own: the glyph takes the app's one FONT_SCALE
                (GlyphSlot's default), which is exactly what the label beside it
                takes, and the label area is a minHeight — it grows with them
                rather than clipping. It used to be pinned at the old
                FONT_SCALE.ui alongside a label pinned the same way, back when a
                button was the one thing that refused to answer the OS slider.
                STACKED, the mark has nothing beside it to line up with, so it
                stands in the strip's own plain centred box instead — the same
                fixed mark at every font scale as the option next to it. */}
            {startIcon ? (
              stack
                ? <View style={styles.stackGlyph}>{startIcon}</View>
                : <GlyphSlot size={TEXT.md} label={label} style={styles.startSlot}>{startIcon}</GlyphSlot>
            ) : null}
            {/* Icon-only button: an empty label drops the Text entirely rather
                than rendering a zero-width one, so the labelRow gap doesn't
                push the glyph off the button's centre. */}
            {label ? <Text
              // Stacked, the word is the strip's caption rank, not the button's
              // own label type: only the fill may tell the pair apart.
              style={[stack ? STRIP_LABEL : BUTTON_LABEL, styles.text, skin.text, useVariantDisabled && skin.disabledText]}
              numberOfLines={multiline ? 2 : 1}
              adjustsFontSizeToFit={!multiline}
              minimumFontScale={0.85}
            >
              {label}
            </Text> : null}
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
  // A BUTTON IS A TILE LYING ON THE PAGE, so it wears the app's one lift (user
  // directive 2026-08-03) — the same CARD_SHADOW a card, a list and a chip cast.
  // A FILL is what earns it: a mark with no ground behind it (an OptionStrip
  // option, and this component's own `plain`) casts nothing, because there is no
  // tile there to lift — which is why the lift is applied per variant.
  btn: { boxShadow: CARD_SHADOW },
  disabled: { opacity: DISABLED_OPACITY },
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
  // The mark over the word (`stack`): the same column an OptionStrip option is,
  // down to the gap between the two — the pair stands side by side and must be
  // one shape. The button's own minHeight is a FLOOR under it, so a stacked
  // button is a few dp taller than a plain one and never shorter.
  labelStack: { flexDirection: 'column', gap: STRIP_GLYPH_GAP },
  // The stacked mark's box: no line of text to centre on (see the render), so it
  // is the strip's — a plain centred box at the mark's own size, which keeps the
  // word under it from riding up when the glyph is the smaller of the two.
  stackGlyph: { minHeight: STRIP_GLYPH, alignItems: 'center', justifyContent: 'center' },
  // Fixed-width start slot: whatever sits here (a provided iconStart or the
  // loading Spinner) is centered inside exactly BUTTON_GLYPH — the size both of
  // them are given above. This is what keeps the label from shifting when a tap
  // swaps the icon for the spinner. Content wider than a glyph (e.g. the
  // credit-cost badge on the invite button) grows past the minWidth and is the
  // one place a swap can still move the label.
  startSlot: {
    minWidth: BUTTON_GLYPH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    textAlignVertical: 'center',
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

// THE type of an action button's label, for the whole app. Exported because one
// button CANNOT compose <Button>: the SSO provider tiles (LoginForm) must read
// as a white field-skin tile with the platform brand mark pinned to the start
// edge, so they are their own Pressable — and before this they re-typed a label
// style that had already drifted (-0.3 tracking against this -0.2). A button
// that has to be built by hand still takes its type from here.
//
// `size` does not change the type: an lg and an md button differ in height and
// padding, not in how their label sets.
//
// TEXT.md, the body rank (user directive 2026-07-28). A button label is not a
// heading — it names an action in the same voice the rest of the surface speaks,
// and at TEXT.lg it was setting one rank ABOVE the popup text that explains it.
// The semibold weight and the fill are what mark it as the thing to press.
export const BUTTON_LABEL: TextStyle = {
  fontSize: TEXT.md,
  fontWeight: WEIGHT.medium,
  letterSpacing: -0.2,
  textAlign: 'center',
  includeFontPadding: false,
}

const SIZE: Record<Size, { btn: object; labelArea: object }> = {
  lg: {
    btn: { borderRadius: RADIUS },
    labelArea: { minHeight: BUTTON_MIN_HEIGHT, paddingVertical: SM },
  },
  md: {
    btn: { borderRadius: RADIUS },
    labelArea: { paddingVertical: SM },
  },
}

// The `positive` tone once wore the action BRAND_MARK for the invite pair; since the
// app unified onto ONE purple (user directive 2026-07-25) it resolves to the same
// INK as every other button, kept only so existing call sites stay valid.
// Held down it darkens to INK_PRESSED like every purple button.
const TONE: Record<Tone, { btn: object; pressedBtn: object }> = {
  positive: {
    btn: { backgroundColor: INK },
    pressedBtn: { backgroundColor: INK_PRESSED },
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
  // Fill while the button is HELD DOWN. The purple fills darken to the deep
  // INK_PRESSED step (user directive 2026-07-25: pressing a button = dark purple);
  // the recessive ones step one shade darker so the press still reads.
  pressedBtn?: object
  // This variant has NO GROUND, so it casts no lift (see styles.btn).
  flat?: boolean
}> = {
  // Disabled is a LIGHT INK fill carrying a FULL-STRENGTH purple label, not
  // the global opacity fade. Two separate problems that fade caused: the solid
  // purple washed out to near-invisible on the page, and a muted label on
  // top of that was unreadable. The pale fill alone says "not yet"; the label
  // stays legible so the user can still read what the action is.
  primary: {
    btn: { backgroundColor: INK },
    text: { color: WHITE },
    disabledBtn: { backgroundColor: INK_WASH },
    disabledText: { color: INK },
    pressedBtn: { backgroundColor: INK_PRESSED },
  },
  secondary: {
    btn: { backgroundColor: PAGE },
    text: { color: INK_SUBTLE, fontWeight: WEIGHT.medium },
    pressedBtn: { backgroundColor: INK_DIM },
  },
  // A BUTTON WITH NO GROUND AT ALL (user directive 2026-08-07): no fill, no rim,
  // no lift — the glyph and the word standing on the page itself, in the app's
  // own tap target. It is `secondary` with the tile taken away, which is exactly
  // what a quiet action beside the one purple offer needs: `secondary`'s PAGE
  // fill is a shade off the page it lies on, so what actually drew the outline
  // was the lift under it, and a barely-there tile reads as a frame around the
  // words rather than as something to press. Same object as an OptionStrip
  // option, down to the press fade — the ink answers the finger, because there
  // is no surface here to flash.
  plain: {
    btn: {},
    text: { color: INK_SUBTLE, fontWeight: WEIGHT.medium },
    pressedBtn: { opacity: PRESSED_OPACITY_BARE },
    flat: true,
  },
  soft: {
    btn: { backgroundColor: INK_SUBTLE },
    text: { color: WHITE },
    pressedBtn: { backgroundColor: INK_PRESSED },
  },
  dark: {
    btn: { backgroundColor: INK },
    text: { color: WHITE },
    pressedBtn: { backgroundColor: INK_PRESSED },
  },
  // The one action purple, so the label is white. Held down → deep INK_PRESSED.
  premium: {
    btn: { backgroundColor: PREMIUM },
    text: { color: WHITE },
    pressedBtn: { backgroundColor: INK_PRESSED },
  },
  // White button sized for placement on top of a filled INK surface.
  // The white fill (the same lift as every other surface) keeps the CTA legible
  // against the purple. Held down it steps to the LINE tone.
  onPrimary: {
    btn: { backgroundColor: SURFACE },
    text: { color: INK },
    disabledBtn: { backgroundColor: WHITE_SOFT },
    disabledText: { color: WHITE_STRONG },
    pressedBtn: { backgroundColor: LINE },
  },
  // Recessive companion to `onPrimary`: the secondary action when the
  // surface is INK-colored. Mirrors `secondary` (soft fill + muted
  // weight) but on the white-alpha scale so it sits on a tinted bg.
  onPrimaryGhost: {
    btn: { backgroundColor: WHITE_SOFT },
    text: { color: WHITE, fontWeight: WEIGHT.medium },
    pressedBtn: { backgroundColor: WHITE_MID },
  },
}
