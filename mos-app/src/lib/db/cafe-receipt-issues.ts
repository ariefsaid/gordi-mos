import { supabase } from '@/lib/supabase'
import { CAFE_RECEIPT_PHOTO_READ_LIMIT } from './cafe-receipt-photos'
import { listCafeReceipts, type CafeReceipt, type CafeReceiptLine } from './cafe-receipts'
import { readAllPages } from './reporting-shared'

export type CafeReceiptIssueKind = 'no_po' | 'over' | 'wrong_unit' | 'short' | 'damaged_wrong'
export type CafeReceiptIssueStatus = 'open' | 'linked' | 'closed'

/** No PO, over and wrong unit keep their part unposted; short and damaged/wrong are information (FR-1034). */
export const BLOCKING_ISSUE_KINDS: ReadonlySet<CafeReceiptIssueKind> = new Set<CafeReceiptIssueKind>(['no_po', 'over', 'wrong_unit'])

/** Part of an issue procurement linked to a PO, and whether it is queued for ESB or held. */
export type CafeReceiptIssuePart = {
  po_number: string
  quantity: string
  state: 'queued' | 'held'
  po_created_after_delivery: boolean
}

/** One Receipt issue with the Approved receipt and line it is about. */
export type CafeReceiptIssue = {
  id: string
  kind: CafeReceiptIssueKind
  quantity: string
  status: CafeReceiptIssueStatus
  created_at: string
  linked_po_number: string | null
  /** The linked PO a release found without room for the part, which re-opened the issue. */
  reopened_po_number: string | null
  /** Linked parts, oldest first; empty for a viewer who reads no portions (a receiver). */
  parts: CafeReceiptIssuePart[]
  closed_note: string | null
  resolved_by: string | null
  resolved_at: string | null
  receipt: CafeReceipt
  line: CafeReceiptLine
}

/** A matched part a release could not post: no open PO has room for it (DD-2026-10-06-1429). */
export type CafeReceiptHeldPortion = {
  id: string
  quantity: string
  created_at: string
  receipt: CafeReceipt
  line: CafeReceiptLine
}

/** A queued portion ESB permanently refused, with the outbox message and identifying MOS key. */
export type CafeReceiptEsbRefusedPortion = CafeReceiptHeldPortion & {
  po_number: string
  mos_key: string | null
  esb_message: string | null
}

export type CafeReceiptIssueList = {
  /** Every open issue, and the newest resolved ones. */
  issues: CafeReceiptIssue[]
  held: CafeReceiptHeldPortion[]
  refused: CafeReceiptEsbRefusedPortion[]
  /** How many issues are resolved in all, when more exist than are listed. */
  resolvedTotal: number
}

export type CafeReceiptIssueOpenPo = {
  po_number: string
  supplier_name: string | null
  po_date: string
  /** What the PO still has for the item: the cache less what is queued or held against it. */
  available: string
  /** The PO is dated on or before the arrival date, so ESB accepts the receipt against it (FR-1036). */
  date_eligible: boolean
  created_after_delivery: boolean
}

export type CafeReceiptIssueOpenPos = {
  options: CafeReceiptIssueOpenPo[]
  cache_as_of: string | null
  is_current: boolean
  refresh_requested_at: string | null
}

export type CafeReceiptIssueLink = {
  /** `open` when the PO took part of the quantity and the rest stays an issue. */
  status: 'linked' | 'open'
  matched_quantity: string
  remaining_quantity: string
  posting: 'queued' | 'held'
  po_created_after_delivery: boolean
}

const ISSUE_FIELDS = 'id,receipt_id,line_id,kind,quantity,status,created_at,linked_po_number,reopened_po_number,closed_note,resolved_by,resolved_at'
const HELD_FIELDS = 'id,receipt_id,line_id,quantity,created_at'
const PART_FIELDS = 'issue_id,po_number,quantity,state,po_created_after_delivery,created_at'
const KINDS: readonly CafeReceiptIssueKind[] = ['no_po', 'over', 'wrong_unit', 'short', 'damaged_wrong']
const STATUSES: readonly CafeReceiptIssueStatus[] = ['open', 'linked', 'closed']
/** Resolved issues shown at once, newest first; open ones are always read in full. */
export const RESOLVED_READ_LIMIT = 100

