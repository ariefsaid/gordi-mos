import { supabase } from '@/lib/supabase'
import { CAFE_RECEIPT_PHOTO_READ_LIMIT } from './cafe-receipt-photos'
import { listCafeReceipts, type CafeReceipt, type CafeReceiptLine } from './cafe-receipts'
import { readAllPages } from './reporting-shared'

export type CafeReceiptIssueKind = 'no_po' | 'over' | 'wrong_unit' | 'short' | 'damaged_wrong'
export type CafeReceiptIssueStatus = 'open' | 'linked' | 'closed'

/** No PO, over and wrong unit keep their part unposted; short and damaged/wrong are information (FR-1034). */
export const BLOCKING_ISSUE_KINDS: ReadonlySet<CafeReceiptIssueKind> = new Set<CafeReceiptIssueKind>(['no_po', 'over', 'wrong_unit'])

/** One Receipt issue with the Approved receipt and line it is about. */
export type CafeReceiptIssue = {
  id: string
  kind: CafeReceiptIssueKind
  quantity: string
  status: CafeReceiptIssueStatus
  created_at: string
  linked_po_number: string | null
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
  /** The PO a procurement link chose; null when the release re-matched it to none. */
  po_number: string | null
  linked: boolean
  receipt: CafeReceipt
  line: CafeReceiptLine
}

export type CafeReceiptIssueList = {
  /** Every open issue, and the newest resolved ones. */
  issues: CafeReceiptIssue[]
  held: CafeReceiptHeldPortion[]
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

const ISSUE_FIELDS = 'id,receipt_id,line_id,kind,quantity,status,created_at,linked_po_number,closed_note,resolved_by,resolved_at'
const HELD_FIELDS = 'id,receipt_id,line_id,quantity,po_number,issue_id,created_at'
const KINDS: readonly CafeReceiptIssueKind[] = ['no_po', 'over', 'wrong_unit', 'short', 'damaged_wrong']
const STATUSES: readonly CafeReceiptIssueStatus[] = ['open', 'linked', 'closed']
/** Resolved issues shown at once, newest first; open ones are always read in full. */
export const RESOLVED_READ_LIMIT = 100

const ops = () => supabase.schema('ops')

/**
 * Every open issue and held no-longer-fits portion the viewer may read, plus the newest resolved
 * issues (RLS: procurement reads the organisation's, a receiver their own issues and no
 * portions). Each comes with its receipt, line, evidence and photos from the shared receipt read.
 */
export async function listCafeReceiptIssues(): Promise<CafeReceiptIssueList> {
  const [open, resolved, resolvedCount, heldRows] = await Promise.all([
    readAllPages<Record<string, unknown>>('listCafeReceiptIssues', (from, to) => ops().from('cafe_receipt_issues')
      .select(ISSUE_FIELDS).eq('status', 'open').order('created_at').order('id').range(from, to)),
    ops().from('cafe_receipt_issues').select(ISSUE_FIELDS).neq('status', 'open')
      .order('resolved_at', { ascending: false }).order('id').limit(RESOLVED_READ_LIMIT),
    ops().from('cafe_receipt_issues').select('id', { count: 'exact', head: true }).neq('status', 'open'),
    readAllPages<Record<string, unknown>>('listCafeReceiptIssues', (from, to) => ops().from('cafe_receipt_portions')
      .select(HELD_FIELDS).eq('state', 'held').eq('hold_reason', 'no_longer_fits').order('created_at').order('id').range(from, to)),
  ])
  if (resolved.error) throw new Error(`listCafeReceiptIssues failed: ${resolved.error.message}`)
  if (resolvedCount.error) throw new Error(`listCafeReceiptIssues failed: ${resolvedCount.error.message}`)
  const issueRows = [...open, ...((resolved.data ?? []) as Array<Record<string, unknown>>)]
  const receipts = await readReceipts([...issueRows, ...heldRows].map(row => String(row.receipt_id)))
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
        closed_note: nullableString(row.closed_note),
        resolved_by: nullableString(row.resolved_by),
        resolved_at: nullableString(row.resolved_at),
      }
    }),
    held: heldRows.map(row => ({
      ...evidence(row),
      quantity: String(row.quantity),
      po_number: nullableString(row.po_number),
      linked: typeof row.issue_id === 'string',
    })),
    resolvedTotal: resolvedCount.count ?? 0,
  }
}

/** The receipts the rows name, read 50 at a time like the receipt photo read. */
async function readReceipts(ids: readonly string[]): Promise<Map<string, CafeReceipt>> {
  const unique = [...new Set(ids)]
  const chunks: string[][] = []
  for (let start = 0; start < unique.length; start += CAFE_RECEIPT_PHOTO_READ_LIMIT) {
    chunks.push(unique.slice(start, start + CAFE_RECEIPT_PHOTO_READ_LIMIT))
  }
  const read = await Promise.all(chunks.map(chunk => listCafeReceipts(['Approved'], { ids: chunk, limit: chunk.length })))
  return new Map(read.flat().map(receipt => [receipt.id, receipt]))
}

/** What waits for procurement's PO (FR-1034's badge): open blocking issues and held portions no PO has room for. */
export async function countCafeReceiptIssuesNeedingPo(): Promise<number> {
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
