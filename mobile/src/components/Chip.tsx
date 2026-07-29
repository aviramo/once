import { useCallback, useEffect, useRef, useState } from 'react'
import { LayoutChangeEvent, NativeSyntheticEvent, Pressable, StyleProp, StyleSheet, TextLayoutEventData, View, ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Text } from './AppText'
import { Path, Circle, Rect } from 'react-native-svg'
import { Glyph } from './icons'
import { GlyphSlot } from './GlyphSlot'
import { FONT_SCALE } from '../fonts'
import { isRTL as localeIsRTL } from '../i18n'
import { XS, SM, MD, RADIUS, TEXT, WEIGHT, ICON, PULSE, STROKE, lh } from '../tokens'
import { PHOTO_CHROME, PAGE, INK, PRESENCE, INK_WASH, WHITE, LIFT_SHADOW } from '../colors'
import { OUTLINE_SKIN } from '../field'

// Shared pill chip used across cards (watcher list + match card). A soft
// tint of the tone color as background + same-hue icon/text — chips read as
// lightweight fabric swatches instead of bordered stickers. When `onPhoto`
// is set, the chip becomes a solid tile that MATCHES the round overlay buttons
// — the same PHOTO_CHROME white fill, with the tone's own ink (user directive
// 2026-07-25, reverses the earlier transparent-white-ink-on-photo treatment):
// chips and buttons now read as one fabric of white tiles over the photo. The
// `solid` tone is the exception — it keeps its full INK fill + white ink so
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

const TONES = {
  // INK on the PAGE tint — the palest purple in the palette (user directive
  // 2026-07-28). Off-photo, a chip is a page-coloured tile on a white surface:
  // the darker INK_PALE it used to wear read as a lavender block against the
  // white menu, and the muted alpha ramp before that composited into something
  // the eye read as grey. The page purple is the one fill that belongs to both.
  neutral:  { fg: INK,  bg: PAGE },
  // Solid purple with light ink: a chip that is a real "do this" control,
  // not a fact swatch. The full-strength fill (not the PAGE tint) is what
  // makes it read as a button rather than a label — used for the chat's "End".
  solid:    { fg: WHITE,  bg: INK },
  // INK on an INK wash: the positive tone is the one purple, laid soft.
  positive: { fg: INK, bg: INK_WASH },
  // "Do this" rather than "here is a fact". Same white tile as every other
  // on-photo chip — the tile is the fabric of the card and an add-chip is not
  // a foreign object on it. It opts out of the on-photo ink override below so
  // its ink stays the full INK purple whatever the tone rules do around it.
  action:   { fg: INK, bg: PHOTO_CHROME },
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

// ── A wrapped tile hugs the lines it actually paints ───────────────────────
// A flex container that WRAPS keeps the width it was shrunk to, never the width
// its lines ended up using (Yoga does this, and CSS shrink-to-fit does the same)
// — so a chip whose sentence wraps paints a tile as wide as the whole column,
// with dead space after every short line (user directive 2026-07-28).
//
// A plain single-<Text> chip never had this: RN's text measure reports the
// widest LINE, so those tiles already hug. Only the multi-item rows here (text
// runs + mini-chip clusters, and the "+N" name flow) are laid out by the flex
// engine, and only they need this.
//
// Measure-then-correct: lay the label out once, read the item boxes back, and
// cap the container at the width its widest line actually used. Each item measures to its own ink, so the furthest END edge
// across a line IS that line's width. It cannot loop: the second pass caps the
// container at exactly that width, so every line breaks where it already broke
// and measures the same. `maxWidth`, not `width`: if the space ever gets
// NARROWER than the hug (a larger font scale), the lines must stay free to
// re-wrap instead of overflowing the tile.
const HUG_SLACK = 1

function useHugWidth(key: string, lineItems: number[]) {
  const [hug, setHug] = useState<number | null>(null)
  // Read inside the layout callbacks, so they never close over a stale label.
  const items = useRef(lineItems)
  items.current = lineItems
  const boxes = useRef(new Map<string, { x: number; end: number }>())
  const rows = useRef(new Map<number, number>())
  // A new label is a new measurement: drop what the previous one measured
  // rather than capping the new text at the old text's width.
  const measured = useRef(key)
  if (measured.current !== key) {
    measured.current = key
    boxes.current.clear()
    rows.current.clear()
    if (hug !== null) setHug(null)
  }

  const remeasure = useCallback(() => {
    let widest = 0
    for (let li = 0; li < items.current.length; li++) {
      const rowWidth = rows.current.get(li)
      // Nothing to cap until every box of every line has reported: a partial
      // pass would cap the tile at a fraction of its text and re-wrap it.
      if (rowWidth == null) return
      let minX = Infinity
      let maxEnd = 0
      for (let i = 0; i < items.current[li]; i++) {
        const box = boxes.current.get(`${li}:${i}`)
        if (!box) return
        minX = Math.min(minX, box.x)
        maxEnd = Math.max(maxEnd, box.end)
      }
      // Lines are start-aligned: they fill from the left in LTR, from the row's
      // right edge in RTL (layout x is always physical, whatever the direction).
      widest = Math.max(widest, isRTL ? rowWidth - minX : maxEnd)
    }
    if (widest <= 0) return
    const next = Math.ceil(widest)
    setHug(cur => (cur !== null && Math.abs(cur - next) <= HUG_SLACK ? cur : next))
  }, [])

  const onItemLayout = useCallback((li: number, i: number) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout
    boxes.current.set(`${li}:${i}`, { x, end: x + width })
    remeasure()
  }, [remeasure])

  const onLineLayout = useCallback((li: number) => (e: LayoutChangeEvent) => {
    rows.current.set(li, e.nativeEvent.layout.width)
    remeasure()
  }, [remeasure])

  return { style: hug != null ? { maxWidth: hug } : undefined, onItemLayout, onLineLayout }
}

