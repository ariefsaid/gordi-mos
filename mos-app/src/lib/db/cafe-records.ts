// Café Records — read-only client reads over EXISTING tables, under unchanged access rules
// (spec: docs "Verified sources and new client reads"). No schema, RLS or RPC change and no write:
// every function is a SELECT, ordered descending by a stable tuple key, so a page boundary never
// drops or repeats a row even when many rows share a timestamp.
//
// Common contract: { from, to, stream?, statuses?, after?, limit = 50 }. Dates are inclusive business
// dates (requests: requested_at from 00:00 WIB through the end of `to`). `after` is the last tuple of
// the previous page; the next predicate is (k1 < a1) OR (k1 = a1 AND k2 < a2) …. A page returns its rows
// and the cursor of its last row; the caller continues until a page comes back EMPTY (a short page
// proves nothing when the server caps rows).
import { supabase } from '@/lib/supabase'
import { RECEIPT_FIELDS, parseCafeReceiptRow, type CafeReceipt, type CafeReceiptStatus } from './cafe-receipts'
import { REQUEST_FIELDS, parseCafePurchaseRequestRow, type CafePurchaseRequest, type CafePurchaseRequestStatus } from './cafe-purchase-requests'
import type { CafeCountPostingStatus, CafeCountStatus } from './cafe-count'
import type { KitchenLogAction, KitchenLogStatus, ProductionActivity } from './kitchen-logs.types'
import { wibInstantRange } from '@/lib/cafe-records/period'

export const RECORDS_PAGE_LIMIT = 50

/** The last tuple of a page, in the table's key order, as strings. Null = the first page. */
export type RecordCursor = readonly string[]

interface RecordPeriodRead<Status extends string> {
  from: string
  to: string
  stream?: { branchId: string; activity: ProductionActivity } | null
  statuses?: readonly Status[]
  after?: RecordCursor | null
  limit?: number
}

export interface RecordPage<Row> { rows: Row[]; next: RecordCursor | null }

const ops = () => supabase.schema('ops')
const shared = () => supabase.schema('shared')

// ── Keyset predicate ──────────────────────────────────────────────────────────────────────────────

/**
 * PostgREST `or()` body that selects rows strictly BEFORE `tuple` when ordered descending by `columns`.
 * ("before" in a descending list = lexicographically smaller.) Exported for tests.
 */
export function keysetBefore(columns: readonly string[], tuple: RecordCursor): string {
  if (columns.length === 0 || columns.length !== tuple.length) throw new Error('keysetBefore: cursor does not match the key')
  const terms: string[] = []
  for (let i = 0; i < columns.length; i += 1) {
    const equals = columns.slice(0, i).map((column, j) => `${column}.eq.${tuple[j]}`)
    const less = `${columns[i]}.lt.${tuple[i]}`
    terms.push(equals.length === 0 ? less : `and(${[...equals, less].join(',')})`)
  }
  return terms.join(',')
}

function pageLimit(limit: number | undefined): number {
  return Math.max(1, Math.min(limit ?? RECORDS_PAGE_LIMIT, 1000))
}

/** Keeps the PostgREST code, so access denial can be told from a failure (never from an empty result). */
const wrap = (name: string, error: { message: string; code?: string }) =>
  Object.assign(new Error(`${name} failed: ${error.message}`), { code: error.code })

// ── Logs ──────────────────────────────────────────────────────────────────────────────────────────

const LOG_COLUMNS = 'id,batch_id,log_date,branch_id,activity,action,action_label,destination_branch_id,wip_item_id,item_unit_id,qty_porsi,entry_quantity,entry_unit_factor,entry_unit_name,notes,status,submitted_by,created_at,updated_at,reviewed_by,reviewed_at,review_note,posted_to_esb,posted_at,esb_doc_num,superseded_by,wip_items(name)'
const LOG_KEY = ['log_date', 'created_at', 'id'] as const
const LOG_STATUSES: readonly KitchenLogStatus[] = ['Submitted', 'Approved', 'Rejected']

export interface CafeRecordLog {
  id: string
  batch_id: string | null
  log_date: string
  branch_id: string
  activity: ProductionActivity
  action: KitchenLogAction
  action_label: string | null
  destination_branch_id: string | null
  wip_item_id: string
  item_unit_id: string | null
  qty_porsi: number | string
  entry_quantity: number | string | null
  entry_unit_factor: number | string | null
  entry_unit_name: string | null
  notes: string | null
  status: KitchenLogStatus
  submitted_by: string | null
  created_at: string
  updated_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  posted_to_esb: boolean
  posted_at: string | null
  esb_doc_num: string | null
  superseded_by: string | null
  item_name: string | null
}

