import { createI18n } from 'vue-i18n'

import en from '@/locales/en.json'
import ru from '@/locales/ru.json'

export type MessageSchema = typeof en

/**
 * Supported locales
 */
export const SUPPORTED_LOCALES = ['ru', 'en'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

/**
 * Default locale
 */
export const DEFAULT_LOCALE: SupportedLocale = 'ru'

/**
 * Get saved locale from localStorage or fallback to default
 * @returns {SupportedLocale} The saved locale or default locale if not found
 */
function getSavedLocale(): SupportedLocale {
  // Check if we're in a browser environment
  if (typeof localStorage !== 'undefined') {
    const savedLocale = localStorage.getItem('cockpit-locale')
    if (savedLocale && SUPPORTED_LOCALES.includes(savedLocale as SupportedLocale)) {
      return savedLocale as SupportedLocale
    }
  }
  return DEFAULT_LOCALE
}

/**
 * Create and configure i18n instance
 * Default locale is Russian for NaviLync
 * Saved locale preference is restored from localStorage
 */
export const i18n = createI18n<[MessageSchema], SupportedLocale>({
  legacy: false,
  locale: getSavedLocale(), // Use saved locale or Russian as default for NaviLync
  fallbackLocale: 'en',
  messages: {
    en,
    ru,
  },
})

export default i18n
