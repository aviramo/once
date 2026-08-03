import { type ReactNode } from 'react'
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from './AppText'
import { Chip } from './Chip'
import { MetaLine } from './MetaLine'
import { AVATAR } from './CircleBits'
import { tap } from '../lib/haptics'
import type { MetaPart } from '../lib/meta'
import { XS, SM, MD, TEXT, WEIGHT } from '../tokens'
import { INK, LINE } from '../colors'

// THE row of this app (user directive 2026-07-29): a leading glyph or face, a
// title, and the facts about it on the app's one fact line under that title —
// with a chip riding the last of those lines and, rarely, a lane after them for
// a row that answers in place. It repeats on every surface, so it exists once:
// the Circles hub, a group's roster, the waiting queue, my friends, the
// group search, the shared-groups/shared-friends popups, and the main menu's own
// rows (settings.tsx composes StripBody inside its pressable, keeping its press
// fade and its card grouping — see below). A variant is a PROP, never a second
// row component.
//
// Three rules the strips are shaped by, all absolute:
//  • The TITLE OWNS THE FULL WIDTH of the strip and is never clipped. A group's
//    name wraps to as many lines as it needs; nothing sits beside it stealing
//    room, which is what used to cut "Tel Aviv Weekend Runners" to an ellipsis.
//  • THE CHIP RIDES THE LAST TEXT LINE, at its end, facing it. On a row with
//    facts that is the fact line ("26 members"), so the chip sits opposite the
//    details rather than beside the name. On a title-only strip (a member, the
//    queue entry) the last line IS the title, so the chip sits on it.
//  • NO CHEVRON, ever (user directive 2026-07-28). A card of rows on a page that
//    goes somewhere when you tap it does not need an arrow on every one of them,
//    and the lane it ate belonged to the name.

/** How far in from the card's edge a strip holds its contents — the app's page
 *  gutter, MD. Exported because a bare glyph in the `trailing` lane has to be
 *  measured against it to line up with the chrome above the list (see
 *  CirclesPage's ROW_GLYPH_INSET): a mark's own box is not the tile a
 *  chrome control wears, so the two cannot simply share this edge. */
export const STRIP_GUTTER = MD

/** The row box itself. Not exported: nothing stands in a strip's place any more
 *  (the hub's empty-state row was the one caller, deleted 2026-07-30). */
const STRIP_ROW: ViewStyle = {
  flexDirection: 'row', alignItems: 'center', gap: MD,
  paddingHorizontal: STRIP_GUTTER, paddingVertical: MD,
  borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE,
}

export type StripProps = {
  /** The leading lane: an Avatar, a glyph disc, anything. */
  icon?: ReactNode
  /** `avatar` (default) parks it in the fixed avatar-wide lane every roster
   *  shares, so names line up whatever sits in it. `natural` leaves the node its
   *  own width — the menu rows, whose glyph is narrower than a face. */
  iconLane?: 'avatar' | 'natural'
  title?: string
  /** Ink for the title, when a surface tints a row (the menu's tinted rows). */
  titleColor?: string
  /** The row is a HEADING over the rows under it, not one of them — the join
   *  queue's own row, which is the one strip in the app that names a section
   *  rather than a person. It takes the app's one emphasis (`WEIGHT.medium`,
   *  what `Chip bold` puts on a label) and nothing else: the size, the ink and
   *  the lane are the strip's, so it is still the same row, said louder. This is
   *  NOT a licence to weight a row's NAME — a title separates from its facts by
   *  size and colour, never by a second weight (user directive 2026-07-29) — and
   *  a name is what every other strip in the app carries. */
  titleStrong?: boolean
  /** The facts about this row, stated on the app's ONE fact line (MetaLine).
   *  Falsy entries drop, so a caller can inline a condition. Never clipped:
   *  what is said about a row wraps with it. */
  meta?: MetaPart | MetaPart[]
  /** Nothing to say (null/undefined/empty) renders no chip at all. */
  tag?: string | number | null
  /** The chip is a full-strength purple tile with white ink instead of the pale
   *  one: something is WAITING on the user there (join requests), and the pale
   *  chip that states a standing role must not read as the same weight. */
  tagStrong?: boolean
  /** Anything else that rides the END of the last text line, where `tag` would.
   *  For a caller whose own control belongs on that line (the menu's watcher
   *  count, its switch-like chips) rather than a plain count. */
  lineEnd?: ReactNode
  /** The chip stands immediately BESIDE the words instead of at the line's END
   *  edge (user directive 2026-07-30, the menu's credits count): a number that
   *  IS the row's subject reads as part of what the row says, so it follows the
   *  label like a value, where a chip parked at the far edge read as a separate
   *  control facing it across the row. Only the line carrying the chip stops
   *  taking the full width; the title still wraps rather than clipping. */
  endBeside?: boolean
  /** A lane AFTER the text column, for a row that can be ANSWERED where it
   *  stands: the friend-request row's accept/decline pills, and the join
   *  queue's one-tap approve tick. Not a substitute for where the row goes —
   *  the queue's row still opens the requester's profile, and the lane only
   *  saves the trip for the answer that is nearly always the one given. */
  trailing?: ReactNode
}

/** A strip's contents, without a row box around them — for a surface that owns
 *  its own pressable (the menu's SelectFieldRow, with its press fade, its card
 *  grouping and its locked/large variants). The parent supplies the row's
 *  flexDirection + gap; everything inside it is this component's. */
/** The facts a row has to state, if any. Asked rather than read off what
 *  MetaLine rendered: the row's height and where its chip rides both depend on
 *  whether there IS a line under the title. */