export interface CafeRecordLogRead extends RecordPeriodRead<KitchenLogStatus> {
  action?: KitchenLogAction
  itemId?: string
  destinationBranchId?: string
}

/** Submitted / Approved / Rejected logs in a period; Draft is never read; corrected (superseded) rows are left out. */
// HANDOVER: R/handover/records-gaps.md §6. Correction trail — superseded rows are filtered out below, so the chain and the actor/reason of a correction are not readable here.
// HANDOVER: R/handover/records-gaps.md §1. Waste value in rupiah — LOG_COLUMNS carries no cost or value column.
export async function listCafeRecordLogs(read: CafeRecordLogRead): Promise<RecordPage<CafeRecordLog>> {
  let query = ops().from('kitchen_logs').select(LOG_COLUMNS)
    .gte('log_date', read.from).lte('log_date', read.to)
    .in('status', [...(read.statuses?.length ? read.statuses : LOG_STATUSES)])
    .is('superseded_by', null)
  if (read.stream) query = query.eq('branch_id', read.stream.branchId).eq('activity', read.stream.activity)
  if (read.action) query = query.eq('action', read.action)
  if (read.itemId) query = query.eq('wip_item_id', read.itemId)
  if (read.destinationBranchId) query = query.eq('destination_branch_id', read.destinationBranchId)
  if (read.after) query = query.or(keysetBefore(LOG_KEY, read.after))
  const { data, error } = await query
    .order('log_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(pageLimit(read.limit))
  if (error) throw wrap('listCafeRecordLogs', error)
  const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(parseLog)
  return { rows, next: rows.length ? [rows.at(-1)!.log_date, rows.at(-1)!.created_at, rows.at(-1)!.id] : null }
}

function parseLog(row: Record<string, unknown>): CafeRecordLog {
  const embed = row.wip_items as { name?: string } | Array<{ name?: string }> | null | undefined
  const name = Array.isArray(embed) ? embed[0]?.name : embed?.name
  if ((row.activity !== 'kitchen' && row.activity !== 'bar') || !LOG_STATUSES.includes(row.status as KitchenLogStatus)
    || (row.action !== 'produce' && row.action !== 'transfer' && row.action !== 'waste') || typeof row.id !== 'string') {
    throw new Error('listCafeRecordLogs failed: invalid log row')
  }
  const { wip_items: _embed, ...rest } = row
  void _embed
  return { ...(rest as unknown as Omit<CafeRecordLog, 'item_name'>), item_name: typeof name === 'string' ? name : null }
}

// ── Counts ────────────────────────────────────────────────────────────────────────────────────────

// Expected balance and variance are deliberately NOT selected: Records never shows them.
const COUNT_COLUMNS = 'id,branch_id,activity,count_date,wip_item_id,item_name,item_category,item_kind,item_unit_id,unit_name,counted_quantity,status,posting_status,submitted_by,submitted_at,reviewed_at,row_version'
const COUNT_KEY = ['count_date', 'submitted_at', 'id'] as const
const COUNT_STATUSES: readonly CafeCountStatus[] = ['Submitted', 'Confirmed', 'Rejected']

export interface CafeRecordCount {
  id: string
  branch_id: string
  activity: ProductionActivity
  count_date: string
  wip_item_id: string
  item_name: string
  item_category: string | null
  item_kind: 'RAW' | 'WIP'
  item_unit_id: string | null
  unit_name: string | null
  counted_quantity: number | string
  status: CafeCountStatus
  posting_status: CafeCountPostingStatus
  submitted_by: string | null
  submitted_at: string
  reviewed_at: string | null
  row_version: number
}

export interface CafeRecordCountRead extends RecordPeriodRead<CafeCountStatus> { itemId?: string }

/** Counts in a period, including their stored submitter identity. */
export async function listCafeRecordCounts(read: CafeRecordCountRead): Promise<RecordPage<CafeRecordCount>> {
  let query = ops().from('cafe_count_lines').select(COUNT_COLUMNS)
    .gte('count_date', read.from).lte('count_date', read.to)
    .in('status', [...(read.statuses?.length ? read.statuses : COUNT_STATUSES)])
  if (read.stream) query = query.eq('branch_id', read.stream.branchId).eq('activity', read.stream.activity)
  if (read.itemId) query = query.eq('wip_item_id', read.itemId)
  if (read.after) query = query.or(keysetBefore(COUNT_KEY, read.after))
  const { data, error } = await query
    .order('count_date', { ascending: false }).order('submitted_at', { ascending: false }).order('id', { ascending: false })
    .limit(pageLimit(read.limit))
  if (error) throw wrap('listCafeRecordCounts', error)
  const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(row => {
    if ((row.activity !== 'kitchen' && row.activity !== 'bar') || !COUNT_STATUSES.includes(row.status as CafeCountStatus) || typeof row.id !== 'string') {
      throw new Error('listCafeRecordCounts failed: invalid Count row')
    }
    return row as unknown as CafeRecordCount
  })
  const last = rows.at(-1)
  return { rows, next: last ? [last.count_date, last.submitted_at, last.id] : null }
}

// ── Receipts ──────────────────────────────────────────────────────────────────────────────────────

const RECEIPT_KEY = ['arrival_date', 'received_at', 'id'] as const
const RECEIPT_STATUSES: readonly CafeReceiptStatus[] = ['Counted', 'Submitted', 'Approved', 'Rejected']

export interface CafeRecordReceiptRead extends RecordPeriodRead<CafeReceiptStatus> { receivedBy?: string }

/** Receipts the viewer may read (their own and the streams they review) by arrival date; photos are not read. */
export async function listCafeRecordReceipts(read: CafeRecordReceiptRead): Promise<RecordPage<CafeReceipt>> {
  let query = ops().from('cafe_receipts').select(RECEIPT_FIELDS)
    .gte('arrival_date', read.from).lte('arrival_date', read.to)
    .in('status', [...(read.statuses?.length ? read.statuses : RECEIPT_STATUSES)])
  if (read.stream) query = query.eq('branch_id', read.stream.branchId).eq('activity', read.stream.activity)
  if (read.receivedBy) query = query.eq('received_by', read.receivedBy)
  if (read.after) query = query.or(keysetBefore(RECEIPT_KEY, read.after))
  const { data, error } = await query
    .order('arrival_date', { ascending: false }).order('received_at', { ascending: false }).order('id', { ascending: false })
    .limit(pageLimit(read.limit))
  if (error) throw wrap('listCafeRecordReceipts', error)
  const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(parseCafeReceiptRow)
  const last = rows.at(-1)
  return { rows, next: last ? [last.arrival_date, last.received_at, last.id] : null }
}

// ── Requests ──────────────────────────────────────────────────────────────────────────────────────

const REQUEST_KEY = ['requested_at', 'id'] as const
const REQUEST_STATUSES: readonly CafePurchaseRequestStatus[] = ['Submitted', 'Approved', 'Rejected']
const RECORD_REQUEST_FIELDS = REQUEST_FIELDS.replace(
  'lines:cafe_purchase_request_lines(id, item_name, item_category, unit_name, quantity)',
  'lines:cafe_purchase_request_lines(id, wip_item_id, item_unit_id, item_name, item_category, unit_name, quantity)',
)

export interface CafeRecordRequestRead extends RecordPeriodRead<CafePurchaseRequestStatus> { requestedBy?: string }

/** Requests by requested_at (WIB day range), with stored item and unit identity on each line. */
export async function listCafeRecordRequests(read: CafeRecordRequestRead): Promise<RecordPage<CafePurchaseRequest>> {
  const instants = wibInstantRange({ from: read.from, to: read.to })
  let query = ops().from('cafe_purchase_requests').select(RECORD_REQUEST_FIELDS)
    .gte('requested_at', instants.gte).lt('requested_at', instants.lt)
    .in('status', [...(read.statuses?.length ? read.statuses : REQUEST_STATUSES)])
  if (read.stream) query = query.eq('branch_id', read.stream.branchId).eq('activity', read.stream.activity)
  if (read.requestedBy) query = query.eq('requested_by', read.requestedBy)
  if (read.after) query = query.or(keysetBefore(REQUEST_KEY, read.after))
  const { data, error } = await query
    .order('requested_at', { ascending: false }).order('id', { ascending: false })
    .limit(pageLimit(read.limit))
  if (error) throw wrap('listCafeRecordRequests', error)
  const rows = ((data ?? []) as unknown as Array<Record<string, unknown>>).map(parseCafePurchaseRequestRow)
  const last = rows.at(-1)
  return { rows, next: last ? [last.requested_at, last.id] : null }
}

// ── Nested lines (parent paging does not prove line completeness) ─────────────────────────────────

const RECEIPT_LINE_COLUMNS = 'receipt_id,id,item_unit_id,item_name,item_category,unit_name,received_quantity,conditions,condition_reason,condition_updated_at'
const REQUEST_LINE_COLUMNS = 'id,wip_item_id,item_unit_id,item_name,item_category,unit_name,quantity'

export interface CafeRecordReceiptLine {
  receipt_id: string
  id: string
  item_unit_id: string
  item_name: string
  item_category: string | null
  unit_name: string
  received_quantity: number | string
  conditions: string[]
  condition_reason: string | null
  condition_updated_at: string | null
}

/** One receipt's lines, id ascending, `after` = last id of the previous page. */
export async function listCafeRecordReceiptLines(receiptId: string, after?: string | null, limit = RECORDS_PAGE_LIMIT): Promise<CafeRecordReceiptLine[]> {
  let query = ops().from('cafe_receipt_lines').select(RECEIPT_LINE_COLUMNS).eq('receipt_id', receiptId)
  if (after) query = query.gt('id', after)
  const { data, error } = await query.order('id', { ascending: true }).limit(pageLimit(limit))
  if (error) throw wrap('listCafeRecordReceiptLines', error)
  return (data ?? []) as unknown as CafeRecordReceiptLine[]
}

export interface CafeRecordRequestLine {
  id: string
  wip_item_id: string
  item_unit_id: string
  item_name: string
  item_category: string | null
  unit_name: string
  quantity: number | string
}

/** One request's lines through the existing embed: embedded rows ordered by id ascending, filtered and limited. */
export async function listCafeRecordRequestLines(requestId: string, after?: string | null, limit = RECORDS_PAGE_LIMIT): Promise<CafeRecordRequestLine[]> {
  let query = ops().from('cafe_purchase_requests')
    .select(`id,lines:cafe_purchase_request_lines(${REQUEST_LINE_COLUMNS})`)
    .eq('id', requestId)
  if (after) query = query.filter('lines.id', 'gt', after)
  const { data, error } = await query
    .order('id', { referencedTable: 'lines', ascending: true })
    .limit(pageLimit(limit), { referencedTable: 'lines' })
  if (error) throw wrap('listCafeRecordRequestLines', error)
  const parent = ((data ?? []) as unknown as Array<{ lines?: CafeRecordRequestLine[] }>)[0]
  return parent?.lines ?? []
}

// ── People, units ─────────────────────────────────────────────────────────────────────────────────

export interface CafeRecordPerson { id: string; full_name: string }

/** Names by id (historical people included: no archived filter). Batched, id ascending, resumed by id > last. */
export async function listCafeRecordPeople(ids: readonly string[], batch = 100): Promise<CafeRecordPerson[]> {
  return readByIds<CafeRecordPerson>('listCafeRecordPeople', ids, batch, (chunk, after) => {
    let query = shared().from('people').select('id,full_name').in('id', chunk)
    if (after) query = query.gt('id', after)
    return query.order('id', { ascending: true }).limit(batch)
  })
}

export interface CafeRecordUnit { id: string; unit_name: string | null }

/** Unit names by the ids rows carry, with no active/default/shown filter: history keeps units no longer offered. */
export async function listCafeRecordUnits(ids: readonly string[], batch = 100): Promise<CafeRecordUnit[]> {
  return readByIds<CafeRecordUnit>('listCafeRecordUnits', ids, batch, (chunk, after) => {
    let query = ops().from('item_units').select('id,unit_name').in('id', chunk)
    if (after) query = query.gt('id', after)
    return query.order('id', { ascending: true }).limit(batch)
  })
}

async function readByIds<Row extends { id: string }>(
  name: string,
  ids: readonly string[],
  batch: number,
  read: (chunk: string[], after: string | null) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<Row[]> {
  const unique = [...new Set(ids.filter(Boolean))].sort()
  const out: Row[] = []
  for (let start = 0; start < unique.length; start += batch) {
    const chunk = unique.slice(start, start + batch)
    let after: string | null = null
    for (let guard = 0; guard < 1000; guard += 1) {
      const { data, error } = await read(chunk, after)
      if (error) throw wrap(name, error)
      const page = (data ?? []) as Row[]
      if (page.length === 0) break
      out.push(...page)
      const last: string = page.at(-1)!.id
      if (after !== null && last <= after) throw wrap(name, { message: 'the read did not advance' })
      after = last
    }
  }
  return out
}
