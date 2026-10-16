// Count-review-authorized client reads for the nightly ESB on-hand comparison.
import { ContractError, unavailable, type Decimal, type UUID } from './contract'
import { supabase } from '@/lib/supabase'
import type { ProductionActivity } from './kitchen-logs.types'

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — shared StreamRef
export type StreamRef = { branch_id: UUID; activity: ProductionActivity }
// HANDOVER: R/handover/stock-comparison.md §Typed client contract — Missing / Flag
export type Missing = 'not_connected' | 'not_counted' | 'missing_source' | 'partial' | 'mapping_needed' | 'ambiguous_pool' | 'unit_mismatch' | 'unavailable'
export type Flag = Missing | 'shortage' | 'surplus' | 'no_difference' | 'pending_confirmation' | 'different_times' | 'stale_esb' | 'old_count' | 'zero_expected'
// HANDOVER: R/handover/stock-comparison.md §Typed client contract — StockScope
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

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — Expected
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
// HANDOVER: R/handover/stock-comparison.md §Typed client contract — Physical
type Physical = {
  id: UUID
  quantity: Decimal
  unit_id: UUID
  unit_name: string
  count_date: string
  submitted_at: string
  status: 'Submitted' | 'Confirmed'
}
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
  counts: { total: number; shown_scope: number; gaps: number; needs_data: number; counted: number; zero: number }
  counts_complete: boolean
}

const MISSING_VALUES: readonly Missing[] = [
  'not_connected', 'not_counted', 'missing_source', 'partial', 'mapping_needed',
  'ambiguous_pool', 'unit_mismatch', 'unavailable',
]
const FLAG_VALUES: readonly Flag[] = [
  ...MISSING_VALUES, 'shortage', 'surplus', 'no_difference', 'pending_confirmation',
  'different_times', 'stale_esb', 'old_count', 'zero_expected',
]
const CONTRACT_ERRORS: Record<string, ContractError['code']> = {
  '42501': 'FORBIDDEN', 'P0002': 'NOT_FOUND', '22023': 'INVALID', '40001': 'CONFLICT',
}

type UnknownRecord = Record<string, unknown>
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isNullableString = (value: unknown): value is string | null => value === null || isString(value)
const isCountStatus = (value: unknown): value is Physical['status'] => value === 'Submitted' || value === 'Confirmed'

function contractError(name: string, error: { code?: string; message: string }): ContractError {
  const code = error.code ? CONTRACT_ERRORS[error.code] ?? 'UNAVAILABLE' : 'UNAVAILABLE'
  return new ContractError(code, `${name} failed: ${error.message}`)
}

function parseExpected(value: unknown): Expected | null {
  if (value === null) return null
  if (!isRecord(value) || !isString(value.quantity) || !isString(value.unit_code)
    || !isString(value.as_of) || !isString(value.business_date)
    || (value.basis !== 'intraday' && value.basis !== 'end_of_day')
    || (value.provenance !== 'source_row' && value.provenance !== 'explicit_zero_by_source_contract')
    || !isString(value.snapshot_id) || typeof value.row_complete !== 'boolean') {
    throw new ContractError('UNAVAILABLE', 'listStockComparison returned an invalid expected row')
  }
  return {
    quantity: value.quantity,
    unit_code: value.unit_code,
    as_of: value.as_of,
    business_date: value.business_date,
    basis: value.basis,
    provenance: value.provenance,
    snapshot_id: value.snapshot_id,
    row_complete: value.row_complete,
  }
}

function parsePhysical(value: unknown): Physical | null {
  if (value === null) return null
  if (!isRecord(value) || !isString(value.id) || !isString(value.quantity)
    || !isString(value.unit_id) || !isString(value.unit_name)
    || !isString(value.count_date) || !isString(value.submitted_at) || !isCountStatus(value.status)) {
    throw new ContractError('UNAVAILABLE', 'listStockComparison returned an invalid physical Count')
  }
  return {
    id: value.id,
    quantity: value.quantity,
    unit_id: value.unit_id,
    unit_name: value.unit_name,
    count_date: value.count_date,
    submitted_at: value.submitted_at,
    status: value.status,
  }
}

function parseComparisonRow(value: unknown, name: string): ComparisonRow {
  if (!isRecord(value) || !isString(value.key) || !isString(value.item_id) || !isString(value.item_name)
    || (value.kind !== 'RAW' && value.kind !== 'WIP')
    || !isNullableString(value.category) || !(value.unit_id === null || isString(value.unit_id))
    || !isNullableString(value.unit_name) || !isNullableString(value.difference)
    || !isNullableString(value.difference_pct) || typeof value.indicative !== 'boolean') {
    throw new ContractError('UNAVAILABLE', `${name} returned an invalid comparison row`)
  }
  const missing = value.missing
  if (missing !== null && (!isString(missing) || !MISSING_VALUES.includes(missing as Missing))) {
    throw new ContractError('UNAVAILABLE', `${name} returned an invalid missing reason`)
  }
  if (!Array.isArray(value.flags) || value.flags.some(flag => !isString(flag) || !FLAG_VALUES.includes(flag as Flag))) {
    throw new ContractError('UNAVAILABLE', `${name} returned invalid comparison flags`)
  }
  return {
    key: value.key,
    item_id: value.item_id,
    item_name: value.item_name,
    kind: value.kind,
    category: value.category,
    unit_id: value.unit_id,
    unit_name: value.unit_name,
    expected: parseExpected(value.expected),
    count: parsePhysical(value.count),
    difference: value.difference,
    difference_pct: value.difference_pct,
    missing: missing as Missing | null,
    flags: value.flags as Flag[],
    indicative: value.indicative,
  }
}

