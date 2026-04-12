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
export const dir: 'rtl' | 'ltr' = isRTL ? 'rtl' : 'ltr'

export const translations = getTranslations(lang)
export const allTranslations: Record<string, Translations> = { he: he as unknown as Translations, en }

export function t(key: keyof Translations): string {
  return (translations as Record<string, string>)[key] ?? key
}

export function tg(key: keyof Translations, isMale: boolean | null | undefined): string {
  const dict = translations as Record<string, string>
  const suffix = isMale === false ? '_f' : '_m'
  return dict[key + suffix] ?? dict[key] ?? key
}
