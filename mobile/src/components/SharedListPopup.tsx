// The "what we have in common" popups, opened by tapping a match card's
// on-photo chip: SharedGroupsPopup (groups we are both in) and
// SharedFriendsPopup (people we are both friends with). Read-only lists, no
// actions on the rows themselves.
//
// One shell, two fillings. SharedListPopup below IS the surface — the sheet,
// the title, the rounded card, the hairline-separated rows, the loading
// skeleton and the press flash — and each popup only says what a row looks
// like and what tapping it opens. The two were near-identical components until
// 2026-07-29; a difference in row content is a prop, not a second file.
//
// Presentational: the list is fetched by the OPENER (home's openGroups /
// openFriends) the instant the chip is tapped and passed in, so the data loads
// in parallel with the sheet's slide-in instead of only after it mounts. `null`
// renders the skeleton. Composes the shared BottomSheet (never a raw Modal) and
// the shared Avatar primitive, so a person here looks identical to one in the
// Communities sheet.
import { useState, type ReactNode } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { Text } from './AppText'
import { BottomSheet, SheetTitle } from './BottomSheet'
import { Avatar, SkeletonRows, AVATAR } from './CommunityBits'
import { GroupsIcon } from './icons'
import { GroupSheet } from './CommunitiesPage'
import { tap } from '../lib/haptics'
import { memberLabel, sharedFriendLabel, type SharedGroup, type FriendItem } from '../lib/communities'
import { t } from '../i18n'
import { XS, MD, RADIUS, TEXT, WEIGHT } from '../tokens'
import { INK, INK_MUTED, INK_WASH, SURFACE, LINE } from '../colors'

/** One row: a leading avatar/icon, a title line, and any number of meta lines
 *  under it (a group carries two, a person carries none). */
export type SharedRow = {
  key: string
  leading: ReactNode
  title: string
  meta?: (string | null | undefined)[]
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
        <SheetTitle style={styles.title}>{title}</SheetTitle>
        <View style={styles.card}>
          {rows == null ? (
            <SkeletonRows rows={2} lines={skeletonLines} />
          ) : rows.map((r, i) => (
            <Pressable
              key={r.key}
              onPress={() => { tap(); r.onPress() }}
              style={({ pressed }) => [styles.row, i === 0 && styles.rowFirst, pressed && styles.rowPressed]}
            >
              {r.leading}
              <View style={styles.text}>
                <Text style={styles.name} numberOfLines={2}>{r.title}</Text>
                {(r.meta ?? []).filter(Boolean).map((m, j) => (
                  <Text key={j} style={styles.meta} numberOfLines={1}>{m}</Text>
                ))}
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </BottomSheet>
  )
}

// ── Groups we are both in ──────────────────────────────────────────────────
// Each row on THREE lines: the group name, who manages it, how many members.
// Tapping opens the app's one group popup (share link / leave), the same
// surface the Communities hub and the group search open — a group listed here
// is one we are both IN, so it opens in the `joined` state. The list hides
// while that is open (same pattern GroupSheet uses for its own confirm) and
// reappears on close. Ordered smallest-group-first by the server.
export function SharedGroupsPopup({
  visible, groups, onDismiss,
}: { visible: boolean; groups: SharedGroup[] | null; onDismiss: () => void }) {
  const [selected, setSelected] = useState<SharedGroup | null>(null)
  return (
    <>
      <SharedListPopup
        visible={visible && !selected}
        title={t('communities.sharedGroupsTitle')}
        skeletonLines={2}
        rows={groups?.map(g => ({
          key: g.id,
          leading: g.owner
            ? <Avatar userId={g.owner.user_id} name={g.owner.name} image={g.owner.image} />
            : <View style={styles.iconWrap}><GroupsIcon color={INK} /></View>,
          title: g.name,
          meta: [
            g.owner?.name ? t('communities.managedBy').replace('{name}', g.owner.name) : null,
            memberLabel(g.members),
          ],
          onPress: () => setSelected(g),
        })) ?? null}
        onDismiss={onDismiss}
      />
      <GroupSheet group={selected} status="joined" onClose={() => setSelected(null)} />
    </>
  )
}

// ── People we are both friends with ────────────────────────────────────────
// One line per row: the person. There is no second fact about a mutual friend
// worth inventing, so the row is a face and a name. Tapping hands the person
// to the opener, which lands the Communities sheet on their page in My
// friends — the person-level twin of a group row opening GroupSheet. The title
// inflects with the count and, at one, with that friend's gender.
export function SharedFriendsPopup({
  visible, friends, onSelect, onDismiss,
}: {
  visible: boolean
  friends: FriendItem[] | null
  onSelect: (friend: FriendItem) => void
  onDismiss: () => void
}) {
  return (
    <SharedListPopup
      visible={visible}
      title={sharedFriendLabel(friends?.length ?? 0, friends?.[0]?.profile?.is_male)}
      rows={friends?.map(f => ({
        key: f.user_id,
        leading: <Avatar userId={f.user_id} name={f.name} image={f.image} />,
        title: f.name ?? '',
        onPress: () => onSelect(f),
      })) ?? null}
      onDismiss={onDismiss}
    />
  )
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: MD, paddingBottom: MD, gap: MD },
  // Spacing only — the type comes from SheetTitle (BottomSheet.tsx).
  title: { paddingBottom: XS },
  card: { backgroundColor: SURFACE, borderRadius: RADIUS, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: MD, paddingHorizontal: MD, paddingVertical: MD, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE },
  rowFirst: { borderTopWidth: 0 },
  rowPressed: { backgroundColor: INK_WASH },
  iconWrap: { width: AVATAR, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: XS },
  name: { fontSize: TEXT.md, fontWeight: WEIGHT.semibold, color: INK },
  meta: { fontSize: TEXT.md, color: INK_MUTED },
})
