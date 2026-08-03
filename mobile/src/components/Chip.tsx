import { Children, Fragment, createContext, isValidElement, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { LayoutChangeEvent, NativeSyntheticEvent, Pressable, StyleProp, StyleSheet, TextLayoutEventData, View, ViewStyle } from 'react-native'
import Animated, { LinearTransition, runOnJS, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated'
import { Text } from './AppText'
import { Path, Circle, Rect } from 'react-native-svg'
import { Glyph } from './icons'
import { GlyphSlot, LineProbe } from './GlyphSlot'
import { FONT_SCALE, inkOffset, readsInAppDirection } from '../fonts'
import { isRTL as localeIsRTL } from '../i18n'
import { XS, SM, MD, RADIUS, TEXT, WEIGHT, ICON, PULSE, STROKE, ROUND_BUTTON_SIZE_SM, MOTION, CARD_SHADOW, lh } from '../tokens'
import { PHOTO_CHROME, PAGE, INK, INK_DIM, PRESENCE, INK_WASH, WHITE, LINE } from '../colors'
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
  // A FACT THAT IS NOT THERE YET, said in the ink an empty field says it in
  // (user directive 2026-08-01): the tile is the ordinary one, and only its ink
  // steps back to `INK_DIM` — the very colour `EditableText` gives a
  // placeholder, so the empty family chip and the empty bio beside it are one
  // statement in one voice. The glyph fades with the words: what is faint is the
  // whole invitation, not half of it.
  placeholder: { fg: INK_DIM, bg: PAGE },
} as const

export type ChipTone = keyof typeof TONES

/** THE SECOND FACT ON A TILE: a glyph and its word, exactly the shape the chip's
 *  own leading glyph and label make on the other side of the hairline. Stated as
 *  DATA and not as a render slot (`renderAfterRule`, which the countdown rides,
 *  is the slot) for two reasons: it does not tick, and the chip has to know both
 *  labels to lay the pair out — see `useFactPair`.
 *
 *  Its `tone` is the one tile in the app that carries two facts at DIFFERENT
 *  strengths: the match card's height row on your OWN card, where a fact you
 *  have stated stands at full ink beside one you have not, which is a
 *  placeholder. The chip takes the LEADING half's tone; this is how the half
 *  behind the rule says it is the other one. A tone and not a colour, because
 *  the palette a chip paints in lives here. */
export type ChipFact = {
  label: string
  tone?: ChipTone
  /** Handed the fact's own ink, like every other render slot here. */
  renderIcon: (color: string) => React.ReactNode
}

// A chip label made of interleaved text runs and a mini-chip cluster (the
// pale-purple pill, same fabric as the "+N" groups badge). Used by the
// family/kids chip so the ages ride as a dense little cluster of pills inside
// the sentence ("I have 3 kids [0][5][?] and want more, **busy weekend**"). A
// `text` segment carries a plain run (`bold` emphasises it — the weekend
// status); a `badges` segment carries a tight cluster of mini-chips, `ltr`
// forcing their numeric/"?" char order against an RTL paragraph.
export type ChipSegment =
  // `phrase` says this run is ONE piece of the sentence: the row may break
  // BEFORE it, never inside it (user directive 2026-08-02). A run is otherwise
  // handed to the row one word per item so it breaks where prose breaks (see
  // layLine), and that is right for a sentence — but the family chip's weekend
  // status is a short emphasised fact standing at the end of one, and broken
  // across two lines it left a single word stranded under a full line
  // ("...ורוצה עוד, פנויה בסופ״ש" / "הקרוב"). It is the same thing `phraseWrap`
  // says with NBSP for a plain label, said where a label is laid out by the flex
  // engine and glue cannot reach. The AUTHOR states it: a phrase is a unit of
  // meaning, which no measurement can find in a string.
  | { text: string; bold?: boolean; phrase?: boolean }
  | { badges: string[]; ltr?: boolean }
  // A forced line break: the segments after it start a fresh line.
  //
  // IT HAS NO CALL SITE (2026-08-02). Its one caller was the family sentence's
  // weekend phrase, which stood on a line of its own from 2026-07-26 until the
  // comma put it back into the sentence (see buildFamilySegments) — a break is
  // what a sentence does when it runs out of room, and that one was breaking
  // with room still on the line above it. The machinery is wired end to end
  // (segmentLines, the laid-out column, one row per line); it is dead weight on
  // a label that is now always ONE line's worth of words, and should be removed
  // in a change of its own rather than folded into an unrelated edit.
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
    // Only runs that are the same KIND of run may become one: the same weight,
    // and neither of them a phrase the author asked to be kept whole — merging
    // one into its neighbour would hand the pair to the row as ordinary words
    // and lose exactly what the flag was set for.
    if ('text' in seg && prev && 'text' in prev && !!prev.bold === !!seg.bold && !prev.phrase && !seg.phrase) {
      line[line.length - 1] = { text: `${prev.text} ${seg.text}`, bold: seg.bold }
    } else line.push(seg)
  }
  return lines.filter(l => l.length)
}

// ── A SENTENCE BREAKS AT ITS OWN SPACES, NOT AT THE ROW'S ITEM EDGES ───────
// (user directive 2026-08-02.) A `segments` label is a sentence with pills in
// it, and it is laid out by the FLEX engine rather than the text engine — which
// breaks between ITEMS: a run that does not fit in what is left of a line moves
// to the next line WHOLE, leaving behind a half-line of room that nothing may
// use ("יש לי 2 ילדים [2][16]" over an empty half-line, with "ורוצה עוד"
// underneath it). A paragraph would have broken between the words.
//
// So a run is handed over one WORD per item and the row breaks between them
// exactly where prose breaks. What stands between two words is the FONT's own
// space — the leading word carries it — and the row's `columnGap`, which is
// there to stand a pill off the words around it (see segmentLines), is cancelled
// between two words by a negative end margin. That margin rides the word that
// LEADS and not the one that follows, because a negative margin at a line END is
// invisible while one at a line START would push the word off the tile's gutter.
//
// AND A PILL THAT ENDS THE LINE RIDES THE LAST WORD (user directive 2026-08-02):
// the "+N" counting the other circles stands after the last word of the circle's
// NAME and wraps WITH it, which is the whole reason it flows with the text
// instead of standing as a tile beside it. As an item of its own it could not —
// a name too long for the tile left the pill alone on a line, under a line with
// room still on it — so the last word and the pill are ONE unbreakable item. A
// pill in the MIDDLE of a sentence (the kids' ages) is an item like any other:
// what follows it is more sentence, and the row may break there.
// A run whose letters read AGAINST the row is handed over whole (`readsInAppDirection`):
// the flex row would place its words in the row's own direction, and only the
// text engine can put a Latin phrase back in its order inside an RTL line. Such
// a run is `whole`, which also keeps it out of the tail pair below — a pair is
// built on the promise that its text is ONE word and therefore one line, and a
// whole run can wrap inside the pair, leaving the pill hanging beside a block
// instead of after the last word.
type LaidItem =
  | { kind: 'word'; text: string; bold?: boolean; space: boolean; whole?: boolean }
  | { kind: 'pills'; badges: string[]; ltr?: boolean }
  | { kind: 'tail'; text: string; bold?: boolean; whole?: boolean; badges: string[]; ltr?: boolean }

