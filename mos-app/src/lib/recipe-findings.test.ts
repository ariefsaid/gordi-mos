import { expect, it } from 'vitest'
import { findingComparison, findingKey } from './recipe-findings'
import { translateFor } from '@/i18n/use-t'
import type { RecipeFinding } from '@/lib/db/recipe-findings'
const t = translateFor('en')

it.each([
  ['conflicting_recorded_conversions', "Units can't be compared: conflicting recorded conversions"],
  ['ambiguous_stock_unit', "Units can't be compared: stock unit is ambiguous"],
  ['missing_conversion', "Units can't be compared: a verified unit or conversion is missing"],
])('blocked unit evidence (%s) never becomes a numeric shortage', (status, text) => {
  const row = { rule: 'unit_comparison_unverified', comparison_unit: 'PCS', expected_qty_day_comparable: 999, actual_qty_day_comparable: 1, conversion_evidence: { movement_units: [{ status }] } } as RecipeFinding
  expect(findingComparison(row, t, 'en')).toBe(text)
})

it('an unavailable comparable quantity is not filled from raw recipe-line or stock quantities', () => {
  const row = { rule: 'quantity_difference_candidate', comparison_unit: 'KG', expected_qty_day_comparable: null, actual_qty_day_comparable: 8, conversion_evidence: {} } as RecipeFinding
  expect(findingComparison(row, t, 'en')).toBe("Units can't be compared: a verified unit or conversion is missing")
})

it.each(['class', 'rule', 'cause', 'basis'] as const)('a future source %s remains an unconfirmed lead', group => {
  expect(t(findingKey(group, 'future-source-value'))).not.toContain('future-source-value')
  expect(findingKey(group, 'future-source-value')).toBe(`money.findings.${group}.other`)
})

