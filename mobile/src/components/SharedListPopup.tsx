// "What we already share", opened by tapping a profile card's on-photo circle
// chip — wherever that card is: home's match card, and the person page inside
// the Circles sheet (user directive 2026-07-30, a profile is a profile).
// ONE popup for every kind of connection (user directive 2026-07-29): the people
// we are both friends with AND the groups we are both in, in one list.
// It used to be two popups behind two chips, which asked the user to know in
// advance which kind of connection they were looking for.
//
// The order is the chip's own (lib/circles.ts → orderSharedCircles): the
// groups smallest first, with MY FRIENDS slotted in at its size, so row 1 is
// always the circle the chip named. Read-only rows, no actions on them.
//
// Presentational: both lists are fetched by the OPENER (useSharedCircles, at the
// foot of this file) the instant the chip is tapped and passed in, so they load
// in parallel with the sheet's slide-in instead of only after it mounts. `null`
// renders the skeleton.
// Composes the shared BottomSheet (never a raw Modal) and the shared Avatar
// primitive, so a person here looks identical to one in the Circles sheet.
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { View, StyleSheet } from 'react-native'
import { Strip } from './Strip'
import { BottomSheet, SheetTitle } from './BottomSheet'
import { Avatar, SkeletonRows } from './CircleBits'
import { GroupsIcon } from './icons'
import { GroupSheet } from './CirclesPage'
import { tap } from '../lib/haptics'
import { groupFacts, friendOfLabel, orderSharedCircles, sharedGroups, sharedFriends, useMyFriendCount, type SharedGroup, type FriendItem } from '../lib/circles'
import type { MetaPart } from '../lib/meta'
import { t } from '../i18n'
import { RADIUS, SHEET_GAP } from '../tokens'
import { INK, SURFACE } from '../colors'

/** One row: a leading avatar/icon, a title line, and the facts under it — any
 *  number of them, composed onto ONE meta line (a group carries two facts, a
 *  person carries none). */
export type SharedRow = {
  key: string
  leading: ReactNode
  title: string
  meta?: MetaPart[]
  onPress: () => void
}

export function SharedListPopup({
  visible, title, rows, skeletonLines = 1, onDismiss, children,
}: {
  visible: boolean
  title: string
  /** null while loading. */
  rows: SharedRow[] | null
  /** Text lines the real rows carry, so the placeholder opens at roughly the
   *  final height instead of growing under the user's thumb. */
  skeletonLines?: number
  onDismiss: () => void
  /** A popup a ROW opens, rendered INSIDE this one's Modal so it presents over
   *  the list instead of replacing it — see SharedCirclesPopup below. A popup is
   *  its own native window, and two of them as SIBLINGS is the case iOS refuses
   *  to present (why BottomSheet has `onClosed`); nested, the inner one simply
   *  stands on the outer one's window. It sits outside the body column and is
   *  absolutely positioned by RN, so it takes no room and adds no gap. */
  children?: ReactNode
}) {
  return (
    <BottomSheet visible={visible} onDismiss={onDismiss}>
      <View style={styles.wrap}>
        <SheetTitle>{title}</SheetTitle>
        <View style={styles.card}>
          {rows == null ? (
            <SkeletonRows rows={2} lines={skeletonLines} />
          ) : rows.map((r, i) => (
            // The app's ONE row (components/Strip.tsx), the same one the
            // Circles hub and the menu are built from (user directive
            // 2026-07-29) — this popup used to keep a near-identical row of its
            // own. Every fact about the row therefore states itself on the app's
            // one fact line: a stack of meta lines made a two-fact group as tall
            // as three rows of a list that has only one thing to say per row;
            // side by side they read as one sentence about the group.
            <Strip
              key={r.key}
              first={i === 0}
              icon={r.leading}
              title={r.title}
              meta={r.meta}
              onPress={r.onPress}
            />
          ))}
        </View>
      </View>
      {children}
    </BottomSheet>
  )
}