const ops = () => supabase.schema('ops')

/**
 * Every open/resolved issue and held no-longer-fits portion allowed by row security, plus
 * permanently ESB-refused portions from the role-gated read RPC. Each comes with its receipt,
 * line, evidence and photos from the shared receipt read.
 */
export async function listCafeReceiptIssues(): Promise<CafeReceiptIssueList> {
  const [open, resolved, resolvedCount, heldRows, refusedRows] = await Promise.all([
    readAllPages<Record<string, unknown>>('listCafeReceiptIssues', (from, to) => ops().from('cafe_receipt_issues')
      .select(ISSUE_FIELDS).eq('status', 'open').order('created_at').order('id').range(from, to)),
    ops().from('cafe_receipt_issues').select(ISSUE_FIELDS).neq('status', 'open')
      .order('resolved_at', { ascending: false }).order('id').limit(RESOLVED_READ_LIMIT),
    ops().from('cafe_receipt_issues').select('id', { count: 'exact', head: true }).neq('status', 'open'),
    readAllPages<Record<string, unknown>>('listCafeReceiptIssues', (from, to) => ops().from('cafe_receipt_portions')
      .select(HELD_FIELDS).eq('state', 'held').eq('hold_reason', 'no_longer_fits').order('created_at').order('id').range(from, to)),
    readAllPages<Record<string, unknown>>('listCafeReceiptIssues', (from, to) =>
      ops().rpc('cafe_receipt_esb_refused_portions', { p_offset: from, p_limit: to - from + 1 })),
  ])
  if (resolved.error) throw new Error(`listCafeReceiptIssues failed: ${resolved.error.message}`)
  if (resolvedCount.error) throw new Error(`listCafeReceiptIssues failed: ${resolvedCount.error.message}`)
  const issueRows = [...open, ...((resolved.data ?? []) as Array<Record<string, unknown>>)]
  const receiptIds = [...new Set([...issueRows, ...heldRows, ...refusedRows].map(row => String(row.receipt_id)))]
  const [receipts, parts] = await Promise.all([readReceipts(receiptIds), readParts(receiptIds)])
  const evidence = (row: Record<string, unknown>) => {
    const receipt = receipts.get(String(row.receipt_id))
    const line = receipt?.lines.find(candidate => candidate.id === row.line_id)
    if (!receipt || !line || typeof row.id !== 'string' || typeof row.created_at !== 'string') {
      throw new Error('listCafeReceiptIssues failed: invalid issue row')
    }
    return { receipt, line, id: row.id, created_at: row.created_at }
  }
  return {
    issues: issueRows.map(row => {
      if (!KINDS.includes(row.kind as CafeReceiptIssueKind) || !STATUSES.includes(row.status as CafeReceiptIssueStatus)) {
        throw new Error('listCafeReceiptIssues failed: invalid issue row')
      }
      return {
        ...evidence(row),
        kind: row.kind as CafeReceiptIssueKind,
        quantity: String(row.quantity),
        status: row.status as CafeReceiptIssueStatus,
        linked_po_number: nullableString(row.linked_po_number),
        reopened_po_number: nullableString(row.reopened_po_number),
        parts: parts.get(String(row.id)) ?? [],
        closed_note: nullableString(row.closed_note),
        resolved_by: nullableString(row.resolved_by),
        resolved_at: nullableString(row.resolved_at),
      }
    }),
    held: heldRows.map(row => ({ ...evidence(row), quantity: String(row.quantity) })),
    refused: refusedRows.map(row => {
      if (typeof row.po_number !== 'string' || row.po_number.trim() === '') {
        throw new Error('listCafeReceiptIssues failed: invalid refused portion row')
      }
      return {
        ...evidence({ ...row, id: row.portion_id }), quantity: String(row.quantity), po_number: row.po_number,
        mos_key: nullableString(row.mos_key), esb_message: nullableString(row.esb_message),
      }
    }),
    resolvedTotal: resolvedCount.count ?? 0,
  }
}

