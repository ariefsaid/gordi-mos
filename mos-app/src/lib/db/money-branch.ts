import { supabase } from '@/lib/supabase'
import { appUrl } from '@/config/app-build-settings'
import { announceOpenTaskCountChanged } from '@/lib/open-task-count-store'
import type { ProductionActivity } from './kitchen-logs.types'

// Data layer for the Money Branch page's two non-reporting pieces (#1436): the branch's Café items
// without a recipe, and "Ask branch lead". Never sends org_id; RLS and the function's own checks
// are the authority.

/** A Café prep item at the branch whose ERP item has no active recipe, so its cost is not known. */
export interface UncoveredCafeItem {
  id: string
  name: string
  /** The branch's streams that carry it, kitchen first. */
  activities: ProductionActivity[]
}

/** The branch's active prep (WIP) items whose ERP item has no active recipe. An ingredient (RAW)
 *  never has one, so it is not listed; an item whose recipe state is unknown (null) is not either. */
export async function listUncoveredCafeItems(branchId: string): Promise<UncoveredCafeItem[]> {
  const { data, error } = await supabase.schema('ops').from('cafe_item_references')
    .select('item_id, name, activity')
    .eq('branch_id', branchId)
    .eq('kind', 'WIP')
    .eq('has_active_bom_output', false)
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw new Error(`listUncoveredCafeItems failed: ${error.message}`)
  const byId = new Map<string, UncoveredCafeItem>()
  for (const row of (data ?? []) as { item_id: string; name: string; activity: ProductionActivity }[]) {
    const item = byId.get(row.item_id) ?? { id: row.item_id, name: row.name, activities: [] }
    if (!item.activities.includes(row.activity)) item.activities.push(row.activity)
    byId.set(row.item_id, item)
  }
  for (const item of byId.values()) item.activities.sort((a) => (a === 'kitchen' ? -1 : 1))
  return [...byId.values()]
}

export type AskBranchLeadResult =
  | { kind: 'created'; taskId: string }
  /** The branch's Café Team has no lead in MOS, or the ERP code is linked to no MOS branch. */
  | { kind: 'no-lead' }

export interface AskBranchLeadInput {
  code: string
  period: number
  day: string
  locale: 'en' | 'id'
}

/** The app's own absolute base (scheme, host, path; no trailing slash) for the Task's link. */
function appBaseUrl(): string {
  return new URL(appUrl('/'), window.location.origin).href.replace(/\/+$/, '')
}

/** Create (or find the caller's open) Task for the branch lead. The function builds the Task's
 *  title and link itself: nothing typed here reaches the Task. */
export async function askBranchLead(input: AskBranchLeadInput): Promise<AskBranchLeadResult> {
  const { data, error } = await supabase.schema('mos').rpc('ask_branch_lead', {
    p_branch_code: input.code,
    p_period: input.period,
    p_day: input.day,
    p_app_url: appBaseUrl(),
    p_locale: input.locale,
  })
  if (error) {
    if (error.code === 'P0002') return { kind: 'no-lead' }
    throw new Error(`askBranchLead failed: ${error.message}`)
  }
  announceOpenTaskCountChanged()
  return { kind: 'created', taskId: data as string }
}
