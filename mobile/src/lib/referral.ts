import AsyncStorage from '@react-native-async-storage/async-storage'
import { Share } from 'react-native'
import { requireOptionalNativeModule } from 'expo-modules-core'

import { invoke } from './api'
import { referralUrl } from './links'
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

/** Pull the referral code out of a Play install-referrer string. The string is
 *  a urlencoded query fragment ("ref=ABC1234", or "utm_source=...&ref=ABC1234"
 *  once other campaign params are in play), and an organic install carries
 *  something else entirely ("utm_medium=organic"), so anything unrecognised
 *  yields null rather than a guess. */
export function parseReferralCode(referrer: string | null | undefined): string | null {
  if (!referrer) return null

  const scan = (s: string): string | null => {
    for (const pair of s.split('&')) {
      const eq = pair.indexOf('=')
      if (eq <= 0) continue
      let key: string, value: string
      try {
        key = decodeURIComponent(pair.slice(0, eq))
        value = decodeURIComponent(pair.slice(eq + 1))
      } catch { continue }
      if (key !== REFERRAL_PARAM) continue
      const code = value.trim().toUpperCase()
      if (/^[A-Z0-9]{4,16}$/.test(code)) return code
    }
    return null
  }

  const direct = scan(referrer)
  if (direct) return direct

  // Play usually hands the referrer back decoded once ("ref=ABC1234"), but not
  // always — some devices return it still encoded ("ref%3DABC1234"), where the
  // whole string is a single unsplittable token. One extra decode costs
  // nothing and is the difference between attributing that install and
  // silently losing it.
  if (referrer.includes('%')) {
    try { return scan(decodeURIComponent(referrer)) } catch { return null }
  }
  return null
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
    if (!code) {
      // A definitive "no referrer" (organic install, or sideloaded). The
      // answer will never change for this install, so stop asking.
      await AsyncStorage.setItem(STORAGE.referralClaimed, DONE)
      return
    }

    // Count the attempt BEFORE the round trip, so a call that keeps failing
    // can't loop; the server is idempotent (one inviter per account, forever)
    // so a retry after a dropped response is harmless.
    await AsyncStorage.setItem(STORAGE.referralClaimed, String(attempts + 1))
    await invoke('app/referral', { code, source: 'play_referrer' })
    await AsyncStorage.setItem(STORAGE.referralClaimed, DONE)
  } catch {
    // Retried on the next launch, up to MAX_ATTEMPTS.
  }
}

type WithReferral = {
  referral_code?: string | null
  relations?: { referral?: { joined?: number } | null } | null
} | null | undefined

/** The user's own invite code, straight off the users row. */
export function referralCode(profile: WithReferral): string | null {
  const code = profile?.referral_code
  return typeof code === 'string' && code.length > 0 ? code : null
}

/** How many invited friends have actually joined and paid out. Maintained
 *  server-side on relations.referral.joined, so it arrives with every response
 *  and ticks up live over Realtime. */
export function referralJoined(profile: WithReferral): number {
  const n = profile?.relations?.referral?.joined
  return typeof n === 'number' && n > 0 ? n : 0
}

/** Open the OS share sheet with the user's personal invite link. Resolves to
 *  false when there is no code yet (a profile the server hasn't seeded). */
export async function shareReferral(profile: WithReferral): Promise<boolean> {
  const code = referralCode(profile)
  if (!code) return false
  const url = referralUrl(code)
  try {
    await Share.share({
      // Android reads `message` only, so the URL has to be inside it.
      message: `${t('credits.invite.shareText')} ${url}`,
    })
    return true
  } catch {
    return false
  }
}
