import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import { BottomSheet } from './BottomSheet'
import { HeartIcon } from './icons'
import { invoke } from '../lib/api'
import { tap } from '../lib/haptics'
import { BUY_EXTRA_OPTIONS, type BuyExtraCount, buyExtraBlock, starsText } from '../lib/credits'
import { useUserStore } from '../stores/userStore'
import { t } from '../i18n'
import { BLACK, BLACK_MID, BLACK_SOFT, BLACK_STRONG, PRIMARY, WHITE_MID } from '../colors'
import { LG, MD, RADIUS, SM, TEXT, WEIGHT, XS, ICON } from '../tokens'

// Bottom-sheet picker for buying extra hearts. One row per
// BUY_EXTRA_OPTIONS entry (3 / 10 / 50). The 3-entry posts /app/buy_extra;
// the others render dimmed with a "coming soon" badge until pricing is wired
// up. Pricing is "Free" for every option for now. Used in two places:
// (1) the settings hearts popup's confirm button; (2) the home Viewers
// status card's "buy extra hearts" CTA when the user is hidden because
// they ran out of hearts. Self-dismisses after a successful purchase.

export function BuyExtraPopup({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const [busy, setBusy] = useState<BuyExtraCount | null>(null)
  // Live wallet read so the in-popup gate (canBuyExtra) reflects the most
  // recent purchase/refill. The popup is mounted long enough for a remote
  // refund/grant to land while it's open.
  const profile = useUserStore(s => s.profile)
  const blocked = buyExtraBlock(profile)

  const onPick = useCallback(async (count: BuyExtraCount) => {
    if (busy != null) return
    tap()
    setBusy(count)
    try { await invoke('app/buy_extra', { count }) }
    catch (e) { console.error(e) }
    setBusy(null)
    onDismiss()
  }, [busy, onDismiss])

  return (
    <BottomSheet
      visible={visible}
      onDismiss={() => { if (busy == null) onDismiss() }}
      swipeToDismiss={busy == null}
      disableBackdropDismiss={busy != null}
    >
      <View style={styles.card}>
        <HeartIcon color={PRIMARY} size={32} />
        <Text style={styles.title}>{t('stars.buy.title')}</Text>
        <Text style={styles.desc}>{t('stars.buy.desc')}</Text>
        <View style={styles.list}>
          {BUY_EXTRA_OPTIONS.map(opt => {
            const isBusy = busy === opt.count
            // Three reasons a row is unavailable:
            //   - the option isn't enabled (10 / 50 'coming soon')
            //   - a sibling row is currently busy (lock out concurrent picks)
            //   - a server buy gate is closed (`blocked`): the wallet still
            //     has hearts, or today's purchase slot is used up
            // The tail label communicates the reason explicitly so the user
            // knows why they can't tap.
            const gate = opt.enabled ? blocked : null
            const disabled = !opt.enabled || gate != null || (busy != null && !isBusy)
            return (
              <Pressable
                key={opt.count}
                disabled={disabled}
                onPress={() => onPick(opt.count)}
                style={({ pressed }) => [
                  styles.row,
                  disabled && styles.rowDisabled,
                  pressed && !disabled && styles.rowPressed,
                ]}
              >
                <View style={styles.rowLead}>
                  <HeartIcon color={disabled ? WHITE_MID : PRIMARY} size={ICON.md} />
                  <Text style={[styles.rowCount, disabled && styles.rowCountDisabled]}>
                    {starsText(opt.count)}
                  </Text>
                </View>
                <View style={styles.rowTail}>
                  {!opt.enabled ? (
                    <Text style={styles.rowSoon}>{t('stars.buy.comingSoon')}</Text>
                  ) : gate != null ? (
                    <Text style={styles.rowSoon}>
                      {t(gate === 'has_credits' ? 'stars.buy.hasHearts' : 'stars.buy.alreadyBoughtToday')}
                    </Text>
                  ) : isBusy ? (
                    <ActivityIndicator color={PRIMARY} />
                  ) : (
                    <Text style={styles.rowPrice}>{t('stars.buy.priceFree')}</Text>
                  )}
                </View>
              </Pressable>
            )
          })}
        </View>
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  card: { padding: LG, alignItems: 'center' },
  title: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.extrabold,
    color: BLACK,
    marginTop: SM,
    textAlign: 'center',
  },
  desc: {
    fontSize: TEXT.md,
    color: BLACK_MID,
    marginTop: XS,
    marginBottom: LG,
    textAlign: 'center',
  },
  list: { alignSelf: 'stretch', gap: SM },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: MD,
    paddingHorizontal: LG,
    borderRadius: RADIUS,
    backgroundColor: BLACK_SOFT,
  },
  rowPressed: { backgroundColor: BLACK_MID },
  rowDisabled: { opacity: 0.45 },
  rowLead: { flexDirection: 'row', alignItems: 'center', gap: SM },
  rowCount: { fontSize: TEXT.lg, fontWeight: WEIGHT.extrabold, color: BLACK },
  rowCountDisabled: { color: BLACK_MID },
  rowTail: { flexDirection: 'row', alignItems: 'center' },
  rowPrice: { fontSize: TEXT.md, fontWeight: WEIGHT.extrabold, color: PRIMARY },
  rowSoon: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: BLACK_MID },
})
