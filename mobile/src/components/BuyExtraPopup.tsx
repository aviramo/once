import { useCallback } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { UserPlusIcon } from './icons'
import { tap } from '../lib/haptics'
import { referralCode, shareFriendInvite } from '../lib/referral'
import { formatGrantTime } from '../lib/credits'
import { useUserStore } from '../stores/userStore'
import { t, genderize } from '../i18n'
import { WHITE } from '../colors'

// The "get more credits" sheet. Reached straight from the settings credits row
// (2026-07-22: the explainer dialog that used to sit in between is gone — the
// row already shows the balance and the renewal time) and from every action
// button the user can't currently afford (invite / accept), the paywall moment.
//
// Since 2026-07-28 it is A REGULAR POPUP (user directive): the app's own
// ConfirmDialog — title, one sentence, one action button — instead of the list
// of rows it used to be. Everything else on it is deleted: the 3/10/50 credit
// packs (dead "coming soon" tiles since 2026-07-22, nothing was purchasable),
// the paragraph above them, the "free" badge and the running joined count.
//
// Its sentence is ITS OWN (`credits.buy.desc`, user directive 2026-07-28), not
// the friends page's invite caption it used to borrow: this is where someone
// lands with an empty wallet, so it has to answer both how credits are EARNED
// and when one arrives anyway. It leads with the invite (user directive
// 2026-07-31) — the button under it — and states the daily refill after, as
// the fallback for a wallet that stays empty. Inviting is the only
// way to earn beyond that pool, and the button shares the friend-invite link
// (/f/) the sentence describes: opened with the app installed it links the pair
// as mutual friends, and the server pays both sides a credit for the link.
//
// The reward lands server-side, so this only opens the OS share sheet — nothing
// to await, nothing to optimistically show. /app/buy_extra + BUY_EXTRA_OPTIONS
// (lib/credits.ts) stay for the published build whose 3-credit row is still
// enabled (BACKWARD_COMPAT.md).

export function BuyExtraPopup({ visible, onDismiss, outOfCredits }: {
  visible: boolean
  onDismiss: () => void
  /** Opened because an action (invite / accept) couldn't be afforded, rather
   *  than from the settings credits row. Only the title changes: at the paywall
   *  moment it names what just blocked the user. */
  outOfCredits?: boolean
}) {
  const profile = useUserStore(s => s.profile)
  const grantTime = formatGrantTime(profile)

  const onInvite = useCallback(() => {
    tap()
    // Fire-and-forget: the share sheet is the OS's, and whether the user
    // actually sends anything is invisible to us. This popup stays open behind
    // it, so it is still here when they come back.
    shareFriendInvite(profile)
  }, [profile])

  return (
    <ConfirmDialog
      visible={visible}
      title={t(outOfCredits ? 'credits.buy.emptyTitle' : 'credits.buy.title')}
      // genderize for the same reason as the button below: the Hebrew sentence
      // addresses the user directly, so its verb carries an inline
      // {תקבל|תקבלי} marker. {time} has no pipe, so the two substitutions
      // cannot collide and their order does not matter.
      description={genderize(
        grantTime
          ? t('credits.buy.desc').replace('{time}', grantTime)
          : t('credits.buy.descNoTime'),
        profile?.is_male,
      )}
      // genderize, NOT tg: the Hebrew label carries an inline {הזמן|הזמיני}
      // marker, and tg only ever looks up whole-string _m/_f key variants — it
      // found none, fell back to the raw string, and the marker rendered
      // verbatim.
      confirmLabel={genderize(t('credits.invite.title'), profile?.is_male)}
      confirmIconStart={<UserPlusIcon color={WHITE} />}
      // The one line the paragraph above doesn't answer: WHEN the credit lands
      // (user directive 2026-08-02). It stands with the button because it is
      // about what pressing it leads to, not about the popup.
      actionNote={t('credits.invite.note')}
      // A profile the server hasn't seeded a code for yet: the action is
      // faded and inert, the popup still explains what it offers.
      confirmDisabled={referralCode(profile) == null}
      onConfirm={onInvite}
      // Explicit, and load-bearing: without an onCancel the dialog treats a
      // swipe-down / backdrop tap as a CONFIRM, and dismissing the popup would
      // pop the OS share sheet.
      onCancel={onDismiss}
    />
  )
}
