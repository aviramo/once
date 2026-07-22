import { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Text } from './AppText'
import { Path, Circle, Rect } from 'react-native-svg'
import { Glyph } from './icons'
import { FONT_SCALE, iconScale, inkOffset } from '../fonts'
import { isRTL as localeIsRTL } from '../i18n'
import { SM, MD, RADIUS, TEXT, WEIGHT, ICON, PULSE, STROKE, lh } from '../tokens'
import { PHOTO_CHROME, BORDER_STRONG, GREEN, GREEN_WASH, ORANGE, ORANGE_SOFT, ONLINE_GREEN, PRIMARY } from '../colors'

// Shared pill chip used across cards (watcher list + match card). A soft
// tint of the tone color as background + same-hue icon/text — chips read as
// lightweight fabric swatches instead of bordered stickers. When `onPhoto`
// is set, the chip switches to the shared on-photo chrome: an opaque WHITE
// tile carrying BLACK ink, so it stays readable over any colour photo. State-presence chips (online, proximate,
// kids-affinity) add a `renderTrailing` dot via `PresenceDot`; it is handed
// the chip's own ink colour, so on a photo the dot is gold like the label.
//
// RTL strategy: use `direction:'rtl'` on the chip View (and the inner text
// wrapper) so the Yoga node renders right-to-left regardless of whether
// I18nManager.forceRTL() has propagated to the native root yet. Combined
// with textAlign+writingDirection on the Text for multi-line wrap. If the
// chip still renders LTR on iOS, the native side hasn't picked up forceRTL
// at all — that requires a cold restart of the app (closing it fully from
// the app switcher and reopening), since `forceRTL` updates a native
// preference applied only at app startup.
const isRTL = localeIsRTL

const TONES = {
  // Green ink on a pale GREEN tile. The fill used to be the muted alpha ramp,
  // which composites over the warm page into something the eye reads as grey —
  // so the chip sat outside the palette. GREEN_WASH is the solid half-green
  // that keeps it inside it.
  neutral:  { fg: GREEN,  bg: GREEN_WASH },
  // Orange on an orange wash — the positive hue, never the action green.
  positive: { fg: ORANGE, bg: ORANGE_SOFT },
  // "Do this" rather than "here is a fact". Same white tile as every other
  // on-photo chip — the tile is the fabric of the card and an add-chip is not
  // a foreign object on it — but the ink is the brand orange instead of the
  // reading green. Colour alone carries the difference, which is why this tone
  // opts out of the on-photo ink override below.
  action:   { fg: PRIMARY, bg: PHOTO_CHROME },
} as const

type ChipTone = keyof typeof TONES

// ── Where a chip label is allowed to break ─────────────────────────────────
// A chip label is a compound of short facts: "6.4 mi away, 1 day ago",
// "Has 3 kids (-, 5, 0), no more kids, busy weekend". The chips column is
// narrow (it shares the card's bottom with the action stack), so these wrap —
// and greedy wrapping breaks at whatever space happens to overflow, landing
// inside a phrase: "6.4 mi away, 1 / day ago", "Has 3 kids (-, / 0)".
//
// A line breaker has no notion of "preferred" break, only "possible" one — so
// the fix is to leave it only the seams BETWEEN phrases: after a top-level
// comma, and before a parenthetical. Inside a phrase every space becomes a
// NO-BREAK space. Nothing is forced: a label that fits still renders on one
// line, and one that doesn't breaks where the meaning breaks.
const NBSP = '\u00a0'
// Longer than this, a phrase keeps its ordinary spaces. Glued it would offer
// the breaker no seam at all, and a phrase too wide for the column would then
// be split mid-word — worse than the ragged break we started from. The number
// is the widest phrase the column comfortably fits, in characters.
const PHRASE_GLUE_MAX = 20

