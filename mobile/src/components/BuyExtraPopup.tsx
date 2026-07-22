import { useCallback, useState, type ReactNode } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native'
import { Text } from './AppText'
import { BottomSheet } from './BottomSheet'
import { CoinIcon, UserPlusIcon } from './icons'
import { invoke } from '../lib/api'
import { tap } from '../lib/haptics'
import { BUY_EXTRA_OPTIONS, type BuyExtraCount, creditsText } from '../lib/credits'
import { referralCode, referralJoined, shareReferral } from '../lib/referral'
import { useUserStore } from '../stores/userStore'
import { t, genderize } from '../i18n'
import { INK, BLACK, BLACK_MID, BLACK_SOFT, BLACK_STRONG, PRIMARY } from '../colors'
import { iconScale } from '../fonts'
import { LG, MD, RADIUS, SM, TEXT, WEIGHT, XS, ICON, lh } from '../tokens'

// The "get more credits" sheet. Reached straight from the settings credits row
// (2026-07-22: the explainer dialog that used to sit in between is gone — the
// row already shows the balance and the renewal time) and from every action
// button the user can't currently afford (invite / accept), the paywall moment.
//
// Since 2026-07-22 NOTHING here is purchasable — every BUY_EXTRA_OPTIONS entry
// renders dimmed with a "coming soon" badge (handing out free credits on tap
// was not an economy). The single live row is the referral one at the top:
// share a personal link, and a credit lands once the invited friend installs
// AND completes a profile. The reward is granted entirely server-side, so this
// row only opens the OS share sheet — there is nothing to await and nothing to
// optimistically show.
//
// /app/buy_extra stays deployed for the published build whose 3-credit row is
// still enabled (BACKWARD_COMPAT.md); onPick below is what that build calls.

// One row of the list. Identical geometry for the referral action and the
// credit packs — they differ only in what leads and what trails, which is
// exactly what props are for.
function CreditRow({
  icon, label, sublabel, trailing, disabled, onPress,
}: {
  icon: ReactNode
  label: string
  /** Second line, indented to the label (not the icon), inside the same
   *  pressable. Lives here rather than under the row so the explanation
   *  belongs visibly to the action it qualifies. */
  sublabel?: string
  trailing: ReactNode
  disabled?: boolean
  onPress?: () => void
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        disabled && styles.rowDisabled,
        pressed && !disabled && styles.rowPressed,
      ]}
    >
      <View style={styles.rowLead}>
        <View style={styles.rowIconWrap}>{icon}</View>
        <View style={styles.rowText}>
          <Text style={[styles.rowCount, disabled && styles.rowCountDisabled]}>{label}</Text>
          {sublabel ? <Text style={styles.rowSub}>{sublabel}</Text> : null}
        </View>
      </View>
      <View style={styles.rowTail}>{trailing}</View>
    </Pressable>
  )
}

