// format/date.ts — the locale-aware date module (cohesion-debt 2026-07-19, item #1).
// A date grammar differs by need (a basis date vs a weekday chip vs a full WIB
// timestamp), but the LOCALE must not: every shape here resolves its locale from the
// param, falling back to the non-React readPersistedLocale() so the same app never
// mixes en-GB and the user's locale.
//
// SCOPE, stated rather than implied (the v4 payload carried more than this):
// `formatWeekdayDayMonth` (Tasks' weekday chip) and `formatWibDateTime`
// (lib/wib-time, behind FreshnessLabel and DataProvenanceNote) are NOT folded in
// here by the Money port. Both have live call sites on surfaces this PR does not
// own, and v4's versions change their locale behaviour — a silent restyle of every
// "as of" stamp in the app is not something a Money PR gets to decide. They stay
// where they are until the PR that owns those call sites moves them.
import { readPersistedLocale } from '@/i18n/I18nProvider'
import type { Locale } from '@/i18n/messages'

/** Map an app Locale to the BCP-47 tag used for Intl date formatting. */
export function dateLocaleTag(locale: Locale): string {
  return locale === 'id' ? 'id-ID' : 'en-GB'
}

function resolveTag(locale?: Locale): string {
  return dateLocaleTag(locale ?? readPersistedLocale())
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