/** Receipt ids 50 at a time, like the receipt photo read. */
function chunked(ids: readonly string[]): string[][] {
  const chunks: string[][] = []
  for (let start = 0; start < ids.length; start += CAFE_RECEIPT_PHOTO_READ_LIMIT) chunks.push(ids.slice(start, start + CAFE_RECEIPT_PHOTO_READ_LIMIT))
  return chunks
}

async function readReceipts(ids: readonly string[]): Promise<Map<string, CafeReceipt>> {
  const read = await Promise.all(chunked(ids).map(chunk => listCafeReceipts(['Approved'], { ids: chunk, limit: chunk.length })))
  return new Map(read.flat().map(receipt => [receipt.id, receipt]))
}

/** The linked parts of the receipts' issues by issue, oldest first; RLS returns none to a receiver. */
async function readParts(receiptIds: readonly string[]): Promise<Map<string, CafeReceiptIssuePart[]>> {
  const read = await Promise.all(chunked(receiptIds).map(chunk => readAllPages<Record<string, unknown>>('listCafeReceiptIssues', (from, to) =>
    ops().from('cafe_receipt_portions').select(PART_FIELDS).in('receipt_id', chunk).not('issue_id', 'is', null)
      .in('state', ['queued', 'held']).order('created_at').order('id').range(from, to))))
  const parts = new Map<string, CafeReceiptIssuePart[]>()
  for (const row of read.flat()) {
    if (typeof row.po_number !== 'string' || (row.state !== 'queued' && row.state !== 'held')) {
      throw new Error('listCafeReceiptIssues failed: invalid part row')
    }
    const issueId = String(row.issue_id)
    parts.set(issueId, [...(parts.get(issueId) ?? []), {
      po_number: row.po_number, quantity: String(row.quantity), state: row.state, po_created_after_delivery: row.po_created_after_delivery === true,
    }])
  }
  return parts
}

/**
 * What waits for procurement's PO (FR-1034's badge): open blocking issues and held portions no PO
 * has room for. `receivedBy` counts only that receiver's own receipts' issues, joined first so row
 * security runs on those rows alone; a receiver reads no portions.
 */
export async function countCafeReceiptIssuesNeedingPo({ receivedBy }: { receivedBy?: string } = {}): Promise<number> {
  if (receivedBy) {
    const { count, error } = await ops().from('cafe_receipt_issues').select('id,cafe_receipts!inner(received_by)', { count: 'exact', head: true })
      .eq('cafe_receipts.received_by', receivedBy).eq('status', 'open').in('kind', [...BLOCKING_ISSUE_KINDS])
    if (error) throw new Error(`countCafeReceiptIssuesNeedingPo failed: ${error.message}`)
    return count ?? 0
  }
  const [issues, held] = await Promise.all([
    ops().from('cafe_receipt_issues').select('id', { count: 'exact', head: true })
      .eq('status', 'open').in('kind', [...BLOCKING_ISSUE_KINDS]),
    ops().from('cafe_receipt_portions').select('id', { count: 'exact', head: true })
      .eq('state', 'held').eq('hold_reason', 'no_longer_fits'),
  ])
  if (issues.error) throw new Error(`countCafeReceiptIssuesNeedingPo failed: ${issues.error.message}`)
  if (held.error) throw new Error(`countCafeReceiptIssuesNeedingPo failed: ${held.error.message}`)
  return (issues.count ?? 0) + (held.count ?? 0)
}

/** Whether the signed-in person holds the procurement capability; the RPCs decide again on every action. */
export async function canManageCafeReceiptIssues(): Promise<boolean> {
  const { data, error } = await ops().rpc('can_manage_cafe_receipt_issues')
  if (error) throw new Error(`canManageCafeReceiptIssues failed: ${error.message}`)
  return data === true
}

