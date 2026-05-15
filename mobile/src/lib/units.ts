import { getLocales } from 'expo-localization'
import { t, tg } from '../i18n'
import type { LocationType } from '../stores/userStore'

// Distance unit system, derived once from the device locale.
// Countries that use the imperial system for everyday distance.
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM'])

type Units = 'metric' | 'imperial'

export const units: Units =
  IMPERIAL_REGIONS.has(getLocales()[0]?.regionCode ?? '') ? 'imperial' : 'metric'

export const M_PER_MI = 1609.344

// "Right here" threshold (meters). Under this gap the distance reads as
// proximate and adds the green presence dot to the distance chip. Same
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
