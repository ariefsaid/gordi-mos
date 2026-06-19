// Kitchen module data layer — ops schema.
// Fetches WIP items + plans; inserts kitchen log rows.
// The client NEVER sends org_id, submitted_by, status — DB stamps them (NFR-003).
// Snake_case column names consumed directly — no camelCase bridge.

import { supabase } from '@/lib/supabase'
import type {
  WipItemOption,
  KitchenPlanRow,
  PlanMap,
  CreateKitchenLogInput,
  KitchenActionType,
} from './kitchen-logs.types'

const ops = () => supabase.schema('ops')

// ── WIP items ────────────────────────────────────────────────────────────────

/**
 * List active WIP items sorted by name.
 * Mirrors oracle list_active_wip_items (FR-011).
 */
export async function listActiveWipItems(): Promise<WipItemOption[]> {
  const { data, error } = await ops()
    .from('wip_items')
    .select('id,name,category')
    .eq('flag_active', true)
    .order('name', { ascending: true })
  if (error) throw new Error(`listActiveWipItems failed — ${error.message}`)
  return (data ?? []) as WipItemOption[]
}

// ── Kitchen plans ─────────────────────────────────────────────────────────────

/**
 * Fetch kitchen plans for a given date (YYYY-MM-DD WIB).
 * Returns a PlanMap: { [wip_item_id]: { [action_type]: qty_porsi } }
 * so the form can look up plan qty per (item, action_type) in O(1).
 */
export async function fetchPlanMap(logDate: string): Promise<PlanMap> {
  const { data, error } = await ops()
    .from('kitchen_plans')
    .select('wip_item_id,action_type,qty_porsi')
    .eq('date', logDate)
  if (error) throw new Error(`fetchPlanMap failed — ${error.message}`)
  const rows = (data ?? []) as Pick<KitchenPlanRow, 'wip_item_id' | 'action_type' | 'qty_porsi'>[]
  const map: PlanMap = {}
  for (const row of rows) {
    if (!map[row.wip_item_id]) map[row.wip_item_id] = {} as PlanMap[string]
    map[row.wip_item_id][row.action_type as KitchenActionType] = row.qty_porsi
  }
  return map
}

// ── Kitchen log insert ────────────────────────────────────────────────────────

/**
 * Insert one kitchen log row.
 * Sends ONLY: business_unit_id, log_date, action_type, wip_item_id, qty_porsi, notes.
 * status defaults to 'Submitted' at DB. org_id + submitted_by are server-stamped.
 * Throws on PostgREST error. Returns the inserted row's id.
 *
 * DB column name is `date` not `log_date` — map here at the boundary.
 */
export async function insertKitchenLog(input: CreateKitchenLogInput): Promise<string> {
  // Validate client-side before hitting the DB (qty > 0)
  if (input.qty_porsi <= 0) {
    throw new Error('qty_porsi must be > 0')
  }

  const row: Record<string, unknown> = {
    business_unit_id: input.business_unit_id,
    date: input.log_date,           // DB column is `date`
    action_type: input.action_type,
    wip_item_id: input.wip_item_id,
    qty_porsi: input.qty_porsi,
    notes: input.notes ?? null,
    // status NOT sent — DB defaults to 'Submitted'
    // org_id NOT sent — server-stamped by current_org_id()
    // submitted_by NOT sent — server-stamped by current_person_id()
  }

  const { data, error } = await ops()
    .from('kitchen_logs')
    .insert(row)
    .select('id')
    .single()

  if (error) throw new Error(`insertKitchenLog failed — ${error.message}`)
  return (data as { id: string }).id
}

/**
 * Insert multiple kitchen log lines in one batch.
 * Each line must have qty_porsi > 0 (caller validates; this validates each too).
 * Returns array of inserted ids.
 */
export async function insertKitchenLogBatch(
  inputs: CreateKitchenLogInput[],
): Promise<string[]> {
  if (inputs.length === 0) return []

  const rows = inputs.map(input => {
    if (input.qty_porsi <= 0) throw new Error('qty_porsi must be > 0')
    return {
      business_unit_id: input.business_unit_id,
      date: input.log_date,
      action_type: input.action_type,
      wip_item_id: input.wip_item_id,
      qty_porsi: input.qty_porsi,
      notes: input.notes ?? null,
      // status / org_id / submitted_by: server-stamped
    }
  })

  const { data, error } = await ops()
    .from('kitchen_logs')
    .insert(rows)
    .select('id')

  if (error) throw new Error(`insertKitchenLogBatch failed — ${error.message}`)
  return ((data ?? []) as { id: string }[]).map(r => r.id)
}
