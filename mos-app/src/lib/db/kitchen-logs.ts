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
  ReviewLogRow,
  ApproveResult,
  KitchenStockRow,
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
    .eq('log_date', logDate)
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
 * The corrected #45 stock contract row (one per active WIP item, org-scoped by RLS):
 *   ops.kitchen_stock_for_date(p_as_of date)
 *     returns table(wip_item_id uuid, usable_qty numeric, available_qty numeric)
 * `usable_qty` → `stok` (FR-022 effective-target basis); `available_qty` → `tersedia`
 * (FR-023 transfer cap basis). Negative balances are preserved (FR-061/AC-032).
 */
interface StockForDateRow {
  wip_item_id: string
  usable_qty: number
  available_qty: number
}

/**
 * Fetch the corrected #45 stock rows for a date.
 * Calls `ops.kitchen_stock_for_date(p_as_of)` (the corrected signature — the prior
 * `stock_available_for_date(p_date)` form did not exist and failed at runtime).
 * Returns one row per active WIP item; RLS scopes them to the caller's org.
 */
async function fetchStockForDate(asOf: string): Promise<StockForDateRow[]> {
  const { data, error } = await ops().rpc('kitchen_stock_for_date', { p_as_of: asOf })
  if (error) throw new Error(`fetchStockMap failed — ${error.message}`)
  return (data ?? []) as StockForDateRow[]
}

/**
 * Fetch per-item stock + availability for a date as a StockMap keyed by wip_item_id
 * for O(1) lookup in the capture form (S1). Maps the corrected #45 contract's
 * `usable_qty`/`available_qty` → the existing `{ stok, tersedia }` shape.
 * `tersedia` (FR-023) is the transfer-availability the stepper caps against;
 * `stok` (FR-022) feeds the effective-target `max(plan − stok, 0)`.
 */
export async function fetchStockMap(logDate: string): Promise<StockMap> {
  const rows = await fetchStockForDate(logDate)
  const map: StockMap = {}
  for (const row of rows) {
    map[row.wip_item_id] = { stok: row.usable_qty, tersedia: row.available_qty } satisfies ItemStock
  }
  return map
}

/**
 * Fetch the read-only Stock view's display rows for a date (S4, FR-060/061).
 * Lists **every active WIP item** (FR-011, sorted by name) with its two cuts —
 * `stok` (usable_qty) and `tersedia` (available_qty) — for the selected date.
 * An active item with no stock row defaults to 0/0 (it simply has no approved
 * activity yet). Negative balances are preserved, never clamped (FR-061/AC-032).
 * Reuses `fetchStockForDate` + `listActiveWipItems` (DRY with the capture path).
 */
export async function fetchKitchenStock(asOf: string): Promise<KitchenStockRow[]> {
  const [items, stockRows] = await Promise.all([listActiveWipItems(), fetchStockForDate(asOf)])
  const byItem = new Map(stockRows.map(r => [r.wip_item_id, r]))
  return items.map(item => {
    const s = byItem.get(item.id)
    return {
      wip_item_id: item.id,
      wip_item_name: item.name,
      category: item.category,
      stok: s?.usable_qty ?? 0,
      tersedia: s?.available_qty ?? 0,
    }
  })
}

// ── Kitchen log insert ────────────────────────────────────────────────────────

/**
 * Insert one kitchen log row.
 * Sends ONLY: business_unit_id, log_date, action_type, wip_item_id, qty_porsi, notes.
 * status defaults to 'Submitted' at DB. org_id + submitted_by are server-stamped.
 * Throws on PostgREST error. Returns the inserted row's id.
 */
export async function insertKitchenLog(input: CreateKitchenLogInput): Promise<string> {
  // Validate client-side before hitting the DB (qty > 0)
  if (input.qty_porsi <= 0) {
    throw new Error('qty_porsi must be > 0')
  }

  const row: Record<string, unknown> = {
    business_unit_id: input.business_unit_id,
    log_date: input.log_date,
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
      log_date: input.log_date,
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

// ── Review / approve queue (S3 — ops_lead, FR-040..044/050) ───────────────────

/** A PostgREST error that carries the Postgres SQLSTATE / app error code so the UI
 *  can distinguish P0003 (already actioned), 42501 (forbidden), P0002 (not found). */
export class KitchenRpcError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'KitchenRpcError'
    this.code = code
  }
}

// The review-queue select. Embeds the WIP item name from the SAME ops schema
// (ops.kitchen_logs → ops.wip_items is FK-embeddable; cross-schema submitter →
// shared.people is NOT — PGRST200 — so the submitter NAME is resolved client-side
// from the directory, mirroring tasks.ts).
const REVIEW_SELECT =
  'id,log_date,action_type,wip_item_id,qty_porsi,notes,status,submitted_by,business_unit_id,created_at,wip_items(name)'

