import { t } from '../i18n'

// "Just now" threshold — under this gap the user reads as currently online.
// Also drives the green presence dot on the time chip (WatcherCard +
// MatchCard).
export const SECONDS_JUST_NOW = 60

function ageSeconds(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
}

export function isLastSeenJustNow(iso: string | null | undefined): boolean {
  const diff = ageSeconds(iso)
  return diff != null && diff < SECONDS_JUST_NOW
}

// Relative-time tail for the merged proximity chip: genderless, no "online"
// prefix ("just now" / "6 min ago"). This is the piece formatProximity appends
// after distance.
export function formatAgo(iso: string | null | undefined): string {
  const diff = ageSeconds(iso)
  if (diff == null) return ''
  if (diff < SECONDS_JUST_NOW) return t('match.ago.now')
  if (diff < 3600) {
    const n = Math.floor(diff / 60)
    return n === 1 ? t('match.ago.min') : t('match.ago.mins').replace('{n}', String(n))
  }
  if (diff < 86400) {
    const n = Math.floor(diff / 3600)
    if (n === 1) return t('match.ago.hr')
    if (n === 2) return t('match.ago.hrs2')
    return t('match.ago.hrs').replace('{n}', String(n))
  }
  const n = Math.floor(diff / 86400)
  if (n === 1) return t('match.ago.day')
  if (n === 2) return t('match.ago.days2')
  return t('match.ago.days').replace('{n}', String(n))
}
