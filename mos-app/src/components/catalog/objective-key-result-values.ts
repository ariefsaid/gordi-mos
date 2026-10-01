// Key-result figures: the number rules (typed text in, a database-safe number out) and the percent.
import { useI18n } from '@/i18n/I18nProvider'
import { dateLocaleTag } from '@/lib/format/date'
import type { KeyResultRow } from '@/lib/db/objective-key-results'

/**
 * Empty text is null (never zero). A value the database would refuse is rejected before it is sent:
 * not a finite number, 1e15 or larger in size, or more than 6 decimal places.
 */
export function parseNumber(raw: string): number | null {
  const text = raw.trim()
  if (text === '') return null
  const value = Number(text)
  if (!Number.isFinite(value)) throw new Error('not a finite number')
  if (Math.abs(value) >= 1e15 || !/^-?\d+(\.\d{1,6})?$/.test(String(value))) throw new Error('number out of range')
  return value
}

export const numberText = (value: number | null) => (value === null ? '' : String(value))

export function isNumber(raw: string): boolean {
  try { parseNumber(raw); return true } catch { return false }
}

/** The percentage exists only when both figures are set and the target is non-zero. */
export function percentOf(row: KeyResultRow): number | null {
  const { current_value: current, target_value: target } = row
  if (current === null || target === null || target === 0) return null
  return Math.round(Math.min(100, Math.max(0, (current / target) * 100)))
}

export function useNumberFormat() {
  const { locale } = useI18n()
  const format = new Intl.NumberFormat(dateLocaleTag(locale) === 'id-ID' ? 'id-ID' : 'en-US', { maximumFractionDigits: 6 })
  return (value: number) => format.format(value)
}

export type FormValues = { what: string; target: string; unit: string; due: string; owner: string | null }

export function valuesOf(row: KeyResultRow | null): FormValues {
  return {
    what: row?.what ?? '',
    target: numberText(row?.target_value ?? null),
    unit: row?.unit ?? '',
    due: row?.due_date ?? '',
    owner: row?.owner_person_id ?? null,
  }
}
