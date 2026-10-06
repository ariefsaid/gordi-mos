import { supabase } from '@/lib/supabase'
import { listCafeReceiptLinePhotos, type CafeReceiptPhoto } from './cafe-receipt-photos'

export type CafeReceiptIssueKind = 'no_po' | 'over' | 'wrong_unit' | 'short' | 'damaged_wrong'
export type CafeReceiptIssueStatus = 'open' | 'linked' | 'closed'

export type CafeReceiptIssuePortion = {
  quantity: string
  po_number: string | null
  state: 'held' | 'queued' | 'superseded'
  hold_reason: string | null
}

export type CafeReceiptIssue = {
  id: string
  receipt_id: string
  line_id: string
  item_unit_id: string
  kind: CafeReceiptIssueKind
  quantity: string
  status: CafeReceiptIssueStatus
  reason: string
  created_at: string
  age_days: number
  branch_id: string
  branch_name: string
  activity: 'kitchen' | 'bar'
  arrival_date: string
  received_by: string
  receiver_name: string
  received_at: string
  item_name: string
  item_category: string | null
  unit_name: string
  received_quantity: string
  photos: CafeReceiptPhoto[]
  portions: CafeReceiptIssuePortion[]
  linked_po_number: string | null
  linked_po_date: string | null
  linked_po_created_at: string | null
  closed_note: string | null
  resolved_by: string | null
  resolved_by_name: string | null
  resolved_at: string | null
}

export type CafeReceiptIssueOpenPo = {
  po_number: string
  supplier_name: string | null
  po_date: string
  date_eligible: boolean
  esb_created_at: string | null
}

export type CafeReceiptIssueOpenPoResult = {
  options: CafeReceiptIssueOpenPo[]
  cache_as_of: string | null
  is_current: boolean
  refresh_requested_at: string | null
}

const ISSUE_KINDS: readonly CafeReceiptIssueKind[] = ['no_po', 'over', 'wrong_unit', 'short', 'damaged_wrong']
const ISSUE_STATUSES: readonly CafeReceiptIssueStatus[] = ['open', 'linked', 'closed']

const ops = () => supabase.schema('ops')
const shared = () => supabase.schema('shared')