export function phraseWrap(label: string): string {
  const phrases: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < label.length; i++) {
    const c = label[i]
    if (c === '(') {
      depth++
      // Seam before a parenthetical, so "(ages)" travels as one piece.
      if (depth === 1 && i > start && label[i - 1] === ' ') {
        phrases.push(label.slice(start, i - 1))
        start = i
      }
    } else if (c === ')') {
      depth = Math.max(0, depth - 1)
    } else if (c === ',' && depth === 0 && label[i + 1] === ' ') {
      // Seam after a top-level comma — the comma stays with its phrase, the
      // space after it is dropped and re-added as the joining break.
      phrases.push(label.slice(start, i + 1))
      start = i + 2
    }
  }
  phrases.push(label.slice(start))
  return phrases
    .map(p => (p.length <= PHRASE_GLUE_MAX ? p.replace(/ /g, NBSP) : p))
    .join(' ')
}

// A chip's outer height, derived from the same tokens its padding box is
// built from (see `styles.chip`). Exported so anything that has to sit level
// with a chip — the leading glyph of the settings groups row — centres against
// the real height instead of a hand-tuned margin that drifts when the tokens
// move.
export const CHIP_HEIGHT = lh(TEXT.sm) + 2 * SM

export function Chip({
  renderIcon,
  text,
  tone = 'neutral',
  onPhoto = false,
  outlined = false,
  renderTrailing,
  onPress,
}: {
  renderIcon?: (color: string) => React.ReactNode
  text: string
  tone?: ChipTone
  onPhoto?: boolean
  /** No fill, just a light green rule. For a chip that ADDS something rather
   * than reporting a fact — it reads as an empty slot waiting to be filled,
   * which a solid chip cannot. */
  outlined?: boolean
  renderTrailing?: (color: string) => React.ReactNode
  /** When provided, the chip itself becomes the Pressable. Avoids an extra
   * wrapper View that would break the flexShrink chain — wrapping a
   * flexShrink:1 chip in a plain Pressable hides the shrink hint from the
   * parent row, so the chip stops wrapping and overflows the column. */
  onPress?: () => void
}) {
  const { fg, bg } = TONES[tone]
  // On a photo the chip is the shared WHITE chrome tile carrying GREEN ink.
  // The white tile is what supplies the contrast — the photo underneath is
  // arbitrary — which is exactly what frees the label and glyph to be the
  // brand green rather than a neutral black. The `action` tone opts out of the
  // ink half: it wears the same white tile, and its orange ink is the whole of
  // what separates a "do this" from the facts beside it.
  const asChrome = onPhoto && tone !== 'action'
  const bgColor = asChrome ? PHOTO_CHROME : bg
  const glyphColor = asChrome ? GREEN : fg
  const Container: any = onPress ? Pressable : View
  return (
    <Container
      onPress={onPress}
      style={[styles.chip, outlined ? styles.chipOutlined : { backgroundColor: bgColor }]}
    >
      {renderIcon ? <View style={styles.glyphWrap}>{renderIcon(glyphColor)}</View> : null}
      <Text
        style={[styles.chipText, { color: glyphColor }]}
        maxFontSizeMultiplier={FONT_SCALE.heading}
      >
        {phraseWrap(text)}
      </Text>
      {renderTrailing ? <View style={styles.glyphWrap}>{renderTrailing(glyphColor)}</View> : null}
    </Container>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────
// All chip icons render at ICON.sm so chips share one baseline across cards.

// The three location-anchor icons (pin / home / work) are shared between the
// distance chip (default ICON.sm so the chip rhythm is stable) and the
// settings location picker (larger via the size prop) — one glyph family,
// one source of truth per type.
export function PinIcon({ color, size = ICON.sm }: { color: string; size?: number }) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={9} r={2.5} stroke={color} strokeWidth={2} />
    </Glyph>
  )
}

// 'home' anchor (also the legacy location_custom variant — manually picked
// address rather than GPS).
export function HomeIcon({ color, size = ICON.sm }: { color: string; size?: number }) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M3 11l9-8 9 8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M5 10v10h14V10" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M10 20v-5h4v5" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Glyph>
  )
}

// 'work' anchor — briefcase. Same baseline as the others.
export function WorkIcon({ color, size = ICON.sm }: { color: string; size?: number }) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={7} width={18} height={13} rx={2} stroke={color} strokeWidth={2} />
      <Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 13h18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Glyph>
  )
}

