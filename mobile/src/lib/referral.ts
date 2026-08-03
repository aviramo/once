import AsyncStorage from '@react-native-async-storage/async-storage'
import { requireOptionalNativeModule } from 'expo-modules-core'

import { invoke } from './api'
import { shareInvitation } from './share'
import { referralUrl, friendInviteUrl } from './links'
import { linkFriendByCode, redeemInvite } from './circles'
import { STORAGE } from '../keys'
import { t } from '../i18n'

// Referral program (2026-07-22). Buying credits is switched off; inviting
// someone who actually joins is the only way to earn beyond the daily pool.
//
// ATTRIBUTION IS INVISIBLE TO THE INVITEE. They tap a link, land on the Play
// listing, install, and open the app — nothing else. The code rides along in
// the store's `referrer` parameter, and the native module below reads it back
// on first launch. There is deliberately NO code field in onboarding.
//
// The reward is credited server-side, and only once the invitee's profile
// passes the same matchable gate that decides whether anyone may see them
// (>= 1 image). See supabase/migrations/20260722160000_referral_program.sql.

// Android-only, and absent in Expo Go — requireOptionalNativeModule returns
// null instead of throwing, which is exactly the graceful degradation we want
// (no referrer simply means no attribution, never an error).
const InstallReferrer = requireOptionalNativeModule<{
  getInstallReferrer(): Promise<string | null>
}>('InstallReferrer')

/** Query-parameter name the web redirect packs the code into, inside Play's
 *  `referrer` string. Must match web/src/proxy.ts. */
const REFERRAL_PARAM = 'ref'
/** Flag the /f/ friend-invite path sets in the install referrer ("f=1") so a
 *  fresh install also links the pair as friends, not just attributes a credit.
 *  Absent for the credit-only /i/ link. Must match web/public/invite.js. */
const FRIEND_PARAM = 'f'
/** Param the /g/ group-invite path packs its token into ("grp=<TOKEN>") so a
 *  fresh install joins the group on first launch. Its own key rather than
 *  `ref`, where a six-digit group token would be indistinguishable from a
 *  referral code. Must match web/public/invite.js + store.js. */
const GROUP_PARAM = 'grp'

/** Read one param out of a Play install-referrer string. The string is a
 *  urlencoded query fragment ("ref=ABC1234", or "utm_source=...&ref=ABC1234"
 *  once other campaign params are in play), and an organic install carries
 *  something else entirely ("utm_medium=organic"), so an absent param yields
 *  null rather than a guess.
 *
 *  Play usually hands the referrer back decoded once, but not always — some
 *  devices return it still encoded ("ref%3DABC1234"), where the whole string is
 *  a single unsplittable token. One extra decode costs nothing and is the
 *  difference between attributing that install and silently losing it. */
function readReferrerParam(referrer: string | null | undefined, key: string): string | null {
  if (!referrer) return null
  const scan = (s: string): string | null => {
    for (const pair of s.split('&')) {
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      try {
        if (decodeURIComponent(pair.slice(0, eq)) !== key) continue
        return decodeURIComponent(pair.slice(eq + 1)).trim()
      } catch { continue }
    }
    return null
  }
  const direct = scan(referrer)
  if (direct !== null) return direct
  if (referrer.includes('%')) {
    try { return scan(decodeURIComponent(referrer)) } catch { return null }
  }
  return null
}

/** Did this install referrer come from a friend-invite link (/f/)? */
export function parseFriendFlag(referrer: string | null | undefined): boolean {
  return readReferrerParam(referrer, FRIEND_PARAM) === '1'
}

/** The referral code an install came in with, or null when it carries none. */
export function parseReferralCode(referrer: string | null | undefined): string | null {
  const code = readReferrerParam(referrer, REFERRAL_PARAM)?.toUpperCase() ?? null
  return code && /^[A-Z0-9]{4,16}$/.test(code) ? code : null
}

/** The group invite token an install came in with (/g/ link), or null. */
export function parseGroupToken(referrer: string | null | undefined): string | null {
  const token = readReferrerParam(referrer, GROUP_PARAM)
  return token && /^\d{6}$/.test(token) ? token : null
}

