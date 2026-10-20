import { supabase } from '@/lib/supabase'
import { readAllPages } from '@/lib/db/reporting-shared'

export const CANCEL_VOID_REASONS = ['order_error', 'customer_request', 'unavailable', 'quality', 'training', 'other'] as const
export type CancelVoidReason = typeof CANCEL_VOID_REASONS[number]
export type CancelVoidRow = {
  esb_code: string; row_id: string; case_id: string; is_case: boolean
  branch_code: string; sales_date: string; sales_num: string
  action_kind: 'sale_cancelled' | 'sale_void' | 'menu_cancelled'
  node_kind: string; menu_name: string | null
  review_value_idr: number | null; review_value_basis: 'sale_grand_total' | 'raw_menu_total' | 'detail_only'; line_total: number | null
  creator_account: string | null; last_editor_account: string | null
  minutes_to_last_edit: number | null; reason_text: string | null
  reason_scope: 'sale_reason_not_exposed' | 'source_line_reason'
  source_evidence_hash: string | null; snapshot_as_of: string
}
export type CancelVoidReview = {
  id: string; esb_code: string; case_id: string; person_id: string; reason: CancelVoidReason
  note: string; reviewed_by: string; created_at: string; source_evidence_hash: string | null
}
export type CancelVoidData = { rows: CancelVoidRow[]; reviews: CancelVoidReview[] }
export type CancelVoidReviewInput = { esbCode: string; caseId: string; personId: string; reason: CancelVoidReason; note: string }
const REVIEW_COLUMNS = 'id,esb_code,case_id,person_id,reason,note,reviewed_by,created_at,source_evidence_hash'

export async function latestCancelVoidDate(branch: string): Promise<string | null> {
  const { data, error } = await supabase.schema('reporting').from('cancel_void_register')
    .select('sales_date').eq('branch_code', branch).order('sales_date', { ascending: false }).limit(1)
  if (error) throw error
  return data?.[0]?.sales_date ?? null
}

export async function listCancelVoidRegister(branch: string, start: string, end: string): Promise<CancelVoidData> {
  const rows = await readAllPages<CancelVoidRow>('listCancelVoidRegister', (from, to) => supabase.schema('reporting')
    .from('cancel_void_register').select('esb_code,row_id,case_id,is_case,branch_code,sales_date,sales_num,action_kind,node_kind,menu_name,review_value_idr,review_value_basis,line_total,creator_account,last_editor_account,minutes_to_last_edit,reason_text,reason_scope,source_evidence_hash,snapshot_as_of')
    .eq('branch_code', branch).gte('sales_date', start).lte('sales_date', end)
    .order('sales_date', { ascending: false }).order('esb_code').order('row_id').range(from, to))
  const caseIds = [...new Set(rows.filter(row => row.is_case).map(row => row.case_id))]
  const reviews: CancelVoidReview[] = []
  // Bound each URL while paging all history; the company is part of the case identity below.
  for (let offset = 0; offset < caseIds.length; offset += 100) {
    reviews.push(...await readAllPages<CancelVoidReview>('listCancelVoidReviews', (from, to) => supabase.schema('mos')
      .from('cancel_void_reviews').select(REVIEW_COLUMNS).in('case_id', caseIds.slice(offset, offset + 100))
      .in('esb_code', [...new Set(rows.map(row => row.esb_code))])
      .order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to)))
  }
  return { rows, reviews }
}

export async function recordCancelVoidReview(input: CancelVoidReviewInput): Promise<CancelVoidReview> {
  const { data, error } = await supabase.schema('mos').from('cancel_void_reviews').insert({
    esb_code: input.esbCode, case_id: input.caseId, person_id: input.personId, reason: input.reason, note: input.note.trim(),
  }).select(REVIEW_COLUMNS).single()
  if (error) throw error
  return data as CancelVoidReview
}
