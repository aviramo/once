import { getLocales } from 'expo-localization'
import { t, tg } from '../i18n'

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

export function formatDistance(m: number | null | undefined, isMale?: boolean | null, customLocation?: boolean | null): string {
  if (m == null || isNaN(m)) return ''
  if (isDistanceHere(m)) return tg('home.distanceHere', isMale)
  const suffix = ` ${t(customLocation ? 'home.distanceFromYouCustom' : 'home.distanceFromYou')}`
  if (units === 'imperial') {
    const miles = m / M_PER_MI
    if (miles < 10) return `${miles.toFixed(1)} ${t('settings.miles')}${suffix}`
    return `${Math.round(miles).toLocaleString()} ${t('settings.miles')}${suffix}`
  }
  if (m < 1000) return `${Math.round(m)} ${t('settings.meter')}${suffix}`
  const km = m / 1000
  if (km > 10) return `${Math.round(km).toLocaleString()} ${t('settings.km')}${suffix}`
  return `${km.toFixed(1)} ${t('settings.km')}${suffix}`
}
