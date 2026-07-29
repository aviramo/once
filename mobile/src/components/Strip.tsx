import { useState, type ReactNode } from 'react'
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from './AppText'
import { Chip } from './Chip'
import { MetaLine } from './MetaLine'
import { AVATAR } from './CommunityBits'
import { tap } from '../lib/haptics'
import type { MetaPart } from '../lib/meta'
import { XS, SM, MD, TEXT } from '../tokens'
import { INK, LINE, INK_WASH } from '../colors'

// THE row of this app (user directive 2026-07-29): a leading glyph or face, a
// title, and the facts about it on the app's one fact line under that title —
// with a chip riding the last of those lines and, rarely, a lane after them for
// a row that answers in place. It repeats on every surface, so it exists once:
// the Communities hub, a group's roster, the waiting queue, my friends, the
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

/** The row box itself, for a caller that lays out its own contents in a strip's
 *  place (the hub's empty-state row). */
export const STRIP_ROW: ViewStyle = {
  flexDirection: 'row', alignItems: 'center', gap: MD,
  paddingHorizontal: MD, paddingVertical: MD,
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
  /** The one row that answers in place instead of opening something: the
   *  friend-request row's accept/decline pills. A lane AFTER the text column. */
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

export function StripBody({ icon, iconLane = 'avatar', title, titleColor, meta, tag, tagStrong, lineEnd, trailing }: StripProps) {
  const facts = stripFacts(meta)
  // The one chip component, in its small size (`Chip small`): a strip's chip and
  // the menu row's chip are the same tile, so a count that moves between the two
  // surfaces does not change shape on the way.
  const end = tag != null && tag !== ''
    ? <Chip small text={String(tag)} tone={tagStrong ? 'solid' : 'positive'} />
    : lineEnd ?? null
  return (
    <>
      {icon ? (iconLane === 'avatar' ? <View style={s.icon}>{icon}</View> : icon) : null}
      <View style={s.text}>
        {title != null ? (
          <View style={s.line}>
            <Text style={[s.title, s.lineText, titleColor ? { color: titleColor } : null]}>{title}</Text>
            {facts.length === 0 ? end : null}
          </View>
        ) : null}
        {facts.length > 0 ? (
          <View style={s.line}>
            <MetaLine parts={facts} style={s.lineText} />
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
  const [pressed, setPressed] = useState(false)
  const facts = stripFacts(body.meta)
  // A strip that says something UNDER the name breathes (MD); one that is a name
  // and nothing else is the tighter people row (SM) every roster is made of. One
  // rule, so two rows of the same content can never end up different heights.
  const rowStyle = [STRIP_ROW, facts.length === 0 && s.tight, first && s.first, style]
  const content = <StripBody {...body} />
  if (!onPress) return <View style={rowStyle}>{content}</View>
  return (
    <Pressable
      onPress={() => { tap(); onPress() }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[rowStyle, pressed && { backgroundColor: INK_WASH }]}
    >
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
  // A row's name is a navigation label wherever it appears — a group in the hub,
  // a person in a roster, a field in the menu: same size, same weight, same ink,
  // so the whole navigable surface reads as one voice (user directive
  // 2026-07-28). Regular weight, and the fact line under it one rank DOWN
  // (MetaLine's own type): title vs meta separates by size and colour, never by
  // a second weight (user directive 2026-07-29).
  title: { flexShrink: 1, fontSize: TEXT.md, color: INK },
})
