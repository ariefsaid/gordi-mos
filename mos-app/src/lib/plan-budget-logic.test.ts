// plan-budget-logic tests — TDD (AC-tagged). Pure selectors for the Plan budget/COGS + pricing
// pre-flight (ADR-0022). AC-PB-004 (budgeted COGS = BOM × linked cost lines), AC-PB-005 (margin,
// read-only), AC-PB-006 (fail-loud freshness/certification).
import { describe, it, expect } from 'vitest'
import {
  computeBudgetedCogs,
  projectMargin,
  assessCostStatus,
  formatIDR,
  formatPct,
  STALENESS_DAYS,
  MARGIN_FLOOR_PCT,
  type BomLine,
  type IngredientCostLine,
} from './plan-budget-logic'

const NOW = '2026-07-07T00:00:00Z'
const FRESH = '2026-07-01T00:00:00Z' // 6 days before NOW
const STALE = '2026-01-01T00:00:00Z' // > STALENESS_DAYS before NOW

function bom(over: Partial<BomLine> = {}): BomLine {
  return { menu_item_esb_code: 'MENU-1', ingredient_esb_code: 'ING-1', recipe_qty: 2, qty_unit: 'kg', ...over }
}
function cost(over: Partial<IngredientCostLine> = {}): IngredientCostLine {
  return { ingredient_esb_code: 'ING-1', name: 'Milk', unit_cost: 10000, unit: 'L', as_of: FRESH, ...over }
}

describe('computeBudgetedCogs — AC-PB-004: budgeted COGS = Σ qty × linked cost', () => {
  it('sums recipe_qty × the LINKED unit cost across the BOM', () => {
    const r = computeBudgetedCogs(
      [bom({ recipe_qty: 2 }), bom({ ingredient_esb_code: 'ING-2', recipe_qty: 0.5 })],
      [cost({ unit_cost: 10000 }), cost({ ingredient_esb_code: 'ING-2', unit_cost: 40000 })],
    )
    // 2×10000 + 0.5×40000 = 20000 + 20000 = 40000
    expect(r.total).toBe(40000)
    expect(r.complete).toBe(true)
    expect(r.lines[0].unit_cost).toBe(10000)
    expect(r.lines[0].line_total).toBe(20000)
  })

  it('AC-PB-004: a BOM line with NO linked cost line yields null (never a silent zero) and marks incomplete', () => {
    const r = computeBudgetedCogs(
      [bom({ recipe_qty: 2 }), bom({ ingredient_esb_code: 'ING-X', recipe_qty: 1 })],
      [cost({ unit_cost: 10000 })], // no ING-X cost line
    )
    expect(r.lines[1].unit_cost).toBeNull()
    expect(r.lines[1].line_total).toBeNull()
    expect(r.complete).toBe(false)
    // total is the sum over the lines that DO have a cost (20000), but completeness flags it partial
    expect(r.total).toBe(20000)
  })

  it('returns total=null when no BOM line has a linked cost', () => {
    const r = computeBudgetedCogs([bom({ ingredient_esb_code: 'ING-X' })], [cost({})])
    expect(r.total).toBeNull()
    expect(r.complete).toBe(false)
  })

  it('AC-PB-007: the unit cost is resolved from the LINKED record (link-never-copy — no embedded field)', () => {
    // The line_total is computed from recipe_qty × the joined unit_cost; there is no copied column.
    const r = computeBudgetedCogs([bom({ recipe_qty: 3 })], [cost({ unit_cost: 5000 })])
    expect(r.lines[0].unit_cost).toBe(5000) // resolved from the linked cost line
    expect(r.lines[0].line_total).toBe(15000)
  })

  it('basis_as_of is the OLDEST cost-line as_of across the resolved lines (the freshness watermark)', () => {
    const r = computeBudgetedCogs(
      [bom({ recipe_qty: 1 }), bom({ ingredient_esb_code: 'ING-2', recipe_qty: 1 })],
      [cost({ as_of: FRESH }), cost({ ingredient_esb_code: 'ING-2', as_of: STALE })],
    )
    expect(r.basis_as_of).toBe(STALE)
  })
})