// ── Everything we share ────────────────────────────────────────────────────
// A group row states who manages it and how many members on one meta line, and
// opens the app's one group popup (share link / leave) — the same surface the
// Circles hub and the group search open, in the `joined` state, since a
// group listed here is one we are both IN. THE LIST STAYS EXACTLY WHERE IT IS
// while that stands over it (user directive 2026-07-30): the group popup is
// nested inside this one's window (see `children` above), so it rises over the
// list and leaving it reveals the list already there. It used to be a sibling
// popup with the list switched off underneath (`visible && !selected`), which
// slid the list away on the tap and slid it back in on the way out — two full
// animations to look at one row of a list the user never left.
//
// A person row is a face and a name: there is no second fact about a mutual
// friend worth inventing. Tapping hands the person — the whole item, profile
// and all — to the opener, which opens THAT PERSON'S PAGE and nothing else
// (user directive 2026-07-29): a name on a card is not a way into My Friends,
// so no roster is stacked under it. Whatever a row opens only COVERS this list,
// group and person alike, so closing it comes back here rather than to the bare
// card (user directive 2026-07-30) — see `covered` on useSharedCircles.
//
// ONE CIRCLE IS NOT A LIST (user directive 2026-08-02): when the pair shares
// exactly one circle the chip goes STRAIGHT to that circle's own surface — the
// group popup, or the person's page — and this list is never raised at all. A
// popup titled "what we share" over a single row is a door in front of a door,
// and the row under it says nothing the chip that opened it had not already
// said. Which surface it is, is decided by the fetched lists (they are the
// truth); the chip's own `sole` count only decides whether the SKELETON goes up
// while they are out, so a single circle never flashes a list on its way to the
// surface it was always going to open.
export function SharedCirclesPopup({
  visible, groups, friends, subjectIsMale, sole, onSelectFriend, onDismiss,
}: {
  visible: boolean
  /** null while loading — either list still out makes the popup a skeleton, so
   *  the rows can never appear in an order the other list would have changed. */
  groups: SharedGroup[] | null
  friends: FriendItem[] | null
  /** The CARD SUBJECT's gender, for the wording of a friend row ("חברה של אסף"
   *  / "חבר של אסף"): the row is a sentence about the person whose card this
   *  is, not about the friend it names. */
  subjectIsMale?: boolean | null
  /** The chip counted exactly one circle, so there is nothing to list and
   *  nothing is raised until the lists say WHICH surface to open. A hint, not
   *  the decision: a card is a snapshot, so a chip that turns out to have been
   *  wrong simply lands on the list a beat later. */
  sole?: boolean
  onSelectFriend: (friend: FriendItem) => void
  onDismiss: () => void
}) {
  const [selected, setSelected] = useState<SharedGroup | null>(null)
  // The size of my friends circle, read off my own summary exactly as the chip
  // reads it — same rule, same number, so a row can never contradict the chip.
  const myFriends = useMyFriendCount()
  const items = groups && friends ? orderSharedCircles(groups, friends, myFriends) : null
  const only = items?.length === 1 ? items[0] : null
  // The one circle being a PERSON: their page is the app's root-window overlay,
  // not a popup, so the host opens it and this popup ENDS — unlike a row's tap,
  // which only covers a list the user will want back. There is no list here to
  // come back to.
  const onlyFriend = only?.kind === 'friend' ? only.friend : null
  useEffect(() => {
    if (!visible || !onlyFriend) return
    onSelectFriend(onlyFriend)
    onDismiss()
  }, [visible, onlyFriend])
  // The one circle being a GROUP: its popup IS the answer to the chip, so it
  // stands alone in this component's place rather than nested inside a list
  // that is not being shown. (The nested instance below is the other case — a
  // group a ROW opened, which must leave the list lit under it.)
  if (only?.kind === 'group') {
    return <GroupSheet group={visible ? only.group : null} status="joined" onClose={onDismiss} />
  }
  return (
    <SharedListPopup
      // Nothing is raised for a single circle: while the lists are out the
      // chip's own count answers, and once they land the count of rows does.
      visible={visible && (items ? items.length !== 1 : !sole)}
      title={t('circles.sharedTitle')}
      skeletonLines={2}
      rows={items?.map(item => item.kind === 'group' ? {
        key: item.group.id,
        // A group with no owner to show a face for wears the groups glyph in
        // the same lane — the strip centres whatever sits in it.
        leading: item.group.owner
          ? <Avatar userId={item.group.owner.user_id} name={item.group.owner.name} image={item.group.owner.image} />
          : <GroupsIcon color={INK} />,
        title: item.group.name,
        meta: groupFacts(item.group.members, item.group.owner?.name),
        onPress: () => setSelected(item.group),
      } : {
        key: item.friend.user_id,
        leading: <Avatar userId={item.friend.user_id} name={item.friend.name} image={item.friend.image} />,
        // A row NAMES THE CIRCLE, never the person in it (user directive
        // 2026-07-29): the friends circle is "חברה של אסף", the same sentence
        // the card's chip says when it names this circle, off the same one
        // composer — so the row and the chip that opened it cannot word the
        // connection differently. A friend with no name to state falls back to
        // nothing rather than to a half sentence.
        title: item.friend.name ? friendOfLabel(item.friend.name, subjectIsMale) : '',
        onPress: () => onSelectFriend(item.friend),
      }) ?? null}
      onDismiss={onDismiss}
    >
      <GroupSheet group={selected} status="joined" onClose={() => setSelected(null)} />
    </SharedListPopup>
  )
}

