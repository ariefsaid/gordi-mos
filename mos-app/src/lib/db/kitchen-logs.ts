// Kitchen module data layer — ops schema.
// Fetches WIP items + plans; inserts kitchen log rows.
// The client NEVER sends org_id, submitted_by, status — DB stamps them (NFR-003).
// Snake_case column names consumed directly — no camelCase bridge.

import { supabase } from '@/lib/supabase'
import type {
  WipItemOption,
  KitchenPlanRow,
  PlanMap,
  StockMap,
  ItemStock,
  CreateKitchenLogInput,
  KitchenActionType,
} from './kitchen-logs.types'

const ops = () => supabase.schema('ops')
const shared = () => supabase.schema('shared')

/**
 * The canonical name of the kitchen business unit (spec §3.3/§2). Kitchen logs
 * belong to this BU; the approval RPC's Daily-Log mirror resolves it by name.
 * NOTE (owner / eng-planner open item): a stable `code`/slug on
 * shared.business_units would be more robust than matching on a display name.
 */
export const KITCHEN_BU_NAME = 'Kitchen and Bar'

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

// ── Kitchen business unit resolution (#3, spec §3.3) ──────────────────────────

/**
 * Resolve the "Kitchen and Bar" business-unit id by name from shared.business_units.
 * Kitchen logs belong to this BU — NOT the viewer's first role BU (which is wrong for
 * kitchen staff who may carry an unrelated reporting BU). RLS scopes the read to the
 * caller's org (org_id is never sent — directory.ts pattern).
 * Throws a clear, surfaceable error when the BU can't be resolved (the page renders an
 * error state rather than stamping a wrong BU).
 */
export async function resolveKitchenBuId(): Promise<string> {
  const { data, error } = await shared()
    .from('business_units')
    .select('id,name')
    .eq('name', KITCHEN_BU_NAME)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`resolveKitchenBuId failed — ${error.message}`)
  const row = data as { id: string } | null
  if (!row?.id) {
    throw new Error(
      `Kitchen business unit ("${KITCHEN_BU_NAME}") not found — cannot log without it.`,
    )
  }
  return row.id
}

// ── Kitchen stock + availability (#4, FR-022/023) ─────────────────────────────

/**
 * Fetch per-item stock + availability for a date via the #45 DB substrate's
 * `ops.stock_available_for_date(p_date)` function (built but not deployed in this
 * worktree — unit-tested with mocked data, same as the other reads here).
 * Returns a StockMap: { [wip_item_id]: { stok, tersedia } }.
 * `tersedia` (FR-023) is the transfer-availability the stepper caps against;
 * `stok` (FR-022) feeds the effective-target `max(plan − stok, 0)`.
 */
export async function fetchStockMap(logDate: string): Promise<StockMap> {
  const { data, error } = await ops().rpc('stock_available_for_date', { p_date: logDate })
  if (error) throw new Error(`fetchStockMap failed — ${error.message}`)
  const rows = (data ?? []) as { wip_item_id: string; stok: number; tersedia: number }[]
  const map: StockMap = {}
  for (const row of rows) {
    map[row.wip_item_id] = { stok: row.stok, tersedia: row.tersedia } satisfies ItemStock
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
