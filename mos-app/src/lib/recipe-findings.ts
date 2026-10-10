import type { ColumnDef, SortingState } from '@tanstack/react-table'
import type { RecipeFinding } from '@/lib/db/recipe-findings'
import type { Translate } from '@/i18n/use-t'
import type { MessageKey } from '@/i18n/messages'

export const FINDING_CLASSES = ['warehouse_artefact', 'team_input', 'esb_system'] as const
export const FINDING_RULES = ['missing_recipe_mapping', 'quantity_difference_candidate', 'recipe_edited_after_sale', 'unit_comparison_unverified', 'excluded_demand_stock_unassigned', 'eligibility_excluded', 'package_exclusion'] as const
export const FINDING_SORT: SortingState = [{ id: 'impact', desc: true }, { id: 'day', desc: true }, { id: 'id', desc: false }]
export const FINDING_COLUMNS: ColumnDef<RecipeFinding>[] = [
  { id: 'impact', accessorFn: r => r.impact_idr ?? undefined, sortUndefined: 'last' },
  { id: 'day', accessorKey: 'day' },
  { id: 'id', accessorFn: r => `${r.esb_code}:${r.finding_id}` },
]

const COPY: Record<'class' | 'rule' | 'cause' | 'basis', Record<string, MessageKey>> = {
  class: {
    warehouse_artefact: 'money.findings.class.warehouse_artefact', team_input: 'money.findings.class.team_input',
    esb_system: 'money.findings.class.esb_system', other: 'money.findings.class.other',
  },
  rule: {
    missing_recipe_mapping: 'money.findings.rule.missing_recipe_mapping',
    quantity_difference_candidate: 'money.findings.rule.quantity_difference_candidate',
    recipe_edited_after_sale: 'money.findings.rule.recipe_edited_after_sale',
    unit_comparison_unverified: 'money.findings.rule.unit_comparison_unverified',
    excluded_demand_stock_unassigned: 'money.findings.rule.excluded_demand_stock_unassigned',
    eligibility_excluded: 'money.findings.rule.eligibility_excluded',
    package_exclusion: 'money.findings.rule.package_exclusion', other: 'money.findings.rule.other',
  },
  cause: {
    missing_recipe_mapping: 'money.findings.cause.missing_recipe_mapping',
    quantity_difference_candidate: 'money.findings.cause.quantity_difference_candidate',
    recipe_edited_after_sale: 'money.findings.cause.recipe_edited_after_sale',
    unit_comparison_unverified: 'money.findings.cause.unit_comparison_unverified',
    excluded_demand_stock_unassigned: 'money.findings.cause.excluded_demand_stock_unassigned',
    eligibility_excluded: 'money.findings.cause.eligibility_excluded',
    package_exclusion: 'money.findings.cause.package_exclusion', other: 'money.findings.cause.other',
  },
  basis: {
    current_recipe_estimate: 'money.findings.basis.current_recipe_estimate',
    unassigned_actual: 'money.findings.basis.unassigned_actual',
    allocated_actual_previously_omitted: 'money.findings.basis.allocated_actual_previously_omitted',
    not_quantified: 'money.findings.basis.not_quantified', other: 'money.findings.basis.other',
  },
}
export function findingKey(group: keyof typeof COPY, value: string): MessageKey {
  return COPY[group][value] ?? COPY[group].other
}

export function filterRecipeFindings(rows: RecipeFinding[], params: URLSearchParams): RecipeFinding[] {
  return rows.filter(r => (params.get('rf_all') === '1' || r.needs_human)
    && (!params.get('rf_class') || params.get('rf_class') === r.classification)
    && (!params.get('rf_rule') || params.get('rf_rule') === r.rule)
    && (!params.get('rf_day') || params.get('rf_day') === r.day))
}

export function findingComparison(row: RecipeFinding, t: Translate, locale: string): string {
  if (row.rule === 'unit_comparison_unverified' || !row.comparison_unit
    || row.expected_qty_day_comparable === null || row.actual_qty_day_comparable === null) {
    const statuses = [...(row.conversion_evidence.recipe_units ?? []), ...(row.conversion_evidence.movement_units ?? [])].map(e => e?.status)
    const reason = statuses.includes('conflicting_recorded_conversions') ? 'money.findings.units.conflict'
      : statuses.includes('ambiguous_stock_unit') ? 'money.findings.units.ambiguous' : 'money.findings.units.missing'
    return t('money.findings.unitsBlocked', { reason: t(reason) })
  }
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 })
  return t('money.findings.comparison', { expected: number.format(row.expected_qty_day_comparable), actual: number.format(row.actual_qty_day_comparable), unit: row.comparison_unit })
}

/** Owner-confirmed closure, not inferred from absent sales; unexpected findings remain visible. */
export function isCikalHoliday(code: string, start: string, end: string): boolean {
  return code === 'SKC' && start <= '2026-10-08' && end >= '2026-10-03'
}
