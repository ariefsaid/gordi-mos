import { useCallback } from 'react'
import { messages, type MessageKey } from './messages'
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
