import { getLocales } from 'expo-localization'
import { t, tg } from '../i18n'

// Distance unit system, derived once from the device locale.
// Countries that use the imperial system for everyday distance.
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM'])

type Units = 'metric' | 'imperial'

export const units: Units =
  IMPERIAL_REGIONS.has(getLocales()[0]?.regionCode ?? '') ? 'imperial' : 'metric'

export const M_PER_MI = 1609.344

export function formatDistance(m: number | null | undefined, isMale?: boolean | null): string {
  if (m == null || isNaN(m)) return ''
  if (m < 250) return tg('home.distanceHere', isMale)
  const suffix = ` ${t('home.distanceFromYou')}`
  if (units === 'imperial') {
    const miles = m / M_PER_MI
    if (miles < 0.1) return tg('home.distanceHere', isMale)
    if (miles < 10) return `${miles.toFixed(1)} ${t('settings.miles')}${suffix}`
    return `${Math.round(miles).toLocaleString()} ${t('settings.miles')}${suffix}`
  }
  if (m < 1000) return `${Math.round(m)} ${t('settings.meter')}${suffix}`
  const km = m / 1000
  if (km > 10) return `${Math.round(km).toLocaleString()} ${t('settings.km')}${suffix}`
  return `${km.toFixed(1)} ${t('settings.km')}${suffix}`
}
