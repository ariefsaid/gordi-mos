// plan-budget-logic.ts — pure selectors for the Plan budget/COGS + pricing pre-flight (ADR-0022).
// No Supabase, no React — fully unit-testable. The pages compose these over the rows the DAL returns.
//
// Money + date formatting are re-exported from the canonical format modules
// (cohesion-debt 2026-07-19, item #1) — this file no longer owns an IDR/date copy.
import { formatIDR } from './format/money'
import { formatDayMonthYear } from './format/date'
import { formatPercent } from './format/percent'

export { formatIDR }
//
// The model (binding — see docs/specs/plan-budget.spec.md):
//  - Ingredient cost line = reference data; basis ESB last_hpp; consumers LINK by ingredient_esb_code,
//    never copy (anchor A5). The unit cost is always RESOLVED by joining the linked cost line.
//  - Budget = a captured budgeted-COGS scenario. The unit cost is never copied into a budget line.
//  - Fail-loud: a budget whose cost basis is STALE (as_of older than the threshold) OR whose certified-
//    metric definition is UNCERTIFIED renders a fail-loud badge (anchor A7); the pricing pre-flight warns.

/** A cost line is STALE when its as_of is more than this many days older than the basis reference. */
export const STALENESS_DAYS = 30

/** The pricing pre-flight shows a soft floor warning below this margin-% (warn-only — D5/OQ-3). */
export const MARGIN_FLOOR_PCT = 0.3

/** A BOM line (read from reporting.bom_lines — ESB-owned, read-only in MOS). */
export interface BomLine {
  menu_item_esb_code: string
  ingredient_esb_code: string
  recipe_qty: number
  qty_unit: string
}

/** An ingredient cost line (read from reporting.ingredient_cost_lines — the linked certified record). */
export interface IngredientCostLine {
  ingredient_esb_code: string
  name: string
  unit_cost: number
  unit: string
  as_of: string // ISO timestamp
}

/** A captured budget (read from mos.budgets). */
export interface BudgetRow {
  id: string
  menu_item_esb_code: string
  menu_item_name: string
  scenario_label: string
  scenario_type: 'baseline' | 'promo' | 'new_branch' | 'menu'
  owning_bu_id: string
  total_budgeted_cogs: number
  cost_basis_as_of: string // ISO timestamp
  certified_metric_key: string
  is_complete: boolean
}

/** A certified-metric definition (read from mos.certified_metrics). */
export interface CertifiedMetric {
  key: string
  name: string
  certified: boolean
}

/** A BOM ingredient costed against its linked cost line (the link-never-copy join result). */
export interface CostedBomLine {
  ingredient_esb_code: string
  ingredient_name: string
  recipe_qty: number
  qty_unit: string
  /** Resolved from the LINKED cost line — never a copied/embedded number. null when no linked cost line. */
  unit_cost: number | null
  /** The linked cost line's as_of (for the freshness badge). null when no linked cost line. */
  cost_as_of: string | null
  /** recipe_qty × unit_cost; null when unit_cost is null (missing linked cost line). */
  line_total: number | null
}

export interface BudgetedCogs {
  lines: CostedBomLine[]
  /** Σ line_total over lines that have a linked cost. */
  total: number | null
  /** False when ANY BOM line lacks a linked cost line (never a silent zero). */
  complete: boolean
  /** The oldest cost-line as_of across the resolved lines (the freshness watermark). */
  basis_as_of: string | null
}

/**
 * Compute the budgeted COGS for a menu item: the BOM costed at the LINKED ingredient cost lines.
 * AC-PB-004. A BOM ingredient with no linked cost line yields line_total = null (never a silent zero);
 * the result is `complete: false`. The unit cost is RESOLVED from the linked cost line (link-never-copy).
 */