function parseSource(value: unknown, name: string): SourceState {
  if (!isRecord(value) || (value.connection !== 'connected' && value.connection !== 'not_connected')
    || !(value.snapshot_id === null || isString(value.snapshot_id))
    || !isNullableString(value.mapping_version) || !isNullableString(value.as_of)
    || !isNullableString(value.synced_at) || typeof value.complete !== 'boolean'
    || !Array.isArray(value.missing_scopes) || value.missing_scopes.some(scope => !isString(scope))
    || typeof value.stale_after_hours !== 'number' || typeof value.count_stale_after_hours !== 'number'
    || !(value.last_complete_snapshot_id === null || isString(value.last_complete_snapshot_id))) {
    throw new ContractError('UNAVAILABLE', `${name} returned an invalid source state`)
  }
  return {
    connection: value.connection,
    snapshot_id: value.snapshot_id,
    mapping_version: value.mapping_version,
    as_of: value.as_of,
    synced_at: value.synced_at,
    complete: value.complete,
    missing_scopes: value.missing_scopes,
    stale_after_hours: value.stale_after_hours,
    count_stale_after_hours: value.count_stale_after_hours,
    last_complete_snapshot_id: value.last_complete_snapshot_id,
  }
}

function parseComparisonPage(value: unknown): ComparisonPage {
  if (!isRecord(value) || !Array.isArray(value.rows) || !(value.next === null || isString(value.next))
    || !isString(value.generation) || !isRecord(value.counts)
    || typeof value.counts.total !== 'number' || typeof value.counts.shown_scope !== 'number'
    || typeof value.counts.gaps !== 'number' || typeof value.counts.needs_data !== 'number'
    || typeof value.counts.counted !== 'number' || typeof value.counts.zero !== 'number'
    || typeof value.counts_complete !== 'boolean') {
    throw new ContractError('UNAVAILABLE', 'listStockComparison returned an invalid page')
  }
  return {
    rows: value.rows.map(row => parseComparisonRow(row, 'listStockComparison')),
    next: value.next,
    generation: value.generation,
    source: parseSource(value.source, 'listStockComparison'),
    counts: {
      total: value.counts.total,
      shown_scope: value.counts.shown_scope,
      gaps: value.counts.gaps,
      needs_data: value.counts.needs_data,
      counted: value.counts.counted,
      zero: value.counts.zero,
    },
    counts_complete: value.counts_complete,
  }
}

function comparisonCategory(category: string | null | undefined): string | null {
  return !category || category === 'all' ? null : category
}

function encodeCursor(value: UnknownRecord): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function generationCursor(scope: StockScope, category: string | null): string | undefined {
  if (!scope.generation || scope.cursor) return scope.cursor
  return encodeCursor({
    generation: scope.generation,
    branch_id: scope.stream.branch_id,
    activity: scope.stream.activity,
    only_differences: scope.only_differences ?? false,
    q: scope.q ?? '',
    kind: scope.kind ?? 'all',
    category: category ?? '',
    sort: scope.sort,
    dir: scope.dir,
    after: null,
  })
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract
export async function listStockComparison(scope: StockScope): Promise<ComparisonPage> {
  const category = comparisonCategory(scope.category)
  const { data, error } = await supabase.schema('ops').rpc('list_stock_comparison', {
    p_branch_id: scope.stream.branch_id,
    p_activity: scope.stream.activity,
    p_only_differences: scope.only_differences ?? false,
    p_q: scope.q ?? '',
    p_kind: scope.kind ?? 'all',
    p_category: category,
    p_sort: scope.sort,
    p_dir: scope.dir,
    p_cursor: generationCursor(scope, category) ?? null,
    p_limit: scope.limit ?? 50,
  })
  if (error) throw contractError('listStockComparison', error)
  return parseComparisonPage(data)
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract
export async function getStockComparisonItem(
  scope: { stream: StreamRef; item_id: UUID; unit_id: UUID; generation: string },
): Promise<{ row: ComparisonRow; source: SourceState; source_unit_quantity: { quantity: Decimal; unit_code: string } | null }> {
  const { data, error } = await supabase.schema('ops').rpc('get_stock_comparison_item', {
    p_branch_id: scope.stream.branch_id,
    p_activity: scope.stream.activity,
    p_item_id: scope.item_id,
    p_unit_id: scope.unit_id,
    p_generation: scope.generation,
  })
  if (error) throw contractError('getStockComparisonItem', error)
  if (!isRecord(data)) throw new ContractError('UNAVAILABLE', 'getStockComparisonItem returned an invalid result')
  const sourceUnit = data.source_unit_quantity
  if (sourceUnit !== null && (!isRecord(sourceUnit) || !isString(sourceUnit.quantity) || !isString(sourceUnit.unit_code))) {
    throw new ContractError('UNAVAILABLE', 'getStockComparisonItem returned an invalid source unit quantity')
  }
  return {
    row: parseComparisonRow(data.row, 'getStockComparisonItem'),
    source: parseSource(data.source, 'getStockComparisonItem'),
    source_unit_quantity: sourceUnit === null ? null : {
      quantity: sourceUnit.quantity as Decimal,
      unit_code: sourceUnit.unit_code as string,
    },
  }
}

// HANDOVER: R/handover/stock-comparison.md §Typed client contract — EsbStockMovement
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

// Movements are a separate, deferred source contract; on-hand does not imply a ledger feed.
// HANDOVER: R/handover/stock-comparison.md §Deferred movement contract
export async function listEsbStockMovements(
  scope: { stream: StreamRef; item_id: UUID; unit_id: UUID; from: string; to: string; cursor?: string; generation?: string },
): Promise<{ rows: EsbStockMovement[]; next: string | null; as_of: string; complete: boolean }> {
  void scope
  return unavailable('listEsbStockMovements')
}