const DONE = 'done'
/** A failed claim retries on later launches, but not forever: the server
 *  rejects some claims permanently (an account too old for an install
 *  referrer to be plausible), and those must not re-ask on every single
 *  launch for the life of the install. */
const MAX_ATTEMPTS = 3

/** Claim the install referrer, once per install.
 *
 *  Runs silently in the background after sign-in. Every failure is swallowed:
 *  the invitee must never see anything about this, and the inviter's credit
 *  arrives later over Realtime + push. */
export async function claimInstallReferral(): Promise<void> {
  try {
    if (!InstallReferrer) return
    const mark = await AsyncStorage.getItem(STORAGE.referralClaimed)
    if (mark === DONE) return
    const attempts = Number(mark) || 0
    if (attempts >= MAX_ATTEMPTS) return

    const raw = await InstallReferrer.getInstallReferrer()
    const code = parseReferralCode(raw)
    // A /g/ group invite carries a token instead of a code: no credit to claim,
    // but the install still owes the user the join they tapped for.
    const group = parseGroupToken(raw)
    if (!code && !group) {
      // A definitive "no referrer" (organic install, or sideloaded). The
      // answer will never change for this install, so stop asking.
      await AsyncStorage.setItem(STORAGE.referralClaimed, DONE)
      return
    }

    // Count the attempt BEFORE the round trip, so a call that keeps failing
    // can't loop; the server is idempotent (one inviter per account, forever)
    // so a retry after a dropped response is harmless.
    await AsyncStorage.setItem(STORAGE.referralClaimed, String(attempts + 1))
    // Friend-connect for a /f/ install (best-effort, independent of the credit
    // claim below so a 'too_late' referral can't block it). Idempotent
    // server-side; retried on later launches until the DONE mark lands.
    if (code && parseFriendFlag(raw)) {
      try { await linkFriendByCode(code) } catch { /* retried until DONE */ }
    }
    if (code) await invoke('app/referral', { code, source: 'play_referrer' })
    // Deliberately NOT swallowed: unlike the credit claim, losing this would
    // lose the whole point of the link, so a failure leaves the DONE mark unset
    // and the join retries on the next launch (up to MAX_ATTEMPTS).
    if (group) await redeemInvite(group)
    await AsyncStorage.setItem(STORAGE.referralClaimed, DONE)
  } catch {
    // Retried on the next launch, up to MAX_ATTEMPTS.
  }
}

type WithReferral = {
  referral_code?: string | null
} | null | undefined

/** The user's own invite code, straight off the users row. */
export function referralCode(profile: WithReferral): string | null {
  const code = profile?.referral_code
  return typeof code === 'string' && code.length > 0 ? code : null
}

// The running "how many joined through me" count (relations.referral.joined) is
// still maintained server-side, but NOTHING in the app reads it any more: the
// credits popup showed it and the user cut it (2026-07-28 — the offer is what
// the popup is for, not a scoreboard). Read it off the profile again if a
// surface ever wants it back.

/** Open the OS share sheet with the user's personal invite link. Resolves to
 *  false when there is no code yet (a profile the server hasn't seeded). */
export async function shareReferral(profile: WithReferral): Promise<boolean> {
  const code = referralCode(profile)
  if (!code) return false
  const url = referralUrl(code)
  // The newline puts the link on its own line so it unfurls into its own
  // preview card below the invitation sentence.
  return shareInvitation(`${t('credits.invite.shareText')}\n${url}`)
}

/** Share the FRIEND invite link (/f/<CODE>). Same per-user code as the credit
 *  referral, a distinct path that auto-links the two as mutual friends when
 *  opened with the app installed (and still attributes + links on a fresh
 *  install). Same share text as shareReferral. */
export async function shareFriendInvite(profile: WithReferral): Promise<boolean> {
  const code = referralCode(profile)
  if (!code) return false
  const url = friendInviteUrl(code)
  return shareInvitation(`${t('credits.invite.shareText')}\n${url}`)
}
