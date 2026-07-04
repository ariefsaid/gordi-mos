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

const I18nContext = createContext<I18nContextValue | null>(null)

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

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
  }, [])

  return <I18nContext.Provider value={{ locale, setLocale }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext)
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return ctx
}
