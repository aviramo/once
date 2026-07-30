// "What we already share", opened by tapping a profile card's on-photo circle
// chip — wherever that card is: home's match card, and the person page inside
// the Communities sheet (user directive 2026-07-30, a profile is a profile).
// ONE popup for every kind of connection (user directive 2026-07-29): the people
// we are both friends with AND the groups we are both in, in one list.
// It used to be two popups behind two chips, which asked the user to know in
// advance which kind of connection they were looking for.
//
// The order is the chip's own (lib/communities.ts → orderSharedCircles): the
// groups smallest first, with MY FRIENDS slotted in at its size, so row 1 is
// always the circle the chip named. Read-only rows, no actions on them.
//
// Presentational: both lists are fetched by the OPENER (useSharedCircles, at the
// foot of this file) the instant the chip is tapped and passed in, so they load
// in parallel with the sheet's slide-in instead of only after it mounts. `null`
// renders the skeleton.
// Composes the shared BottomSheet (never a raw Modal) and the shared Avatar
// primitive, so a person here looks identical to one in the Communities sheet.
import { useCallback, useState, type ReactNode } from 'react'
import { View, StyleSheet } from 'react-native'
import { Strip } from './Strip'
import { BottomSheet, SheetTitle } from './BottomSheet'
import { Avatar, SkeletonRows } from './CommunityBits'
import { GroupsIcon } from './icons'
import { GroupSheet } from './CommunitiesPage'
import { tap } from '../lib/haptics'
import { groupFacts, friendOfLabel, orderSharedCircles, sharedGroups, sharedFriends, useMyFriendCount, type SharedGroup, type FriendItem } from '../lib/communities'
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
  visible, title, rows, skeletonLines = 1, onDismiss,
}: {
  visible: boolean
  title: string
  /** null while loading. */
  rows: SharedRow[] | null
  /** Text lines the real rows carry, so the placeholder opens at roughly the
   *  final height instead of growing under the user's thumb. */
  skeletonLines?: number
  onDismiss: () => void
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
            // Communities hub and the menu are built from (user directive
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
    </BottomSheet>
  )
}

// ── Everything we share ────────────────────────────────────────────────────
// A group row states who manages it and how many members on one meta line, and
// opens the app's one group popup (share link / leave) — the same surface the
// Communities hub and the group search open, in the `joined` state, since a
// group listed here is one we are both IN. The list hides while that is open
// (same pattern GroupSheet uses for its own confirm) and reappears on close.
//
// A person row is a face and a name: there is no second fact about a mutual
// friend worth inventing. Tapping hands the person — the whole item, profile
// and all — to the opener, which opens THAT PERSON'S PAGE and nothing else
// (user directive 2026-07-29): a name on a card is not a way into My Friends,
// so no roster is stacked under it and closing the page goes back to the card.
export function SharedCirclesPopup({
  visible, groups, friends, subjectIsMale, onSelectFriend, onDismiss,
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
  onSelectFriend: (friend: FriendItem) => void
  onDismiss: () => void
}) {
  const [selected, setSelected] = useState<SharedGroup | null>(null)
  // The size of my friends circle, read off my own summary exactly as the chip
  // reads it — same rule, same number, so a row can never contradict the chip.
  const myFriends = useMyFriendCount()
  const items = groups && friends ? orderSharedCircles(groups, friends, myFriends) : null
  return (
    <>
      <SharedListPopup
        visible={visible && !selected}
        title={t('communities.sharedTitle')}
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
      />
      <GroupSheet group={selected} status="joined" onClose={() => setSelected(null)} />
    </>
  )
}

// ── Opening it ─────────────────────────────────────────────────────────────
// THE way a card's circle chip is wired, wherever that card is rendered (home's
// match card, and the profile page inside the Communities sheet): one hook so
// the two surfaces cannot fetch, order or word the same popup differently. It
// owns everything except what a friend row opens — that is the one thing the
// two hosts genuinely answer differently (home stacks the Communities sheet on
// that person, the sheet just pushes the page).
//
// Both lists are fetched HERE the instant the chip is tapped (not inside the
// popup on mount) and in parallel with each other, so they ride the sheet's
// slide-in and the content is usually ready by the time the sheet is up.
export function useSharedCircles() {
  const [visible, setVisible] = useState(false)
  const [groups, setGroups] = useState<SharedGroup[] | null>(null)
  const [friends, setFriends] = useState<FriendItem[] | null>(null)
  // Whose card the popup was opened from, for the wording of a friend row
  // ("חברה של אסף"): the row states how THIS person is connected to the friend
  // it names, so it inflects with the card subject, exactly as the chip does.
  const [subjectIsMale, setSubjectIsMale] = useState<boolean | null | undefined>(undefined)
  const close = useCallback(() => setVisible(false), [])
  const open = useCallback((userId: string, isMale?: boolean | null) => {
    tap()
    setGroups(null)
    setFriends(null)
    setSubjectIsMale(isMale)
    setVisible(true)
    sharedGroups(userId).then(setGroups).catch(() => setGroups([]))
    sharedFriends(userId).then(setFriends).catch(() => setFriends([]))
  }, [])
  return { open, close, props: { visible, groups, friends, subjectIsMale, onDismiss: close } }
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