function layLine(line: ChipRun[]): LaidItem[] {
  const out: LaidItem[] = []
  line.forEach((seg, i) => {
    if ('badges' in seg) {
      const prev = out[out.length - 1]
      // A PILL CLUSTER BELONGS TO THE FACT IT COUNTS (user directive 2026-08-03:
      // the kids and their ages are one thing, and so is each of the other
      // facts). A cluster following a PHRASE is glued into it wherever the phrase
      // stands — "יש לי 2 ילדים [6][10]" travels as one item, and the sentence
      // breaks between the facts instead of between a fact and its own ages. A
      // cluster after a plain word keeps the older rule: it pairs only at the END
      // of the line (the circle chip's "+N", which counts the last word of a
      // name), because mid-sentence what follows a pill is more sentence and the
      // row may break there.
      if (prev && prev.kind === 'word' && !prev.space && (prev.whole || i === line.length - 1)) {
        out[out.length - 1] = { kind: 'tail', text: prev.text, bold: prev.bold, whole: prev.whole, badges: seg.badges, ltr: seg.ltr }
      } else out.push({ kind: 'pills', badges: seg.badges, ltr: seg.ltr })
      return
    }
    // TWO RUNS THAT COULD NOT BE MERGED ARE STILL TWO WORDS APART. `segmentLines`
    // joins adjacent text runs into one paragraph, but only when their `bold`
    // matches — the family sentence's weekend phrase is the emphasised one, so it
    // stays a run of its own and lands here as the very case that rule is about:
    // what stands between the two is a SPACE, not the row's pill gap. So the run
    // that leads carries the space exactly as its own words do.
    const next = line[i + 1]
    const runSpace = !!next && !('badges' in next)
    // Handed over WHOLE for either of two reasons: the author says it is one
    // phrase (`phrase`, see ChipSegment), or its letters read against the row and
    // only the text engine can order them (`readsInAppDirection`). Both come out
    // the same way — one item the row may break before and not inside.
    if (seg.phrase || !readsInAppDirection(seg.text)) {
      out.push({ kind: 'word', text: seg.text, bold: seg.bold, space: runSpace, whole: true })
      return
    }
    // `filter(Boolean)` for a run that arrived with a double space in it: an
    // empty word would be an item with nothing in it, carrying a gap of its own.
    const words = seg.text.split(' ').filter(Boolean)
    words.forEach((text, wi) =>
      out.push({ kind: 'word', text, bold: seg.bold, space: wi < words.length - 1 || runSpace }),
    )
  })
  return out
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

// A CAP MEASURED IN A NARROW MOMENT CAN NEVER FIND ITS WAY BACK OUT (user report
// 2026-08-03: "אין לי ילדים" stood on two lines inside a tile whose widest row —
// the distance sentence, twice as long — sat on one). The cap is a `maxWidth` on
// the very column it was measured from, so once it lands every later measurement
// is taken UNDERNEATH it: a label laid out while its box was still narrow wraps,
// the wrapped lines measure narrower still, and that is a stable fixed point the
// label cannot leave however much room it is given afterwards. A plain `Text`
// chip never showed it — RN measures text by its widest LINE, so those tiles hug
// themselves — which is why the fact set's one `segments` row was the one row
// stuck.
//
// So the hug is released when the ROOM grows: `ChipRoom` carries the width the
// tile itself settled on (see `ChipStack`), and a bigger one drops what was
// measured in the smaller one and measures again free. It is a ratchet in the
// widening direction only — the same shape `useUnglue` below uses, and for the
// same reason: a narrower box must stay free to re-wrap, so only MORE room is a
// reason to doubt a measurement.
const ChipRoom = createContext<number | null>(null)

function useHugWidth(key: string, lineItems: number[]) {
  const [hug, setHug] = useState<number | null>(null)
  const room = useContext(ChipRoom)
  // Read inside the layout callbacks, so they never close over a stale label.
  const items = useRef(lineItems)
  items.current = lineItems
  const boxes = useRef(new Map<string, { x: number; end: number }>())
  const rows = useRef(new Map<number, number>())
  // A new label is a new measurement: drop what the previous one measured
  // rather than capping the new text at the old text's width.
  const measured = useRef(key)
  // The room the standing measurement was taken in, so a wider tile can retire
  // it (see ChipRoom above). Only ever ratcheted UP: a tile that narrows again
  // must keep measuring under its cap, which is what makes the hug stable.
  // THE FIRST ROOM IS A GROWN ROOM (user report 2026-08-03: the family sentence
  // stood on two lines inside a tile whose distance row, twice as long, sat on
  // one). The very first measurement is taken BEFORE the tile has laid out at
  // all, i.e. with no room known — and a measurement taken in an unknown room is
  // exactly the one that must be doubted the moment a real width arrives.
  // Adopting that first width silently (which is what this did) froze whatever
  // the row happened to wrap at while the card was still finding its size, and
  // since the tile hugs its widest row, the room could then never grow past it:
  // a stable fixed point the row could not leave.
  const measuredRoom = useRef(room)
  const grown = room != null && (measuredRoom.current == null || room > measuredRoom.current + HUG_SLACK)
  if (measured.current !== key || grown) {
    measured.current = key
    measuredRoom.current = room
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
      {/* A MINI-CHIP'S INK IS CENTRED IN ITS OWN TILE (user directive
          2026-08-03: the small chips must line up with the line they stand in).
          The tile is exactly one line box tall, and a line box carries its ink
          BELOW its own centre — so the digit sat low in the pill, and a pill
          aligned by its box then read as sitting high beside the sentence.
          Lifted by the app's one `inkOffset`, off the pill's OWN text (a
          Hebrew phrase pill and a digit do not owe the same nudge), and as a
          transform so the tile keeps the size it measured. */}
      <Text
        style={[
          styles.badgeText,
          ltr && styles.badgeTextLtr,
          { transform: [{ translateY: -inkOffset(TEXT.sm, FONT_SCALE, text) }] },
        ]}
      >
        {text}
      </Text>
    </View>
  )
}

// ── A MINI-CHIP STANDS ON A LINE OF TEXT, LIKE A GLYPH ─────────────────────
// (user directive 2026-08-03: the small chips must line up with the line they
// are in.) A pill is shorter than the line it flows in — its text is a size
// down — so aligning the two BOXES leaves it floating in the line's air: high
// under the row's `center`, low under the tail pair's `flex-end`. And a line
// box carries its ink BELOW its own centre, by more where the words are
// Hebrew, so even a perfectly centred box reads high beside the words.
//
// This is the very question `GlyphSlot` answers for a glyph, so it is answered
// the same way and for the same reasons: a zero-width `LineProbe` gives the
// slot the height of a REAL line of the label (never a `lh()` computed in JS —
// see the probe), the pills are centred against it, and `inkOffset` nudges them
// onto the ink. Whatever the host row aligns — the top, the middle or the last
// line of a wrapped phrase — it is now aligning a box that IS one line, so the
// pills land on that line either way.
function PillSlot({
  label,
  size,
  onLayout,
  children,
}: {
  /** The words this pill stands in, for the script (see inkOffset). */
  label: string
  /** The font size of those words. */
  size: number
  onLayout?: (e: LayoutChangeEvent) => void
  children: React.ReactNode
}) {
  return (
    <View style={styles.pillSlot} onLayout={onLayout}>
      <LineProbe size={size} cap={FONT_SCALE} style={styles.pillProbe} />
      <View style={[styles.badgeCluster, { transform: [{ translateY: inkOffset(size, FONT_SCALE, label) }] }]}>
        {children}
      </View>
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

// (A MEDIUM tile stood here for an hour on 2026-08-01 — the midpoint of
// CHIP_HEIGHT and BUTTON_MIN_HEIGHT — for the action at the end of the card
// strip's second row, which had to be big enough to read as something to press
// and to carry the invitation's credit cost. The action moved up to row 1 the
// same day, beside the clock, where it is the `small` tile like every other chip
// that annotates a line rather than standing on a card. There is no size between
// a chip and a button again, and nothing should reintroduce one without a call
// site.)

/** THE gutter of a chip: the air between the tile's edge and what it carries.
 *  Stated once because it is read on BOTH axes — see CHIP_BLOCK_PAD. */
export const CHIP_GUTTER = MD

/** ── A chip that is a BLOCK pays the gutter on the vertical too ─────────────
 *  The rule above derives a PILL's vertical padding from the round-button
 *  height, which is right for a tile carrying one short line — but the match
 *  card's bottom-START set is not that: the merged fact tile stacks three
 *  sentences, two of which wrap, and the bio tile is a paragraph. So a block
 *  states its own box, the same on every side: the stacked rows (ChipStack) and
 *  the match card's bio tile, which imports this rather than re-typing it so the
 *  two can never drift (the bio sat at a flat `padding: MD` once before, and the
 *  whole point of `useChipPadding` was to stop it from differing from the chips
 *  beside it — this is the same guarantee, now that the chips beside it are
 *  blocks too).
 *
 *  ONE number on all four sides (user directive 2026-07-31, restored 2026-08-02
 *  after an afternoon at a step in on the vertical): a block indents its text
 *  from its own rim exactly as every pill in the app does, and the tile the user
 *  reads is the one with room around its facts. The tighter top and bottom made
 *  the stack read as crowded against its own edges, which is what the block's
 *  air exists to prevent — do not close them in again.
 *
 *  What that shorter-lived value never touched, and still does not, is the air
 *  between two facts: see CHIP_BLOCK_SEAM_PAD, stated off this one.
 *
 *  A LONE pill is untouched: it is still exactly a round chrome button tall. */
export const CHIP_BLOCK_PAD = CHIP_GUTTER

/** ── A SEAM is half a gutter, because two rows pay it together ──────────────
 *  (user directive 2026-07-31.) The air above the tile's first row and below its
 *  last is the block's own — it stands between the text and the OUTSIDE, and it
 *  is a whole CHIP_BLOCK_PAD. A seam is not that: the rule between two facts has
 *  a row's padding on EACH side of it, so the full gutter twice over opened a
 *  band of empty white wider than the tile's own edges and read as three tiles
 *  again, which is the very thing the merge undid. Each side gives half, so the
 *  facts sit a gutter apart — and that number stood still through the outer
 *  edges closing in and opening back out on 2026-08-02, because how far two
 *  facts stand from each other is a different question from how close the stack
 *  runs to the tile's rim. */
export const CHIP_BLOCK_SEAM_PAD = CHIP_BLOCK_PAD / 2


/** The chip's vertical padding: what is left of CHIP_HEIGHT once one line of
 *  label is in it, halved. `lineBox` is the probe's measurement; until it has
 *  reported, the token arithmetic stands in — it is exact at font scale 1, which
 *  is where a first frame overwhelmingly is, so nothing visibly settles. An
 *  outlined chip pays for its rule out of the same box, so its outer rectangle
 *  matches the filled chips beside it. */
function chipPad(lineBox: number | null, outlined: boolean, height: number): number {
  const pad = Math.max(0, (height - (lineBox ?? lh(TEXT.md))) / 2)
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
export function useChipPadding(outlined = false, height = CHIP_HEIGHT) {
  const [lineBox, setLineBox] = useState<number | null>(null)
  // Only a measurement that CHANGES the padding is worth a render. At font
  // scale 1 the probe confirms exactly what the token arithmetic already said,
  // so the ordinary device pays nothing at all for this.
  const onHeight = useCallback(
    (h: number) => setLineBox(cur => (chipPad(cur, outlined, height) === chipPad(h, outlined, height) ? cur : h)),
    [outlined, height],
  )
  return {
    style: { paddingVertical: chipPad(lineBox, outlined, height) },
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
// ── THE NAME CLOSES; WHAT THE STATE HAS TO SAY STAYS ───────────────────────
// (user directive 2026-08-03, see `collapsed`.) The block that names the person
// — the leading mark, the label, and the rule that divides it from the readout
// — slides shut HORIZONTALLY into the tile's start edge, so the tile closes
// around its clock instead of the clock vanishing with the name.
//
// It is the mechanism the card's trailing block opens with (CardTrailing), run
// the other way: a clipping box whose width is the animation. What differs is
// that the block NEVER LEAVES THE LAYOUT (user directive 2026-08-03) — the
// movement is horizontal and nothing else, and the tile's height is this
// block's, so a block hung out of flow would hand the row's height to the
// readout beside it and the tile would change height as the name closed. It
// stays in flow and is simply pinned to the width it measured while the box
// narrows past it (`flexShrink: 0`), so the box hides its end rather than
// squeezing it into a re-wrap. At rest it is unpinned, because a long name must
// keep the shrink/wrap chain that lets it wrap inside the open tile.
//
// The chip's own row gap is cancelled as the box closes (`marginEnd`): a gap
// standing between a zero-width box and the readout is a gutter the tile pays
// for a block that is not there.
function LeadClip({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  const progress = useSharedValue(collapsed ? 0 : 1)
  const [clipping, setClipping] = useState(collapsed)
  const [width, setWidth] = useState(0)
  const settled = useRef(false)
  useEffect(() => {
    if (!settled.current) {
      settled.current = true
      return
    }
    if (collapsed) {
      // Clip FIRST, animate on the next commit: the width the run is measured
      // against has to be committed to the style before anything moves.
      setClipping(true)
    } else {
      progress.value = withTiming(1, undefined, finished => {
        'worklet'
        if (finished) runOnJS(setClipping)(false)
      })
    }
  }, [collapsed])
  useEffect(() => {
    if (collapsed && clipping && width > 0) progress.value = withTiming(0)
  }, [collapsed, clipping, width])
  const clip = useAnimatedStyle(() => {
    if (!clipping) return { width: undefined, marginEnd: 0 }
    const p = progress.value
    return { width: width * p, marginEnd: -SM * (1 - p) }
  }, [clipping, width])
  return (
    <Animated.View style={[styles.leadClip, clip]}>
      <View
        style={[styles.leadClipRow, clipping && { width, flexShrink: 0 }]}
        // Measured only while unpinned: that is the width the tile actually
        // gives this block, and it is the one the close is run against.
        onLayout={clipping ? undefined : e => {
          const w = e.nativeEvent.layout.width
          setWidth(cur => (Math.abs(cur - w) < 0.5 ? cur : w))
        }}
      >
        {children}
      </View>
    </Animated.View>
  )
}

function ChipRule({ size }: { size: number }) {
  return (
    <View style={styles.rule}>
      <LineProbe size={size} cap={FONT_SCALE} />
      <View style={styles.ruleInk} />
    </View>
  )
}

// ── A FACT IS ONE PACKAGE: ITS GLYPH AND ITS WORD, NEVER SPLIT ─────────────
// (user directive 2026-08-02.) A tile carrying two facts is a row of five boxes
// — glyph, word, rule, glyph, word — and a flex row with nothing to wrap at
// shrinks its items instead: on a narrow column at a large font scale the mark
// stayed where it was and the words were squeezed until the breaker cut them
// mid-word ("⇕ 5'4 / "  │  🚬 Smoke / r", Hebrew_Big). So each fact is a box of
// its own that cannot break, and the ROW is what wraps: two lines when the two
// facts cannot stand side by side, each still whole.
//
// The rule goes with them. It divides two facts on ONE line; at the end of a
// wrapped line it is a hairline dangling after a word, dividing nothing — the
// stacking is the division, and the row's own tight line gap is what says these
// two lines are one fact-row rather than two rows of the tile (which stand a
// seam apart, see CHIP_BLOCK_SEAM_PAD).
//
// The same measure-then-correct shape as `useHugWidth` above, and for the same
// reason: A FLEX WRAP ROW CANNOT SHRINK-TO-FIT WHAT IT WRAPPED — once it wraps
// it takes the whole width it was offered, leaving the tile a band of empty
// white past its two short lines. Two boxes is all this row has, so the widest
// line is arithmetic rather than a sweep of item edges: the two of them plus the
// gap when they share a line, the wider of the two when they do not.
//
// It cannot loop. The cap is the widest line, which is always LESS than the two
// facts side by side, so a wrapped row stays wrapped and re-measures the same;
// dropping the rule only ever narrows the lead box, so the second pass can only
// narrow the cap. `maxWidth`, not `width`, exactly as the hug above: a box that
// gets NARROWER (a larger font scale) must stay free to re-wrap.
const FACT_WRAP_SLOP = 1
const FACT_FIT_INIT = { wrapped: false, hug: null as number | null }

function useFactPair(key: string) {
  const [fit, setFit] = useState(FACT_FIT_INIT)
  const lead = useRef<{ w: number; y: number } | null>(null)
  const trail = useRef<{ w: number; y: number } | null>(null)
  // New facts are a new question: measure them in the room the tile has, never
  // cap them at what the last pair happened to need.
  const measured = useRef(key)
  if (measured.current !== key) {
    measured.current = key
    lead.current = null
    trail.current = null
    if (fit !== FACT_FIT_INIT) setFit(FACT_FIT_INIT)
  }
  const settle = useCallback(() => {
    const a = lead.current
    const b = trail.current
    // Nothing to say until both boxes have reported: a cap read off one of them
    // is a cap at half the row.
    if (!a || !b) return
    // Two boxes on one line share a cross-axis start (the row is flex-start
    // aligned), so a trailing fact standing LOWER than the leading one is a
    // trailing fact on a line of its own.
    const wrapped = b.y - a.y > FACT_WRAP_SLOP
    const hug = Math.ceil(wrapped ? Math.max(a.w, b.w) : a.w + SM + b.w)
    setFit(cur =>
      cur.wrapped === wrapped && cur.hug !== null && Math.abs(cur.hug - hug) <= HUG_SLACK
        ? cur
        : { wrapped, hug },
    )
  }, [])
  const onLead = useCallback((e: LayoutChangeEvent) => {
    lead.current = { w: e.nativeEvent.layout.width, y: e.nativeEvent.layout.y }
    settle()
  }, [settle])
  const onTrail = useCallback((e: LayoutChangeEvent) => {
    trail.current = { w: e.nativeEvent.layout.width, y: e.nativeEvent.layout.y }
    settle()
  }, [settle])
  return {
    wrapped: fit.wrapped,
    style: fit.hug != null ? { maxWidth: fit.hug } : undefined,
    onLead,
    onTrail,
  }
}

// ── Several facts sharing ONE tile ─────────────────────────────────────────
// (user directive 2026-07-30.) Set by `ChipStack` below: a chip rendered inside
// one is a ROW of a shared tile rather than a tile of its own, so it drops the
// two things that made it a separate object — the fill and the lift — and keeps
// everything that makes it a chip: its glyph slot and its gutter — plus the
// block's own vertical air (CHIP_BLOCK_PAD, in place of the pill's derived
// padding). A context and not a prop, so no call site can put a chip in a stack
// and forget to say so.
//
// It carries WHERE in the tile the row is, because that is what decides each of
// its two vertical edges: an edge facing the outside pays the block's air, an
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
  fact,
  renderAfterRule,
  renderTrailing,
  onTrailingPress,
  collapsed,
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
   * chip, the shared-circle chip) and `text` is ignored. `renderTrailing` is
   * NOT: a mark at the tile's trailing end says something about the TILE (the
   * shared circle's disclosure chevron) and is the same mark whichever shape
   * the label took, so it stands in the chip's own row either way. */
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
  /** A SECOND FACT on the same tile, behind the app's hairline — the smoking
   *  half of the match card's height row ("175 ס״מ │ 🚬 לא מעשנת"). The tile is
   *  then a row of two PACKAGES, each a glyph and its word, and it wraps between
   *  them rather than inside either (see `useFactPair`).
   *
   *  It is the whole tile: a chip carrying two facts carries nothing else, so
   *  `count`, `renderTrailing`, `endAction` and `renderAfterRule` are not drawn
   *  beside it — the ticking countdown is the OTHER shape this tile takes, and a
   *  tile is one or the other. */
  fact?: ChipFact
  /** A READOUT on the same tile, TRAILING it — after the label, behind the
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
   *  chip (and the card carrying it) once a second. A second FACT is the other
   *  shape (`fact` above), stated as data because it does not tick and because
   *  the tile has to know it to lay the pair out.
   *  It is handed the tile's own LABEL SIZE beside the ink, so what stands
   *  behind the rule is set at the size of the label in front of it whichever
   *  tile it landed on (the `small` variant is a step down). */
  renderAfterRule?: (color: string, size: number) => React.ReactNode
  renderTrailing?: (color: string) => React.ReactNode
  /** Makes the TRAILING glyph its own press target, separate from the chip's
   * `onPress` — a small affordance riding inside a label chip (the match card's
   * report flag at the reading-end of the name/age heading, 2026-07-29).
   * TAP_SLOP widens the target past the tiny glyph. */
  onTrailingPress?: () => void
  /** CLOSES THE TILE DOWN TO WHAT THE STATE HAS TO SAY (user directive
   *  2026-08-03). The tap that zooms the card's info set away closes the heading
   *  tile too — but only the part of it that NAMES the person: the leading mark,
   *  the label and the rule behind it slide shut horizontally, into the tile's
   *  own START edge, and whatever `renderAfterRule` carries (the invitation's
   *  clock, chat's "End chat", the mark that opens the state's message) is left
   *  standing in a tile that has closed around it. It is the same statement the
   *  fact set's zoom makes — give the photograph its room back — said the one way
   *  a tile that must not lose its readout can say it. Only the plain-label shape
   *  takes it: a two-fact tile and a segments sentence have no part that is
   *  merely a name. */
  collapsed?: boolean
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
  // EVERY FILLED TILE IS LIFTED, WHEREVER IT STANDS (user directive
  // 2026-08-03): the app has ONE shadow for a tile lying on something
  // (CARD_SHADOW), and a chip is one of those whether it is over a photo or the
  // `small` "owner" pill on a white list row. It used to be `onPhoto` only, so
  // the same tile read as two different objects depending on its host.
  // Outlined chips (an empty add slot) stay flat — they are a rule, not a tile —
  // and a STACKED row casts nothing because the stack it stands in casts for it.
  const tileShadow = !outlined && !stacked
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
  // clusters, each line then handed to the row one WORD at a time so it breaks
  // where prose breaks (see layLine). It is built here so the hug hook knows how
  // many boxes each line owes it, and is capped by it so the tile ends where the
  // text does (see useHugWidth).
  // The size the label's own lines are set at — what a pill standing in one of
  // them is measured against (see PillSlot).
  const labelSize = small ? TEXT.sm : TEXT.md
  // A SENTENCE WITH NO PILL IN IT IS NOT A FLEX ROW — IT IS A LABEL (user report
  // 2026-08-03, iPhone: the shared-circle chip broke "אספני ויניל" across two
  // lines and left the disclosure mark stranded at the far end of a half-empty
  // one, inside a tile whose distance row was twice as long). The laid-out column
  // exists so a pill may flow INSIDE a sentence, and it pays for that with a
  // measured cap: a flex wrap row cannot shrink-to-fit what it wrapped — it
  // reports the whole width it wrapped IN — so the tile has to be capped at the
  // widest line the hug measured, and a cap taken in a narrower moment is a wrap
  // the row cannot leave while the tile's own width is being set by some OTHER,
  // longer row. A run with no pill in it owes none of that: handed to the text
  // engine as an ordinary label it hugs its widest line by construction and
  // breaks at its own spaces. So a lone text run IS the plain label, which is
  // what the circle chip is whenever there is no "+N" beside its name.
  const soleRun = segments && segments.length === 1 && 'text' in segments[0] ? segments[0] : null
  const plainLabel = soleRun ? soleRun.text : text
  const emphasis = bold || !!soleRun?.bold
  const lines = segments && !soleRun ? segmentLines(segments) : null
  const laid = lines ? lines.map(layLine) : null
  const hug = useHugWidth(
    lines ? lines.map(l => l.map(s => ('badges' in s ? s.badges.join(',') : s.text)).join('')).join('\n') : '',
    laid ? laid.map(l => l.length) : [],
  )
  const unglue = useUnglue(!lines ? plainLabel : undefined)
  // TWO FACTS ON ONE TILE, each a package of a glyph and its word (see
  // `useFactPair`). Both labels are the key: the pair is laid out under a
  // measured cap, so a half that CHANGES — the height row on your own card, the
  // moment it is answered — must be measured in the room the tile has rather
  // than in what the previous pair needed.
  const pair = !!fact && !segments
  const factFg = fact ? TONES[fact.tone ?? tone].fg : fg
  const facts = useFactPair(pair ? `${text ?? ''}\n${fact!.label}` : '')
  // The tile's height contract (see CHIP_HEIGHT): the label's real line box is
  // measured by an out-of-flow probe and the padding is whatever is left of a
  // round chrome button's diameter. Two variants opt out — the `small` tile (one
  // step UNDER the chrome on purpose, so it keeps its token box) and a STACKED
  // row (a block, not a pill; see CHIP_BLOCK_PAD).
  //
  // (A `markOnly` variant lived here for an afternoon — a tile carrying a glyph
  // and NO label, for the card strip's refusal when it was an X. Nothing in the
  // app is an icon-only chip again. If one is ever wanted, note that it has to
  // opt out of BOTH the glyph-beside-text slot below — there is no line to stand
  // beside — and the label `Text`, which renders unconditionally: a chip with no
  // label still lays out an EMPTY one, and the row's `gap` for it, which pushes
  // the mark half a gap off centre.)
  const pad = useChipPadding(outlined)
  const derivedPad = !small && !stacked
  // The leading glyph, hoisted because a two-fact tile stands it INSIDE its
  // fact's package (that is what keeps a mark with the word it annotates when
  // the row wraps) and every other tile stands it in the chip's own row.
  const leadGlyph = renderIcon
    ? <GlyphSlot {...glyphSlot} onPress={onIconPress}>{renderIcon(fg)}</GlyphSlot>
    : null
  // A tile that can close is one whose host STATES the fact, open or shut — the
  // clip has to be there in both states or the closing block would be a node
  // React mounts as it starts moving. `undefined` is a chip that never closes,
  // which is every chip in the app but the match card's heading; the two shapes
  // that have no part which is merely a name (a two-fact tile, a segments
  // sentence) never take it.
  const collapsible = collapsed !== undefined && !pair && !segments
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
      {pair || collapsible ? null : leadGlyph}
      {pair ? (
        // TWO FACTS, TWO PACKAGES (see `useFactPair`): each fact is a glyph and
        // its word in a box of its own, and the row between them is what wraps.
        // The rule travels with the leading fact and is dropped the moment they
        // stop sharing a line — a hairline at the end of a wrapped line divides
        // nothing.
        <View style={[styles.factRow, facts.style]}>
          <View style={styles.factPack} onLayout={facts.onLead}>
            {leadGlyph}
            <Text
              style={[styles.chipText, small && styles.chipTextSmall, bold && styles.chipTextBold, { color: fg }]}
              onTextLayout={unglue.onTextLayout}
              onLayout={unglue.onLayout}
            >
              {unglue.label}
            </Text>
            {facts.wrapped ? null : <ChipRule size={glyphSlot.size} />}
          </View>
          <View style={styles.factPack} onLayout={facts.onTrail}>
            <GlyphSlot {...glyphSlot} label={fact!.label}>{fact!.renderIcon(factFg)}</GlyphSlot>
            <Text style={[styles.chipText, small && styles.chipTextSmall, { color: factFg }]}>
              {fact!.label}
            </Text>
          </View>
        </View>
      ) : laid ? (
        // A column of wrapping rows: one row per `br`-delimited line, each row a
        // sentence handed over one WORD at a time with its pill clusters between
        // them, so the row breaks where prose breaks and a pill that ends the
        // line travels with the word before it (see layLine). Same direction as
        // the chip so items read start-to-end.
        //
        // The trailing slot stands OUTSIDE that column, in the chip's own row —
        // it is a mark about the tile, not a run of the sentence, so it may not
        // be swept up by the hug or pushed onto a wrapped line.
        <>
          <View style={[styles.segmentColumn, hug.style]}>
            {laid.map((items, li) => {
              // The line's own words, for the pill slots standing in it: the
              // script of the line decides how far below its box centre its ink
              // sits, exactly as it does for a glyph (see PillSlot, inkOffset).
              const lineLabel = items.map(it => (it.kind === 'pills' ? '' : it.text)).join(' ')
              return (
              <View key={li} style={styles.segments} onLayout={hug.onLineLayout(li)}>
                {items.map((it, i) =>
                  it.kind === 'pills' ? (
                    <PillSlot key={i} label={lineLabel} size={labelSize} onLayout={hug.onItemLayout(li, i)}>
                      {it.badges.map((b, j) => <Badge key={j} text={b} ltr={it.ltr} />)}
                    </PillSlot>
                  ) : it.kind === 'tail' ? (
                    <View key={i} style={styles.tailPair} onLayout={hug.onItemLayout(li, i)}>
                      {/* A tail whose text is a PHRASE rather than one word is
                          the only text in this label that may still wrap inside
                          an item: the fact and its pills travel together, so a
                          fact too wide for the tile breaks at its own spaces
                          instead of overflowing it. */}
                      <Text style={[styles.chipText, small && styles.chipTextSmall, (bold || it.bold) && styles.chipTextBold, it.whole && styles.tailTextWhole, { color: fg }]}>
                        {it.text}
                      </Text>
                      <PillSlot label={it.text} size={labelSize}>
                        {it.badges.map((b, j) => <Badge key={j} text={b} ltr={it.ltr} />)}
                      </PillSlot>
                    </View>
                  ) : (
                    <Text
                      key={i}
                      style={[
                        styles.chipText,
                        small && styles.chipTextSmall,
                        (bold || it.bold) && styles.chipTextBold,
                        it.space && styles.wordSpace,
                        { color: fg },
                      ]}
                      onLayout={hug.onItemLayout(li, i)}
                    >
                      {it.space ? `${it.text} ` : it.text}
                    </Text>
                  ),
                )}
              </View>
              )
            })}
          </View>
          {renderTrailing ? (
            <GlyphSlot {...glyphSlot} style={styles.segmentTrailing} onPress={onTrailingPress}>
              {renderTrailing(fg)}
            </GlyphSlot>
          ) : null}
        </>
      ) : (
        <>
          {(() => {
            const label = (
              <Text
                style={[styles.chipText, small && styles.chipTextSmall, emphasis && styles.chipTextBold, { color: fg }]}
                onTextLayout={unglue.onTextLayout}
                onLayout={unglue.onLayout}
              >
                {unglue.label}
              </Text>
            )
            // The hairline stands BEHIND the label and travels with it: a rule
            // dividing a name from a clock has nothing to divide once the name
            // has closed (the same reason a two-fact row drops it when the pair
            // stops sharing a line).
            const rule = renderAfterRule ? <ChipRule size={glyphSlot.size} /> : null
            return collapsible ? (
              <LeadClip collapsed={!!collapsed}>
                {leadGlyph}
                {label}
                {rule}
              </LeadClip>
            ) : (
              <>{label}{rule}</>
            )
          })()}
          {/* The second fact, behind that rule. The chip's own SM gap stands on
              each side of it, so the tile reads as two facts sharing one box
              rather than as a label with something stuck to it. */}
          {renderAfterRule ? renderAfterRule(fg, glyphSlot.size) : null}
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
// What it takes ON is the block's own air (see CHIP_BLOCK_PAD): a stacked row is
// a wrapping sentence in a wide white block, not a short line in a capsule, so it
// pays the gutter on the vertical too rather than the pill's derived padding —
// whatever a round chrome button has left over. A lone chip is still exactly a
// button tall.
//
// On its OUTER edges, that is (user directive 2026-07-31): the two rows meeting
// at a seam pay a GUTTER together, half each, so the facts stand one gutter apart
// instead of two (see CHIP_BLOCK_SEAM_PAD). A row learns which of its edges is
// which from the context below.
//
// alignItems:'flex-start' so every row hugs its own label and the tile hugs the
// WIDEST of them (a stretch-aligned column would have made every row as wide as
// the widest and defeated each chip's own hug). The rule then takes
// `alignSelf:'stretch'`, which is what lets a zero-width hairline span whatever
// width the rows settled on.
// (There is no resize transition on this tile any more, 2026-08-03 — see the
// `layout` prop below for what an animated width does to a start-anchored box.)

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
  // THE ROOM THE ROWS ARE MEASURED IN (see ChipRoom): the tile hugs its widest
  // row, so its own width is the widest any row of it has been able to make
  // itself — which is exactly the signal a row whose hug was measured in a
  // narrower moment needs to retire that measurement and lay itself out free
  // again. Stated per set and not per row: the rows share one tile.
  const [room, setRoom] = useState<number | null>(null)
  const onRoom = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    setRoom(cur => (cur !== null && Math.abs(cur - w) <= HUG_SLACK ? cur : w))
  }, [])
  // toArray drops the nulls a conditional row renders, so the rules land between
  // the facts that are actually there — and an empty set paints no tile at all.
  const rows = Children.toArray(children)
  if (!rows.length) return null
  const { bg } = TONES[tone]
  const bgColor = onPhoto && tone !== 'solid' ? PHOTO_CHROME : bg
  return (
    <View
      // THE TILE CHANGES SIZE WHERE ITS TEXT DOES, IN ONE FRAME (user report
      // 2026-08-03). It used to carry a LinearTransition, on "the tile grows and
      // shrinks, it never jumps" (2026-08-02) — but the tile HUGS its widest row,
      // so a fact whose text changes under the reader (a distance ticking from
      // "2 minutes" to "6") changes its WIDTH, and a layout animation on a width
      // interpolates the box's own ORIGIN with it: under RTL the whole set
      // visibly slid right and left on the photograph every time a number
      // changed. A start-anchored box that hugs its content may not be animated
      // on the axis it hugs. The measure-and-arm machinery that kept the tile's
      // first settling unanimated went with it — with no animation there is
      // nothing to withhold.
      pointerEvents={pointerEvents}
      // The stack is a tile like any other and is lifted wherever it stands, not
      // only over a photo (user directive 2026-08-03): on the own-profile card,
      // whose ground is white, the fact set was the one tile on the screen with
      // nothing under it. The lift is stated HERE and not by the rows — a shade
      // per row would draw a seam under each fact.
      style={[styles.stack, { backgroundColor: bgColor }, styles.chipShadow, style]}
      onLayout={onRoom}
    >
      {/* The room, on the other hand, IS one around the set: it is the tile's
          own width, the same for every row of it. */}
      <ChipRoom.Provider value={room}>
        {rows.map((row, i) => (
          <Fragment key={isValidElement(row) ? row.key ?? i : i}>
            {/* The rule divides two facts sharing ONE object. With no object it
                would be a hairline drawn across a photograph, dividing nothing —
                the gutters between the rows are what separate them now. */}
            {i ? <View style={styles.stackRule} /> : null}
            {/* A provider per ROW, not one around the set: what a row needs to know
                is its own position, which is what decides whether each of its
                vertical edges pays the block's gutter or half of it. */}
            <ChipStacked.Provider value={rowPos(i, rows.length)}>{row}</ChipStacked.Provider>
          </Fragment>
        ))}
      </ChipRoom.Provider>
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
      {/* A PARENT AND A CHILD, NOT TWO PEOPLE (user directive 2026-08-02). The
          two figures stood at 78% of each other's height, which reads as two
          adults side by side; the child is ~55% now, so its head lands at the
          parent's hip — stature, not head size, is what says which of them is
          the child. The head is deliberately NOT scaled that far (2.0 against
          the parent's 3.0): children ARE big-headed, and at ICON.sm the glyph
          paints 12dp, where a head shrunk in proportion closes into a dot. For
          the same reason its stroke is a hair lighter — the ring has to stay
          open at 0.5dp per unit. Both figures still stand on one ground line
          (y=21), which is what keeps the height difference readable. */}
      <Circle cx={17.5} cy={12.9} r={2} stroke={color} strokeWidth={1.6} />
      <Path d="M14.5 21v-0.5a3 3 0 0 1 6 0v0.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </Glyph>
  )
}

// ── The two facts a person states about his own body ───────────────────────
// They share ONE row of the fact tile, divided by the chip's own rule (see the
// `fact` prop), because either of them alone is half a sentence about the
// same thing. `size` for the same reason KidsIcon takes one: these glyphs also
// lead the rows of the popup that edits them.

// A measured span: the two ends marked, the arrow between them pointing at
// both. Ink 3..21 on the vertical, the span every other glyph in this family
// runs on the horizontal, so the mark reads at the same weight as the kids and
// the pin beside it.
export function HeightIcon({ color, size = ICON.sm }: { color: string; size?: number }) {
  return (
    <Glyph
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" strokeLinejoin="round"
    >
      <Path d="M5 3h14" />
      <Path d="M5 21h14" />
      <Path d="M12 7v10" />
      <Path d="M9 10l3-3 3 3" />
      <Path d="M9 14l3 3 3-3" />
    </Glyph>
  )
}

// A cigarette lying across the box with the filter marked off at its end, and
// one wisp off the lit tip. `crossed` is the OTHER answer (user directive
// 2026-08-02): the SAME mark with a prohibition slash over it, which is how a
// "no" is drawn everywhere in the world and is read without the word beside it.
// A VARIANT and never a second glyph, so the two answers cannot drift into two
// different cigarettes — exactly the eye/eye-off pair the visibility row wears,
// and the word still stands beside the mark in both cases.
// The slash runs corner to corner on the family's own 3..21 span, and it LEANS
// THE OTHER WAY from the app's other negations (user directive 2026-08-02;
// BlockIcon and EyeOffIcon both run top-START to bottom-END): those two cross a
// round eye and a circle, which have no grain to fight, while this one crosses a
// long horizontal object — the way it leans now it cuts the cigarette's clear
// stretch and leaves the filter tick and the wisp alone, instead of tying a knot
// of three strokes over the tick at the size a fact chip paints. It is not
// mirrored under RTL, and neither is the cigarette: an object is not a thing
// held from the reading side (compare SearchIcon and BackIcon, which are).
export function SmokeIcon({ color, size = ICON.sm, crossed = false }: { color: string; size?: number; crossed?: boolean }) {
  return (
    <Glyph width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={14} width={18} height={5} rx={2} stroke={color} strokeWidth={STROKE.base} />
      <Path d="M16.5 14v5" stroke={color} strokeWidth={STROKE.base} />
      <Path d="M7 11c0-1.8 2-1.8 2-3.6S7 5.6 7 3.8" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" />
      {crossed ? <Path d="M21 3L3 21" stroke={color} strokeWidth={STROKE.base} strokeLinecap="round" /> : null}
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
  // fact tile. It states its own air (see CHIP_BLOCK_PAD): the gutter on the
  // vertical as well as sideways, because these rows are wrapping sentences in a
  // wide white block and a block indents its text from every one of its edges.
  chipBlock: { paddingVertical: CHIP_BLOCK_PAD },
  // …and half a GUTTER on an edge that faces a SEAM rather than the outside,
  // since the row on the other side of that hairline pays the other half (see
  // CHIP_BLOCK_SEAM_PAD). Two styles and not four, so each edge is decided on its
  // own and a one-row stack keeps the block's air on both.
  chipBlockSeamTop: { paddingTop: CHIP_BLOCK_SEAM_PAD },
  chipBlockSeamBottom: { paddingBottom: CHIP_BLOCK_SEAM_PAD },
  // The line-box probe is a measuring stick, not content: absolute so it neither
  // takes a slot in the chip's row (the row's `gap` would push the label off by
  // SM for a zero-width child) nor holds the tile open when the label is taller
  // than one line. It paints nothing at any size.
  chipProbe: { position: 'absolute' },
  // Same lift the round overlay buttons cast — applied to on-photo tiles so
  // chips and buttons read as one fabric off the image. It is the app's ONE
  // shadow for a tile lying on something (CARD_SHADOW), shared with the lists
  // and the settings cards (user directive 2026-08-03).
  chipShadow: { boxShadow: CARD_SHADOW },
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
  // The box the naming block closes INTO: it clips, and its width is the
  // animation (see LeadClip). flexShrink keeps the label's shrink/wrap chain
  // running through it, so a long name still wraps inside the open tile.
  leadClip: {
    overflow: 'hidden',
    flexShrink: 1,
  },
  // The block itself: an ordinary row, IN FLOW at every moment, carrying the
  // chip's own gap between the mark, the name and the rule. It stays in flow
  // while it closes (it is only pinned to the width it measured, and stops
  // shrinking) — the movement is HORIZONTAL and nothing else, so the text may
  // never leave the layout: the tile's height is the block's, and a block hung
  // out of flow would hand the row's height over to the readout beside it and
  // change the tile's height as it closed.
  leadClipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SM,
    flexShrink: 1,
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
    // A mini-chip is a chip: it wears the app's one tile lift like every other
    // one (user directive 2026-08-03).
    boxShadow: CARD_SHADOW,
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
  // The row a TWO-FACT tile lays out in (see `useFactPair`). Its items are the
  // two facts, so `columnGap` is the chip's own SM — the air between any two
  // parts of a tile — and `rowGap` the tighter XS a wrapped label takes, which
  // is what says the two lines are ONE row of the stack and not two.
  // alignItems:'flex-start' for the reason the chip's own row does it: a fact
  // whose word wrapped is taller than the one beside it, and both marks belong
  // level with their first line.
  factRow: {
    direction: isRTL ? 'rtl' : 'ltr',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    columnGap: SM,
    rowGap: XS,
    flexShrink: 1,
  },
  // ONE fact: its glyph and its word (and, on the leading one, the rule that
  // follows it), with the chip's own SM between them — the very row the tile
  // itself is, one level in, so a package reads exactly as a lone chip's
  // contents do. It shrinks, so a fact too wide for a line of its own still
  // wraps at its spaces instead of overflowing the tile.
  factPack: {
    direction: isRTL ? 'rtl' : 'ltr',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SM,
    flexShrink: 1,
  },
  // The age pills packed tight as one inline unit (user directive 2026-07-26 —
  // "denser"): a hair-gap between pills, well under the SM that separates the
  // sentence's words, so [0][5][?] read as a single little group.
  // The pill slot: exactly one line of the label tall (see PillSlot), so a host
  // row aligning it — top, centre or the last line of a wrapped phrase — is
  // aligning a line rather than a shorter tile floating in one.
  pillSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 1,
  },
  // Zero width, like GlyphSlot's: the probe adds height and nothing else, so the
  // slot stays exactly as wide as its pills and the hug measures the ink.
  pillProbe: { width: 0 },
  badgeCluster: {
    direction: isRTL ? 'rtl' : 'ltr',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: XS,
    rowGap: XS,
  },
  // TWO WORDS STAND A SPACE APART, NOT A CHIP-GAP APART (see layLine). The
  // leading word carries the font's own space and cancels the row's `columnGap`
  // — which is there to stand a PILL off the words around it, and between two
  // words would be a second space, and a visibly wider one. It rides the word
  // that LEADS because a negative end margin at a line end is invisible, while
  // the same margin on the word that follows would push a line's first word out
  // through the tile's gutter.
  wordSpace: { marginEnd: -SM },
  // The last word of a sentence and the pill that counts it: ONE item, so the
  // row can break BEFORE the word and never between the word and its pill. Its
  // gap is the row's own — this pair is a pill standing off the words beside it,
  // which is exactly what that gap is for — and `alignItems:'center'` is the
  // row's own too: the word is a single line by construction, so the pill sits
  // on it exactly as it sat when both were items of the row.
  // AND THE PAIR ITSELF WRAPS, SO A WORD IS NEVER BROKEN TO KEEP ITS PILL BESIDE
  // IT (user directive 2026-08-03: "a word must stay together; the +5 goes on a
  // line of its own — if there is no room on the same line"). A pair that does
  // not fit is one item the row cannot break, so the only thing left to give was
  // the WORD, and the text engine broke it mid-word ("אסטרונומי / ה" beside its
  // +5). Wrapping INSIDE the pair keeps the pairing exactly as it was wherever
  // the two fit on one line, and drops the pill onto the next line only where
  // they do not — which is the pill's own last resort rather than the name's.
  tailPair: {
    direction: isRTL ? 'rtl' : 'ltr',
    flexDirection: 'row',
    flexWrap: 'wrap',
    // AND THE PILL STANDS ON THE LAST LINE OF WHAT IT COUNTS (user directive
    // 2026-08-03). Whether it wrapped onto a line of its own or the tail's text
    // did, a CENTRED pill floats against the middle of the block beside no line
    // at all. `flex-end` puts it where the sentence ENDS; a pair that fits on one
    // line is unmoved, that line being the last one.
    alignItems: 'flex-end',
    columnGap: SM,
    rowGap: XS,
    flexShrink: 1,
  },
  // A PHRASE tail is the one text in the label allowed to give: the fact and its
  // pills are one item, so a fact wider than the tile must break at its own
  // spaces rather than push the pills off the edge. A one-WORD tail keeps its
  // width — there is nothing in it to break but the word itself.
  tailTextWhole: { flexShrink: 1 },
  // The disclosure mark stands XS off the label, not the chip's own SM — exactly
  // the distance it keeps from the clock it follows in the heading tile
  // (`trailingRow` in MatchCard): the mark and what it follows are ONE
  // statement, and this row is read for the label rather than for the mark. The
  // 4dp it gives back is 4dp the sentence keeps: a segments label wraps at its
  // own items, so the last of them — the "+N" pill — is what a too-narrow line
  // costs, and this row is the tile's widest.
  segmentTrailing: { marginStart: XS - SM },
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
