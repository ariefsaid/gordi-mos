// Kitchen module data layer — ops schema.
// Fetches WIP items + plans; inserts kitchen log rows.
// The client NEVER sends org_id, submitted_by, status — DB stamps them (NFR-003).
// Snake_case column names consumed directly — no camelCase bridge.

import { supabase } from '@/lib/supabase'
import { movementKey } from '@/lib/kitchen-action-label'
import { listActiveBranches } from './branches'
import type {
  BranchOption,
  WipItemOption,
  PlanMap,
  StockMap,
  ItemStock,
  CreateKitchenLogInput,
  KitchenAction,
  ProductionActivity,
  ProductionStream,
  ReviewLogRow,
  ApproveResult,
  KitchenStockRow,
  KitchenStockStreamRow,
} from './kitchen-logs.types'

const ops = () => supabase.schema('ops')
const shared = () => supabase.schema('shared')

/**
 * The stable code of the kitchen business unit (spec §3.3/§2, ADR-0019 D1 remap). Kitchen is an
 * Activity within the Retail Ops team BU; kitchen logs belong to Retail Ops. The approval RPC's
 * Daily-Log mirror resolves it by this code. Resolving by `code` — not display name — survives
 * BU renames (the fragility a prior version of this constant had, fixed by the
 * 20260705000002_bu_taxonomy_remap migration which added shared.business_units.code).
 */
export const KITCHEN_BU_CODE = 'retail_ops'

// ── The production stream a Café surface opens on ─────────────────────────────

/**
 * The branch a Café surface opens on: the books the ONE physical kitchen's output is
 * credited to today, which is the single (branch, activity) stream currently captured
 * (DD-WAY-25). Beware the label trap while reading this — the incumbent's stock tab says
 * "Stok HQ", where HQ means the CENTRAL KITCHEN, which books here and not to the branch
 * whose ERP code is GHQ.
 *
 * It is a DEFAULT SELECTION, not a model constant: the stream is a real column on every
 * row, a capture surface can move it, and an org without this branch falls back to the
 * first row of its own catalog rather than refusing to open.
 */
export const DEFAULT_CAPTURE_BRANCH_CODE = 'rumah_rames'
export const DEFAULT_CAPTURE_ACTIVITY: ProductionActivity = 'kitchen'

/** Pick the opening stream out of an already-loaded catalog. Null when it is empty. */
export function defaultStreamFrom(branches: readonly BranchOption[]): ProductionStream | null {
  const branch =
    branches.find(b => b.code === DEFAULT_CAPTURE_BRANCH_CODE) ?? branches[0] ?? null
  return branch ? { branch, activity: DEFAULT_CAPTURE_ACTIVITY } : null
}

/**
 * Resolve the opening stream against the live catalog. For surfaces that read one stream
 * and do not let the viewer move it yet; a capture surface loads the catalog itself so it
 * can offer the picker.
 */
export async function resolveDefaultCaptureStream(): Promise<ProductionStream | null> {
  return defaultStreamFrom(await listActiveBranches())
}

// ── WIP items ────────────────────────────────────────────────────────────────

/**
 * List active WIP items sorted by name — the UNGATED read.
 * Mirrors oracle list_active_wip_items.
 *
 * DELIBERATELY not the capture form's source. The DD-WAY-29 gate scopes absence to the
 * CAPTURE form only (FR-011) — this read feeds the stock/verification plane (FR-060,
 * OD-WAY-45) and the plan surface, which must keep seeing every active item: an
 * unconfirmed item still has real balances to verify, and hiding it there would blind
 * the very plane that audits the gate. The capture form reads listCaptureFormItems.
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

/**
 * List the items the CAPTURE FORM may offer, sorted by name — read from
 * ops.capture_form_items, the gated read path (FR-011, DD-WAY-29): only item-units whose
 * ERP coordinates are CONFIRMED come back, so an unconfirmed item is absent — not disabled,
 * not warned. The gate is the query, never a flag consulted at render time (NFR-004).
 *
 * The view returns one row per confirmed (item, unit); the form's item list is items, so
 * rows collapse to distinct items here. Unit display is a later slice (FR-020/021).
 */
