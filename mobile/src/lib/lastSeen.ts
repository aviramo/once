import { tg } from '../i18n'

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

export function formatLastSeen(iso: string | null | undefined, isMale: boolean | null | undefined): string {
  const diff = ageSeconds(iso)
  if (diff == null) return ''
  if (diff < SECONDS_JUST_NOW) return tg('match.justNow', isMale)
  if (diff < 3600) {
    const n = Math.floor(diff / 60)
    if (n === 1) return tg('match.minAgo', isMale)
    return tg('match.minsAgo', isMale).replace('{n}', String(n))
  }
  if (diff < 86400) {
    const n = Math.floor(diff / 3600)
    if (n === 1) return tg('match.hrAgo', isMale)
    if (n === 2) return tg('match.hrs2Ago', isMale)
    return tg('match.hrsAgo', isMale).replace('{n}', String(n))
  }
  const n = Math.floor(diff / 86400)
  if (n === 1) return tg('match.dayAgo', isMale)
  if (n === 2) return tg('match.days2Ago', isMale)
  return tg('match.daysAgo', isMale).replace('{n}', String(n))
}