const stripFacts = (meta: StripProps['meta']): string[] =>
  (Array.isArray(meta) ? meta : [meta]).filter(Boolean) as string[]

export function StripBody({ icon, iconLane = 'avatar', title, titleColor, titleStrong, meta, tag, tagStrong, lineEnd, endBeside, trailing }: StripProps) {
  const facts = stripFacts(meta)
  // The one chip component, in its small size (`Chip small`): a strip's chip and
  // the menu row's chip are the same tile, so a count that moves between the two
  // surfaces does not change shape on the way.
  const end = tag != null && tag !== ''
    ? <Chip small text={String(tag)} tone={tagStrong ? 'solid' : 'positive'} />
    : lineEnd ?? null
  // Only the line the chip rides gives up the full width, and only when asked
  // to: that is the whole of `endBeside`.
  const endLineText = end != null && endBeside ? s.lineTextHug : s.lineText
  // AND WHEN IT NO LONGER FITS BESIDE THE WORDS, IT DROPS UNDER THEM. `beside`
  // is where the chip STANDS, not a promise that the two share one line: a
  // sentence-length chip (the visibility row's "Ayelet and someone else are
  // watching me") outgrows the column at a large font scale, and with the line
  // unable to break, the only item that could give was the LABEL — which has
  // `minWidth: 0`, so it was squeezed to zero width and painted nothing at all,
  // leaving the pill floating in a band of empty white where the row's own state
  // should have been (Hebrew_Big, 2026-08-02). The title owns the full width and
  // is never clipped; what gives is the line, which grows a second row.
  const endLine = end != null && endBeside ? s.lineWrap : null
  return (
    <>
      {icon ? (iconLane === 'avatar' ? <View style={s.icon}>{icon}</View> : icon) : null}
      <View style={s.text}>
        {title != null ? (
          <View style={[s.line, facts.length === 0 ? endLine : null]}>
            <Text style={[s.title, facts.length === 0 ? endLineText : s.lineText, titleStrong ? s.titleStrong : null, titleColor ? { color: titleColor } : null]}>{title}</Text>
            {facts.length === 0 ? end : null}
          </View>
        ) : null}
        {facts.length > 0 ? (
          <View style={[s.line, endLine]}>
            <MetaLine parts={facts} style={endLineText} />
            {end}
          </View>
        ) : null}
      </View>
      {trailing}
    </>
  )
}

export function Strip({ first, style, onPress, ...body }: StripProps & {
  first?: boolean
  style?: StyleProp<ViewStyle>
  onPress?: () => void
}) {
  // NO PRESS MARK ON A STRIP (user directive 2026-08-03). A row does not report
  // that a finger is on it — the finger is on it, the user can see that — and the
  // one thing the mark actually managed to say was wrong: a scroll and a page
  // being dragged away both begin as a touch on a row, so the tint lit on every
  // one of them and read as a row that had been chosen. What confirms a tap is
  // the HAPTIC, which fires with the press and cannot be triggered by a drag.
  // Deleted with the mark: the pressed state, the touch-move / touch-end cancels
  // it needed to survive a scroll, and the pull-engaged reaction.
  const facts = stripFacts(body.meta)
  // A strip that says something UNDER the name breathes (MD); one that is a name
  // and nothing else is the tighter people row (SM) every roster is made of. One
  // rule, so two rows of the same content can never end up different heights.
  const rowStyle = [STRIP_ROW, facts.length === 0 && s.tight, first && s.first, style]
  const content = <StripBody {...body} />
  if (!onPress) return <View style={rowStyle}>{content}</View>
  return (
    <Pressable onPress={() => { tap(); onPress() }} style={rowStyle}>
      {content}
    </Pressable>
  )
}

const s = StyleSheet.create({
  // A strip that is a name and nothing under it — the people rows every roster
  // is made of. Same strip, tighter, because there is one line to hold.
  tight: { paddingVertical: SM },
  first: { borderTopWidth: 0 },
  // The leading lane is the avatar's width whatever sits in it, so every name on
  // a list starts at the same place.
  icon: { width: AVATAR, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: XS },
  // One line of the text column: its words take the WHOLE width, and the chip,
  // when this is the last line, sits at its end facing them.
  line: { flexDirection: 'row', alignItems: 'center', gap: SM },
  lineText: { flex: 1, minWidth: 0 },
  // The `endBeside` line: the words take only what they need, so the chip after
  // them starts where they stop. Still `flexShrink`, so a long label wraps
  // instead of pushing the chip off the row.
  lineTextHug: { flexShrink: 1, minWidth: 0 },
  // …and that line may BREAK, which is the other half of the same rule (see the
  // render). A chip that fits stands beside the words exactly as before — a wrap
  // costs nothing until something overflows — and one that does not takes a line
  // of its own directly under them, at the same gap the text column puts between
  // a title and the facts below it (`s.text`'s own XS): the pill is one more line
  // this row has to say, so it is spaced like one. `rowGap` alone, so the SM
  // between the words and a chip riding beside them is untouched.
  lineWrap: { flexWrap: 'wrap', rowGap: XS },
  // A row's name is a navigation label wherever it appears — a group in the hub,
  // a person in a roster, a field in the menu: same size, same weight, same ink,
  // so the whole navigable surface reads as one voice (user directive
  // 2026-07-28). Regular weight, and the fact line under it one rank DOWN
  // (MetaLine's own type): title vs meta separates by size and colour, never by
  // a second weight (user directive 2026-07-29).
  title: { flexShrink: 1, fontSize: TEXT.md, color: INK },
  // …unless the row is a heading rather than a name — see `titleStrong`.
  titleStrong: { fontWeight: WEIGHT.medium },
})
