import { useCallback } from 'react'
import { messages, type Locale, type MessageKey } from './messages'
import { useI18n } from './I18nProvider'

/**
 * useT — the i18n lookup hook (ADR-0021). `t(key, vars?)` resolves the
 * active-locale string, falls back to `en` when the active locale is
 * missing the key, and falls back to the key itself when `en` is also
 * missing it — never throws. `${name}` placeholders interpolate from `vars`.
 */
export type TranslateVars = Record<string, string | number>

export function interpolate(template: string, vars: TranslateVars = {}): string {
  return template.replace(/\$\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined ? match : String(value)
  })
}

export type Translate = (key: MessageKey, vars?: TranslateVars) => string

export function useT(): Translate {
  const { locale } = useI18n()

  return useCallback(
    (key, vars) => {
      const localeCatalog = messages[locale] as Partial<Record<MessageKey, string>>
      const enCatalog = messages.en as Partial<Record<MessageKey, string>>
      const template = localeCatalog[key] ?? enCatalog[key] ?? key
      return interpolate(template, vars)
    },
    [locale]
  )
}

/**
 * translateFor — the non-React translator.
 *
 * `useT()` is the right answer everywhere a component renders. It is not available in the few
 * places that produce user-visible strings OUTSIDE a render: a collection descriptor's `load()`,
 * a pure formatter, an error boundary that mounts above `I18nProvider`. Those used to reach for
 * an English template literal, which is how untranslated copy kept landing in the UI (the
 * FR-422 trace strings, ErrorFallback). This resolves against the same persisted locale the
 * provider seeds from, so the two agree.
 *
 * Caveat, deliberately not hidden: a string built here is bound at CALL time, so a live locale
 * switch does not restyle it until the data it belongs to is loaded again. That is correct for
 * load-time strings and is why this is not offered as a general substitute for `useT`.
 */
export function translateFor(locale: Locale): Translate {
  return (key, vars) => {
    const template = messages[locale][key] ?? messages.en[key] ?? key
    return interpolate(template, vars)
  }
}