export async function listCaptureFormItems(): Promise<WipItemOption[]> {
  const { data, error } = await ops()
    .from('capture_form_items')
    .select('wip_item_id,name,category')
    .order('name', { ascending: true })
  if (error) throw new Error(`listCaptureFormItems failed — ${error.message}`)
  const seen = new Set<string>()
  const items: WipItemOption[] = []
  for (const row of (data ?? []) as { wip_item_id: string; name: string; category: string | null }[]) {
    if (seen.has(row.wip_item_id)) continue
    seen.add(row.wip_item_id)
    items.push({ id: row.wip_item_id, name: row.name, category: row.category })
  }
  return items
}

// ── Kitchen plans ─────────────────────────────────────────────────────────────

/**
 * Fetch kitchen plans for a date, SCOPED TO ONE (branch, activity) production stream
 * (OD-WAY-28). The date-only read this replaces silently summed every stream's plan into
 * one number the moment more than one stream existed.
 *
 * Returns a PlanMap: { [wip_item_id]: { [movement key]: qty_porsi } }, so the form looks up
 * the plan for the movement the capturer has selected in O(1). The key is derived from the
 * stored `(action, destination_branch_id)` pair — there is no stored action_type.
 */
export async function fetchPlanMap(
  logDate: string,
  stream: ProductionStream,
): Promise<PlanMap> {
  const { data, error } = await ops()
    .from('kitchen_plans')
    .select('wip_item_id,action,destination_branch_id,qty_porsi')
    .eq('log_date', logDate)
    .eq('branch_id', stream.branch.id)
    .eq('activity', stream.activity)
  if (error) throw new Error(`fetchPlanMap failed — ${error.message}`)
  type PlanKeyRow = {
    wip_item_id: string
    action: KitchenAction
    destination_branch_id: string | null
    qty_porsi: number
  }
  const map: PlanMap = {}
  for (const row of (data ?? []) as PlanKeyRow[]) {
    if (!map[row.wip_item_id]) map[row.wip_item_id] = {}
    map[row.wip_item_id][
      movementKey({ action: row.action, destinationBranchId: row.destination_branch_id })
    ] = row.qty_porsi
  }
  return map
}

// ── Kitchen business unit resolution (#3, spec §3.3) ──────────────────────────

/**
 * Resolve the Retail Ops business-unit id by stable code from shared.business_units.
 * Kitchen logs belong to this BU — NOT the viewer's first role BU (which is wrong for
 * kitchen staff who may carry an unrelated reporting BU). RLS scopes the read to the
 * caller's org (org_id is never sent — directory.ts pattern).
 * Throws a clear, surfaceable error when the BU can't be resolved (the page renders an
 * error state rather than stamping a wrong BU).
 */
