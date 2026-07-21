import { supabase } from '@/lib/supabase'

export type FollowUpKind = 'b2b_ar' | 'retail_pending'
export type FollowUpLane = 'b2b_sales' | 'retail_ops'
export type FollowUpState = 'open' | 'chased' | 'promised' | 'partial' | 'settled' | 'confirmed'
export type FollowUpTransition = 'chase' | 'promise' | 'partial' | 'settle' | 'confirm'

export interface FollowUpRow {
  id: string
  org_id: string
  counterparty: string
  kind: FollowUpKind
  lane: FollowUpLane
  source_invoice_ref: string | null
  original_amount: number
  running_balance: number
  state: FollowUpState
  promise_date: string | null
  issued_date: string | null
  due_date: string | null
  assigned_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FollowUpEvent {
  id: string
  org_id: string
  follow_up_id: string
  transition: FollowUpTransition
  from_state: FollowUpState
  to_state: FollowUpState
  amount: number | null
  cash_in_date: string | null
  evidence: string | null
  promise_date: string | null
  note: string | null
  actor_person_id: string | null
  created_at: string
}

export interface FollowUpFilters { overdue?: boolean; state?: FollowUpState }
export interface FollowUpTransitionOptions { amount?: number; cash_in_date?: string; evidence?: string; promise_date?: string; note?: string }
export interface FollowUpReconDrift { org_id: string; counterparty: string; period: string; mos_amount: number; esb_amount: number; drift: number; is_drift: boolean }

const mos = () => supabase.schema('mos')

export async function listFollowUps(filters: FollowUpFilters = {}): Promise<FollowUpRow[]> {
  let query = mos().from('follow_ups').select('*').order('due_date', { ascending: true, nullsFirst: false })
  if (filters.state) query = query.eq('state', filters.state)
  if (filters.overdue) query = query.lt('due_date', new Date().toISOString().slice(0, 10)).neq('state', 'settled').neq('state', 'confirmed')
  const { data, error } = await query
  if (error) throw new Error(`listFollowUps failed — ${error.message}`)
  return (data ?? []) as FollowUpRow[]
}

export async function getFollowUp(id: string): Promise<FollowUpRow | null> {
  const { data, error } = await mos().from('follow_ups').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`getFollowUp failed — ${error.message}`)
  return (data as FollowUpRow | null) ?? null
}

export async function listFollowUpEvents(followUpId: string): Promise<FollowUpEvent[]> {
  const { data, error } = await mos().from('follow_up_events').select('*').eq('follow_up_id', followUpId).order('created_at', { ascending: true })
  if (error) throw new Error(`listFollowUpEvents failed — ${error.message}`)
  return (data ?? []) as FollowUpEvent[]
}

export async function transitionFollowUp(id: string, transition: FollowUpTransition, options: FollowUpTransitionOptions = {}): Promise<FollowUpRow> {
  const { data, error } = await supabase.schema('mos').rpc('transition_follow_up', { p_follow_up_id: id, p_transition: transition, p_options: options })
  if (error) throw new Error(`${error.code ?? 'FOLLOW_UP_RPC'}: ${error.message}`)
  return data as FollowUpRow
}

export async function listReconDrift(): Promise<FollowUpReconDrift[]> {
  const { data, error } = await mos().from('follow_up_recon_drift').select('*').eq('is_drift', true).order('period', { ascending: false })
  if (error) throw new Error(`listReconDrift failed — ${error.message}`)
  return (data ?? []) as FollowUpReconDrift[]
}

export function isOverdue(row: Pick<FollowUpRow, 'due_date' | 'state'>, today = new Date()): boolean {
  if (!row.due_date || row.state === 'settled' || row.state === 'confirmed') return false
  return row.due_date < today.toISOString().slice(0, 10)
}

export function summarizeAging(rows: readonly FollowUpRow[], today = new Date()) {
  return {
    overdue: rows.filter((row) => isOverdue(row, today)).length,
    chased: rows.filter((row) => row.state === 'chased').length,
    promised: rows.filter((row) => row.state === 'promised').length,
    partial: rows.filter((row) => row.state === 'partial').length,
  }
}