// The pale-purple mini-chip. Single source for both the "+N" groups hint and
// the family chip's age/weekend pills so they read as one fabric.
function Badge({ text, ltr = false, style, onLayout }: { text: string; ltr?: boolean; style?: StyleProp<ViewStyle>; onLayout?: (e: LayoutChangeEvent) => void }) {
  return (
    <View style={[styles.badge, style]} onLayout={onLayout}>
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
// Longer than this, a phrase keeps its ordinary spaces even before anything is
// measured. A character count can only ever GUESS at what fits — the real guard
// is the measured un-glue below — but it keeps an obviously long phrase from
// having to be corrected at all.
const PHRASE_GLUE_MAX = 20

/** The seams a chip label may break at: after a top-level comma, and before a
 *  parenthetical. What lies between two seams is one phrase. */
export function splitPhrases(label: string): string[] {
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
}

// Note a SHORT single phrase is glued too, and that is load-bearing beyond tidy
// wrapping: a two-word label that fits ("just now", "1 min ago") was losing its
// last word on screen — the tile measured at the full width, then the breaker
// split the trailing word onto a second line that the one-line tile clips,
// leaving "just" plus an empty gap. A glued phrase offers no break to take.
//
// `loose` un-glues everything: the label goes back to its ordinary spaces. It
// is what the measured correction below flips on, because GLUE IS A PREFERENCE
// AND A PREFERENCE THAT CANNOT BE HONOURED MUST NOT BECOME A MID-WORD BREAK
// (user directive 2026-07-29). A phrase with no seam inside it that still does
// not fit the column is split by the breaker at whatever CHARACTER overflows —
// "אימון בוקר בפארק" painted as "אימון בוקר בפאר / ק". Ungluing gives those
// spaces back, so it breaks between words instead.
export function phraseWrap(label: string, loose = false): string {
  const phrases = splitPhrases(label)
  return phrases
    .map(p => (!loose && p.length <= PHRASE_GLUE_MAX ? p.replace(/ /g, NBSP) : p))
    .join(' ')
}

// ── The measured un-glue ───────────────────────────────────────────────────
// Whether a glued phrase FITS is not knowable from the string: it depends on the
// column the chip landed in, the font scale, the script. So the label is painted
// glued and corrected if the breaker had to cut a word in half. With the glue in
// place a phrase offers no break of its own, so a line beyond the seams
// (`splitPhrases`) is a break the breaker had to invent — a mid-word one. The
// one label that trips this without a broken word is a compound whose LONG
// phrase (past PHRASE_GLUE_MAX, so never glued) wrapped at its own spaces; it
// loses the glue on its short phrases and reads the same, because a label
// already wide enough to wrap twice was never going to keep its seams anyway.
//
// The same measure-then-correct shape as the hug above, and it carries the same
// lesson: A CORRECTION IS ONLY AS GOOD AS THE WIDTH IT WAS MEASURED AT.
// A first pass can land in a box whose parent has not resolved its own width
// yet, so the box's widest layout is remembered and the un-glue is dropped the
// moment it is laid out WIDER. It cannot loop: ungluing only ever lets the text
// break in MORE places, so the tile it produces is never wider than the glued
// one that produced it, and only a genuinely roomier box resets anything.
function useUnglue(text: string | undefined) {
  const [loose, setLoose] = useState(false)
  const widest = useRef(0)
  // A new label is a new question: measure it glued, whatever the last one did.
  const measured = useRef(text)
  if (measured.current !== text) {
    measured.current = text
    widest.current = 0
    if (loose) setLoose(false)
  }
  const seams = text ? splitPhrases(text).length : 0
  return {
    label: text != null ? phraseWrap(text, loose) : '',
    onTextLayout: (e: NativeSyntheticEvent<TextLayoutEventData>) => {
      if (!loose && e.nativeEvent.lines.length > seams) setLoose(true)
    },
    onLayout: (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width
      if (w <= widest.current) return
      widest.current = w
      if (loose) setLoose(false)
    },
  }
}

// A chip's outer height, derived from the same tokens its padding box is
// built from (see `styles.chip`). Exported so anything that has to sit level
// with a chip — the leading glyph of the settings groups row — centres against
// the real height instead of a hand-tuned margin that drifts when the tokens
// move.
export const CHIP_HEIGHT = lh(TEXT.md) + 2 * SM

export function Chip({
  renderIcon,
  text,
  segments,
  tone = 'neutral',
  onPhoto = false,
  outlined = false,
  bold = false,
  small = false,
  plusCount,
  renderTrailing,
  onTrailingPress,
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
  /** No fill, just a light purple rule. For a chip that ADDS something rather
   * than reporting a fact — it reads as an empty slot waiting to be filled,
   * which a solid chip cannot. */
  outlined?: boolean
  /** Heavier label weight at the SAME chip size — used for the name/age heading
   * chip so it reads as the card's heading without growing the tile past the
   * fact chips beside it. */
  bold?: boolean
  /** The compact tile: a tighter box around smaller text, for a chip that
   * annotates a LIST ROW rather than standing on a card — the role/queue chip on
   * a group strip, and the same chip on the menu row that opens those strips.
   * One size step, a prop, never a second chip component. */
  small?: boolean
  renderTrailing?: (color: string) => React.ReactNode
  /** Makes the TRAILING glyph its own press target, separate from the chip's
   * `onPress` — a small affordance riding inside a label chip (the match card's
   * report flag at the reading-end of the name/age heading, 2026-07-29).
   * TAP_SLOP widens the target past the tiny glyph. */
  onTrailingPress?: () => void
  /** When provided, the chip itself becomes the Pressable. Avoids an extra
   * wrapper View that would break the flexShrink chain — wrapping a
   * flexShrink:1 chip in a plain Pressable hides the shrink hint from the
   * parent row, so the chip stops wrapping and overflows the column. */
  onPress?: () => void
}) {
  const { fg, bg } = TONES[tone]
  // On a photo a chip is a solid tile that matches the round overlay buttons:
  // the same PHOTO_CHROME white fill, with the tone's own fg as ink. `solid`
  // keeps its full INK fill + white ink so the chat's "End" still reads as a
  // strong control, not a label.
  const bgColor = onPhoto && tone !== 'solid' ? PHOTO_CHROME : bg
  // A filled tile over a photo casts the same soft lift as the round overlay
  // buttons, so chips and buttons read as one fabric off the image. Outlined
  // chips (an empty add slot) stay flat.
  const tileShadow = onPhoto && !outlined
  // Every glyph in this chip stands beside the chip's OWN label — the small
  // tile's label is a size down, and both are capped at FONT_SCALE.heading, so
  // the icon can never outgrow the text it sits next to on a large-font device.
  const glyphSlot = { size: small ? TEXT.sm : TEXT.md, cap: FONT_SCALE.heading }
  const Container: any = onPress ? Pressable : View
  // "+N": the mini-chip that TRAILS the label, the same slot the presence dot
  // rides in — not an item flowing inside the text (user directive 2026-07-29).
  // The label used to be split into word-runs so the pill could chain after the
  // final word, but a wrap row is laid out by the flex engine, and the flex
  // engine cannot shrink-to-fit what it wrapped: the tile kept the width it was
  // measured at, so the chip painted a dead half-line of white beside the text,
  // and which line the pill landed on could differ between two runs of the same
  // card. A plain <Text> has none of that — RN measures it at its widest LINE,
  // so it hugs by construction — and the pill simply stands after it. `ltr`
  // keeps the weak "+" glued to its digit; the pill rides the chip's own
  // trailing side, so it follows the app's direction like every other piece of
  // chip chrome.
  const plusPill = plusCount ? (isRTL ? `${plusCount}+` : `+${plusCount}`) : null
  // The one flex-laid-out label shape left: `br`-delimited lines of text runs +
  // pill clusters (the family chip). It is built here so the hug hook knows how
  // many boxes each line owes it, and is capped by it so the tile ends where the
  // text does (see useHugWidth).
  const lines = segments ? segmentLines(segments) : null
  const hug = useHugWidth(
    lines ? lines.map(l => l.map(s => ('badges' in s ? s.badges.join(',') : s.text)).join('')).join('\n') : '',
    lines ? lines.map(l => l.length) : [],
  )
  const unglue = useUnglue(!lines ? text : undefined)
  return (
    <Container
      onPress={onPress}
      style={[styles.chip, small && styles.chipSmall, outlined ? styles.chipOutlined : { backgroundColor: bgColor }, tileShadow && styles.chipShadow]}
    >
      {renderIcon ? <GlyphSlot {...glyphSlot}>{renderIcon(fg)}</GlyphSlot> : null}
      {lines ? (
        // A column of wrapping rows: one row per `br`-delimited line, each row a
        // run of text + mini-chip clusters. Each text run is its own flex item
        // so it wraps at word boundaries; a badge cluster flows inline. Same
        // direction as the chip so items read start-to-end.
        <View style={[styles.segmentColumn, hug.style]}>
          {lines.map((line, li) => (
            <View key={li} style={styles.segments} onLayout={hug.onLineLayout(li)}>
              {line.map((seg, i) =>
                'badges' in seg ? (
                  <View key={i} style={styles.badgeCluster} onLayout={hug.onItemLayout(li, i)}>
                    {seg.badges.map((b, j) => <Badge key={j} text={b} ltr={seg.ltr} />)}
                  </View>
                ) : (
                  <Text
                    key={i}
                    style={[styles.chipText, small && styles.chipTextSmall, (bold || seg.bold) && styles.chipTextBold, { color: fg }]}
                    maxFontSizeMultiplier={FONT_SCALE.heading}
                    onLayout={hug.onItemLayout(li, i)}
                  >
                    {seg.text}
                  </Text>
                ),
              )}
            </View>
          ))}
        </View>
      ) : (
        <>
          <Text
            style={[styles.chipText, small && styles.chipTextSmall, bold && styles.chipTextBold, { color: fg }]}
            maxFontSizeMultiplier={FONT_SCALE.heading}
            onTextLayout={unglue.onTextLayout}
            onLayout={unglue.onLayout}
          >
            {unglue.label}
          </Text>
          {plusPill ? (
            // Bottom-aligned, so on a label that wrapped it stands beside the
            // LAST line — where the count belongs — instead of floating up
            // level with the first one.
            <Badge text={plusPill} ltr style={styles.plusPill} />
          ) : null}
          {renderTrailing ? (
            // The trailing glyph is its own press target when asked (the report
            // flag inside the name/age chip) — the SAME one-line-tall slot, just
            // pressable, so it stays level with the label's first line exactly
            // as the inert version does and wins the responder over the chip's
            // own onPress.
            <GlyphSlot {...glyphSlot} onPress={onTrailingPress}>{renderTrailing(fg)}</GlyphSlot>
          ) : null}
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
// colour carries the meaning: purple (default) = "right now" / "right here" on
// time + distance chips; white = kids-affinity chip (readable on the dark
// photo scrim, where a black/brand dot would disappear). When
// `pulsing` is set, opacity loops 1 ↔ PULSE.opacity continuously to signal a
// live ongoing state (today: the chat partner being online).

const PRESENCE_DOT_SIZE = 7

export function PresenceDot({ color = PRESENCE, pulsing = false }: { color?: string; pulsing?: boolean }) {
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
  // The compact tile: one step in on both axes, so the chip annotates a list row
  // instead of standing beside it as an object of its own weight.
  chipSmall: { paddingHorizontal: SM, paddingVertical: XS, gap: XS },
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
  chipText: {
    fontSize: TEXT.md,
    lineHeight: lh(TEXT.md),
    // Regular weight (user directive 2026-07-29). A chip is a FACT — how far
    // away, how many kids, which group — not a heading, and a stack of them all
    // set in semibold read as a column of shouted labels with nothing quiet to
    // measure against. The white tile and the purple ink already separate a chip
    // from the photo under it; the weight was doing no work. It also gives the
    // `bold` opt-in below its meaning back: while every chip was semibold, `bold`
    // was a no-op and the one thing meant to stand out could not.
    flexShrink: 1,
    // Start-aligned (physically right in RTL) comes from the app-wide reading
    // direction — TEXT_START in src/fonts.ts, applied once in AppText. This
    // used to re-declare it inline. NOTE textAlign:'right' would be RN's RTL
    // trap: it means "end of writing direction", i.e. physically LEFT in RTL.
  },
  // The one emphasis, at the ordinary chip size: the name/age heading chip reads
  // as the card's heading without growing the tile past the fact chips beside it,
  // and FamilyCard's status run (`seg.bold`) stands out inside its sentence.
  // Only a call site that asks for it gets this — see chipText above.
  chipTextBold: {
    fontWeight: WEIGHT.medium,
  },
  // The small tile's label — the list-row size, one step under the chip's own.
  chipTextSmall: {
    fontSize: TEXT.sm,
    lineHeight: lh(TEXT.sm),
  },
  // A small pale-purple pill riding inside the chip after the label — the
  // "+N more shared groups" hint. The PAGE tint, the same fill the chip itself
  // wears off-photo (user directive 2026-07-28: every chip is the page purple),
  // so it reads as a whisper of purple against the white chip tile. Its line
  // height matches the label's first line (lh(TEXT.md)) so, under the row's
  // flex-start alignment, the pill sits level with line one of a wrapped label.
  badge: {
    backgroundColor: PAGE,
    borderRadius: RADIUS,
    paddingHorizontal: XS,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: TEXT.sm,
    lineHeight: lh(TEXT.md),
    fontWeight: WEIGHT.medium,
    color: INK,
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
  // The "+N" pill stands OFF the label: the chip's own SM gap between its parts,
  // and a step more on top of it, so the count reads as a second object on the
  // tile rather than as the last word of the name (user directive 2026-07-29).
  // alignSelf ends it level with the label's LAST line — the chip's row is
  // aligned flex-start, for the leading glyph.
  plusPill: {
    marginStart: XS,
    alignSelf: 'flex-end',
  },
  presenceDot: {
    width: PRESENCE_DOT_SIZE,
    height: PRESENCE_DOT_SIZE,
    borderRadius: PRESENCE_DOT_SIZE,
  },
})