export async function resolveKitchenBuId(): Promise<string> {
  const { data, error } = await shared()
    .from('business_units')
    .select('id,code')
    .eq('code', KITCHEN_BU_CODE)
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`resolveKitchenBuId failed — ${error.message}`)
  const row = data as { id: string } | null
  if (!row?.id) {
    throw new Error(
      `Kitchen business unit (code "${KITCHEN_BU_CODE}") not found — cannot log without it.`,
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
async function fetchStockForDate(
  asOf: string,
  stream: ProductionStream,
): Promise<StockForDateRow[]> {
  const { data, error } = await ops().rpc('kitchen_stock_for_date', {
    p_as_of: asOf,
    p_branch_id: stream.branch.id,
    p_activity: stream.activity,
  })
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
export async function fetchStockMap(
  logDate: string,
  stream: ProductionStream,
): Promise<StockMap> {
  const rows = await fetchStockForDate(logDate, stream)
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
export async function fetchKitchenStock(
  asOf: string,
  stream: ProductionStream,
): Promise<KitchenStockRow[]> {
  const [items, stockRows] = await Promise.all([
    listActiveWipItems(),
    fetchStockForDate(asOf, stream),
  ])
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

/**
 * Fetch the read-only Stock view's display rows ACROSS every given (branch, activity)
 * stream (#198, OD-WAY-28): one row per (active WIP item × stream) pair, each carrying
 * the stream it belongs to. "Stok HQ" means the central kitchen, which books to Rumah
 * Rames — not Gordi HQ — so a stock view that cannot say WHOSE books a row is looking at
 * is the shape of problem that hides a COGS error. Runs one `fetchKitchenStock` per
 * stream in parallel; bounded by the branch catalog × 2 activities, both small.
 */
export async function fetchKitchenStockAcrossStreams(
  asOf: string,
  streams: readonly ProductionStream[],
): Promise<KitchenStockStreamRow[]> {
  const perStream = await Promise.all(
    streams.map(async (stream): Promise<KitchenStockStreamRow[]> => {
      const rows = await fetchKitchenStock(asOf, stream)
      return rows.map(row => ({ ...row, stream }))
    }),
  )
  return perStream.flat()
}

// ── Kitchen log insert ────────────────────────────────────────────────────────

/**
 * Turn one capture line into the row shape `ops.kitchen_logs` actually holds, and refuse to
 * build one that the table's own CHECKs would reject. Both refusals are client mirrors of a
 * database constraint, never a substitute for it (DD-WAY-8 — RLS and CHECKs are the
 * boundary):
 *  - a row must name its (branch, activity) production stream (`branch_id`/`activity` are
 *    NOT NULL, AC-007) — a log with no stream cannot be submitted;
 *  - a produce carries no destination and a transfer must carry one
 *    (`kitchen_logs_destination_matches_action`).
 */
function toKitchenLogRow(input: CreateKitchenLogInput): Record<string, unknown> {
  if (input.qty_porsi <= 0) throw new Error('qty_porsi must be > 0')
  if (!input.branch_id || !input.activity) {
    throw new Error('a kitchen log must name its (branch, activity) production stream')
  }
  if (input.action === 'produce' && input.destination_branch_id !== null) {
    throw new Error('a produce carries no destination branch')
  }
  if (input.action === 'transfer' && !input.destination_branch_id) {
    throw new Error('a transfer must name a destination branch')
  }
  return {
    business_unit_id: input.business_unit_id,
    log_date: input.log_date,
    branch_id: input.branch_id,
    activity: input.activity,
    action: input.action,
    destination_branch_id: input.destination_branch_id,
    wip_item_id: input.wip_item_id,
    qty_porsi: input.qty_porsi,
    notes: input.notes ?? null,
    // status NOT sent — DB defaults to 'Submitted'
    // source NOT sent — DB defaults to 'mos'
    // org_id NOT sent — server-stamped by current_org_id()
    // submitted_by NOT sent — server-stamped by current_person_id()
  }
}

/**
 * Insert one kitchen log row.
 * Sends ONLY the capture payload above; status/source/org_id/submitted_by are server-stamped.
 * Throws on PostgREST error. Returns the inserted row's id.
 */
export async function insertKitchenLog(input: CreateKitchenLogInput): Promise<string> {
  const row = toKitchenLogRow(input)

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
 * Each line must have qty_porsi > 0 and a complete stream (caller validates; this does too).
 * Returns array of inserted ids.
 */
export async function insertKitchenLogBatch(
  inputs: CreateKitchenLogInput[],
): Promise<string[]> {
  if (inputs.length === 0) return []

  const rows = inputs.map(toKitchenLogRow)

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
// `action_label` is the DERIVED label (DD-WAY-13): PostgREST exposes
// `ops.action_label(ops.kitchen_logs)` as a virtual column, so every surface reads the same
// derivation the database owns instead of re-deriving it — and no row stores a literal.
// `branch_id,activity` (#197/#198): the row's OWN (branch, activity) stream (OD-WAY-28) —
// added so the review queue can look up each row's plan baseline against ITS stream
// rather than one hardcoded stream (the #247/#196 defect this port fixes).
const REVIEW_SELECT =
  'id,log_date,action,destination_branch_id,branch_id,activity,action_label,wip_item_id,qty_porsi,notes,status,submitted_by,business_unit_id,created_at,wip_items(name)'

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
    // `action_label` is computed, so it cannot be ordered on. Ordering by the stored pair it
    // derives from puts produce before transfers and groups transfers by destination —
    // the same grouping the label ordering produced, from the columns that actually exist.
    .order('action', { ascending: true })
    .order('destination_branch_id', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(`listSubmittedKitchenLogs failed — ${error.message}`)

  type RawRow = {
    id: string
    log_date: string
    action: KitchenAction
    destination_branch_id: string | null
    branch_id: string
    activity: ProductionActivity
    action_label: string | null
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
      action_type: r.action_label ?? '',
      action: r.action,
      destination_branch_id: r.destination_branch_id,
      branch_id: r.branch_id,
      activity: r.activity,
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
