/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Locale } from './messages'

/**
 * I18nProvider — the i18n seam (ADR-0021). Holds the active `locale` in context and exposes
 * `setLocale`. It stores nothing: the language belongs to the signed-in account, and
 * `AccountLocaleProvider` (account-locale.tsx) loads and saves it. Before sign-in, and for an
 * account with no saved choice, the locale is the product default. No i18n library — the catalog
 * (`messages.ts`) + this provider + `useT()` are the whole seam.
 */
export const DEFAULT_LOCALE: Locale = 'en'

// The locale most recently applied by a provider, for code that renders outside one or runs
// outside a render (collection loaders, formatters, the top-level crash screen). Deliberately not
// reset on unmount: the crash screen renders after the provider's subtree is gone and must keep
// the viewer's language.
let activeLocale: Locale = DEFAULT_LOCALE

export function readPersistedLocale(): Locale {
  return activeLocale
}

type I18nContextValue = {
  locale: Locale
  setLocale: (next: Locale) => void
}

// Standalone renderers (component tests, embeds, and story-like previews) default to
// English; the application root still supplies the real provider below.
const I18nContext = createContext<I18nContextValue>({ locale: DEFAULT_LOCALE, setLocale: () => {} })

/** `initialLocale` seeds a standalone render (tests, previews); the app passes none. */
export function I18nProvider({ children, initialLocale = DEFAULT_LOCALE }: {
  children?: React.ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    activeLocale = initialLocale
    return initialLocale
  })

  // a11y audit fix: document.documentElement.lang was never updated on locale switch, so
  // assistive tech kept pronouncing Indonesian copy with English phonemes app-wide even
  // though every visible string (and document.title) switched correctly. `lang` is a plain
  // BCP 47 code, not a message-catalog key, so it is set directly rather than through useT.
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale
  }, [locale])

  // Published before the state update so a loader started by the re-render reads the new value.
  const setLocale = useCallback((next: Locale) => {
    activeLocale = next
    setLocaleState(next)
  }, [])

  return <I18nContext.Provider value={{ locale, setLocale }}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext)
}