// ── Opening it ─────────────────────────────────────────────────────────────
// THE way a card's circle chip is wired, wherever that card is rendered (home's
// match card, and the profile page inside the Circles sheet): one hook so
// the two surfaces cannot fetch, order or word the same popup differently. It
// owns everything except what a friend row opens — that is the one thing the
// two hosts genuinely answer differently (home stacks the Circles sheet on
// that person, the sheet just pushes the page).
//
// Both lists are fetched HERE the instant the chip is tapped (not inside the
// popup on mount) and in parallel with each other, so they ride the sheet's
// slide-in and the content is usually ready by the time the sheet is up.
//
// `covered` is the host saying "the page a row opened is standing over my card".
// The popup is HIDDEN while that is true, never closed (user directive
// 2026-07-30): it is still the surface the user was reading, so it comes back
// the moment that page goes away instead of asking them to find the chip again.
// It is the same rule a GROUP row runs on above, by the only means each has: a
// group's popup is a Modal like this one, so it is NESTED and the list simply
// stays lit under it; a person's page is a full-screen OverlaySheet in the app's
// ROOT window, which a Modal always stands above, so the only way to be under it
// is to be switched off — hence `covered`, and hence a returning person page
// costs the slide the group popup no longer does.
// Declarative rather than a suspend()/resume() pair on purpose: the host states
// what is on top of it, so a page that leaves by ANY route — its close X, a
// swipe, the hardware back, an action that finishes with it — brings the popup
// back, and no route can forget to.
export function useSharedCircles(covered?: boolean) {
  const [visible, setVisible] = useState(false)
  const [groups, setGroups] = useState<SharedGroup[] | null>(null)
  const [friends, setFriends] = useState<FriendItem[] | null>(null)
  // What the chip counted when it was tapped: exactly one circle means there is
  // no list coming, so the skeleton stays down and the round trip lands on that
  // circle's own surface (user directive 2026-08-02, see SharedCirclesPopup).
  const [sole, setSole] = useState(false)
  // Whose card the popup was opened from, for the wording of a friend row
  // ("חברה של אסף"): the row states how THIS person is connected to the friend
  // it names, so it inflects with the card subject, exactly as the chip does.
  const [subjectIsMale, setSubjectIsMale] = useState<boolean | null | undefined>(undefined)
  const close = useCallback(() => setVisible(false), [])
  const open = useCallback((userId: string, isMale?: boolean | null, circles?: number) => {
    tap()
    setGroups(null)
    setFriends(null)
    setSubjectIsMale(isMale)
    setSole(circles === 1)
    setVisible(true)
    sharedGroups(userId).then(setGroups).catch(() => setGroups([]))
    sharedFriends(userId).then(setFriends).catch(() => setFriends([]))
  }, [])
  // No `close` for a host to call: the only thing that ends this popup is the
  // user dismissing it (onDismiss), because opening a page from a row merely
  // covers it — see `covered`.
  return { open, props: { visible: visible && !covered, groups, friends, subjectIsMale, sole, onDismiss: close } }
}

// The rows carry no styles of their own any more: the strip owns its geometry
// and its type, for every list in the app at once (components/Strip.tsx).
const styles = StyleSheet.create({
  // No frame of its own: the gutter, the air above the title and the air under
  // the last row are the popup's, and the gap between the title and the list is
  // the popup's between-blocks one (SHEET_GAP in tokens.ts) — this wrap used to
  // pick MD for it and the title an extra XS on top.
  wrap: { gap: SHEET_GAP.block },
  card: { backgroundColor: SURFACE, borderRadius: RADIUS, overflow: 'hidden' },
})
