import { Children, Fragment, createContext, isValidElement, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { LayoutChangeEvent, NativeSyntheticEvent, Pressable, StyleProp, StyleSheet, TextLayoutEventData, View, ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Text } from './AppText'
import { Path, Circle, Rect } from 'react-native-svg'
import { Glyph } from './icons'
import { GlyphSlot, LineProbe } from './GlyphSlot'
import { FONT_SCALE } from '../fonts'
import { isRTL as localeIsRTL } from '../i18n'
import { XS, SM, MD, RADIUS, TEXT, WEIGHT, ICON, PULSE, STROKE, ROUND_BUTTON_SIZE_SM, lh } from '../tokens'
import { PHOTO_CHROME, PAGE, INK, PRESENCE, INK_WASH, WHITE, LIFT_SHADOW, LINE } from '../colors'
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

/** The "+N more circles" hint as a segment: a mini-chip FLOWING with the label,
 *  exactly the kids' ages (user directive 2026-07-30 — "the same way, flowing
 *  with the text"). It is composed here, once, and mirrored under RTL so the
 *  plus stays on the reading-start side; `ltr` then keeps the weak "+" glued to
 *  its digit against an RTL paragraph, like every other numeric pill. */
export function plusBadge(n: number): ChipSegment {
  return { badges: [isRTL ? `${n}+` : `+${n}`], ltr: true }
}

// Split a segment list into lines at each `br`. The lines then render as a
// COLUMN of wrapping rows rather than one row with a full-width spacer: a
// flexBasis:'100%' break item makes the wrap row claim the entire available
// width, which stretched the chip tile edge-to-edge instead of letting it hug
// its text (user directive 2026-07-27). A column hugs the widest line.
//
// TWO TEXT RUNS WITH NOTHING BETWEEN THEM ARE ONE RUN, joined by an ordinary
// SPACE (user, 2026-07-30). The row's `columnGap` is what stands a mini-chip off
// the words around it; between two words it is a second space, and a visibly
// wider one ("אין לי ילדים  ורוצה ילדים"). A segment list is a sentence with
// pills IN it, so wherever a pill is absent — a profile with no ages set — the
// words on either side must close back up into plain prose. Joining them also
// hands the pair to the text engine as one paragraph, which breaks it at its own
// spaces instead of at the flex row's item boundary.
type ChipRun = Exclude<ChipSegment, { br: true }>
function segmentLines(segments: ChipSegment[]): ChipRun[][] {
  const lines: ChipRun[][] = [[]]
  for (const seg of segments) {
    if ('br' in seg) {
      lines.push([])
      continue
    }
    const line = lines[lines.length - 1]
    const prev = line[line.length - 1]
    if ('text' in seg && prev && 'text' in prev && !!prev.bold === !!seg.bold) {
      line[line.length - 1] = { text: `${prev.text} ${seg.text}`, bold: seg.bold }
    } else line.push(seg)
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
      <Text style={[styles.badgeText, ltr && styles.badgeTextLtr]}>
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

// ── A chip stands exactly as tall as a round chrome button ─────────────────
// (user directive 2026-07-30.) A chip tile and a round chrome button are the
// same white object — on the match card's top row the name/age chip and the
// "End Chat" chip sit directly beside home's hamburger — so the two must read
// as ONE height, and the chip's height is therefore stated as the button's
// diameter rather than as a sum of its own paddings.
//
// It cannot be a fixed `height`: a label that wraps has to grow the tile. And
// it cannot be a fixed PADDING either, which is what it used to be — `SM` above
// and below the label makes exactly this number at font scale 1 and at no other
// scale, because the OS grows the label's line box through its own curve,
// UNCAPPED by maxFontSizeMultiplier (see LineProbe). That is why the chips came
// out ~25% taller than the hamburger beside them on a large-font device.
//
// So the PADDING is what is derived: half of whatever room is left inside the
// button's diameter once the label's REAL measured line box is in it. Nothing is
// ever clipped — a line box that has outgrown the button simply takes the last
// of the padding (`Math.max(0, …)`) and the tile grows past it, and a wrapped
// label grows by whole line boxes exactly as before.
export const CHIP_HEIGHT = ROUND_BUTTON_SIZE_SM

/** THE gutter of a chip: the air between the tile's edge and what it carries.
 *  Stated once because it is now read on BOTH axes — see CHIP_BLOCK_PAD. */
export const CHIP_GUTTER = MD

/** ── A chip that is a BLOCK pays the SAME air on all four sides ─────────────
 *  (user directive 2026-07-31.) The rule above derives a PILL's vertical padding
 *  from the round-button height, which is right for a tile carrying one short
 *  line — but the match card's bottom-START set is not that: the merged fact tile
 *  stacks three sentences, two of which wrap, and the bio tile is a paragraph.
 *  Against their MD gutter the derived 8dp read as text pressed against the top
 *  and bottom edges of a wide white block.
 *
 *  So a block-shaped chip takes the gutter on the vertical too: the stacked rows
 *  (ChipStack) and the match card's bio tile, which imports this rather than
 *  re-typing it so the two can never drift (the bio sat at a flat `padding: MD`
 *  once before, and the whole point of `useChipPadding` was to stop it from
 *  differing from the chips beside it — this is the same guarantee, now that the
 *  chips beside it are blocks too).
 *
 *  A LONE pill is untouched: it is still exactly a round chrome button tall. */
export const CHIP_BLOCK_PAD = CHIP_GUTTER

/** ── A SEAM is half a gutter, because two rows pay it together ──────────────
 *  (user directive 2026-07-31.) The air above the tile's first row and below its
 *  last is the block's own gutter — it stands between the text and the OUTSIDE.
 *  A seam is not that: the rule between two facts has a row's padding on EACH
 *  side of it, so the full gutter twice over opened a band of empty white wider
 *  than the tile's own edges and read as three tiles again, which is the very
 *  thing the merge undid. Each side gives half, so the facts sit a gutter apart
 *  and the tile's four outer edges are untouched. */
export const CHIP_BLOCK_SEAM_PAD = CHIP_BLOCK_PAD / 2

/** The chip's vertical padding: what is left of CHIP_HEIGHT once one line of
 *  label is in it, halved. `lineBox` is the probe's measurement; until it has
 *  reported, the token arithmetic stands in — it is exact at font scale 1, which
 *  is where a first frame overwhelmingly is, so nothing visibly settles. An
 *  outlined chip pays for its rule out of the same box, so its outer rectangle
 *  matches the filled chips beside it. */
function chipPad(lineBox: number | null, outlined: boolean): number {
  const pad = Math.max(0, (CHIP_HEIGHT - (lineBox ?? lh(TEXT.md))) / 2)
  return Math.max(0, pad - (outlined ? STROKE.thin : 0))
}

/** THE PILL's padding box, probe and all: render `probe` inside the tile and put
 *  `style` on it. Only a chip carrying one short line of label uses this — the
 *  block-shaped ones take CHIP_BLOCK_PAD instead.
 *
 *  (The match card's BIO used to take its box from here, so that the biggest white
 *  tile on the card could not drift from the chips beside it. Those chips are
 *  blocks now, so the bio is one too and takes CHIP_BLOCK_PAD — the same
 *  guarantee, from the other constant.) */
export function useChipPadding(outlined = false) {
  const [lineBox, setLineBox] = useState<number | null>(null)
  // Only a measurement that CHANGES the padding is worth a render. At font
  // scale 1 the probe confirms exactly what the token arithmetic already said,
  // so the ordinary device pays nothing at all for this.
  const onHeight = useCallback(
    (h: number) => setLineBox(cur => (chipPad(cur, outlined) === chipPad(h, outlined) ? cur : h)),
    [outlined],
  )
  return {
    style: { paddingVertical: chipPad(lineBox, outlined) },
    probe: <LineProbe size={TEXT.md} cap={FONT_SCALE} style={styles.chipProbe} onHeight={onHeight} />,
  }
}

// ── The rule INSIDE a chip ─────────────────────────────────────────────────
// A hairline dividing the tile's label from a second fact trailing it —
// the match card's "Moran, 46 | 07:44". It is the app's ONE rule, the very
// hairline the dock draws between its options (LINE at StyleSheet.hairlineWidth),
// so a division inside a tile and a division between two keys read as the same
// mark.
//
// Its height is NOT computed. A zero-width `LineProbe` standing beside it lays
// out a real line of the label's own size and the row stretches the rule to that
// box, so the rule is exactly one line of label tall at every font scale — the
// same reason `GlyphSlot` measures a line rather than deriving one from `lh()`.
// It rides line ONE of a wrapped label, like the leading glyph, because the chip
// row is aligned flex-start.
function ChipRule({ size }: { size: number }) {
  return (
    <View style={styles.rule}>
      <LineProbe size={size} cap={FONT_SCALE} />
      <View style={styles.ruleInk} />
    </View>
  )
}

// ── Several facts sharing ONE tile ─────────────────────────────────────────
// (user directive 2026-07-30.) Set by `ChipStack` below: a chip rendered inside
// one is a ROW of a shared tile rather than a tile of its own, so it drops the
// two things that made it a separate object — the fill and the lift — and keeps
// everything that makes it a chip: its glyph slot and its gutter — which it now
// pays on the vertical as well (CHIP_BLOCK_PAD, in place of the pill's derived
// padding). A context and not a prop, so no call site can put a chip in a stack
// and forget to say so.
//
// It carries WHERE in the tile the row is, because that is what decides each of
// its two vertical edges: an edge facing the outside pays the block's gutter, an
// edge facing a seam pays half of it (see CHIP_BLOCK_SEAM_PAD). The stack knows
// the order of its rows and a row does not, so the answer is stated here rather
// than inferred anywhere else. `null` = not in a stack at all.
type ChipStackRow = { first: boolean; last: boolean }
// The four positions are module constants so a re-render hands each row the SAME
// context value it had before, and only a row whose position actually changed
// re-renders.
const ROW_ONLY: ChipStackRow = { first: true, last: true }
const ROW_FIRST: ChipStackRow = { first: true, last: false }
const ROW_MID: ChipStackRow = { first: false, last: false }
const ROW_LAST: ChipStackRow = { first: false, last: true }
const rowPos = (i: number, n: number): ChipStackRow =>
  i === 0 ? (n === 1 ? ROW_ONLY : ROW_FIRST) : i === n - 1 ? ROW_LAST : ROW_MID
const ChipStacked = createContext<ChipStackRow | null>(null)

/** THE action that rides a chip's trailing edge — see `endAction` below. One
 *  type, so the match card's `headingAction` and the chip's own slot cannot
 *  drift apart. It says its name (`label`) or it IS its name (`renderIcon`): the
 *  chat's "End chat" spells the consequence out, while the own-profile card's
 *  plus is a mark everyone already reads, and a word for it would only repeat
 *  what the popup behind it lists. Never both. */
export type ChipEndAction = {
  label?: string
  /** Handed the block's own white ink, like every other render slot here is
   *  handed the tone's. */
  renderIcon?: (color: string) => React.ReactNode
  /** What the GLYPH form says to a screen reader; a label form says itself. */
  a11yLabel?: string
  onPress: () => void
}

export function Chip({
  renderIcon,
  onIconPress,
  text,
  segments,
  tone = 'neutral',
  onPhoto = false,
  outlined = false,
  bold = false,
  small = false,
  count,
  endAction,
  renderAfterRule,
  renderTrailing,
  onTrailingPress,
  onPress,
}: {
  renderIcon?: (color: string) => React.ReactNode
  /** Makes the LEADING glyph its own press target, separate from the chip's
   *  `onPress` — the mirror of `onTrailingPress`, and what the match card's
   *  report flag rides on now that it leads the heading tile (user directive
   *  2026-07-30). TAP_SLOP widens the target past the small glyph. */
  onIconPress?: () => void
  text?: string
  /** Interleaved text runs + mini-chips, an alternative to the plain `text`
   * label. When set, the chip renders these wrapping segments (the family/kids
   * chip, the shared-circle chip) and `text`/`renderTrailing` are ignored. */
  segments?: ChipSegment[]
  tone?: ChipTone
  onPhoto?: boolean
  /** A BARE number in a pill after the label, at the label's trailing end — the
   * opposite side of the tile from the leading glyph (user directive
   * 2026-07-30). For a live quantity the label itself does not name: the menu's
   * visibility tile says "Visible" and this says how many people are watching.
   * The number alone, because the tile is small and its own label already says
   * what is being counted. The same pale fabric as the mini-chips a `segments`
   * label flows (`Badge`), standing in the tile's own trailing slot rather than
   * in the sentence: nothing here is being counted INSIDE a phrase. */
  count?: number
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
  /** AN ACTION THAT IS PART OF THE TILE, NOT A SECOND TILE (user directive
   *  2026-07-30): a solid purple block CONTINUING the chip at its TRAILING edge,
   *  bleeding to the tile's own three edges and carrying its corner, with the
   *  label's white ink on it. Chat's "End chat" — which used to be a `solid`
   *  chip of its own, standing on a row under the name — is the one of these:
   *  ending the conversation belongs with whom it ends, and two tiles stacked in
   *  the corner said that twice. The tile is read name-first and the action is
   *  what it ends on (user directive 2026-07-30 — it led for an afternoon, and
   *  an action before the name reads as the tile being an action). It takes NO
   *  rule (unlike `renderAfterRule`, which stands inside the tile): the fill is already the
   *  division, and a hairline at a purple-to-white seam would be a second one.
   *  Nothing here is stacked (ChipStack) — this is a lone tile's own edge.
   *  It carries a word or a GLYPH (see ChipEndAction): the own-profile card's
   *  add is a plus standing in the very block the chat's "End chat" stands in,
   *  because both are the one thing the heading tile lets you DO about the
   *  person it names. */
  endAction?: ChipEndAction
  /** A SECOND fact on the same tile, TRAILING it — after the label, behind the
   *  app's hairline rule (see ChipRule). Handed the tone's own ink, like every
   *  other render slot here. Today: the invitation countdown, which rides inside
   *  the match card's name/age chip (user directive 2026-07-30) instead of
   *  standing as a readout on the status card. It TRAILS the name (user
   *  directive 2026-07-31): the tile is read for who this is, and the deadline is
   *  what is happening to that person, so the name comes first and the clock
   *  finishes the line — the same shape as every other chip in the app, where the
   *  label leads and a second fact follows it.
   *  A SLOT and not a string, deliberately — the countdown ticks, and a slot
   *  keeps that second inside the element it paints instead of re-rendering the
   *  chip (and the card carrying it) once a second. */
  renderAfterRule?: (color: string) => React.ReactNode
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
  // Inside a ChipStack this chip is a row of a shared tile, so the tile's own
  // fill, rule and lift are stated ONCE by the stack and not by each row. What
  // the row itself answers for is its two vertical edges — see ChipStackRow.
  const stackRow = useContext(ChipStacked)
  const stacked = !!stackRow
  // On a photo a chip is a solid tile that matches the round overlay buttons:
  // the same PHOTO_CHROME white fill, with the tone's own fg as ink. `solid`
  // keeps its full INK fill + white ink so the chat's "End" still reads as a
  // strong control, not a label.
  const bgColor = onPhoto && tone !== 'solid' ? PHOTO_CHROME : bg
  // A filled tile over a photo casts the same soft lift as the round overlay
  // buttons, so chips and buttons read as one fabric off the image. Outlined
  // chips (an empty add slot) stay flat.
  const tileShadow = onPhoto && !outlined && !stacked
  // Every glyph in this chip stands beside the chip's OWN label — the small
  // tile's label is a size down, and both take the app's one FONT_SCALE ceiling,
  // so the icon can never outgrow the text it sits next to on a large-font
  // device. And the label itself goes with them: a chip's text is as often user
  // data as UI language (a name, a group's name, a distance), and which script
  // it is written in is what decides where its ink sits inside the line — the
  // report shield beside "Inbal, 51" in a Hebrew build was being centred on
  // Hebrew ink the tile does not paint (user report 2026-07-31, see inkOffset).
  const glyphSlot = {
    size: small ? TEXT.sm : TEXT.md,
    cap: FONT_SCALE,
    label: text ?? segments?.map(s => ('badges' in s ? s.badges.join(' ') : 'br' in s ? '' : s.text)).join(' '),
  }
  const Container: any = onPress ? Pressable : View
  // THE trailing pill: a mini-chip in the tile's own trailing slot, the same one
  // the presence dot rides in — for a number the SENTENCE does not contain
  // ("Visible  3"). A quantity that belongs INSIDE the label flows with the
  // words instead, as a `badges` segment (the kids' ages, the shared circles'
  // "+N") — see `plusBadge`.
  const trailingPill = count != null ? String(count) : null
  // The flex-laid-out label shape: `br`-delimited lines of text runs + pill
  // clusters. It is built here so the hug hook knows how many boxes each line
  // owes it, and is capped by it so the tile ends where the text does (see
  // useHugWidth).
  const lines = segments ? segmentLines(segments) : null
  const hug = useHugWidth(
    lines ? lines.map(l => l.map(s => ('badges' in s ? s.badges.join(',') : s.text)).join('')).join('\n') : '',
    lines ? lines.map(l => l.length) : [],
  )
  const unglue = useUnglue(!lines ? text : undefined)
  // The tile's height contract (see CHIP_HEIGHT): the label's real line box is
  // measured by an out-of-flow probe and the padding is whatever is left of a
  // round chrome button's diameter. Two variants opt out — the `small` tile (one
  // step UNDER the chrome on purpose, so it keeps its token box) and a STACKED
  // row (a block, not a pill; see CHIP_BLOCK_PAD).
  //
  // (A `markOnly` variant lived here for an afternoon — a tile carrying a glyph
  // and NO label, for the photo menu's actions when they were four bare marks.
  // It had to opt out of BOTH the padding above and the glyph-beside-text slot
  // below, since neither means anything without a line of text to be beside. The
  // menu says its rows in words now, so nothing in the app is an icon-only chip.
  // If one is ever wanted again, note that the label branch below renders its
  // `Text` unconditionally: a chip with no label still lays out an EMPTY one, and
  // the row's `gap` for it, which pushes the mark half a gap off centre.)
  const pad = useChipPadding(outlined)
  const derivedPad = !small && !stacked
  return (
    <Container
      onPress={onPress}
      style={[
        styles.chip,
        small && styles.chipSmall,
        stacked ? styles.chipBlock : null,
        stackRow && !stackRow.first && styles.chipBlockSeamTop,
        stackRow && !stackRow.last && styles.chipBlockSeamBottom,
        stacked ? null : outlined ? styles.chipOutlined : { backgroundColor: bgColor },
        tileShadow && styles.chipShadow,
        derivedPad && pad.style,
      ]}
    >
      {derivedPad ? pad.probe : null}
      {renderIcon ? <GlyphSlot {...glyphSlot} onPress={onIconPress}>{renderIcon(fg)}</GlyphSlot> : null}
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
            onTextLayout={unglue.onTextLayout}
            onLayout={unglue.onLayout}
          >
            {unglue.label}
          </Text>
          {renderAfterRule ? (
            // The hairline and then the second fact, both BEHIND the label. The
            // chip's own SM gap stands on each side of the rule, so the tile
            // reads as two facts sharing one box rather than as a label with
            // something stuck to it.
            <>
              <ChipRule size={glyphSlot.size} />
              {renderAfterRule(fg)}
            </>
          ) : null}
          {trailingPill ? (
            // CENTRED on the label's line, in the very same measured one-line box
            // the leading glyph stands in — a mini-chip beside a line of text is
            // the same geometry problem as a glyph beside one, so it takes the
            // same one answer (GlyphSlot) rather than a second alignment of its
            // own. It used to be the bare pill, bottom-aligned to the row: the
            // pill is a size-down line box and so is SHORTER than the label's, and
            // hanging it from the bottom of the taller box left every one of them
            // sitting low against its text (user, 2026-07-30).
            // The slot is still bottom-aligned (`trailingPill`), which is what
            // puts that one-line box beside the LAST line of a wrapped label —
            // where a count belongs — instead of level with the first.
            <GlyphSlot {...glyphSlot} style={styles.trailingPill}>
              <Badge text={trailingPill} ltr />
            </GlyphSlot>
          ) : null}
          {renderTrailing ? (
            // The trailing glyph is its own press target when asked (the report
            // flag inside the name/age chip) — the SAME one-line-tall slot, just
            // pressable, so it stays level with the label's first line exactly
            // as the inert version does and wins the responder over the chip's
            // own onPress.
            <GlyphSlot {...glyphSlot} onPress={onTrailingPress}>{renderTrailing(fg)}</GlyphSlot>
          ) : null}
          {endAction ? (
            // The tile's own trailing EDGE, painted purple. It cancels the chip's
            // gutter on the end side and its derived vertical padding on both
            // others (negative margins, read straight off the box the chip is
            // using — never a second guess at it), states the gutter again as its
            // own, and takes the tile's corner where it meets it.
            // `alignSelf:'stretch'` is what makes it full height whatever the
            // label does: the chip's row is aligned flex-start, for the leading
            // glyph, so without it the block would be one line tall inside a
            // wrapped tile.
            <Pressable
              onPress={endAction.onPress}
              accessibilityRole="button"
              accessibilityLabel={endAction.a11yLabel}
              style={[
                styles.endAction,
                { marginVertical: -pad.style.paddingVertical, borderColor: bgColor },
              ]}
            >
              {endAction.renderIcon ? (
                // A MARK IN THIS BLOCK IS CENTRED IN THE BLOCK, not on a line of
                // text (user report 2026-07-31: the plus sat visibly off the
                // block's middle). It used to stand in the app's glyph-beside-text
                // slot — but there is no text beside it here, and that slot pays
                // for a text neighbour twice over: its box is one LINE of label
                // tall rather than the block's own height, and `inkOffset` then
                // nudges the mark down onto ink that is not there. The block is a
                // plain tile with a mark in the middle of it, exactly like the
                // close X in a round chrome button, so it is centred by the
                // block's own `justifyContent` and this wrapper's `alignSelf`.
                // (The WORD form keeps the default stretch: it is a line of text
                // and lays itself out as one.)
                <View style={styles.endActionGlyph}>{endAction.renderIcon(WHITE)}</View>
              ) : (
                <Text style={[styles.chipText, styles.endActionText]}>{endAction.label}</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </Container>
  )
}

// ── THE stacked chip: one tile, several facts, a rule between them ─────────
// (user directive 2026-07-30.) The match card's bottom-START facts — the circle
// we share, the kids/family sentence, the where/when — were three separate white
// tiles in a column with photo showing between them. They are ONE tile now,
// divided by the app's hairline: they are one set of facts about one person, and
// a set is an object. The photo shows around it, not through it.
//
// The divider is the app's ONE rule — LINE at StyleSheet.hairlineWidth, the very
// hairline the dock draws between its options and `ChipRule` draws inside a chip
// — laid ACROSS the tile because these facts are stacked, and edge to edge
// because this is one object being divided rather than a list of rows in a box.
//
// The rows are ordinary `Chip`s: each keeps its glyph slot and the chip's own
// gutter, so the tile declares no padding of its own and the rule needs no inset.
// What a row drops is only what made it a separate OBJECT — the fill and the
// lift — and it drops it through the context above rather than by a prop at the
// call site.
//
// What it takes ON is the gutter on the VERTICAL too (user directive 2026-07-31,
// see CHIP_BLOCK_PAD): a stacked row is a wrapping sentence in a wide white
// block, not a short line in a capsule, so the pill's derived padding — which is
// whatever a round chrome button has left over — read as text pressed against the
// block's top and bottom edges. The rows are the one part of the app that pays
// the same air on all four sides; a lone chip is still exactly a button tall.
//
// On its OUTER edges, that is (user directive 2026-07-31): the two rows meeting
// at a seam pay it together, half each, so the facts stand a gutter apart
// instead of two (see CHIP_BLOCK_SEAM_PAD). The tile's own four edges are
// unchanged — a row learns which of its edges is which from the context below.
//
// alignItems:'flex-start' so every row hugs its own label and the tile hugs the
// WIDEST of them (a stretch-aligned column would have made every row as wide as
// the widest and defeated each chip's own hug). The rule then takes
// `alignSelf:'stretch'`, which is what lets a zero-width hairline span whatever
// width the rows settled on.
export function ChipStack({
  tone = 'neutral',
  onPhoto = false,
  pointerEvents,
  style,
  children,
}: {
  tone?: ChipTone
  onPhoto?: boolean
  /** The tile is PAINTED where its widest row reaches, so it swallows its own
   *  touch everywhere it is white — see the match card's toggle rule. Stated
   *  here rather than per row for exactly that reason. */
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only'
  style?: StyleProp<ViewStyle>
  children?: React.ReactNode
}) {
  // toArray drops the nulls a conditional row renders, so the rules land between
  // the facts that are actually there — and an empty set paints no tile at all.
  const rows = Children.toArray(children)
  if (!rows.length) return null
  const { bg } = TONES[tone]
  const bgColor = onPhoto && tone !== 'solid' ? PHOTO_CHROME : bg
  return (
    <View
      pointerEvents={pointerEvents}
      style={[styles.stack, { backgroundColor: bgColor }, onPhoto && styles.chipShadow, style]}
    >
      {rows.map((row, i) => (
        <Fragment key={isValidElement(row) ? row.key ?? i : i}>
          {i ? <View style={styles.stackRule} /> : null}
          {/* A provider per ROW, not one around the set: what a row needs to know
              is its own position, which is what decides whether each of its
              vertical edges pays the block's gutter or half of it. */}
          <ChipStacked.Provider value={rowPos(i, rows.length)}>{row}</ChipStacked.Provider>
        </Fragment>
      ))}
    </View>
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

// `size` because this glyph also labels the own-profile preview's "family &
// kids" BUTTON, where the button injects its own glyph size (BUTTON_GLYPH) —
// same as its siblings above.
export function KidsIcon({ color, size = ICON.sm }: { color: string; size?: number }) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none">
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
    // THE chip's gutter: MD, twice the air the tile keeps above and below its
    // label (tried at SM on 2026-07-30 and reverted the same day — a chip is a
    // wide-ish tile on purpose, and a label pressed to 8dp from the tile's edge
    // read as cramped). `paddingVertical` here is only the pre-measurement
    // stand-in; the real one is derived (see CHIP_HEIGHT / useChipPadding), and
    // it is the same number at font scale 1, so nothing moves as the probe lands.
    paddingHorizontal: CHIP_GUTTER,
    paddingVertical: SM,
    borderRadius: RADIUS,
    flexShrink: 1,
  },
  // The compact tile: one step in on both axes, so the chip annotates a list row
  // instead of standing beside it as an object of its own weight.
  chipSmall: { paddingHorizontal: SM, paddingVertical: XS, gap: XS },
  // A chip that is a BLOCK rather than a pill — a stacked row of the match card's
  // fact tile. The gutter on all four sides (see CHIP_BLOCK_PAD): these rows are
  // wrapping sentences in a wide white block, not one short line in a capsule, so
  // the pill's derived 8dp read as text pressed against the block's edges.
  chipBlock: { paddingVertical: CHIP_BLOCK_PAD },
  // …and half of it on an edge that faces a SEAM rather than the outside, since
  // the row on the other side of that hairline pays the other half (see
  // CHIP_BLOCK_SEAM_PAD). Two styles and not four, so each edge is decided on its
  // own and a one-row stack keeps the block's air on both.
  chipBlockSeamTop: { paddingTop: CHIP_BLOCK_SEAM_PAD },
  chipBlockSeamBottom: { paddingBottom: CHIP_BLOCK_SEAM_PAD },
  // The line-box probe is a measuring stick, not content: absolute so it neither
  // takes a slot in the chip's row (the row's `gap` would push the label off by
  // SM for a zero-width child) nor holds the tile open when the label is taller
  // than one line. It paints nothing at any size.
  chipProbe: { position: 'absolute' },
  // Same soft lift the round overlay buttons cast — applied to on-photo tiles so
  // chips and buttons read as one fabric off the image (shared LIFT_SHADOW).
  chipShadow: LIFT_SHADOW,
  // The stacked tile (see ChipStack): the chip's own ground and corner, with the
  // rows' boxes inside it. It states no padding — every row is a whole chip box
  // already — and hugs its widest row, the same way a lone chip hugs its label.
  stack: {
    direction: isRTL ? 'rtl' : 'ltr',
    flexDirection: 'column',
    alignItems: 'flex-start',
    borderRadius: RADIUS,
    flexShrink: 1,
  },
  // The divider between two facts on one tile: the app's ONE hairline, run edge
  // to edge (`alignSelf:'stretch'` — the rows carry the gutter, so the rule needs
  // no inset of its own and reads as the tile being divided rather than as a
  // list separator sitting inside it).
  stackRule: {
    alignSelf: 'stretch',
    height: StyleSheet.hairlineWidth,
    backgroundColor: LINE,
  },
  // The rule is drawn OUTSIDE the padding box, so an outlined chip would sit
  // taller and wider than the filled chips beside it. Pull the padding in by
  // exactly the border width: same tokens, same outer rectangle, so a row of
  // chips keeps one height whichever variant it holds. (The vertical half of
  // that is `chipPad`'s job on every chip but the `small` one, which is the only
  // variant still taking its box from this rule — see CHIP_HEIGHT.)
  chipOutlined: {
    ...OUTLINE_SKIN,
    backgroundColor: 'transparent',
    paddingHorizontal: CHIP_GUTTER - STROKE.thin,
    paddingVertical: SM - STROKE.thin,
  },
  chipText: {
    fontSize: TEXT.md,
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
  },
  // The in-chip rule's box: one line of label tall (the probe beside it says how
  // tall that is) with the hairline stretched to fill it. It hugs its content on
  // the cross axis in the chip's flex-start row, so on a wrapped label it stands
  // beside line one.
  rule: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  ruleInk: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: LINE,
  },
  // The purple block continuing the tile at its trailing edge (see `endAction`).
  // It carries the chip's OWN gutter — the same MD the label stands in on the
  // other side — so the tile reads as one box with a purple end, not as a button
  // parked inside a chip. Its END corners are the tile's (RADIUS), its start
  // edge is square, because that edge is where the tile continues. The vertical
  // half of the bleed is inline: only the chip knows its derived padding.
  endAction: {
    alignSelf: 'stretch',
    // …and a FLOOR under that stretch, because the stretch is the one part of
    // this box that is not guaranteed: the chip's row is aligned flex-start (for
    // the leading glyph), so `alignSelf` is a per-child override — the very kind
    // Fabric is known to drop silently on this component (see `chip` above, where
    // the same lesson is recorded about the glyph wrapper). Dropped, the block
    // collapses to its own content and stands SHORT of the tile's bottom edge,
    // which reads as the mark inside it sitting high (user report 2026-07-31).
    // A chip is exactly a round chrome button tall, so that height is the floor,
    // and it is inert wherever the stretch does work: a one-line tile is exactly
    // CHIP_HEIGHT, and a wrapped one is taller still.
    minHeight: CHIP_HEIGHT,
    justifyContent: 'center',
    marginEnd: -CHIP_GUTTER,
    // The tile's own white, laid as a RING around the purple (user directive
    // 2026-07-30). It is an optical correction, not a decoration: a dark block
    // butted against a light one of the same height reads SMALLER than it is
    // (irradiation), so the purple looked like a short button dropped into the
    // tile. Setting it back off the tile's edges by a stroke — in the very white
    // the name stands on, so the ring reads as the tile and not as a border —
    // makes the two ends read as one object again. `borderColor` is inline: only
    // the chip knows which ground it is painting (PHOTO_CHROME on a photo, the
    // tone's own bg off it).
    borderWidth: STROKE.thin,
    // The block's outer edge is the tile's, so the label's gutter is measured
    // from there: a border is drawn INSIDE the box, so the padding gives back
    // exactly what the stroke took (same correction as `chipOutlined`).
    paddingHorizontal: CHIP_GUTTER - STROKE.thin,
    // For whatever precedes it this block is an edge, not a neighbouring part,
    // so the label stands at the tile's GUTTER from it rather than at the row's
    // inter-part gap: the tile's own MD, less the SM the chip's `gap` already
    // puts there.
    marginStart: CHIP_GUTTER - SM,
    backgroundColor: INK,
    borderTopEndRadius: RADIUS,
    borderBottomEndRadius: RADIUS,
  },
  // The mark inside that block, hugging itself and centred across it. The block
  // is a column, so `alignSelf` is the horizontal half and its own
  // `justifyContent` the vertical one — between them the mark sits in the middle
  // of the purple, which is the whole point (see the slot it replaced).
  endActionGlyph: {
    alignSelf: 'center',
  },
  endActionText: {
    color: WHITE,
  },
  // A small pale-purple pill riding inside the chip after the label — the
  // "+N more shared groups" hint. The PAGE tint, the same fill the chip itself
  // wears off-photo (user directive 2026-07-28: every chip is the page purple),
  // so it reads as a whisper of purple against the white chip tile. It hugs its
  // own line and the row aligns it flex-start, so the pill sits level with the TOP
  // of line one of a wrapped label. It used to stretch its text's line box to the
  // label's (a declared `lineHeight: lh(TEXT.md)` under a TEXT.sm font) to fill
  // that line edge to edge — a declared line box grows uncapped with the OS font
  // scale, so on a large-font device the pill would have stood TALLER than the
  // label line it was there to sit inside.
  badge: {
    backgroundColor: PAGE,
    borderRadius: RADIUS,
    paddingHorizontal: XS,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: TEXT.sm,
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
  // The trailing pill's SLOT stands OFF the label: the chip's own SM gap between
  // its parts, and a step more on top of it, so the count reads as a second
  // object on the tile rather than as the last word of the label (user directive
  // 2026-07-29). alignSelf lands the slot on the label's LAST line — the chip's
  // row is aligned flex-start, for the leading glyph — and the pill is centred
  // inside it, so a one-line label reads as plainly centred either way.
  trailingPill: {
    marginStart: XS,
    alignSelf: 'flex-end',
  },
  presenceDot: {
    width: PRESENCE_DOT_SIZE,
    height: PRESENCE_DOT_SIZE,
    borderRadius: PRESENCE_DOT_SIZE,
  },
})