export function BuyExtraPopup({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const [busy, setBusy] = useState<BuyExtraCount | null>(null)
  const profile = useUserStore(s => s.profile)

  const onPick = useCallback(async (count: BuyExtraCount) => {
    if (busy != null) return
    tap()
    setBusy(count)
    try { await invoke('app/buy_extra', { count }) }
    catch (e) { console.error(e) }
    setBusy(null)
    onDismiss()
  }, [busy, onDismiss])

  const onInvite = useCallback(() => {
    tap()
    // Fire-and-forget: the share sheet is the OS's, and whether the user
    // actually sends anything is invisible to us. This sheet stays open, so
    // the row (and its joined count) is still there when they come back.
    shareReferral(profile)
  }, [profile])

  const joined = referralJoined(profile)
  const canInvite = referralCode(profile) != null

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
          <CreditRow
            icon={<UserPlusIcon color={canInvite ? PRIMARY : BLACK_STRONG} size={ICON.md} />}
            // genderize, NOT tg: the Hebrew title carries an inline
            // {הזמן|הזמיני} marker, and tg only ever looks up whole-string
            // _m/_f key variants — it found none, fell back to the raw
            // string, and the marker rendered verbatim.
            label={genderize(t('credits.invite.title'), profile?.is_male)}
            sublabel={joined === 0
              ? t('credits.invite.joined.none')
              : joined === 1
                ? t('credits.invite.joined.one')
                : t('credits.invite.joined.many').replace('{n}', String(joined))}
            disabled={!canInvite || busy != null}
            onPress={onInvite}
            trailing={<Text style={styles.rowBadge}>{t('credits.buy.priceFree')}</Text>}
          />

          {BUY_EXTRA_OPTIONS.map(opt => {
            const isBusy = busy === opt.count
            // Two reasons a row is unavailable: the option isn't enabled (all
            // of them, currently), or a sibling row is busy.
            const disabled = !opt.enabled || (busy != null && !isBusy)
            return (
              <CreditRow
                key={opt.count}
                icon={<CoinIcon color={disabled ? BLACK_STRONG : PRIMARY} size={ICON.md} />}
                label={creditsText(opt.count)}
                disabled={disabled}
                onPress={() => onPick(opt.count)}
                trailing={!opt.enabled ? (
                  <Text style={styles.rowBadge}>{t('credits.buy.comingSoon')}</Text>
                ) : isBusy ? (
                  <ActivityIndicator color={INK} />
                ) : (
                  <Text style={styles.rowPrice}>{t('credits.buy.priceFree')}</Text>
                )}
              />
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: MD,
    paddingHorizontal: LG,
    borderRadius: RADIUS,
    backgroundColor: BLACK_SOFT,
  },
  rowPressed: { backgroundColor: BLACK_MID },
  rowDisabled: { opacity: 0.45 },
  // flex (not flexShrink) so the text column claims the leftover width and
  // wraps, instead of pushing the trailing badge off the row.
  // Top-aligned, not centred: a row with a sublabel is TWO lines, and centring
  // parked the glyph and the badge in the gap between them. Both now sit on
  // the label's line (see rowIconWrap / rowTail), which is the row's heading.
  rowLead: { flexDirection: 'row', alignItems: 'flex-start', gap: SM, flex: 1 },
  // A box exactly one label-line tall, top-aligned, so the glyph centres on
  // the FIRST line instead of drifting into the gap between a wrapped row's
  // two lines. A single-line row is unaffected — the box then equals the row
  // height and top-align == centre.
  //
  // Deliberately NO inkOffset nudge (unlike Chip's glyphWrap): the label here
  // sets at lh(TEXT.lg) with plenty of leading, so the line box and the ink
  // already share a centre, and the extra 3dp read as visibly low.
  rowIconWrap: {
    height: iconScale(lh(TEXT.lg)),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  // lineHeight is what rowIconWrap/rowTail measure against — without it the
  // label sets at the font's own metrics and the boxes no longer match it.
  rowCount: { fontSize: TEXT.lg, lineHeight: lh(TEXT.lg), fontWeight: WEIGHT.extrabold, color: BLACK },
  rowCountDisabled: { color: BLACK_MID },
  // Second line of a row, indented to the label. Same recipe as the settings
  // `hint` style (app/settings.tsx) — TEXT.sm at lh() 1.4×. The lineHeight is
  // load-bearing: without it a wrapped two-line hint sets at the font's own
  // metrics and reads visibly cramped against the app's other body text.
  rowSub: { fontSize: TEXT.sm, color: BLACK_STRONG, lineHeight: lh(TEXT.sm), marginTop: XS },
  // The trailing badge rides the label's line too, for the same reason the
  // glyph does — leading and trailing chrome frame the heading, not the
  // two-line block.
  rowTail: {
    flexDirection: 'row',
    height: iconScale(lh(TEXT.lg)),
    alignItems: 'center',
    marginStart: SM,
  },
  rowPrice: { fontSize: TEXT.md, fontWeight: WEIGHT.extrabold, color: INK },
  // Shared trailing badge: "coming soon" on the dead packs, "free" on the
  // invite row. One style so the two read as the same kind of tag.
  rowBadge: { fontSize: TEXT.sm, fontWeight: WEIGHT.semibold, color: BLACK_MID },
})
