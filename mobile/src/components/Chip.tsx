import { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Text } from './AppText'
import { Path, Circle, Rect } from 'react-native-svg'
import { Glyph } from './icons'
import { FONT_SCALE, iconScale, inkOffset } from '../fonts'
import { isRTL as localeIsRTL } from '../i18n'
import { XS, SM, MD, RADIUS, TEXT, WEIGHT, ICON, PULSE, STROKE, lh } from '../tokens'
import { PHOTO_CHROME, GREEN, GREEN_WASH, ONLINE_GREEN, PRIMARY, PRIMARY_BG, WHITE, LIFT_SHADOW } from '../colors'
import { OUTLINE_SKIN } from '../field'

// Shared pill chip used across cards (watcher list + match card). A soft
// tint of the tone color as background + same-hue icon/text — chips read as
// lightweight fabric swatches instead of bordered stickers. When `onPhoto`
// is set, the chip becomes a solid tile that MATCHES the round overlay buttons
// — the same PHOTO_CHROME beige fill, with the tone's own ink (user directive
// 2026-07-25, reverses the earlier transparent-white-ink-on-photo treatment):
// chips and buttons now read as one fabric of beige tiles over the photo. The
// `solid` tone is the exception — it keeps its full GREEN fill + white ink so
// the chat's "End" still reads as a strong control, not a label. State-presence
// chips (online, proximate, kids-affinity) add a `renderTrailing` dot via
// `PresenceDot`; it is handed the chip's own ink colour.
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

// A label counts as RTL when it carries any Hebrew or Arabic letter. Drives the
// "+N" word-flow row's direction off the label's OWN script (see the render),
// independent of the UI locale.
const RTL_SCRIPT = /[֐-׿؀-ۿ]/

const TONES = {
  // Green ink on a pale GREEN tile. The fill used to be the muted alpha ramp,
  // which composites over the warm page into something the eye reads as grey —
  // so the chip sat outside the palette. GREEN_WASH is the solid half-green
  // that keeps it inside it.
  neutral:  { fg: GREEN,  bg: GREEN_WASH },
  // Solid brand green with light ink: a chip that is a real "do this" control,
  // not a fact swatch. The full-strength fill (not the GREEN_WASH tint) is what
  // makes it read as a button rather than a label — used for the chat's "End".
  solid:    { fg: WHITE,  bg: GREEN },
  // Orange on an orange wash — the positive hue, never the action green.
  positive: { fg: PRIMARY, bg: PRIMARY_BG },
  // "Do this" rather than "here is a fact". Same white tile as every other
  // on-photo chip — the tile is the fabric of the card and an add-chip is not
  // a foreign object on it — but the ink is the brand orange instead of the
  // reading green. Colour alone carries the difference, which is why this tone
  // opts out of the on-photo ink override below.
  action:   { fg: PRIMARY, bg: PHOTO_CHROME },
} as const

type ChipTone = keyof typeof TONES

// A chip label made of interleaved text runs and a mini-chip cluster (the
// pale-purple pill, same fabric as the "+N" groups badge). Used by the
// family/kids chip so the ages ride as a dense little cluster of pills inside
// the sentence ("I have 3 kids [0][5][?] and want more, **busy weekend**"). A
// `text` segment carries a plain run (`bold` emphasises it — the weekend
// status); a `badges` segment carries a tight cluster of mini-chips, `ltr`
// forcing their numeric/"?" char order against an RTL paragraph.
export type ChipSegment =
  | { text: string; bold?: boolean }
  | { badges: string[]; ltr?: boolean }
  // A forced line break: the segments after it start a fresh line (the weekend
  // status wants to stand on a line of its own, not trail the kids sentence).
  | { br: true }

