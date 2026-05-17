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
