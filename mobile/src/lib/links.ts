// Single source of truth for outbound brand-site links.
//
// The Vercel deployment (once-lake) is the ONLY site now — the old GitHub
// Pages copy (aviramo.github.io/once-app) is retired. proxy.ts on the web
// app serves these clean paths (/terms, /privacy, ...) straight from the
// static marketing files; the pages read ?lang= client-side.
const BRAND_SITE = 'https://once-lake.vercel.app'

/** The support inbox published on the brand site (contact rows on the terms,
 *  privacy and child-safety pages). The settings "support" row opens the
 *  device mail composer straight at it. */
export const SUPPORT_EMAIL = 'once.app.support@gmail.com'

export const supportMailUrl = (subject: string): string =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`

/** The brand site's landing page. Carries the app's own language for the same
 *  reason legalUrl does: index.html honours `?lang=` over the browser's
 *  preference list, so the site opens in the language the user is already
 *  reading the app in. */
export const brandSiteUrl = (lang: string): string => `${BRAND_SITE}/?lang=${lang}`

export type LegalPage = 'terms' | 'privacy' | 'child-safety'

export const legalUrl = (page: LegalPage, lang: string): string =>
  `${BRAND_SITE}/${page}?lang=${lang}`

/** Personal invite link. web/src/proxy.ts matches /i/<CODE> and bounces an
 *  Android visitor to the Play listing with the code packed into the store's
 *  `referrer` parameter, which is what makes attribution automatic. Anyone
 *  else lands on the normal download page. */
export const referralUrl = (code: string): string => `${BRAND_SITE}/i/${code}`

/** Group invite link. The group's opaque token rides in the URL path (never
 *  shown as a "code" to the user). web/src/proxy.ts matches /g/<TOKEN> and
 *  bounces to the app (`once://g/<TOKEN>`, with a Play-store fallback); opening
 *  it in an installed app joins the group. */
export const groupInviteUrl = (token: string): string => `${BRAND_SITE}/g/${token}`

/** Friend invite link. Carries the inviter's referral code. web/src/proxy.ts
 *  matches /f/<CODE> and bounces to the app (`once://f/<CODE>`, with a
 *  Play-store fallback that packs the code into the install referrer); opening
 *  it in an installed app links the two as mutual friends with no approval.
 *  Same CODE as referralUrl (the per-user referral_code), a different path so
 *  the friend-connect is distinct from the credit-only referral link. */
export const friendInviteUrl = (code: string): string => `${BRAND_SITE}/f/${code}`
