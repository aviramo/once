import { getLocales } from 'expo-localization'
import { t, tg } from '../i18n'
import type { LocationType } from '../stores/userStore'
import { formatAgo, isLastSeenJustNow } from './lastSeen'

// Distance unit system, derived once from the device locale.
// Countries that use the imperial system for everyday distance.
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM'])

type Units = 'metric' | 'imperial'

export const units: Units =
  IMPERIAL_REGIONS.has(getLocales()[0]?.regionCode ?? '') ? 'imperial' : 'metric'

export const M_PER_MI = 1609.344

// "Right here" threshold (meters). Under this gap the distance reads as
// proximate and adds the presence dot to the distance chip. Same
// threshold for metric and imperial — 250m comfortably covers <0.1mi
// (~160m), so the imperial branch never needs a second check.
export const M_HERE_THRESHOLD = 250

export function isDistanceHere(m: number | null | undefined): boolean {
  return m != null && !isNaN(m) && m < M_HERE_THRESHOLD
}

// The distance text is fully scenario-specific: which of the 9 viewer×subject
// anchor combinations applies picks one of `home.dist.<ab>` (with a `{d}`
// distance placeholder) or, when proximate, `home.near.<ab>`. `ab` is the
// first letter of each type: d=device, h=home, w=work (e.g. 'hw' = my home ↔
// their work). Subject-side phrasing is gendered (his/her) via tg on the
// subject's is_male; the device/device cell has no subject pronoun so it
// falls back to its base (non-gendered) key.
export function formatDistance(
  m: number | null | undefined,
  isMale?: boolean | null,
  viewerType: LocationType = 'device',
  subjectType: LocationType = 'device',
): string {
  if (m == null || isNaN(m)) return ''
  const ab = `${viewerType[0]}${subjectType[0]}`
  if (isDistanceHere(m)) return tg(`home.near.${ab}` as Parameters<typeof tg>[0], isMale)
  let d: string
  if (units === 'imperial') {
    const miles = m / M_PER_MI
    d = miles < 10
      ? `${miles.toFixed(1)} ${t('settings.miles')}`
      : `${Math.round(miles).toLocaleString()} ${t('settings.miles')}`
  } else if (m < 1000) {
    d = `${Math.round(m)} ${t('settings.meter')}`
  } else {
    const km = m / 1000
    d = km > 10
      ? `${Math.round(km).toLocaleString()} ${t('settings.km')}`
      : `${km.toFixed(1)} ${t('settings.km')}`
  }
  return tg(`home.dist.${ab}` as Parameters<typeof tg>[0], isMale).replace('{d}', d)
}

// Merged proximity chip: ONE phrase combining the anchor-aware distance and
// the relative last-seen, replacing the old two separate time + distance
// chips. It reuses formatDistance verbatim (so all 9 viewer×subject anchor
// combos + the "near" phrasing stay single-sourced) and appends formatAgo's
// genderless time tail. Shape (Hebrew): "במרחק 20 mi ממך לפני 6 דקות"; the
// "במרחק" prefix rides only on the non-near distance part, the near phrase
// ("ממש כאן" / "ממש ליד הבית שלה") stands on its own. True live device↔device
// proximity collapses both parts into a single "כאן ועכשיו". hideTime (chat /
// locked-with-message states) drops the time tail; a missing distance drops
// the distance part — the chip degrades to whichever part exists (user
// directive 2026-07-27: time alone is fine, distance alone is fine, both is
// both). Only when NEITHER half exists does it return '' — the caller's
// "don't render the chip at all" signal.
export function formatProximity(
  m: number | null | undefined,
  lastSeenIso: string | null | undefined,
  isMale?: boolean | null,
  viewerType: LocationType = 'device',
  subjectType: LocationType = 'device',
  hideTime = false,
): string {
  const hasDist = m != null && !isNaN(m)
  const near = isDistanceHere(m)
  const ab = `${viewerType[0]}${subjectType[0]}`
  const justNow = !hideTime && isLastSeenJustNow(lastSeenIso)
  // "Here and now" only reads true for live device↔device proximity; any
  // fixed anchor on either side keeps the explicit near phrase + time.
  if (hasDist && near && justNow && ab === 'dd') return t('home.prox.hereNow')
  const distPart = !hasDist
    ? ''
    : near
      ? formatDistance(m, isMale, viewerType, subjectType)
      : t('home.prox.prefix') + formatDistance(m, isMale, viewerType, subjectType)
  const timePart = hideTime ? '' : formatAgo(lastSeenIso)
  if (distPart && timePart) return distPart + t('home.prox.join') + timePart
  return distPart || timePart
}
