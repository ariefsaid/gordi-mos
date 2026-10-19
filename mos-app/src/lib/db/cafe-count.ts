import { supabase } from '@/lib/supabase'
import { parseQuantityInput } from '@/lib/quantity-parser'
import type { QuantityParseResult } from '@/lib/quantity-parser'
import type { ProductionActivity, ProductionStream } from './kitchen-logs.types'

export type CafeCountableItem = {
  id: string
  name: string
  category: string | null
  kind: 'RAW' | 'WIP'
  unitId: string
  unitName: string
}

export type CafeCountStatus = 'Submitted' | 'Confirmed' | 'Rejected'
type CafeCountExpectedStatus = 'waiting' | 'ready'
export type CafeCountPostingStatus = 'not_posted' | 'not_needed' | 'held' | 'posted' | 'failed'

export type CafeCountLine = {
  id: string
  branch_id: string
  activity: ProductionActivity
  count_date: string
  wip_item_id: string
  item_name: string
  item_category: string | null
  item_kind: 'RAW' | 'WIP'
  item_unit_id: string
  unit_name: string
  storage_location_id?: string | null
  counted_quantity: string
  recounted_quantity: string | null
  recounted_at: string | null
  reason: string | null
  variance: string | null
  expected_balance: string | null
  expected_status: CafeCountExpectedStatus
  expected_recorded_at: string | null
  status: CafeCountStatus
  posting_status: CafeCountPostingStatus
  submitted_at: string
  reviewed_at: string | null
  row_version: number
}

export type CafeCountDraftLine = {
  client_key: string
  item_id: string
  quantity: string
  storage_location_id?: string | null
}

export type CafeCountLineOutcome = {
  client_key: string
  outcome: 'submitted' | 'existing' | 'refused'
  line_id?: string
  reason?: string
}

/** What the floor may know about its own line: a state word, never the Expected figure or Variance. */
export type CafeCountFloorState = 'waiting' | 'needs_recount' | 'needs_reason' | 'with_reviewer' | 'confirmed' | 'held'

export type CafeCountFloorLine = {
  id: string
  itemId: string
  state: CafeCountFloorState
  rowVersion: number
}

export type ConfirmCafeCountResult = {
  line_id: string
  status: 'Confirmed'
  posting_status: 'not_needed' | 'held'
  row_version: number
  variance: string
}

type CountableItemRow = {
  item_id: string
  item_name: string
  item_category: string | null
  item_kind: string
  item_unit_id: string
  unit_name: string
}

const COUNT_LINE_FIELDS = [
  'id', 'branch_id', 'activity', 'count_date', 'wip_item_id', 'item_name', 'item_category', 'item_kind',
  'item_unit_id', 'unit_name', 'storage_location_id', 'counted_quantity', 'recounted_quantity',
  'recounted_at', 'reason', 'expected_status',
  'expected_recorded_at', 'status', 'posting_status', 'submitted_at', 'reviewed_at', 'row_version',
].join(', ')

/** The server intersects the stream list with active RAW/WIP items and a confirmed ERP stock default. */
export async function listCafeCountableItems(stream: ProductionStream): Promise<CafeCountableItem[]> {
  const { data, error } = await supabase.schema('ops').rpc('cafe_countable_items', {
    p_branch_id: stream.branch.id,
    p_activity: stream.activity,
  })
  if (error) throw new Error(`listCafeCountableItems failed: ${error.message}`)
  return ((data ?? []) as CountableItemRow[]).map(row => {
    if ((row.item_kind !== 'RAW' && row.item_kind !== 'WIP') || !row.item_id || !row.item_name?.trim()
      || !row.item_unit_id || !row.unit_name?.trim()) {
      throw new Error('listCafeCountableItems failed: invalid item or default-unit row')
    }
    return {
      id: row.item_id,
      name: row.item_name,
      category: row.item_category,
      kind: row.item_kind,
      unitId: row.item_unit_id,
      unitName: row.unit_name,
    }
  })
}

