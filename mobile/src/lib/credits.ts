import { t } from '../i18n'

// Credit economy — client-side constants + accessors.
//
// The SERVER is the single source of truth and ENFORCES every cost; the
// client only DISPLAYS them. These numbers MUST stay in sync with the SQL
// helpers (`_credits_cost` / `_credits_cap`) and the server-side
// defaultRelations seed in supabase/functions/user.ts. If a cost or the
// daily cap changes, change it in all three places in lockstep.
//
// Tier model retired 2026-06-01. Wallet shape:
//   { balance:0..CREDIT_CAP, extra:0..N, held:0..N, granted_on?, next_grant_at? }
// `balance` is the daily pool (refilled to CREDIT_CAP every 20:00 Asia/Jerusalem).
// `extra` is the purchased pool (no cap), bought via /app/buy_extra.
// Charging deducts balance FIRST, then extra; refunds restore balance up to
// the cap and overflow lands in extra.

export const CREDIT_COST = {
  invite: 1,
  approve: 1,
  broadcast: 1,
  // Cancelling forfeits the held heart instead of charging a new one. The
  // spend already happened on send, so the cancel button shows no badge.
  cancel: 0,
} as const

export type CreditAction = keyof typeof CREDIT_COST

/** Daily cap: balance refills up to this number every 20:00 Asia/Jerusalem. */
export const CREDIT_CAP = 3

/** Options offered by the buy-extra popup. Server validates against this
 *  exact set in app_buy_extra. The mobile popup currently surfaces the
 *  prices as "Free" for every option and only the 3-heart entry is enabled
 *  ("coming soon" badge on 10 / 50). When real pricing is wired up, swap
 *  the labels in i18n keys (`stars.buy.price.*`) and flip the `enabled`
 *  flags here. The 3/10/50 tier set is mirrored in the SQL `app_buy_extra`
 *  validation; change all three places together. */
export const BUY_EXTRA_OPTIONS = [
  { count: 3,  enabled: true  },
  { count: 10, enabled: false },
  { count: 50, enabled: false },
] as const

export type BuyExtraCount = (typeof BUY_EXTRA_OPTIONS)[number]['count']

/** Localized, grammatically-correct "N hearts" phrase: singular for 1
 * ("לב אחד" / "1 heart"), plural otherwise. One source so every prose
 * mention of a hearts amount agrees in number. */
export function starsText(n: number): string {
  return n === 1
    ? t('stars.count.one')
    : t('stars.count.many').replace('{n}', String(n))
}

export type CreditsWallet = {
  /** Daily pool. 0..CREDIT_CAP. */
  balance: number
  /** Purchased pool. 0..N. */
  extra: number
  /** Reserved against a live waiting invite (server-side accounting). Not
   * displayed; the spend already left balance / extra when the invite was
   * sent. */
  held?: number
  granted_on?: string | null
  /** ISO instant of the next 20:00 Asia/Jerusalem grant. Server-computed so
   * the client never does timezone math — it just formats this stamp. */
  next_grant_at?: string | null
  /** Grant-day date (YYYY-MM-DD) when the user last bought extras. Absent =
   * never bought. The buy throttle (one purchase per 20:00 Asia/Jerusalem
   * grant cycle) gates app_buy_extra on `bought_on !== current grant day`. */
  bought_on?: string | null
}

type WithCredits = { relations?: { credits?: CreditsWallet | null } | null } | null | undefined

/** The user's credits wallet, or null if the server hasn't seeded it yet. */
export function readCredits(profile: WithCredits): CreditsWallet | null {
  const c = profile?.relations?.credits
  return c && typeof c.balance === 'number' ? c : null
}

/** Spendable from the daily pool (0 when the wallet is missing). */
export function creditBalance(profile: WithCredits): number {
  return readCredits(profile)?.balance ?? 0
}

/** Spendable from the purchased pool (0 when the wallet is missing or
 *  on a legacy snapshot that predates the field). */
export function creditExtra(profile: WithCredits): number {
  const c = readCredits(profile)
  if (!c) return 0
  const n = typeof c.extra === 'number' ? c.extra : 0
  return n > 0 ? n : 0
}

/** Total spendable = balance + extra. This is what every affordability
 *  check should use — costs deduct balance first, but the user can spend
 *  as long as the total covers the cost. */
export function creditTotal(profile: WithCredits): number {
  return creditBalance(profile) + creditExtra(profile)
}

/** The current grant-day date (YYYY-MM-DD) — the date of the most recent
 * 20:00 Asia/Jerusalem boundary. Derived from `next_grant_at` (= next
 * boundary) by subtracting 24h and formatting in Asia/Jerusalem. Mirrors
 * SQL `_credits_grant_day()`. Returns null when the server hasn't set
 * next_grant_at yet (fresh user before the first cron tick). */
function currentGrantDay(wallet: CreditsWallet): string | null {
  const iso = wallet.next_grant_at
  if (!iso) return null
  const next = new Date(iso)
  if (Number.isNaN(next.getTime())) return null
  const prev = new Date(next.getTime() - 86_400_000)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(prev)
}

/** True iff the user is allowed to buy extras right now. Mirrors the
 *  server's app_buy_extra gates:
 *    1. credits.extra === 0  (only when the extras pool is empty —
 *       regardless of the daily balance; user request 2026-06-01)
 *    2. credits.bought_on !== current grant day  (once per cycle)
 *  Once a buy succeeds, the server sets `bought_on` to the live grant_day,
 *  so subsequent reads of this predicate return false until the next 20:00
 *  Asia/Jerusalem boundary. */
export function canBuyExtra(profile: WithCredits): boolean {
  const c = readCredits(profile)
  if (!c) return false
  if ((c.extra ?? 0) > 0) return false
  const day = currentGrantDay(c)
  if (!day) return true
  return (c.bought_on ?? '') !== day
}

/** The next grant moment formatted as a relative day word + clock time:
 * "היום ב-HH:MM" / "מחר ב-HH:MM" (or "today at HH:MM" / "tomorrow at HH:MM"),
 * or '' if unknown. next_grant_at is an absolute instant (server-computed at
 * the 20:00 Asia/Jerusalem boundary), so formatting it in the device's local
 * time is correct — no client-side timezone math. The day relativity is
 * computed against the device's local date too (correct for the user). For
 * the rare grant whose next-firing day is more than 1 day out (clock skew
 * across midnight) we fall back to the short "DD/MM HH:MM" form. */
export function formatNextGrant(profile: WithCredits): string {
  const iso = readCredits(profile)?.next_grant_at
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  const clock = `${p(d.getHours())}:${p(d.getMinutes())}`
  // Days between today's local-midnight and the grant's local-midnight.
  const today = new Date()
  const dayKey = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((dayKey(d) - dayKey(today)) / 86_400_000)
  if (diffDays <= 0) return t('stars.grant.today').replace('{time}', clock)
  if (diffDays === 1) return t('stars.grant.tomorrow').replace('{time}', clock)
  // Fallback to the absolute short form for >24h grants.
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${clock}`
}