/**
 * List the Submitted kitchen logs for a date — the ops_lead review queue (FR-040).
 * Only `status = 'Submitted'` rows (the GIGO queue, FR-024/040); RLS scopes to the
 * caller's org. Returns a flat display shape (WIP name embedded; plan-vs-logged is
 * merged at the page from fetchPlanMap; submitter name from the directory).
 */
export async function listSubmittedKitchenLogs(logDate: string): Promise<ReviewLogRow[]> {
  const { data, error } = await ops()
    .from('kitchen_logs')
    .select(REVIEW_SELECT)
    .eq('status', 'Submitted')
    .eq('log_date', logDate)
    .order('action_type', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listSubmittedKitchenLogs failed — ${error.message}`)

  type RawRow = {
    id: string
    log_date: string
    action_type: KitchenActionType
    wip_item_id: string
    qty_porsi: number
    notes: string | null
    status: ReviewLogRow['status']
    submitted_by: string | null
    business_unit_id: string
    created_at: string
    // PostgREST returns the embed as an object (to-one) — tolerate array-or-object-or-null.
    wip_items: { name: string } | { name: string }[] | null
  }

  return ((data ?? []) as unknown as RawRow[]).map((r): ReviewLogRow => {
    const embed = Array.isArray(r.wip_items) ? r.wip_items[0] : r.wip_items
    return {
      id: r.id,
      log_date: r.log_date,
      action_type: r.action_type,
      wip_item_id: r.wip_item_id,
      wip_item_name: embed?.name ?? '—',
      qty_porsi: r.qty_porsi,
      notes: r.notes,
      status: r.status,
      submitted_by: r.submitted_by,
      business_unit_id: r.business_unit_id,
      created_at: r.created_at,
    }
  })
}

/**
 * Approve a Submitted kitchen log via the atomic `approve_kitchen_log` RPC (FR-050).
 * The RPC mints the batch_id, recomputes stock, enqueues the ESB push, and writes
 * the Daily-Log mirror server-side (atomic, confirmed-only) — the UI just reflects
 * the returned batch_id or the typed error. `reviewNote` is optional (the spec only
 * requires it on a plan-deviating approve — the page enforces that gate, FR-041).
 *
 * Re-throws PostgREST errors as KitchenRpcError so the page can branch on the code:
 *   P0003 → log no longer Submitted (someone else actioned it) → refresh the queue
 *   42501 → not ops_lead / wrong org → forbidden
 *   P0002 → not found
 */
export async function approveKitchenLog(
  logId: string,
  reviewNote?: string | null,
): Promise<ApproveResult> {
  const { data, error } = await ops().rpc('approve_kitchen_log', {
    p_log_id: logId,
    p_review_note: reviewNote ?? null,
  })
  if (error) {
    const code = (error as { code?: string }).code ?? 'UNKNOWN'
    throw new KitchenRpcError(code, `approveKitchenLog failed — ${error.message}`)
  }
  return { batch_id: data as string }
}

/**
 * Reject a Submitted kitchen log (FR-041) — a guarded Submitted→Rejected UPDATE
 * (the `kitchen_logs_update_reviewer` RLS policy allows ops_lead/admin to make this
 * transition). A review note is ALWAYS required on reject (FR-041, AC-041) — gated
 * client-side here and re-asserted server-side.
 *
 * The client sends ONLY `status` + `review_note`. `reviewed_by` / `reviewed_at` are
 * NOT sent — they are reviewer provenance that must be server-stamped (NFR-003).
 * NOTE (substrate gap — see report): FR-044 requires reviewer provenance on the
 * review transition; the approve RPC stamps it, but reject is a plain UPDATE whose
 * policy only accepts status + review_note. If provenance on reject is required, the
 * #45 SQL (a trigger or the policy) must stamp it server-side — flagged, not patched
 * from the UI tree.
 */
export async function rejectKitchenLog(logId: string, reviewNote: string): Promise<void> {
  if (!reviewNote.trim()) {
    throw new Error('A review note is required to reject a kitchen log.')
  }
  const { error } = await ops()
    .from('kitchen_logs')
    .update({ status: 'Rejected', review_note: reviewNote.trim() })
    .eq('id', logId)
    .eq('status', 'Submitted') // guard: only a Submitted log can be rejected (idempotency)
  if (error) throw new Error(`rejectKitchenLog failed — ${error.message}`)
}
