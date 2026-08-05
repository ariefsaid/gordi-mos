/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Locale } from './messages'

/**
 * I18nProvider — the i18n seam (ADR-0021). Holds the active `locale` in
 * context, persists the chosen value to `localStorage` (`mos.locale`), and
 * exposes `setLocale`. Default locale is `'en'`. No i18n library — the
 * catalog (`messages.ts`) + this provider + `useT()` are the whole seam.
 */
const STORAGE_KEY = 'mos.locale'

type I18nContextValue = {
  locale: Locale
  setLocale: (next: Locale) => void
}

// Standalone renderers (component tests, embeds, and story-like previews) default to
// English; the application root still supplies the real persisted provider below.
const I18nContext = createContext<I18nContextValue>({ locale: 'en', setLocale: () => {} })

export function readPersistedLocale(): Locale {
  if (typeof window === 'undefined') return 'en'
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'id' ? 'id' : 'en'
  } catch {
    return 'en' // localStorage unavailable (private mode / denied) → safe default
  }
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readPersistedLocale)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale)
    } catch {
      /* storage full / denied — in-memory state still applies */
    }
  }, [locale])

  // a11y audit fix: document.documentElement.lang was never updated on locale switch, so
  // assistive tech kept pronouncing Indonesian copy with English phonemes app-wide even
  // though every visible string (and document.title) switched correctly. `lang` is a plain
  // BCP 47 code, not a message-catalog key, so it is set directly rather than through useT.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
  }, [])

  return <I18nContext.Provider value={{ locale, setLocale }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