export function ClockIcon({ color }: { color: string }) {
  return (
    <Glyph width={ICON.sm} height={ICON.sm} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M12 7v5l3 3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Glyph>
  )
}

export function KidsIcon({ color }: { color: string }) {
  return (
    <Glyph width={ICON.sm} height={ICON.sm} viewBox="0 0 24 24" fill="none">
      <Circle cx={8} cy={7} r={3} stroke={color} strokeWidth={2} />
      <Path d="M2 21v-2a6 6 0 0 1 12 0v2" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={17} cy={10} r={2.2} stroke={color} strokeWidth={2} />
      <Path d="M13 21v-1a4 4 0 0 1 8 0v1" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Glyph>
  )
}

// Small presence dot used as a chip trailing affordance. 7px filled circle,
// hue carries the meaning: green (default) = "right now" / "right here" on
// time + distance chips; white = kids-affinity chip (readable on the dark
// photo scrim, where a black/brand dot would disappear). When
// `pulsing` is set, opacity loops 1 ↔ PULSE.opacity continuously to signal a
// live ongoing state (today: the chat partner being online).

const PRESENCE_DOT_SIZE = 7

export function PresenceDot({ color = ONLINE_GREEN, pulsing = false }: { color?: string; pulsing?: boolean }) {
  const opacity = useSharedValue(1)
  useEffect(() => {
    if (pulsing) {
      opacity.value = withRepeat(withTiming(PULSE.opacity, { duration: PULSE.phaseMs }), -1, true)
    } else {
      opacity.value = withTiming(1)
    }
  }, [pulsing])
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  return <Animated.View style={[styles.presenceDot, { backgroundColor: color }, animStyle]} />
}


const styles = StyleSheet.create({
  chip: {
    direction: isRTL ? 'rtl' : 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SM,
    paddingHorizontal: MD,
    paddingVertical: SM,
    borderRadius: RADIUS,
    flexShrink: 1,
  },
  // The rule is drawn OUTSIDE the padding box, so an outlined chip would sit
  // taller and wider than the filled chips beside it. Pull the padding in by
  // exactly the border width: same tokens, same outer rectangle, so a row of
  // chips keeps one height whichever variant it holds.
  chipOutlined: {
    backgroundColor: 'transparent',
    borderWidth: STROKE.thin,
    borderColor: BORDER_STRONG,
    paddingHorizontal: MD - STROKE.thin,
    paddingVertical: SM - STROKE.thin,
  },
  // Same treatment the settings select rows use (selectRowIconWrap): a box
  // exactly one text-line tall, top-aligned, so the glyph centres against the
  // FIRST line of a wrapped chip label instead of drifting into the gap
  // between the two lines. marginTop lands it on that line's ink rather than
  // on its line box. Single-line chips are unaffected — the box then equals
  // the row height, so top-align and centre coincide. The cap matches the
  // label's own maxFontSizeMultiplier so box and text scale together.
  glyphWrap: {
    alignSelf: 'flex-start',
    height: iconScale(lh(TEXT.sm), FONT_SCALE.heading),
    marginTop: inkOffset(TEXT.sm, FONT_SCALE.heading),
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: TEXT.sm,
    lineHeight: lh(TEXT.sm),
    fontWeight: WEIGHT.semibold,
    flexShrink: 1,
    // textAlign:'left' is "start of writing direction": physically left in
    // LTR, physically right in RTL (after auto-flip). textAlign:'right' is
    // RN's RTL trap — it's interpreted as "end of writing direction" which
    // is physically LEFT in RTL mode. So 'left' is the correct value for
    // "align to where reading starts" in both directions.
    textAlign: 'left',
    writingDirection: isRTL ? 'rtl' : 'ltr',
  },
  presenceDot: {
    width: PRESENCE_DOT_SIZE,
    height: PRESENCE_DOT_SIZE,
    borderRadius: PRESENCE_DOT_SIZE,
  },
})
