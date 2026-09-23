import type { TaskStatus } from '@/lib/db/tasks.types'
import type { Locale } from '@/i18n/messages'
import { formatWeekdayDayMonth } from '@/lib/format/date'

// OFF-TRACK-FIRST status order (OD-P3-6 / signed mockup): In Progress → Blocked → Open → Done.
// Shared by the tasks workspace + the My Week mini-table so the two never drift.
export const STATUS_ORDER: TaskStatus[] = ['In Progress', 'Blocked', 'Open', 'Done']

/** Get first name from full_name. */
export function firstName(fullName: string): string {
  return fullName.split(' ')[0] ?? fullName
}

/** Get initials (up to 2) from full_name. */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

// Compact age-unit suffixes per locale. Mirrors formatDate's `locale: Locale = 'en'` pattern
// (below) — every existing caller that passes no locale keeps the prior en-only output exactly.
const AGE_UNITS: Record<Locale, { minute: string; hour: string; day: string }> = {
  en: { minute: 'm', hour: 'h', day: 'd' },
  id: { minute: 'mnt', hour: 'jam', day: 'hr' },
}

/** Format a duration between two ISO timestamps into a compact age string (e.g. "2h", "3d";
 * "2jam", "3hr" for id) — the units alone are localized, matching a localized Pill next to it. */
export function formatAge(isoDate: string, now: Date, locale: Locale = 'en'): string {
  const units = AGE_UNITS[locale]
  const ms = now.getTime() - new Date(isoDate).getTime()
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes}${units.minute}`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}${units.hour}`
  const days = Math.floor(hours / 24)
  return `${days}${units.day}`
}

/** Format a YYYY-MM-DD date into a display string like "Wed 12 Jun".
 * Delegates to the canonical locale-aware date module (cohesion-debt 2026-07-19, item #1) —
 * #191 (Home port) needed this same delegation for its attention rows (`home-attention.ts`), which
 * want the viewer's locale on a formatter every other call site here still used unlocalized. Every
 * existing caller passes no `locale`, so the default reproduces the prior en-GB output exactly. */
export function formatDate(d: string, locale: Locale = 'en'): string {
  return formatWeekdayDayMonth(d, locale)
}

/** Resolve the human-facing provenance label for a Task row or record. */
export function taskSourceLabel(workLineName: string, objectiveName: string, adHocLabel: string): string {
  return workLineName || objectiveName || adHocLabel
}
