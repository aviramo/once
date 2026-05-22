import { t } from '../i18n'

// Credit economy — client-side constants + accessors.
//
// The SERVER is the single source of truth and ENFORCES every cost; the client
// only DISPLAYS them. These numbers MUST stay in sync with the SQL helpers
// `_credits_cost` / `_credits_tier_cfg` and the server-side defaultRelations
// seed in supabase/functions/user.ts (see CLAUDE.md "Credits economy"). If a
// cost or tier amount changes, change it in all three places in lockstep.

export const CREDIT_COST = {
  // Inviting is free — the badge on the send-invite button reads "0" so the
  // user sees it costs nothing. Display-only: there is no SQL `invite` cost.
  invite: 0,
  approve: 1,
  broadcast: 1,
  // Cancelling a sent invite costs the inviter 1 heart (user request
  // 2026-05-22). Inviting is free; the charge is the price of backing out.
  cancel: 1,
} as const

export type CreditAction = keyof typeof CREDIT_COST

// Per-tier daily grant amount + accumulation cap. Mirror of the SQL
// `_credits_tier_cfg` (source of truth + enforcement). DISPLAY ONLY — the
// server enforces. Keep in sync with `_credits_tier_cfg` and the
// defaultRelations seed in supabase/functions/user.ts (CLAUDE.md "Credits
// economy"): change all together.
export const CREDIT_TIER = {
  free: { daily: 3, cap: 3 },
  pro: { daily: 10, cap: 10 },
} as const

export type CreditTier = keyof typeof CREDIT_TIER

/** The user's current tier (defaults to 'free' when the wallet is missing). */
export function creditTier(profile: WithCredits): CreditTier {
  return readCredits(profile)?.tier === 'pro' ? 'pro' : 'free'
}

/** Localized, grammatically-correct "N hearts" phrase: singular for 1
 * ("לב אחד" / "1 heart"), plural otherwise. One source so every prose
 * mention of a hearts amount agrees in number. */
export function starsText(n: number): string {
  return n === 1
    ? t('stars.count.one')
    : t('stars.count.many').replace('{n}', String(n))
}

export type CreditsWallet = {
  balance: number
  tier: 'free' | 'pro'
  granted_on?: string | null
  /** ISO instant of the next 20:00 Asia/Jerusalem grant. Server-computed so
   * the client never does timezone math — it just formats this stamp. */
  next_grant_at?: string | null
}

type WithCredits = { relations?: { credits?: CreditsWallet | null } | null } | null | undefined

/** The user's credits wallet, or null if the server hasn't seeded it yet. */
export function readCredits(profile: WithCredits): CreditsWallet | null {
  const c = profile?.relations?.credits
  return c && typeof c.balance === 'number' ? c : null
}

/** Spendable balance (0 when the wallet is missing). */
export function creditBalance(profile: WithCredits): number {
  return readCredits(profile)?.balance ?? 0
}

/** The next grant moment as a short `DD/MM HH:MM`, or '' if unknown.
 * next_grant_at is an absolute instant (server-computed at the 20:00
 * Asia/Jerusalem boundary), so formatting it in the device's local time is
 * correct — no client-side timezone math. */
export function formatNextGrant(profile: WithCredits): string {
  const iso = readCredits(profile)?.next_grant_at
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`
}