// Split a segment list into lines at each `br`. The lines then render as a
// COLUMN of wrapping rows rather than one row with a full-width spacer: a
// flexBasis:'100%' break item makes the wrap row claim the entire available
// width, which stretched the chip tile edge-to-edge instead of letting it hug
// its text (user directive 2026-07-27). A column hugs the widest line.
type ChipRun = Exclude<ChipSegment, { br: true }>
function segmentLines(segments: ChipSegment[]): ChipRun[][] {
  const lines: ChipRun[][] = [[]]
  for (const seg of segments) {
    if ('br' in seg) lines.push([])
    else lines[lines.length - 1].push(seg)
  }
  return lines.filter(l => l.length)
}

// The pale-purple mini-chip. Single source for both the "+N" groups hint and
// the family chip's age/weekend pills so they read as one fabric.
function Badge({ text, ltr = false }: { text: string; ltr?: boolean }) {
  return (
    <View style={styles.badge}>
      <Text style={[styles.badgeText, ltr && styles.badgeTextLtr]} maxFontSizeMultiplier={FONT_SCALE.heading}>
        {text}
      </Text>
    </View>
  )
}

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
  // A single phrase has no sibling to stay separate from, so gluing it buys
  // nothing — it only removes every word-break seam and forces a mid-word
  // break when the phrase is too wide for the narrow column (a group name like
  // "אוניברסיטת בן גוריון" split as "גורי/ון"). Keep its natural spaces so it
  // wraps at a word boundary, never inside a word.
  if (phrases.length === 1) return label
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
  segments,
  tone = 'neutral',
  onPhoto = false,
  outlined = false,
  bold = false,
  plusCount,
  renderTrailing,
  onPress,
}: {
  renderIcon?: (color: string) => React.ReactNode
  text?: string
  /** Interleaved text runs + mini-chips, an alternative to the plain `text`
   * label. When set, the chip renders these wrapping segments (used by the
   * family/kids chip) and `text`/`plusCount`/`renderTrailing` are ignored. */
  segments?: ChipSegment[]
  tone?: ChipTone
  onPhoto?: boolean
  /** When > 0, renders a small light-purple "+N" pill AFTER the text, inside
   * the same chip. Used by the group chip to hint that the pair shares more
   * groups than the one named. The "+N" is composed here (single source) and
   * mirrored under RTL so the plus stays on the reading-start side. */
  plusCount?: number
  /** No fill, just a light green rule. For a chip that ADDS something rather
   * than reporting a fact — it reads as an empty slot waiting to be filled,
   * which a solid chip cannot. */
  outlined?: boolean
  /** Heavier label weight at the SAME chip size — used for the name/age heading
   * chip so it reads as the card's heading without growing the tile past the
   * fact chips beside it. */
  bold?: boolean
  renderTrailing?: (color: string) => React.ReactNode
  /** When provided, the chip itself becomes the Pressable. Avoids an extra
   * wrapper View that would break the flexShrink chain — wrapping a
   * flexShrink:1 chip in a plain Pressable hides the shrink hint from the
   * parent row, so the chip stops wrapping and overflows the column. */
  onPress?: () => void
}) {
  const { fg, bg } = TONES[tone]
  // On a photo a chip is a solid tile that matches the round overlay buttons:
  // the same PHOTO_CHROME beige fill, with the tone's own fg as ink. `solid`
  // keeps its full GREEN fill + white ink so the chat's "End" still reads as a
  // strong control, not a label.
  const bgColor = onPhoto && tone !== 'solid' ? PHOTO_CHROME : bg
  // A filled tile over a photo casts the same soft lift as the round overlay
  // buttons, so chips and buttons read as one fabric off the image. Outlined
  // chips (an empty add slot) stay flat.
  const tileShadow = onPhoto && !outlined
  const Container: any = onPress ? Pressable : View
  // "+N": the mini-chip that chains right after the label's last word. It is
  // nested INSIDE the label <Text> as an inline element — never a sibling flex
  // item and never a split-per-word run. That keeps the whole label ONE bidi
  // run (a Hebrew name renders correctly even in an LTR UI, instead of its words
  // reordering by the flex engine) while the pill still flows after the final
  // glyph and wraps with it. RTL mirrors the plus to the reading-start side
  // ("1+"); `ltr` keeps the weak "+" glued to the digit.
  // Direction follows the LABEL's OWN script, not the UI locale: the flex engine
  // can't bidi-reorder words, so a locale-only direction reversed a Hebrew name
  // in an English UI. The "+" sits on that script's reading-start side.
  const nameDir: 'rtl' | 'ltr' | null = plusCount && text ? (RTL_SCRIPT.test(text) ? 'rtl' : 'ltr') : null
  const plusPill = nameDir ? (nameDir === 'rtl' ? `${plusCount}+` : `+${plusCount}`) : null
  return (
    <Container
      onPress={onPress}
      style={[styles.chip, outlined ? styles.chipOutlined : { backgroundColor: bgColor }, tileShadow && styles.chipShadow]}
    >
      {renderIcon ? <View style={styles.glyphWrap}>{renderIcon(fg)}</View> : null}
      {segments ? (
        // A column of wrapping rows: one row per `br`-delimited line, each row a
        // run of text + mini-chip clusters. Each text run is its own flex item
        // so it wraps at word boundaries; a badge cluster flows inline. Same
        // direction as the chip so items read start-to-end.
        <View style={styles.segmentColumn}>
          {segmentLines(segments).map((line, li) => (
            <View key={li} style={styles.segments}>
              {line.map((seg, i) =>
                'badges' in seg ? (
                  <View key={i} style={styles.badgeCluster}>
                    {seg.badges.map((b, j) => <Badge key={j} text={b} ltr={seg.ltr} />)}
                  </View>
                ) : (
                  <Text
                    key={i}
                    style={[styles.chipText, (bold || seg.bold) && styles.chipTextBold, { color: fg }]}
                    maxFontSizeMultiplier={FONT_SCALE.heading}
                  >
                    {seg.text}
                  </Text>
                ),
              )}
            </View>
          ))}
        </View>
      ) : plusPill ? (
        // Name + "+N": word-runs in a wrap row directed by the name's script, so
        // the pill lands right after the final word in any UI locale.
        <View style={[styles.nameFlow, { direction: nameDir! }]}>
          {(text ?? '').split(/\s+/).filter(Boolean).map((w, i) => (
            <Text
              key={i}
              style={[styles.chipText, bold && styles.chipTextBold, { color: fg }]}
              maxFontSizeMultiplier={FONT_SCALE.heading}
            >
              {w}
            </Text>
          ))}
          <Badge text={plusPill} ltr />
        </View>
      ) : (
        <>
          <Text
            style={[styles.chipText, bold && styles.chipTextBold, { color: fg }]}
            maxFontSizeMultiplier={FONT_SCALE.heading}
          >
            {phraseWrap(text ?? '')}
          </Text>
          {renderTrailing ? <View style={styles.glyphWrap}>{renderTrailing(fg)}</View> : null}
        </>
      )}
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
    // Top-align the row, NOT centre: a wrapped label is taller than the glyph
    // box, and centring the row floats the icon into the middle of the whole
    // chip instead of level with the FIRST line. The old spec centred here and
    // leaned on the glyph wrapper's own `alignSelf:'flex-start'` to pull it back
    // up — but that per-child override is silently dropped under the New Arch
    // (Fabric), so the icon sat mid-chip on multi-line labels. Aligning at the
    // parent makes it independent of that override. Single-line chips are
    // unaffected: every child box (glyph wrapper + one-line text) is exactly one
    // line tall, so flex-start and centre coincide.
    alignItems: 'flex-start',
    gap: SM,
    paddingHorizontal: MD,
    paddingVertical: SM,
    borderRadius: RADIUS,
    flexShrink: 1,
  },
  // Same soft lift the round overlay buttons cast — applied to on-photo tiles so
  // chips and buttons read as one fabric off the image (shared LIFT_SHADOW).
  chipShadow: LIFT_SHADOW,
  // The rule is drawn OUTSIDE the padding box, so an outlined chip would sit
  // taller and wider than the filled chips beside it. Pull the padding in by
  // exactly the border width: same tokens, same outer rectangle, so a row of
  // chips keeps one height whichever variant it holds.
  chipOutlined: {
    ...OUTLINE_SKIN,
    backgroundColor: 'transparent',
    paddingHorizontal: MD - STROKE.thin,
    paddingVertical: SM - STROKE.thin,
  },
  // Same treatment the settings select rows use (selectRowIconWrap): a box
  // exactly one text-line tall so the glyph centres against the FIRST line of a
  // wrapped chip label instead of drifting into the gap between the two lines.
  // The parent (`.chip`) top-aligns the row, so this box lands on the first
  // line; marginTop then lands the glyph on that line's ink rather than on its
  // line box. Single-line chips are unaffected — the box then equals the row
  // height, so top-align and centre coincide. The cap matches the label's own
  // maxFontSizeMultiplier so box and text scale together.
  glyphWrap: {
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
  // Heaviest weight at the ordinary chip size: the name/age heading chip reads
  // as the card's heading without growing the tile past the fact chips beside it.
  chipTextBold: {
    fontWeight: WEIGHT.extrabold,
  },
  // A small light-purple pill riding inside the chip after the label — the
  // "+N more shared groups" hint. GREEN_WASH is the app's pale-purple soft-tile
  // surface, so it reads as light purple against the beige chip tile. Its line
  // height matches the label's first line (lh(TEXT.sm)) so, under the row's
  // flex-start alignment, the pill sits level with line one of a wrapped label.
  badge: {
    backgroundColor: GREEN_WASH,
    borderRadius: RADIUS,
    paddingHorizontal: XS,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: TEXT.xs,
    lineHeight: lh(TEXT.sm),
    fontWeight: WEIGHT.semibold,
    color: GREEN,
    textAlign: 'center',
  },
  // Forced LTR for numeric/punctuation pills (the "+N" hint, a kid's age, "?"):
  // the char order is authoritative and the weak glyphs must not bidi-reorder
  // against an RTL paragraph. Off for a phrase pill (the Hebrew weekend status),
  // which follows the paragraph direction instead.
  badgeTextLtr: {
    writingDirection: 'ltr',
  },
  // The family chip's content: text runs + age/weekend mini-chips flowing as a
  // wrapping row so each fact keeps its own pill and the sentence rewraps to the
  // narrow column. Same direction as the chip so it reads start-to-end.
  segments: {
    direction: isRTL ? 'rtl' : 'ltr',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: SM,
    rowGap: XS,
    flexShrink: 1,
  },
  // The age pills packed tight as one inline unit (user directive 2026-07-26 —
  // "denser"): a hair-gap between pills, well under the SM that separates the
  // sentence's words, so [0][5][?] read as a single little group.
  badgeCluster: {
    direction: isRTL ? 'rtl' : 'ltr',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: XS,
    rowGap: XS,
  },
  // The stack of `br`-delimited lines. alignItems:'flex-start' so each line hugs
  // its own content and the chip tile ends up as wide as the WIDEST line, not as
  // wide as the column it sits in.
  segmentColumn: {
    direction: isRTL ? 'rtl' : 'ltr',
    flexDirection: 'column',
    alignItems: 'flex-start',
    rowGap: XS,
    flexShrink: 1,
  },
  // The group-name "+N" flow: word-runs + trailing pill. `direction` is set
  // inline per label script (see render). columnGap approximates a word space
  // (the words were split on whitespace, so the natural spaces are gone).
  nameFlow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: XS,
    rowGap: XS,
    flexShrink: 1,
  },
  presenceDot: {
    width: PRESENCE_DOT_SIZE,
    height: PRESENCE_DOT_SIZE,
    borderRadius: PRESENCE_DOT_SIZE,
  },
})
