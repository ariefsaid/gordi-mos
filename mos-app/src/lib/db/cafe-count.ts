import { supabase } from '@/lib/supabase'
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
export type CafeCountExpectedStatus = 'waiting' | 'ready'
export type CafeCountPostingStatus = 'not_posted' | 'not_needed' | 'held' | 'posted' | 'failed'

export type CafeCountFloorLine = {
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
  counted_quantity: string
  recounted_quantity: string | null
  reason: string | null
  expected_ready: boolean
  recount_required: boolean
  reason_required: boolean
  status: CafeCountStatus
  posting_status: CafeCountPostingStatus
  submitted_at: string
  reviewed_at: string | null
  row_version: number
}

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
  counted_quantity: string
  submitted_by: string
  recounted_quantity: string | null
  recounted_by: string | null
  recounted_at: string | null
  reason: string | null
  reason_entered_by: string | null
  reason_entered_at: string | null
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
}

export type CafeCountLineOutcome = {
  client_key: string
  outcome: 'submitted' | 'existing' | 'refused'
  line_id?: string
  reason?: string
}

export type ConfirmCafeCountResult = {
  line_id: string
  status: 'Confirmed'
  posting_status: 'not_needed' | 'held'
  row_version: number
  variance: string
}

export type CafeCountRecountResult = {
  line_id: string
  row_version: number
  reason_required: boolean
}

export type CafeCountReasonResult = {
  line_id: string
  row_version: number
  reason_recorded: true
}

type CountableItemRow = {
  item_id: string
  item_name: string
  item_category: string | null
  item_kind: string
  item_unit_id: string
  unit_name: string
}

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

/** Floor payload deliberately contains booleans, never Expected quantity, Variance, or direction. */
export async function listCafeCountFloorLines(countDate: string): Promise<CafeCountFloorLine[]> {
  const { data, error } = await supabase.schema('ops').rpc('cafe_count_floor_lines', {
    p_count_date: countDate,
  })
  if (error) throw new Error(`listCafeCountFloorLines failed: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => {
    if ((row.activity !== 'kitchen' && row.activity !== 'bar')
      || typeof row.expected_ready !== 'boolean' || typeof row.recount_required !== 'boolean'
      || typeof row.reason_required !== 'boolean') {
      throw new Error('listCafeCountFloorLines failed: invalid floor-safe Count row')
    }
    if (row.status !== 'Submitted' && row.status !== 'Confirmed' && row.status !== 'Rejected') {
      throw new Error('listCafeCountFloorLines failed: invalid Count status')
    }
    return {
      id: String(row.id),
      branch_id: String(row.branch_id),
      activity: row.activity,
      count_date: String(row.count_date),
      wip_item_id: String(row.wip_item_id),
      item_name: String(row.item_name),
      item_category: row.item_category == null ? null : String(row.item_category),
      item_kind: row.item_kind as 'RAW' | 'WIP',
      item_unit_id: String(row.item_unit_id),
      unit_name: String(row.unit_name),
      counted_quantity: String(row.counted_quantity),
      recounted_quantity: row.recounted_quantity == null ? null : String(row.recounted_quantity),
      reason: row.reason == null ? null : String(row.reason),
      expected_ready: row.expected_ready,
      recount_required: row.recount_required,
      reason_required: row.reason_required,
      status: row.status,
      posting_status: row.posting_status as CafeCountPostingStatus,
      submitted_at: String(row.submitted_at),
      reviewed_at: row.reviewed_at == null ? null : String(row.reviewed_at),
      row_version: Number(row.row_version),
    }
  })
}

/** Reviewer-only reader; its RPC checks ops_lead/admin before returning Expected and Variance. */
export async function listCafeCountReviewLines(countDate: string): Promise<CafeCountLine[]> {
  const { data, error } = await supabase.schema('ops').rpc('cafe_count_review_lines', {
    p_count_date: countDate,
  })
  if (error) throw new Error(`listCafeCountReviewLines failed: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => {
    if (row.activity !== 'kitchen' && row.activity !== 'bar') {
      throw new Error('listCafeCountReviewLines failed: invalid Café stream')
    }
    if (row.expected_status !== 'waiting' && row.expected_status !== 'ready') {
      throw new Error('listCafeCountReviewLines failed: invalid Expected balance status')
    }
    if (row.status !== 'Submitted' && row.status !== 'Confirmed' && row.status !== 'Rejected') {
      throw new Error('listCafeCountReviewLines failed: invalid Count status')
    }
    return {
      ...row,
      counted_quantity: String(row.counted_quantity),
      submitted_by: String(row.submitted_by),
      recounted_quantity: row.recounted_quantity == null ? null : String(row.recounted_quantity),
      recounted_by: row.recounted_by == null ? null : String(row.recounted_by),
      recounted_at: row.recounted_at == null ? null : String(row.recounted_at),
      reason: row.reason == null ? null : String(row.reason),
      reason_entered_by: row.reason_entered_by == null ? null : String(row.reason_entered_by),
      reason_entered_at: row.reason_entered_at == null ? null : String(row.reason_entered_at),
      variance: row.variance == null ? null : String(row.variance),
      expected_balance: row.expected_balance == null ? null : String(row.expected_balance),
    } as unknown as CafeCountLine
  })
}

/** Only the three permitted browser-owned fields cross the submit boundary. */
export async function submitCafeCounts(
  stream: ProductionStream,
  lines: readonly CafeCountDraftLine[],
): Promise<CafeCountLineOutcome[]> {
  const p_lines = lines.map(({ client_key, item_id, quantity }) => ({ client_key, item_id, quantity }))
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

export async function recordCafeCountRecount(lineId: string, quantity: string): Promise<CafeCountRecountResult> {
  const { data, error } = await supabase.schema('ops').rpc('record_cafe_count_recount', {
    p_line_id: lineId,
    p_recounted_quantity: quantity,
  })
  if (error) throw new Error(`recordCafeCountRecount failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || typeof row.line_id !== 'string' || typeof row.row_version !== 'number'
    || typeof row.reason_required !== 'boolean') {
    throw new Error('recordCafeCountRecount failed: invalid response')
  }
  return { line_id: row.line_id, row_version: row.row_version, reason_required: row.reason_required }
}

export async function recordCafeCountReason(lineId: string, reason: string): Promise<CafeCountReasonResult> {
  const { data, error } = await supabase.schema('ops').rpc('record_cafe_count_reason', {
    p_line_id: lineId,
    p_reason: reason.trim(),
  })
  if (error) throw new Error(`recordCafeCountReason failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || typeof row.line_id !== 'string' || typeof row.row_version !== 'number'
    || row.reason_recorded !== true) {
    throw new Error('recordCafeCountReason failed: invalid response')
  }
  return { line_id: row.line_id, row_version: row.row_version, reason_recorded: true }
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
export function normalizeCafeCountQuantity(raw: string): string | null {
  const value = raw.trim()
  if (value === '') return null
  const match = /^(\d+)(?:[.,](\d{1,4}))?$/.exec(value)
  if (!match) return null
  const whole = match[1].replace(/^0+(?=\d)/, '')
  const fraction = (match[2] ?? '').replace(/0+$/, '')
  if (whole.length > 10) return null
  return fraction ? `${whole}.${fraction}` : whole
}

export function newCafeCountClientKey(): string {
  return crypto.randomUUID()
}
