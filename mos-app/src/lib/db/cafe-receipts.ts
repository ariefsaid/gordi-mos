import { supabase } from '@/lib/supabase'
import { normalizeCafeCountQuantity, newCafeCountClientKey } from './cafe-count'
import type { ProductionActivity, ProductionStream } from './kitchen-logs.types'

/** One receivable item: every active, confirmed ESB product detail (unit) the stream may receive. */
export type CafeReceivableItem = {
  id: string
  name: string
  category: string | null
  kind: 'RAW' | 'WIP' | null
  units: ReadonlyArray<{ id: string; name: string }>
  /** The unit fixed beside the box; another unit needs the deliberate change-unit control. */
  defaultUnitId: string
}

export type CafeReceiptStatus = 'Counted' | 'Submitted' | 'Approved' | 'Rejected'
export type CafeReceiptPostingStatus = 'not_posted' | 'held'

export type CafeReceiptLine = {
  id: string
  item_name: string
  item_category: string | null
  unit_name: string
  received_quantity: string
}

export type CafeReceipt = {
  id: string
  branch_id: string
  activity: ProductionActivity
  arrival_date: string
  delivery_note_number: string | null
  status: CafeReceiptStatus
  posting_status: CafeReceiptPostingStatus
  posting_hold_reason: string | null
  received_by: string
  received_at: string
  submitted_at: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  row_version: number
  lines: CafeReceiptLine[]
}

export type CafeReceiptDraftLine = { item_unit_id: string; quantity: string }

export type CafeReceiptSubmitResult = {
  receipt_id: string
  outcome: 'created' | 'existing'
  row_version: number
}

type ReceivableRow = {
  item_id: string
  item_name: string
  item_category: string | null
  item_kind: string | null
  item_unit_id: string
  unit_name: string
  is_default_unit: boolean
}

const RECEIPT_FIELDS = [
  'id', 'branch_id', 'activity', 'arrival_date', 'delivery_note_number', 'status', 'posting_status',
  'posting_hold_reason', 'received_by', 'received_at', 'submitted_at', 'reviewed_by', 'reviewed_at',
  'review_note', 'row_version',
  'lines:cafe_receipt_lines(id, item_name, item_category, unit_name, received_quantity)',
].join(', ')

const STATUSES: readonly CafeReceiptStatus[] = ['Counted', 'Submitted', 'Approved', 'Rejected']

function ops() {
  return supabase.schema('ops')
}

/** Groups the server's one-row-per-unit list into one row per item, default unit first. */
export async function listCafeReceivableItems(stream: ProductionStream): Promise<CafeReceivableItem[]> {
  const { data, error } = await ops().rpc('cafe_receivable_items', {
    p_branch_id: stream.branch.id,
    p_activity: stream.activity,
  })
  if (error) throw new Error(`listCafeReceivableItems failed: ${error.message}`)
  const items = new Map<string, CafeReceivableItem & { units: Array<{ id: string; name: string }> }>()
  for (const row of (data ?? []) as ReceivableRow[]) {
    if (!row.item_id || !row.item_name?.trim() || !row.item_unit_id || !row.unit_name?.trim()) {
      throw new Error('listCafeReceivableItems failed: invalid item or unit row')
    }
    const kind = row.item_kind === 'RAW' || row.item_kind === 'WIP' ? row.item_kind : null
    const item = items.get(row.item_id) ?? {
      id: row.item_id, name: row.item_name, category: row.item_category, kind, units: [], defaultUnitId: row.item_unit_id,
    }
    if (row.is_default_unit) {
      item.defaultUnitId = row.item_unit_id
      item.units.unshift({ id: row.item_unit_id, name: row.unit_name })
    } else {
      item.units.push({ id: row.item_unit_id, name: row.unit_name })
    }
    items.set(row.item_id, item)
  }
  return [...items.values()]
}

