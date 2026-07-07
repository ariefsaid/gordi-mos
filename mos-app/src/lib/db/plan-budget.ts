// Data layer for the Plan budget/COGS + pricing pre-flight surfaces (ADR-0022). Reads the reporting
// value-source read-models (ingredient cost lines + BOM — the curated ESB last_hpp / recipe snapshot,
// ADR-0010 OLTP/OLAP) and the mos captured records (budgets + certified metrics). Writes only
// mos.budgets (+ its lines) — never writes BOMs/cost-lines/prices to ESB (D3/D5).
//
// The reporting read-models are snapshot-fed by the future warehouse->Supabase job (dev-seeded);
// wiring the real feed is a drop-in (the DAL + components are unchanged) — NOT faked in the component.
// RLS is the authority: reporting = finance/admin SELECT; mos.budgets write = can('cogs.write').
// This layer NEVER sends org_id (RLS scopes it); throws non-secret on error (no DSN/token/SQL).

import { supabase } from '@/lib/supabase'
import type {
  BomLine,
  IngredientCostLine,
  BudgetRow,
  CertifiedMetric,
} from '@/lib/plan-budget-logic'

const reporting = () => supabase.schema('reporting')
const mos = () => supabase.schema('mos')

// ── Reporting value-source read-models (snapshot-fed; dev-seeded) ──────────────

const COST_SELECT = 'ingredient_esb_code,name,unit_cost,unit,as_of'
const BOM_SELECT = 'menu_item_esb_code,ingredient_esb_code,recipe_qty,qty_unit,as_of'

/** List the ingredient cost lines for the caller's org (RLS: finance/admin). */
export async function listIngredientCostLines(): Promise<IngredientCostLine[]> {
  const { data, error } = await reporting()
    .from('ingredient_cost_lines')
    .select(COST_SELECT)
    .order('ingredient_esb_code', { ascending: true })
  if (error) throw new Error(`listIngredientCostLines failed — ${error.message}`)
  return (data ?? []) as unknown as IngredientCostLine[]
}

/** List the BOM lines for the caller's org, optionally filtered to one menu item (RLS: finance/admin). */
export async function listBomLines(menuItemEsbCode?: string): Promise<BomLine[]> {
  let q = reporting().from('bom_lines').select(BOM_SELECT)
  if (menuItemEsbCode) q = q.eq('menu_item_esb_code', menuItemEsbCode)
  q = q.order('menu_item_esb_code', { ascending: true })
  const { data, error } = await q
  if (error) throw new Error(`listBomLines failed — ${error.message}`)
  return (data ?? []) as unknown as BomLine[]
}

// ── mos captured records ───────────────────────────────────────────────────────

const BUDGET_SELECT =
  'id,menu_item_esb_code,menu_item_name,scenario_label,scenario_type,owning_bu_id,total_budgeted_cogs,cost_basis_as_of,certified_metric_key,is_complete'

/** List budgets for the caller's org, optionally filtered to one menu item (RLS: finance/admin). */
export async function listBudgets(menuItemEsbCode?: string): Promise<BudgetRow[]> {
  let q = mos().from('budgets').select(BUDGET_SELECT).is('archived_at', null)
  if (menuItemEsbCode) q = q.eq('menu_item_esb_code', menuItemEsbCode)
  q = q.order('created_at', { ascending: false })
  const { data, error } = await q
  if (error) throw new Error(`listBudgets failed — ${error.message}`)
  return (data ?? []) as unknown as BudgetRow[]
}

/** Read one certified-metric definition by key (RLS: finance/admin). null when absent. */
export async function getCertifiedMetric(key: string): Promise<CertifiedMetric | null> {
  const { data, error } = await mos()
    .from('certified_metrics')
    .select('key,name,unit,grain,certified')
    .eq('key', key)
    .maybeSingle()
  if (error) throw new Error(`getCertifiedMetric failed — ${error.message}`)
  if (!data) return null
  return data as unknown as CertifiedMetric
}

export interface CaptureBudgetInput {
  menuItemEsbCode: string
  menuItemName: string
  scenarioLabel: string
  scenarioType: 'baseline' | 'promo' | 'new_branch' | 'menu'
  owningBuId: string
  totalBudgetedCogs: number
  costBasisAsOf: string
  certifiedMetricKey?: string
  isComplete: boolean
  notes?: string
  /** The linked ingredient breakdown (ingredient + qty only — NO unit cost; link-never-copy, A5). */
  lines: { ingredient_esb_code: string; recipe_qty: number; qty_unit: string }[]
}

/**
 * Capture a budget scenario: insert mos.budgets + its mos.budget_lines (ingredient + qty only).
 * AC-PB-008. Write gated by can('cogs.write') + org seam (RLS). The unit cost is NEVER sent — it is
 * always resolved by joining the linked cost line (link-never-copy). Returns the new budget id.
 */
export async function captureBudget(input: CaptureBudgetInput): Promise<string> {
  const { data: budget, error } = await mos()
    .from('budgets')
    .insert({
      menu_item_esb_code: input.menuItemEsbCode,
      menu_item_name: input.menuItemName,
      scenario_label: input.scenarioLabel,
      scenario_type: input.scenarioType,
      owning_bu_id: input.owningBuId,
      total_budgeted_cogs: input.totalBudgetedCogs,
      cost_basis_as_of: input.costBasisAsOf,
      certified_metric_key: input.certifiedMetricKey ?? 'cogs.budgeted',
      is_complete: input.isComplete,
      notes: input.notes ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`captureBudget (budget) failed — ${error.message}`)

  if (input.lines.length > 0) {
    const rows = input.lines.map((l) => ({
      budget_id: budget.id,
      ingredient_esb_code: l.ingredient_esb_code,
      recipe_qty: l.recipe_qty,
      qty_unit: l.qty_unit,
    }))
    const { error: lineErr } = await mos().from('budget_lines').insert(rows)
    if (lineErr) throw new Error(`captureBudget (lines) failed — ${lineErr.message}`)
  }
  return budget.id as string
}