/** Reads Submitted Counts oldest-first across dates by default; RLS enforces the Café-log org read scope. */
export async function listCafeCountLines(countDate?: string): Promise<CafeCountLine[]> {
  let query = supabase.schema('ops')
    .from('cafe_count_lines')
    .select(COUNT_LINE_FIELDS)
    .eq('status', 'Submitted')
  if (countDate) query = query.eq('count_date', countDate)
  const { data, error } = await query
    .order('count_date', { ascending: true })
    .order('submitted_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw new Error(`listCafeCountLines failed: ${error.message}`)
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>
  const figures = await readCafeCountReviewFigures(rows.map(row => String(row.id)))
  return rows.map(row => {
    if (row.activity !== 'kitchen' && row.activity !== 'bar') {
      throw new Error('listCafeCountLines failed: invalid Café stream')
    }
    if (row.expected_status !== 'waiting' && row.expected_status !== 'ready') {
      throw new Error('listCafeCountLines failed: invalid Expected balance status')
    }
    if (row.status !== 'Submitted' && row.status !== 'Confirmed' && row.status !== 'Rejected') {
      throw new Error('listCafeCountLines failed: invalid Count status')
    }
    return {
      ...row,
      counted_quantity: String(row.counted_quantity),
      recounted_quantity: row.recounted_quantity == null ? null : String(row.recounted_quantity),
      variance: figures.get(String(row.id))?.variance ?? null,
      expected_balance: figures.get(String(row.id))?.expected_balance ?? null,
    } as unknown as CafeCountLine
  })
}

/** The Expected balance and Variance come only from the reviewer-gated read; lines the viewer cannot review have none. */
async function readCafeCountReviewFigures(ids: readonly string[]): Promise<Map<string, { expected_balance: string | null; variance: string | null }>> {
  const figures = new Map<string, { expected_balance: string | null; variance: string | null }>()
  for (let start = 0; start < ids.length; start += 500) {
    const { data, error } = await supabase.schema('ops').rpc('cafe_count_review_figures', { p_line_ids: ids.slice(start, start + 500) })
    if (error) throw new Error(`listCafeCountLines failed: ${error.message}`)
    for (const row of (data ?? []) as Array<Record<string, unknown>>) {
      figures.set(String(row.id), {
        expected_balance: row.expected_balance == null ? null : String(row.expected_balance),
        variance: row.variance == null ? null : String(row.variance),
      })
    }
  }
  return figures
}

const FLOOR_STATES: readonly CafeCountFloorState[] = ['waiting', 'needs_recount', 'needs_reason', 'with_reviewer', 'confirmed', 'held']

/** The stream's live lines for a date as the server's state words; the floor never receives a figure. */
export async function listCafeCountFloorLines(stream: ProductionStream, countDate: string): Promise<CafeCountFloorLine[]> {
  const { data, error } = await supabase.schema('ops').rpc('cafe_count_floor_lines', {
    p_branch_id: stream.branch.id,
    p_activity: stream.activity,
    p_count_date: countDate,
  })
  if (error) throw new Error(`listCafeCountFloorLines failed: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => {
    if (!FLOOR_STATES.includes(row.state as CafeCountFloorState)) throw new Error('listCafeCountFloorLines failed: invalid state')
    return { id: String(row.id), itemId: String(row.wip_item_id), state: row.state as CafeCountFloorState, rowVersion: Number(row.row_version) }
  })
}

/** Stores the floor's one recount; the answer says only whether a reason is still needed. */
export async function recordCafeCountRecount(lineId: string, quantity: string): Promise<{ reasonRequired: boolean; rowVersion: number }> {
  const { data, error } = await supabase.schema('ops').rpc('record_cafe_count_recount', {
    p_line_id: lineId,
    p_recounted_quantity: quantity,
  })
  if (error) throw new Error(`recordCafeCountRecount failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || typeof row.reason_required !== 'boolean' || typeof row.row_version !== 'number') {
    throw new Error('recordCafeCountRecount failed: invalid response')
  }
  return { reasonRequired: row.reason_required, rowVersion: row.row_version }
}

export async function recordCafeCountReason(lineId: string, reason: string): Promise<{ rowVersion: number }> {
  const { data, error } = await supabase.schema('ops').rpc('record_cafe_count_reason', {
    p_line_id: lineId,
    p_reason: reason.trim(),
  })
  if (error) throw new Error(`recordCafeCountReason failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || typeof row.row_version !== 'number') throw new Error('recordCafeCountReason failed: invalid response')
  return { rowVersion: row.row_version }
}

/** Only the three permitted browser-owned fields cross the submit boundary. */
export async function submitCafeCounts(
  stream: ProductionStream,
  lines: readonly CafeCountDraftLine[],
): Promise<CafeCountLineOutcome[]> {
  const p_lines = lines.map(({ client_key, item_id, quantity, storage_location_id }) => ({
    client_key, item_id, quantity,
    ...(storage_location_id === undefined ? {} : { storage_location_id }),
  }))
  const { data, error } = await supabase.schema('ops').rpc('submit_cafe_counts', {
    p_branch_id: stream.branch.id,
    p_activity: stream.activity,
    p_lines,
  })
  if (error) throw new Error(`submitCafeCounts failed: ${error.message}`)
  if (!Array.isArray(data)) throw new Error('submitCafeCounts failed: invalid per-line response')
  return data.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('submitCafeCounts failed: invalid per-line response')
    const row = value as Record<string, unknown>
    if (typeof row.client_key !== 'string'
      || (row.outcome !== 'submitted' && row.outcome !== 'existing' && row.outcome !== 'refused')) {
      throw new Error('submitCafeCounts failed: invalid per-line response')
    }
    return {
      client_key: row.client_key,
      outcome: row.outcome,
      ...(typeof row.line_id === 'string' ? { line_id: row.line_id } : {}),
      ...(typeof row.reason === 'string' ? { reason: row.reason } : {}),
    }
  })
}

export async function confirmCafeCountLine(lineId: string, expectedVersion: number): Promise<ConfirmCafeCountResult> {
  const { data, error } = await supabase.schema('ops').rpc('confirm_cafe_count_line', {
    p_line_id: lineId,
    p_expected_version: expectedVersion,
  })
  if (error) throw new Error(`confirmCafeCountLine failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || row.status !== 'Confirmed' || (row.posting_status !== 'not_needed' && row.posting_status !== 'held')
    || typeof row.line_id !== 'string' || typeof row.row_version !== 'number'
    || (typeof row.variance !== 'number' && typeof row.variance !== 'string')) {
    throw new Error('confirmCafeCountLine failed: invalid review response')
  }
  return { ...row, variance: String(row.variance) } as ConfirmCafeCountResult
}

/** Empty means “not counted”; zero is valid; decimal comma and point are both accepted. */
export function parseCafeCountQuantity(raw: string): QuantityParseResult {
  return parseQuantityInput(raw, {
    min: 0,
    maxIntegerDigits: 10,
    maxFractionDigits: 2,
  })
}

export function normalizeCafeCountQuantity(raw: string): string | null {
  const parsed = parseCafeCountQuantity(raw)
  return parsed.kind === 'valid' ? parsed.normalized : null
}

export function newCafeCountClientKey(): string {
  return crypto.randomUUID()
}