export function computeBudgetedCogs(
  bom: BomLine[],
  costs: IngredientCostLine[],
): BudgetedCogs {
  const costByCode = new Map(costs.map((c) => [c.ingredient_esb_code, c]))
  let complete = true
  let basisAsOf: string | null = null
  const lines: CostedBomLine[] = bom.map((b) => {
    const cost = costByCode.get(b.ingredient_esb_code) ?? null
    const unit_cost = cost ? cost.unit_cost : null
    const cost_as_of = cost ? cost.as_of : null
    const line_total = unit_cost !== null ? round4(b.recipe_qty * unit_cost) : null
    if (line_total === null) complete = false
    if (cost_as_of !== null && (basisAsOf === null || cost_as_of < basisAsOf)) {
      basisAsOf = cost_as_of
    }
    return {
      ingredient_esb_code: b.ingredient_esb_code,
      ingredient_name: cost?.name ?? '(no linked cost line)',
      recipe_qty: b.recipe_qty,
      qty_unit: b.qty_unit,
      unit_cost,
      cost_as_of,
      line_total,
    }
  })
  const totaled = lines.filter((l) => l.line_total !== null)
  const total = totaled.length > 0 ? round4(totaled.reduce((s, l) => s + (l.line_total as number), 0)) : null
  return { lines, total, complete, basis_as_of: basisAsOf }
}

export interface MarginResult {
  cogs: number
  price: number
  margin: number
  /** Gross margin fraction (margin / price). null when price <= 0 (never NaN). */
  margin_pct: number | null
  /** True when margin_pct is below the floor (soft warn — D5/OQ-3). */
  below_floor: boolean
}

/**
 * Project the gross margin for a candidate price against a linked certified budgeted COGS. AC-PB-005.
 * Read-only math — MOS never sets the price (ADR-0022 D5). Returns null margin_pct when price <= 0
 * (never NaN); below_floor is false when margin_pct is null (no number to grade).
 */
export function projectMargin(price: number, cogs: number): MarginResult {
  const p = round4(price)
  const c = round4(cogs)
  const margin = round4(p - c)
  const margin_pct = p > 0 ? round4(margin / p) : null
  return {
    cogs: c,
    price: p,
    margin,
    margin_pct,
    below_floor: margin_pct !== null && margin_pct < MARGIN_FLOOR_PCT,
  }
}

export interface CostStatus {
  /** True when the linked cost line's as_of is older than the staleness threshold vs the reference. */
  stale: boolean
  /** True when the budget's certified-metric definition is NOT certified (or the key is unknown). */
  uncertified: boolean
  /** Convenience: true only when fresh AND certified. */
  fresh: boolean
  /** Human-readable reason list (for the fail-loud badge copy). */
  reasons: string[]
}

/**
 * Assess the freshness + certification of a cost basis for the fail-loud badge. AC-PB-006.
 * `costAsOf` = the linked cost line's as_of (or the budget's cost_basis_as_of for a captured budget);
 * `basisAsOf` = the reference "now-ish" watermark (the budget's cost_basis_as_of, or now for a live
 * cost line). A cost line is STALE when it is more than STALENESS_DAYS older than the reference.
 */
export function assessCostStatus(args: {
  costAsOf: string | null
  basisAsOf?: string | null
  certified?: boolean
  metricKey?: string | null
}): CostStatus {
  const { costAsOf, basisAsOf = null, certified = true, metricKey = 'cogs.budgeted' } = args
  const reasons: string[] = []
  let stale = false
  if (costAsOf === null) {
    stale = true
    reasons.push('No linked cost line for one or more BOM ingredients.')
  } else {
    const reference = basisAsOf ?? new Date().toISOString()
    const ageDays = (Date.parse(reference) - Date.parse(costAsOf)) / 86_400_000
    if (ageDays > STALENESS_DAYS) {
      stale = true
      reasons.push(`Cost basis is stale (as of ${shortDate(costAsOf)} — over ${STALENESS_DAYS} days old).`)
    }
  }
  const uncertified = !certified || !metricKey
  if (uncertified) reasons.push('The COGS metric definition is not certified.')
  return { stale, uncertified, fresh: !stale && !uncertified, reasons }
}

/** Format a 0..1 fraction as a percentage string (e.g. 0.423 -> "42%"). Integer
 * precision is this surface's semantic; the separator/locale comes from the ONE
 * canonical percent module (census g-money r5 F-2). */
export function formatPct(frac: number | null): string {
  return formatPercent(frac, 0)
}

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000
}

function shortDate(iso: string): string {
  return formatDayMonthYear(iso)
}
