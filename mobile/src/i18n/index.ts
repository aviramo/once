import { getLocales } from 'expo-localization'
import he from './he'
import en from './en'

type Translations = typeof en

const RTL_LANGS = ['he', 'ar', 'fa', 'ur', 'yi']

function detectLang(): string {
  const locales = getLocales()
  for (const locale of locales) {
    const code = locale.languageCode?.toLowerCase() ?? ''
    if (code === 'iw' || code === 'he') return 'he'
    if (code === 'en') return 'en'
  }
  return 'en' // default: English
}

function getTranslations(lang: string): Translations {
  switch (lang) {
    case 'en': return en
    default:   return he as unknown as Translations
  }
}

export const lang = detectLang()
export const isRTL = RTL_LANGS.includes(lang)
const translations = getTranslations(lang)

export function t(key: keyof Translations): string {
  return (translations as Record<string, string>)[key] ?? key
}

export function tg(key: keyof Translations, isMale: boolean | null | undefined): string {
  const dict = translations as Record<string, string>
  const suffix = isMale === false ? '_f' : '_m'
  return dict[key + suffix] ?? dict[key] ?? key
}

/**
 * Resolves inline gender markers `{male|female}` inside an already-fetched
 * string against the user's gender. Used where whole-string `_m`/`_f` variants
 * (see `tg`) would force duplicating a large shared block to vary a few words
 * (e.g. the 50-line ready-headline pool — only ~4 lines are gendered).
 * Default (null/undefined/true) → male form, matching `tg`'s convention.
 * Strings with no marker (e.g. all English copy) pass through unchanged.
 */
export function genderize(text: string, isMale: boolean | null | undefined): string {
  const female = isMale === false
  return text.replace(/\{([^{}|]*)\|([^{}|]*)\}/g, (_, m: string, f: string) => (female ? f : m))
}

/**
 * Lowers a string's first letter so a standalone sentence can be spliced into
 * the middle of another one ("For women" → "Available for women"). Hebrew has
 * no case, so this is a no-op there and needs no per-language branch.
 */
export function lowerFirst(text: string): string {
  return text.charAt(0).toLocaleLowerCase() + text.slice(1)
}

/** Double-gender lookup: key_mm, key_mf, key_fm, key_ff → falls back to tg → t. */
export function tgg(key: keyof Translations, userMale: boolean | null | undefined, otherMale: boolean | null | undefined): string {
  const dict = translations as Record<string, string>
  const u = userMale === false ? 'f' : 'm'
  const o = otherMale === false ? 'f' : 'm'
  return dict[`${key}_${u}${o}`] ?? dict[`${key}_${u}`] ?? dict[key] ?? key
}