/** Reads issue rows through RLS, then joins their retained receipt, line, branch, person and photo evidence. */
export async function listCafeReceiptIssues({ now = new Date() }: { now?: Date } = {}): Promise<CafeReceiptIssue[]> {
  const { data: issueData, error: issueError } = await ops().from('cafe_receipt_issues')
    .select('id,receipt_id,line_id,item_unit_id,kind,quantity,status,reason,created_at,linked_po_number,linked_po_date,linked_po_created_at,closed_note,resolved_by,resolved_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (issueError) throw new Error(`listCafeReceiptIssues failed: ${issueError.message}`)
  const issueRows = (issueData ?? []) as Array<Record<string, unknown>>
  if (issueRows.length === 0) return []

  const receiptIds = [...new Set(issueRows.map(row => requiredString(row.receipt_id, 'receipt_id')))]
  const lineIds = [...new Set(issueRows.map(row => requiredString(row.line_id, 'line_id')))]
  const personIds = [...new Set(issueRows.flatMap(row => typeof row.resolved_by === 'string' ? [row.resolved_by] : []))]

  const [receiptResult, lineResult, portionResult] = await Promise.all([
    ops().from('cafe_receipts').select('id,branch_id,activity,arrival_date,received_by,received_at,delivery_note_number').in('id', receiptIds),
    ops().from('cafe_receipt_lines').select('id,item_name,item_category,unit_name,received_quantity,conditions,condition_reason').in('id', lineIds),
    ops().from('cafe_receipt_portions').select('line_id,quantity,po_number,state,hold_reason').in('line_id', lineIds),
  ])
  if (receiptResult.error) throw new Error(`listCafeReceiptIssues failed: ${receiptResult.error.message}`)
  if (lineResult.error) throw new Error(`listCafeReceiptIssues failed: ${lineResult.error.message}`)
  if (portionResult.error) throw new Error(`listCafeReceiptIssues failed: ${portionResult.error.message}`)
  const receipts = new Map(((receiptResult.data ?? []) as Array<Record<string, unknown>>).map(row => [String(row.id), row]))
  const lines = new Map(((lineResult.data ?? []) as Array<Record<string, unknown>>).map(row => [String(row.id), row]))
  const portionsByLine = new Map<string, CafeReceiptIssuePortion[]>()
  for (const row of (portionResult.data ?? []) as Array<Record<string, unknown>>) {
    if (row.state !== 'held' && row.state !== 'queued' && row.state !== 'superseded') {
      throw new Error('listCafeReceiptIssues failed: invalid portion state')
    }
    const lineId = requiredString(row.line_id, 'line_id')
    portionsByLine.set(lineId, [...(portionsByLine.get(lineId) ?? []), {
      quantity: String(row.quantity),
      po_number: nullableString(row.po_number),
      state: row.state,
      hold_reason: nullableString(row.hold_reason),
    }])
  }
  const branchIds = [...new Set([...receipts.values()].map(row => requiredString(row.branch_id, 'branch_id')))]
  const receiverIds = [...new Set([...receipts.values()].map(row => requiredString(row.received_by, 'received_by')))]
  const [branchResult, peopleResult, photos] = await Promise.all([
    shared().from('branches').select('id,name').in('id', branchIds),
    shared().from('people').select('id,full_name').in('id', [...new Set([...receiverIds, ...personIds])]),
    listCafeReceiptLinePhotos(lineIds),
  ])
  if (branchResult.error) throw new Error(`listCafeReceiptIssues failed: ${branchResult.error.message}`)
  if (peopleResult.error) throw new Error(`listCafeReceiptIssues failed: ${peopleResult.error.message}`)
  const branches = new Map(((branchResult.data ?? []) as Array<Record<string, unknown>>).map(row => [String(row.id), String(row.name)]))
  const people = new Map(((peopleResult.data ?? []) as Array<Record<string, unknown>>).map(row => [String(row.id), String(row.full_name)]))
  const photosByLine = new Map<string, CafeReceiptPhoto[]>()
  for (const photo of photos) photosByLine.set(photo.lineId, [...(photosByLine.get(photo.lineId) ?? []), photo])

  return issueRows.map(row => {
    const receipt = receipts.get(requiredString(row.receipt_id, 'receipt_id'))
    const line = lines.get(requiredString(row.line_id, 'line_id'))
    const kind = row.kind
    const status = row.status
    if (!receipt || !line || !ISSUE_KINDS.includes(kind as CafeReceiptIssueKind)
      || !ISSUE_STATUSES.includes(status as CafeReceiptIssueStatus)
      || (receipt.activity !== 'kitchen' && receipt.activity !== 'bar')) {
      throw new Error('listCafeReceiptIssues failed: invalid issue, receipt, or line row')
    }
    const branchId = requiredString(receipt.branch_id, 'branch_id')
    const receivedBy = requiredString(receipt.received_by, 'received_by')
    const lineId = requiredString(row.line_id, 'line_id')
    const createdAt = requiredString(row.created_at, 'created_at')
    const resolvedBy = typeof row.resolved_by === 'string' ? row.resolved_by : null
    return {
      id: requiredString(row.id, 'id'),
      receipt_id: requiredString(row.receipt_id, 'receipt_id'),
      line_id: lineId,
      item_unit_id: requiredString(row.item_unit_id, 'item_unit_id'),
      kind: kind as CafeReceiptIssueKind,
      quantity: String(row.quantity),
      status: status as CafeReceiptIssueStatus,
      reason: typeof row.reason === 'string' && row.reason.trim() ? row.reason : (typeof line.condition_reason === 'string' ? line.condition_reason : ''),
      created_at: createdAt,
      age_days: Math.max(0, Math.floor((now.getTime() - Date.parse(createdAt)) / 86_400_000)),
      branch_id: branchId,
      branch_name: branches.get(branchId) ?? '',
      activity: receipt.activity,
      arrival_date: requiredString(receipt.arrival_date, 'arrival_date'),
      received_by: receivedBy,
      receiver_name: people.get(receivedBy) ?? '',
      received_at: requiredString(receipt.received_at, 'received_at'),
      item_name: requiredString(line.item_name, 'item_name'),
      item_category: typeof line.item_category === 'string' ? line.item_category : null,
      unit_name: requiredString(line.unit_name, 'unit_name'),
      received_quantity: String(line.received_quantity),
      photos: photosByLine.get(lineId) ?? [],
      portions: portionsByLine.get(lineId) ?? [],
      linked_po_number: nullableString(row.linked_po_number),
      linked_po_date: nullableString(row.linked_po_date),
      linked_po_created_at: nullableString(row.linked_po_created_at),
      closed_note: nullableString(row.closed_note),
      resolved_by: resolvedBy,
      resolved_by_name: resolvedBy ? people.get(resolvedBy) ?? null : null,
      resolved_at: nullableString(row.resolved_at),
    }
  })
}

/** Only open, same-branch cached POs whose exact product detail can accept this issue are returned. */
export async function listCafeReceiptIssueOpenPos(issueId: string): Promise<CafeReceiptIssueOpenPoResult> {
  const { data, error } = await ops().rpc('cafe_receipt_issue_open_pos', { p_issue_id: issueId })
  if (error) throw new Error(`listCafeReceiptIssueOpenPos failed: ${error.message}`)
  const result = data as Record<string, unknown> | null
  if (!result || !Array.isArray(result.options) || typeof result.is_current !== 'boolean') {
    throw new Error('listCafeReceiptIssueOpenPos failed: invalid response')
  }
  const options = (result.options as Array<Record<string, unknown>>).map(row => {
    if (typeof row.po_number !== 'string' || typeof row.po_date !== 'string' || typeof row.date_eligible !== 'boolean') {
      throw new Error('listCafeReceiptIssueOpenPos failed: invalid PO row')
    }
    return {
      po_number: row.po_number,
      supplier_name: nullableString(row.supplier_name),
      po_date: row.po_date,
      date_eligible: row.date_eligible,
      esb_created_at: nullableString(row.esb_created_at),
    }
  })
  return {
    options,
    cache_as_of: nullableString(result.cache_as_of),
    is_current: result.is_current,
    refresh_requested_at: nullableString(result.refresh_requested_at),
  }
}

export async function linkCafeReceiptIssue(issueId: string, poNumber: string): Promise<{ status: 'linked'; linked_po_number: string }> {
  const { data, error } = await ops().rpc('link_cafe_receipt_issue', { p_issue_id: issueId, p_po_number: poNumber })
  if (error) throw new Error(`linkCafeReceiptIssue failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || row.status !== 'linked' || typeof row.linked_po_number !== 'string') {
    throw new Error('linkCafeReceiptIssue failed: invalid response')
  }
  return { status: 'linked', linked_po_number: row.linked_po_number }
}

export async function closeCafeReceiptIssue(issueId: string, note: string): Promise<{ status: 'closed' }> {
  const { data, error } = await ops().rpc('close_cafe_receipt_issue', { p_issue_id: issueId, p_note: note.trim() })
  if (error) throw new Error(`closeCafeReceiptIssue failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || row.status !== 'closed') throw new Error('closeCafeReceiptIssue failed: invalid response')
  return { status: 'closed' }
}

export async function requestCafeReceiptIssuePoRefresh(issueId: string): Promise<{ requested_at: string }> {
  const { data, error } = await ops().rpc('request_cafe_receipt_issue_po_refresh', { p_issue_id: issueId })
  if (error) throw new Error(`requestCafeReceiptIssuePoRefresh failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || typeof row.requested_at !== 'string') throw new Error('requestCafeReceiptIssuePoRefresh failed: invalid response')
  return { requested_at: row.requested_at }
}

export async function canManageCafeReceiptIssues(): Promise<boolean> {
  const { data, error } = await ops().rpc('can_manage_cafe_receipt_issues')
  if (error) throw new Error(`canManageCafeReceiptIssues failed: ${error.message}`)
  if (typeof data !== 'boolean') throw new Error('canManageCafeReceiptIssues failed: invalid response')
  return data
}

export async function getCafeReceiptIssueAccess(personId: string): Promise<boolean> {
  const { data, error } = await ops().rpc('get_cafe_receipt_issue_access', { p_person_id: personId })
  if (error) throw new Error(`getCafeReceiptIssueAccess failed: ${error.message}`)
  if (!data || typeof (data as Record<string, unknown>).enabled !== 'boolean') {
    throw new Error('getCafeReceiptIssueAccess failed: invalid response')
  }
  return (data as { enabled: boolean }).enabled
}

export async function setCafeReceiptIssueAccess(personId: string, enabled: boolean): Promise<boolean> {
  const { data, error } = await ops().rpc('set_cafe_receipt_issue_access', { p_person_id: personId, p_enabled: enabled })
  if (error) throw new Error(`setCafeReceiptIssueAccess failed: ${error.message}`)
  if (!data || typeof (data as Record<string, unknown>).enabled !== 'boolean') {
    throw new Error('setCafeReceiptIssueAccess failed: invalid response')
  }
  return (data as { enabled: boolean }).enabled
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`listCafeReceiptIssues failed: invalid ${field}`)
  return value
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}
