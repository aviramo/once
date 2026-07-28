// SharedGroupsPopup — the informative popup opened by tapping a match card's
// group chip. Lists every group the viewer and that person both belong to, each
// on THREE lines: the group name, who manages it, and how many members it has.
// Read-only; no actions.
//
// Presentational: the list is fetched by the opener (home's openGroups) the
// instant the chip is tapped and passed in via `groups`, so the data loads in
// parallel with the sheet's slide-in instead of only after it mounts. `null`
// renders the spinner. Composes the shared BottomSheet (never a raw Modal) and
// the shared Avatar / memberLabel primitives, so an owner here looks identical
// to a member in the Communities sheet. Ordered smallest-group-first.
import { useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { Text } from './AppText'
import { BottomSheet, SheetTitle } from './BottomSheet'
import { Avatar, SkeletonRows, AVATAR } from './CommunityBits'
import { GroupsIcon } from './icons'
import { GroupSheet } from './CommunitiesPage'
import { tap } from '../lib/haptics'
import { memberLabel, type SharedGroup } from '../lib/communities'
import { t } from '../i18n'
import { XS, SM, MD, RADIUS, TEXT, WEIGHT } from '../tokens'
import { INK, INK_MUTED, INK_WASH, SURFACE, LINE } from '../colors'

export function SharedGroupsPopup({
  visible, groups, onDismiss,
}: { visible: boolean; groups: SharedGroup[] | null; onDismiss: () => void }) {
  // Tapping a row opens the app's one group popup (share link / leave), the
  // same surface the Communities hub and the group search open — a group listed
  // here is one we are both IN, so it opens in the `joined` state. The list
  // hides while it's open (same pattern GroupSheet uses for its own confirm),
  // and reappears on close.
  const [selected, setSelected] = useState<SharedGroup | null>(null)
  return (
    <>
      <BottomSheet visible={visible && !selected} onDismiss={onDismiss}>
        <View style={styles.wrap}>
          <SheetTitle style={styles.title}>{t('communities.sharedGroupsTitle')}</SheetTitle>
          {groups == null ? (
            // The same group strips the list is about to render, so the sheet
            // opens at roughly its final height instead of growing under the
            // user's thumb. Two bars, like every other group placeholder.
            <View style={styles.card}><SkeletonRows rows={2} lines={2} /></View>
          ) : (
            <View style={styles.card}>
              {groups.map((g, i) => (
                <Pressable
                  key={g.id}
                  onPress={() => { tap(); setSelected(g) }}
                  style={({ pressed }) => [styles.row, i === 0 && styles.rowFirst, pressed && styles.rowPressed]}
                >
                  {g.owner ? (
                    <Avatar userId={g.owner.user_id} name={g.owner.name} image={g.owner.image} />
                  ) : (
                    <View style={styles.iconWrap}><GroupsIcon color={INK} /></View>
                  )}
                  {/* Three stacked lines: name, manager, member count. */}
                  <View style={styles.text}>
                    <Text style={styles.name} numberOfLines={2}>{g.name}</Text>
                    {g.owner?.name ? (
                      <Text style={styles.meta} numberOfLines={1}>
                        {t('communities.managedBy').replace('{name}', g.owner.name)}
                      </Text>
                    ) : null}
                    <Text style={styles.meta} numberOfLines={1}>{memberLabel(g.members)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </BottomSheet>
      <GroupSheet group={selected} status="joined" onClose={() => setSelected(null)} />
    </>
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
