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
// Charging deducts balance FIRST, then extra. A refund puts a PURCHASED
// credit back into extra (bought credits never expire) but tops the daily
// balance up only to the cap — a daily credit refunded into a full pool is
// dropped, so a hold+refund cycle can never stockpile past the cap.
//
// The currency is called CREDITS and is drawn as a coin (CoinIcon). It used
// to be called hearts and drawn as a heart, which collided with the heart on
// the invite button — that one is the "like" affordance, not money.

export const CREDIT_COST = {
  invite: 1,
  approve: 1,
  broadcast: 1,
  // Cancelling forfeits the held credit instead of charging a new one. The
  // spend already happened on send, so the cancel button shows no badge.
  cancel: 0,
} as const

/** Daily cap: balance refills up to this number every 20:00 Asia/Jerusalem.
 *  One a day since 2026-07-22 (was 3) — the daily pool has to be a decision,
 *  not a number nobody reaches. Mirrors SQL `_credits_cap()`. */
export const CREDIT_CAP = 1

/** Options offered by the credits popup. Server validates against this exact
 *  set in app_buy_extra. Every entry is DISABLED since 2026-07-22: the free
 *  3-credit pack was the only live one, and handing out free credits on tap
 *  is not an economy — inviting a friend replaced it as the way to earn
 *  (REFERRAL_REWARD below). The rows stay visible with a "coming soon" badge
 *  so the price list still reads as a price list once real payments land;
 *  flip `enabled` back on then. The 3/10/50 set is mirrored in the SQL
 *  `app_buy_extra` validation and in the edge dispatcher.
 *
 *  /app/buy_extra deliberately stays deployed and functional — the published
 *  mobile build still renders the 3-credit row as enabled and calls it. See
 *  BACKWARD_COMPAT.md. */
export const BUY_EXTRA_OPTIONS = [
  { count: 3,  enabled: false },
  { count: 10, enabled: false },
  { count: 50, enabled: false },
] as const

/** Credits paid to the inviter for each friend who installs and completes a
 *  profile. Display only — the server credits it and enforces the daily cap.
 *  Mirrors SQL `_referral_reward()`. */
export const REFERRAL_REWARD = 1

export type BuyExtraCount = (typeof BUY_EXTRA_OPTIONS)[number]['count']

/** Localized, grammatically-correct "N credits" phrase: singular for 1
 * ("קרדיט אחד" / "1 credit"), plural otherwise. One source so every prose
 * mention of a credits amount agrees in number. */
export function creditsText(n: number): string {
  return n === 1
    ? t('credits.count.one')
    : t('credits.count.many').replace('{n}', String(n))
}

export type CreditsWallet = {
  /** Daily pool. 0..CREDIT_CAP. */
  balance: number
  /** Purchased pool. 0..N. */
  extra: number
  /** Reserved against a live waiting invite (server-side accounting). Not
   * displayed; the spend already left balance / extra when the invite was
   * sent. The server also tracks `held_extra` (how much of the hold came out
   * of the purchased pool, so a refund returns it there rather than dropping
   * it against a full daily pool) — server-only, never sent as a UI signal. */
  held?: number
  granted_on?: string | null
  /** ISO instant of the next 20:00 Asia/Jerusalem grant. Server-computed so
   * the client never does timezone math — it just formats this stamp. */
  next_grant_at?: string | null
  /** Grant-day date (YYYY-MM-DD) when the user last bought extras. Absent =
   * never bought. A record only — it stopped gating anything when the buy
   * throttle was removed (2026-07-22). */
  bought_on?: string | null
  /** Server-only mark: the user pressed accept on a live invitation and the
   * wallet couldn't cover it. While it's set AND the wallet is empty the
   * server keeps them out of `others()`, so nobody can invite someone who
   * has already refused to pay. Every funding path (purchase / the 20:00
   * grant / a refunded hold) clears it, so the block always lifts by itself.
   * Not read by the client. */
  unpaid_at?: string | null
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

// Buying used to be gated twice — allowed only while the wallet was EMPTY
// ('has_credits') and only once per 20:00 grant cycle ('already_bought_today')
// — because extras were framed as a recovery mechanism. Both gates were
// dropped server-side on 2026-07-22 (app_buy_extra) and with them the client
// mirrors `buyExtraBlock` / `canBuyExtra` / `currentGrantDay`. Buying is
// always available now, in any quantity. `bought_on` survives on the wallet
// as a record of the last purchase day; nothing reads it.

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
  if (diffDays <= 0) return t('credits.grant.today').replace('{time}', clock)
  if (diffDays === 1) return t('credits.grant.tomorrow').replace('{time}', clock)
  // Fallback to the absolute short form for >24h grants.
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${clock}`
}
