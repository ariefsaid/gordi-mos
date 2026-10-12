import { supabase } from '@/lib/supabase'
import { readAllPages } from '@/lib/db/reporting-shared'

export interface RecipeFinding {
  finding_id: string
  day: string
  esb_code: string
  branch_code: string
  menu_name: string | null
  expected_name: string | null
  actual_name: string | null
  classification: string
  rule: string
  confidence: string
  needs_human: boolean
  impact_idr: number | null
  impact_basis: string
  expected_qty_day_comparable: number | null
  actual_qty_day_comparable: number | null
  comparison_unit: string | null
  conversion_evidence: { recipe_units?: { status?: string }[]; movement_units?: { status?: string }[]; comparison_basis?: string | null }
  recommended_check: string
  recipe_version_hash: string | null
  recipe_edited_at: string | null
  recipe_observed_at: string | null
  prior_recipe_observed_at: string | null
  first_sale_at: string | null
  source_checked_at: string
  snapshot_as_of: string
  replica_stale: boolean
  recipe_versions: { version: number; first_seen: string } | null
}

export interface RecipeFindingReceipt {
  esb_code: string
  window_start: string
  window_end: string
  snapshot_as_of: string
  source_completed_at: string | null
  complete: boolean
}
export interface RecipeFindingsData { rows: RecipeFinding[]; receipts: RecipeFindingReceipt[] }

const SELECT = 'finding_id,day,esb_code,branch_code,menu_name,expected_name,actual_name,classification,rule,confidence,needs_human,impact_idr,impact_basis,expected_qty_day_comparable,actual_qty_day_comparable,comparison_unit,conversion_evidence,recommended_check,recipe_version_hash,recipe_edited_at,recipe_observed_at,prior_recipe_observed_at,first_sale_at,source_checked_at,snapshot_as_of,replica_stale,recipe_versions(version,first_seen)'

export async function listRecipeFindings(branch: string, start: string, end: string, companies: string[]): Promise<RecipeFindingsData> {
  const reporting = supabase.schema('reporting')
  const [rows, receipts] = await Promise.all([
    readAllPages<RecipeFinding>('listRecipeFindings', (from, to) => reporting.from('recipe_deduction_findings')
      .select(SELECT).eq('branch_code', branch).in('esb_code', companies).gte('day', start).lte('day', end)
      .order('impact_idr', { ascending: false, nullsFirst: false }).order('day', { ascending: false })
      .order('esb_code').order('finding_id').range(from, to)),
    reporting.from('recipe_finding_snapshots').select('esb_code,window_start,window_end,snapshot_as_of,source_completed_at,complete').in('esb_code', companies),
  ])
  if (receipts.error) throw receipts.error
  return { rows, receipts: receipts.data ?? [] }
}