/** Receipts the viewer may read, newest first; RLS returns their own and the streams they review. */
export async function listCafeReceipts(
  statuses: readonly CafeReceiptStatus[],
  { receivedBy, limit = 50 }: { receivedBy?: string; limit?: number } = {},
): Promise<CafeReceipt[]> {
  let query = ops()
    .from('cafe_receipts')
    .select(RECEIPT_FIELDS)
    .in('status', [...statuses])
  if (receivedBy) query = query.eq('received_by', receivedBy)
  const { data, error } = await query
    .order('received_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listCafeReceipts failed: ${error.message}`)
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(row => {
    if ((row.activity !== 'kitchen' && row.activity !== 'bar') || !STATUSES.includes(row.status as CafeReceiptStatus)
      || (row.posting_status !== 'not_posted' && row.posting_status !== 'held') || !Array.isArray(row.lines)) {
      throw new Error('listCafeReceipts failed: invalid receipt row')
    }
    return {
      ...row,
      lines: (row.lines as Array<Record<string, unknown>>).map(line => ({
        ...line,
        received_quantity: String(line.received_quantity),
      })),
    } as unknown as CafeReceipt
  })
}

/** Count submit: only the key, stream, arrival date and (product detail, quantity) pairs cross the boundary. */
export async function submitCafeReceipt(
  stream: ProductionStream,
  arrivalDate: string,
  clientKey: string,
  lines: readonly CafeReceiptDraftLine[],
): Promise<CafeReceiptSubmitResult> {
  const { data, error } = await ops().rpc('submit_cafe_receipt', {
    p_branch_id: stream.branch.id,
    p_activity: stream.activity,
    p_arrival_date: arrivalDate,
    p_client_key: clientKey,
    p_lines: lines.map(({ item_unit_id, quantity }) => ({ item_unit_id, quantity })),
  })
  if (error) throw new Error(`submitCafeReceipt failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || typeof row.receipt_id !== 'string' || typeof row.row_version !== 'number'
    || (row.outcome !== 'created' && row.outcome !== 'existing')) {
    throw new Error('submitCafeReceipt failed: invalid response')
  }
  return { receipt_id: row.receipt_id, outcome: row.outcome, row_version: row.row_version }
}

export async function sendCafeReceiptForReview(
  receiptId: string,
  expectedVersion: number,
  deliveryNoteNumber: string,
): Promise<{ status: 'Submitted'; row_version: number }> {
  const { data, error } = await ops().rpc('send_cafe_receipt_for_review', {
    p_receipt_id: receiptId,
    p_expected_version: expectedVersion,
    p_delivery_note_number: deliveryNoteNumber.trim() || null,
  })
  if (error) throw new Error(`sendCafeReceiptForReview failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || row.status !== 'Submitted' || typeof row.row_version !== 'number') {
    throw new Error('sendCafeReceiptForReview failed: invalid response')
  }
  return { status: 'Submitted', row_version: row.row_version }
}

export async function reviewCafeReceipt(
  receiptId: string,
  decision: 'approve' | 'reject',
  expectedVersion: number,
  note: string,
): Promise<{ status: 'Approved' | 'Rejected'; row_version: number }> {
  const { data, error } = await ops().rpc('review_cafe_receipt', {
    p_receipt_id: receiptId,
    p_decision: decision,
    p_expected_version: expectedVersion,
    p_note: note.trim() || null,
  })
  if (error) throw new Error(`reviewCafeReceipt failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || (row.status !== 'Approved' && row.status !== 'Rejected') || typeof row.row_version !== 'number') {
    throw new Error('reviewCafeReceipt failed: invalid response')
  }
  return { status: row.status, row_version: row.row_version }
}

/** A received quantity is a typed positive decimal; zero and blank are not part of the receipt. */
export function normalizeCafeReceiptQuantity(raw: string): string | null {
  const value = normalizeCafeCountQuantity(raw)
  return value === null || value === '0' ? null : value
}

export const newCafeReceiptClientKey = newCafeCountClientKey

/** The date a receiver may choose: today and yesterday, or any past date for ops lead and admin. */
export function cafeReceiptArrivalDateBounds(today: string, canBackdate: boolean): { min?: string; max: string } {
  if (canBackdate) return { max: today }
  const yesterday = new Date(`${today}T00:00:00Z`)
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return { min: yesterday.toISOString().slice(0, 10), max: today }
}
