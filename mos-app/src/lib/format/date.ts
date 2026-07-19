// format/date.ts — the ONE locale-aware date module (cohesion-debt 2026-07-19,
// item #1). Before this, three copies existed: task-formatters' locale-aware
// weekday label, wib-time's hardcoded-en-GB WIB timestamp, and plan-budget's
// hardcoded-en-GB day/month/year. The grammars differ by need (a weekday chip vs
// a full timestamp vs a basis date), but the LOCALE must not: every shape here
// resolves its locale from the param, falling back to the non-React
// readPersistedLocale() so the same app never mixes en-GB and the user's locale.
import { readPersistedLocale } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'

/** Map an app Locale to the BCP-47 tag used for Intl date formatting. */
export function dateLocaleTag(locale: Locale): string {
  return locale === 'id' ? 'id-ID' : 'en-GB'
}

function resolveTag(locale?: Locale): string {
  return dateLocaleTag(locale ?? readPersistedLocale())
}

/** "Wed 10 Jun" from a YYYY-MM-DD date (UTC-safe). Returns the raw input if unparseable. */
export function formatWeekdayDayMonth(isoDate: string, locale?: Locale): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d))
  if (Number.isNaN(dt.getTime())) return isoDate
  return dt.toLocaleDateString(resolveTag(locale), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/** "12 Jun 2026" from an ISO timestamp/date. Returns the raw input if unparseable. */
export function formatDayMonthYear(iso: string, locale?: Locale): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  return dt.toLocaleDateString(resolveTag(locale), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "12 Jun 2026, 12:30 WIB" — Asia/Jakarta wall clock with the WIB suffix. */
export function formatWibDateTime(value: string | Date, locale?: Locale): string {
  const date = value instanceof Date ? value : new Date(value)
  const parts = new Intl.DateTimeFormat(resolveTag(locale), {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${pick('day')} ${pick('month')} ${pick('year')}, ${pick('hour')}:${pick('minute')} WIB`
}