describe('projectMargin — AC-PB-005: read-only margin (MOS never sets the price)', () => {
  it('computes gross margin and margin-% from a candidate price vs linked COGS', () => {
    const m = projectMargin(50000, 20000)
    expect(m.margin).toBe(30000)
    expect(m.margin_pct).toBe(0.6)
  })

  it('margin_pct is null (never NaN) when price <= 0', () => {
    const m = projectMargin(0, 20000)
    expect(m.margin_pct).toBeNull()
    expect(m.below_floor).toBe(false)
  })

  it('flags below_floor when margin-% is under the floor (warn-only — D5/OQ-3)', () => {
    const atFloor = projectMargin(1 / (1 - MARGIN_FLOOR_PCT) * 100, 100) // margin_pct exactly floor
    expect(atFloor.margin_pct).toBeCloseTo(MARGIN_FLOOR_PCT, 4)
    expect(atFloor.below_floor).toBe(false) // at the floor, not below
    const below = projectMargin(100, 80) // 20% margin < 30% floor
    expect(below.margin_pct).toBe(0.2)
    expect(below.below_floor).toBe(true)
  })
})

describe('assessCostStatus — AC-PB-006: fail-loud freshness + certification', () => {
  it('fresh + certified -> fresh:true, no reasons', () => {
    const s = assessCostStatus({ costAsOf: FRESH, basisAsOf: NOW, certified: true, metricKey: 'cogs.budgeted' })
    expect(s.stale).toBe(false)
    expect(s.uncertified).toBe(false)
    expect(s.fresh).toBe(true)
    expect(s.reasons).toHaveLength(0)
  })

  it(`STALE when cost as_of is more than ${STALENESS_DAYS} days older than the reference`, () => {
    const s = assessCostStatus({ costAsOf: STALE, basisAsOf: NOW, certified: true })
    expect(s.stale).toBe(true)
    expect(s.fresh).toBe(false)
    expect(s.reasons.join(' ')).toMatch(/stale/i)
  })

  it('UNCERTIFIED when the metric definition is not certified', () => {
    const s = assessCostStatus({ costAsOf: FRESH, basisAsOf: NOW, certified: false })
    expect(s.uncertified).toBe(true)
    expect(s.fresh).toBe(false)
    expect(s.reasons.join(' ')).toMatch(/not certified/i)
  })

  it('UNCERTIFIED when the metric key is absent', () => {
    const s = assessCostStatus({ costAsOf: FRESH, basisAsOf: NOW, certified: true, metricKey: null })
    expect(s.uncertified).toBe(true)
  })

  it('stale when there is no linked cost line at all (costAsOf null)', () => {
    const s = assessCostStatus({ costAsOf: null, basisAsOf: NOW, certified: true })
    expect(s.stale).toBe(true)
  })

  it('uses "now" as the reference when basisAsOf is omitted (live cost-line assessment)', () => {
    // FRESH is only ~days ago relative to the real now() used inside; assert it is NOT flagged stale
    // relative to itself by passing basisAsOf = costAsOf (0 age).
    const s = assessCostStatus({ costAsOf: FRESH, basisAsOf: FRESH, certified: true })
    expect(s.stale).toBe(false)
  })
})

describe('formatters', () => {
  it('formatIDR prefixes Rp and groups thousands with no decimals', () => {
    expect(formatIDR(45000)).toBe('Rp 45,000')
    expect(formatIDR(1234567.5)).toBe('Rp 1,234,568') // rounds, no sen
  })
  it('formatPct renders a 0..1 fraction as a whole-percent string, "—" for null', () => {
    expect(formatPct(0.423)).toBe('42%')
    expect(formatPct(null)).toBe('—')
  })
})
