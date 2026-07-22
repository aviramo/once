// Single source of truth for outbound brand-site links.
//
// The Vercel deployment (once-lake) is the ONLY site now — the old GitHub
// Pages copy (aviramo.github.io/once-app) is retired. proxy.ts on the web
// app serves these clean paths (/terms, /privacy, ...) straight from the
// static marketing files; the pages read ?lang= client-side.
const BRAND_SITE = 'https://once-lake.vercel.app'

export type LegalPage = 'terms' | 'privacy' | 'child-safety'

export const legalUrl = (page: LegalPage, lang: string): string =>
  `${BRAND_SITE}/${page}?lang=${lang}`

/** Personal invite link. web/src/proxy.ts matches /i/<CODE> and bounces an
 *  Android visitor to the Play listing with the code packed into the store's
 *  `referrer` parameter, which is what makes attribution automatic. Anyone
 *  else lands on the normal download page. */
export const referralUrl = (code: string): string => `${BRAND_SITE}/i/${code}`
