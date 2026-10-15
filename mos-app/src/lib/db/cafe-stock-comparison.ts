// Stock comparison — typed client stubs for the proposed ESB on-hand read model.
// DISCONNECTED: the backend does not exist yet (reporting holds NO replicated ESB stock). Every function
// here throws a typed UNAVAILABLE error and must NOT be called while the backend is absent. The preview
// screen shows the real physical Counts through the existing reads (lib/db/cafe-records.ts
// listCafeRecordCounts, lib/db/cafe-count.ts listCafeCountableItems) and leaves every ESB cell blank.
// Contract: R/handover/stock-comparison.md. No schema, permission or write is added by this file.

/* eslint-disable @typescript-eslint/no-unused-vars -- stub parameters mirror the handover signatures; nothing is called until the backend is connected */
import { unavailable, type Decimal, type UUID } from './contract'
import type { ProductionActivity } from './kitchen-logs.types'

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — shared StreamRef
export type StreamRef = { branch_id: UUID; activity: ProductionActivity }

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — Missing / Flag
export type Missing = 'not_connected' | 'not_counted' | 'missing_source' | 'partial' | 'mapping_needed' | 'ambiguous_pool' | 'unit_mismatch' | 'unavailable'
export type Flag = Missing | 'shortage' | 'surplus' | 'no_difference' | 'pending_confirmation' | 'different_times' | 'stale_esb' | 'old_count' | 'zero_expected'

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — StockScope (server-side sort/filter over the whole authorized scope)
export type StockScope = {
  stream: StreamRef
  q?: string
  kind?: 'RAW' | 'WIP'
  category?: string | null
  only_differences?: boolean
  sort: 'gap' | 'quantity' | 'item' | 'count-date'
  dir: 'asc' | 'desc'
  cursor?: string
  limit?: number
  generation?: string
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — Expected (ESB on-hand, quantity + as-of)
type Expected = {
  quantity: Decimal
  unit_code: string
  as_of: string
  business_date: string
  basis: 'intraday' | 'end_of_day'
  provenance: 'source_row' | 'explicit_zero_by_source_contract'
  snapshot_id: UUID
  row_complete: boolean
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — Physical (latest Submitted/Confirmed Count)
type Physical = { id: UUID; quantity: Decimal; unit_id: UUID; unit_name: string; count_date: string; submitted_at: string; status: 'Submitted' | 'Confirmed' }

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — ComparisonRow
export type ComparisonRow = {
  key: string
  item_id: UUID
  item_name: string
  kind: 'RAW' | 'WIP'
  category: string | null
  unit_id: UUID | null
  unit_name: string | null
  expected: Expected | null
  count: Physical | null
  difference: Decimal | null
  difference_pct: Decimal | null
  missing: Missing | null
  flags: Flag[]
  indicative: boolean
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — SourceState
export type SourceState = {
  connection: 'connected' | 'not_connected'
  snapshot_id: UUID | null
  mapping_version: string | null
  as_of: string | null
  synced_at: string | null
  complete: boolean
  missing_scopes: string[]
  stale_after_hours: number
  count_stale_after_hours: number
  last_complete_snapshot_id: UUID | null
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — ComparisonPage
export type ComparisonPage = {
  rows: ComparisonRow[]
  next: string | null
  generation: string
  source: SourceState
  counts: { total: number; shown_scope: number; gaps: number; needs_data: number }
  counts_complete: boolean
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — listStockComparison (whole-scope keyset page; generation pins snapshot + mapping + Count cutoff)
export async function listStockComparison(_scope: StockScope): Promise<ComparisonPage> {
  return unavailable('listStockComparison')
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — getStockComparisonItem (source_unit_quantity keeps an incompatible ESB unit apart from the Count unit)
export async function getStockComparisonItem(
  _scope: { stream: StreamRef; item_id: UUID; unit_id: UUID; generation: string },
): Promise<{ row: ComparisonRow; source: SourceState; source_unit_quantity: { quantity: Decimal; unit_code: string } | null }> {
  return unavailable('getStockComparisonItem')
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — listEsbStockMovements (deferred separate contract; the panel shows Not connected until it exists)
export type EsbStockMovement = {
  id: UUID
  occurred_at: string
  document_ref: string
  movement_type: string
  quantity_in: Decimal
  quantity_out: Decimal
  unit_code: string
  balance_after: Decimal | null
  source_link: string | null
}
export async function listEsbStockMovements(
  _scope: { stream: StreamRef; item_id: UUID; unit_id: UUID; from: string; to: string; cursor?: string; generation?: string },
): Promise<{ rows: EsbStockMovement[]; next: string | null; as_of: string; complete: boolean }> {
  return unavailable('listEsbStockMovements')
}
