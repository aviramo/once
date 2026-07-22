import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import { BottomSheet } from './BottomSheet'
import { CoinIcon } from './icons'
import { invoke } from '../lib/api'
import { tap } from '../lib/haptics'
import { BUY_EXTRA_OPTIONS, type BuyExtraCount, creditsText } from '../lib/credits'
import { t } from '../i18n'
import { INK, BLACK, BLACK_MID, BLACK_SOFT, BLACK_STRONG, PRIMARY, WHITE_MID } from '../colors'
import { LG, MD, RADIUS, SM, TEXT, WEIGHT, XS, ICON } from '../tokens'

// Bottom-sheet picker for buying extra credits. One row per
// BUY_EXTRA_OPTIONS entry (3 / 10 / 50). The 3-entry posts /app/buy_extra;
// the others render dimmed with a "coming soon" badge until pricing is wired
// up. Pricing is "Free" for every option for now. Reached from the settings
// credits popup and from every action button the user can't currently
// afford (invite / accept), which is the paywall moment. Self-dismisses
// after a successful purchase.
//
// There is no availability gate any more: buying used to be allowed only on
// an empty wallet and once per day, both dropped 2026-07-22 server-side.

export function BuyExtraPopup({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const [busy, setBusy] = useState<BuyExtraCount | null>(null)

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
        <Text style={styles.title}>{t('credits.buy.title')}</Text>
        <Text style={styles.desc}>{t('credits.buy.desc')}</Text>
        <View style={styles.list}>
          {BUY_EXTRA_OPTIONS.map(opt => {
            const isBusy = busy === opt.count
            // Two reasons a row is unavailable:
            //   - the option isn't enabled (10 / 50 'coming soon')
            //   - a sibling row is currently busy (lock out concurrent picks)
            const disabled = !opt.enabled || (busy != null && !isBusy)
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
                  <CoinIcon color={disabled ? WHITE_MID : PRIMARY} size={ICON.md} />
                  <Text style={[styles.rowCount, disabled && styles.rowCountDisabled]}>
                    {creditsText(opt.count)}
                  </Text>
                </View>
                <View style={styles.rowTail}>
                  {!opt.enabled ? (
                    <Text style={styles.rowSoon}>{t('credits.buy.comingSoon')}</Text>
                  ) : isBusy ? (
                    <ActivityIndicator color={INK} />
                  ) : (
                    <Text style={styles.rowPrice}>{t('credits.buy.priceFree')}</Text>
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
  card: {
    // No top padding: the sheet's drag handle already supplies the gap above
    // the title (its own marginBottom). Adding padding here stacked on top of
    // it and left a large dead band under the handle.
    padding: LG,
    paddingTop: 0,
    alignItems: 'center',
  },
  title: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.extrabold,
    color: BLACK,
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
  rowPrice: { fontSize: TEXT.md, fontWeight: WEIGHT.extrabold, color: INK },
  rowSoon: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: BLACK_MID },
})