/** The open POs of the issue's branch holding its product detail, from the worker's cache (FR-1035). */
export async function listCafeReceiptIssueOpenPos(issueId: string): Promise<CafeReceiptIssueOpenPos> {
  const { data, error } = await ops().rpc('cafe_receipt_issue_open_pos', { p_issue_id: issueId })
  if (error) throw new Error(`listCafeReceiptIssueOpenPos failed: ${error.message}`)
  const result = (data ?? {}) as Record<string, unknown>
  if (!Array.isArray(result.options) || typeof result.is_current !== 'boolean') {
    throw new Error('listCafeReceiptIssueOpenPos failed: invalid response')
  }
  return {
    options: (result.options as Array<Record<string, unknown>>).map(row => {
      if (typeof row.po_number !== 'string' || typeof row.po_date !== 'string' || typeof row.date_eligible !== 'boolean') {
        throw new Error('listCafeReceiptIssueOpenPos failed: invalid PO row')
      }
      return {
        po_number: row.po_number,
        supplier_name: nullableString(row.supplier_name),
        po_date: row.po_date,
        available: String(row.available ?? '0'),
        date_eligible: row.date_eligible,
        created_after_delivery: row.created_after_delivery === true,
      }
    }),
    cache_as_of: nullableString(result.cache_as_of),
    is_current: result.is_current,
    refresh_requested_at: nullableString(result.refresh_requested_at),
  }
}

/** Asks the worker to refresh the issue's branch PO data; the browser never reads ESB. */
export async function requestCafeReceiptIssuePoRefresh(issueId: string): Promise<void> {
  const { error } = await ops().rpc('request_cafe_receipt_issue_po_refresh', { p_issue_id: issueId })
  if (error) throw new Error(`requestCafeReceiptIssuePoRefresh failed: ${error.message}`)
}

/** Sends only the issue and the chosen PO number; the database re-checks the PO and re-matches. */
export async function linkCafeReceiptIssue(issueId: string, poNumber: string): Promise<CafeReceiptIssueLink> {
  const { data, error } = await ops().rpc('link_cafe_receipt_issue', { p_issue_id: issueId, p_po_number: poNumber })
  if (error) throw new Error(`linkCafeReceiptIssue failed: ${error.message}`)
  const row = (data ?? {}) as Record<string, unknown>
  if ((row.status !== 'linked' && row.status !== 'open') || (row.posting !== 'queued' && row.posting !== 'held')) {
    throw new Error('linkCafeReceiptIssue failed: invalid response')
  }
  return {
    status: row.status,
    matched_quantity: String(row.matched_quantity),
    remaining_quantity: String(row.remaining_quantity),
    posting: row.posting,
    po_created_after_delivery: row.po_created_after_delivery === true,
  }
}

export async function closeCafeReceiptIssue(issueId: string, note: string): Promise<void> {
  const { error } = await ops().rpc('close_cafe_receipt_issue', { p_issue_id: issueId, p_note: note.trim() })
  if (error) throw new Error(`closeCafeReceiptIssue failed: ${error.message}`)
}

/** Admin only: whether a person holds the procurement capability. */
export async function getCafeReceiptIssueAccess(personId: string): Promise<boolean> {
  const { data, error } = await ops().rpc('get_cafe_receipt_issue_access', { p_person_id: personId })
  if (error) throw new Error(`getCafeReceiptIssueAccess failed: ${error.message}`)
  return enabled(data, 'getCafeReceiptIssueAccess')
}

/** Admin only: grant or revoke the procurement capability; the database refuses a self-grant. */
export async function setCafeReceiptIssueAccess(personId: string, grant: boolean): Promise<void> {
  const { data, error } = await ops().rpc('set_cafe_receipt_issue_access', { p_person_id: personId, p_enabled: grant })
  if (error) throw new Error(`setCafeReceiptIssueAccess failed: ${error.message}`)
  if (enabled(data, 'setCafeReceiptIssueAccess') !== grant) throw new Error('setCafeReceiptIssueAccess failed: not saved')
}

function enabled(data: unknown, name: string): boolean {
  const value = (data as Record<string, unknown> | null)?.enabled
  if (typeof value !== 'boolean') throw new Error(`${name} failed: invalid response`)
  return value
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
