import { supabase } from '@/lib/supabase'
import type { ProductionStream } from './kitchen-logs.types'

export type CafeMissingItemReport = {
  id: string
  branchId: string
  activity: string
  itemName: string
  reportedAt: string
  needsAttention: boolean
  resolvedAt: string | null
}

type ReportRow = {
  id: string
  branch_id: string
  activity: string
  item_name: string
  reported_at: string
  needs_attention: boolean
  resolved_at: string | null
}

/** Managers read reports only for the selected (branch, activity) stream. RLS is authoritative. */
export async function listCafeMissingItemReports(stream: ProductionStream): Promise<CafeMissingItemReport[]> {
  const { data, error } = await supabase.schema('ops')
    .from('cafe_missing_item_reports')
    .select('id, branch_id, activity, item_name, reported_at, needs_attention, resolved_at')
    .eq('branch_id', stream.branch.id)
    .eq('activity', stream.activity)
    .eq('needs_attention', true)
    .order('reported_at', { ascending: false })

  if (error) throw new Error(`listCafeMissingItemReports failed: ${error.message}`)
  return ((data ?? []) as ReportRow[]).map(row => ({
    id: row.id,
    branchId: row.branch_id,
    activity: row.activity,
    itemName: row.item_name,
    reportedAt: row.reported_at,
    needsAttention: row.needs_attention,
    resolvedAt: row.resolved_at,
  }))
}

/** Capturers can write; the database stamps org/reporter and verifies the live stream. */
export async function reportMissingCafeItem(stream: ProductionStream, itemName: string): Promise<void> {
  const { error } = await supabase.schema('ops')
    .from('cafe_missing_item_reports')
    .insert({ branch_id: stream.branch.id, activity: stream.activity, item_name: itemName.trim() })

  if (error) throw new Error(`reportMissingCafeItem failed: ${error.message}`)
}

/** One-way, manager-authorized transition; the database stamps who and when. */
export async function resolveCafeMissingItemReport(reportId: string): Promise<void> {
  const { error } = await supabase.schema('ops')
    .from('cafe_missing_item_reports')
    .update({ needs_attention: false })
    .eq('id', reportId)
    .eq('needs_attention', true)

  if (error) throw new Error(`resolveCafeMissingItemReport failed: ${error.message}`)
}
