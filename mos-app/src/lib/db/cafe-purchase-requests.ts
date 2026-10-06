import { supabase } from '@/lib/supabase'
import type { ProductionActivity, ProductionStream } from './kitchen-logs.types'

export type CafePurchaseRequestStatus = 'Submitted' | 'Approved' | 'Rejected'

export type CafePurchaseRequestLine = {
  id: string
  item_name: string
  item_category: string | null
  unit_name: string
  quantity: string
}

export type CafePurchaseRequest = {
  id: string
  branch_id: string
  activity: ProductionActivity
  required_by: string
  note: string | null
  status: CafePurchaseRequestStatus
  requested_by: string
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
  review_note: string | null
  row_version: number
  lines: CafePurchaseRequestLine[]
}

export type CafePurchaseRequestDraftLine = { item_unit_id: string; quantity: string }

const REQUEST_FIELDS = [
  'id', 'branch_id', 'activity', 'required_by', 'note', 'status', 'requested_by', 'requested_at',
  'reviewed_by', 'reviewed_at', 'review_note', 'row_version',
  'lines:cafe_purchase_request_lines(id, item_name, item_category, unit_name, quantity)',
].join(', ')

const STATUSES: readonly CafePurchaseRequestStatus[] = ['Submitted', 'Approved', 'Rejected']

function ops() {
  return supabase.schema('ops')
}

/** Requests the viewer may read, newest first; RLS returns their own and the streams they review. */
export async function listCafePurchaseRequests(
  statuses: readonly CafePurchaseRequestStatus[],
  { requestedBy, limit = 50 }: { requestedBy?: string; limit?: number } = {},
): Promise<CafePurchaseRequest[]> {
  let query = ops()
    .from('cafe_purchase_requests')
    .select(REQUEST_FIELDS)
    .in('status', [...statuses])
  if (requestedBy) query = query.eq('requested_by', requestedBy)
  const { data, error } = await query
    .order('requested_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listCafePurchaseRequests failed: ${error.message}`)
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(row => {
    if ((row.activity !== 'kitchen' && row.activity !== 'bar')
      || !STATUSES.includes(row.status as CafePurchaseRequestStatus) || !Array.isArray(row.lines)) {
      throw new Error('listCafePurchaseRequests failed: invalid request row')
    }
    return {
      ...row,
      lines: (row.lines as Array<Record<string, unknown>>).map(line => ({ ...line, quantity: String(line.quantity) })),
    } as unknown as CafePurchaseRequest
  })
}

/** Send: only the key, stream, needed-by date, note and (product detail, quantity) pairs cross the boundary. */
export async function submitCafePurchaseRequest(
  stream: ProductionStream,
  requiredBy: string,
  note: string,
  clientKey: string,
  lines: readonly CafePurchaseRequestDraftLine[],
): Promise<{ request_id: string; outcome: 'created' | 'existing'; row_version: number }> {
  const { data, error } = await ops().rpc('submit_cafe_purchase_request', {
    p_branch_id: stream.branch.id,
    p_activity: stream.activity,
    p_required_by: requiredBy,
    p_note: note.trim() || null,
    p_client_key: clientKey,
    p_lines: lines.map(({ item_unit_id, quantity }) => ({ item_unit_id, quantity })),
  })
  if (error) throw new Error(`submitCafePurchaseRequest failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || typeof row.request_id !== 'string' || typeof row.row_version !== 'number'
    || (row.outcome !== 'created' && row.outcome !== 'existing')) {
    throw new Error('submitCafePurchaseRequest failed: invalid response')
  }
  return { request_id: row.request_id, outcome: row.outcome, row_version: row.row_version }
}

export async function reviewCafePurchaseRequest(
  requestId: string,
  decision: 'approve' | 'reject',
  expectedVersion: number,
  note: string,
): Promise<{ status: 'Approved' | 'Rejected'; row_version: number }> {
  const { data, error } = await ops().rpc('review_cafe_purchase_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_expected_version: expectedVersion,
    p_note: note.trim() || null,
  })
  if (error) throw new Error(`reviewCafePurchaseRequest failed: ${error.message}`)
  const row = data as Record<string, unknown> | null
  if (!row || (row.status !== 'Approved' && row.status !== 'Rejected') || typeof row.row_version !== 'number') {
    throw new Error('reviewCafePurchaseRequest failed: invalid response')
  }
  return { status: row.status, row_version: row.row_version }
}

/** The needed-by dates the server accepts: today (WIB) through 90 days ahead. */
export function cafePurchaseRequestRequiredByBounds(today: string): { min: string; max: string } {
  const max = new Date(`${today}T00:00:00Z`)
  max.setUTCDate(max.getUTCDate() + 90)
  return { min: today, max: max.toISOString().slice(0, 10) }
}
