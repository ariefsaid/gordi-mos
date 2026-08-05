// ops.stream_completeness — per-stream completeness confirmation (#238, FR-031, OD-WAY-47).
//
// The stream's supervisor/lead records that their stream's item list is COMPLETE. Distinct
// from the per-item-unit COORDINATE confirmation (FR-030, ops.item_units): two roles, neither
// sufficient alone.
//
// This record GATES NOTHING. DD-WAY-29's coordinate gate already decides which rows reach a
// capture form (ops.capture_form_items), and NFR-004 keeps that a query predicate with nothing
// to bypass. Nothing here is ever consulted before a write is allowed — it exists so a stream's
// gaps are a tracked state with a name and a date on them.
//
// The client sends the STREAM and nothing else: confirmed_by/confirmed_at are server-stamped
// (ops._stamp_stream_completeness), exactly like status/org_id/submitted_by on a kitchen log.

import { supabase } from '@/lib/supabase'
import type { ProductionActivity } from './kitchen-logs.types'

const ops = () => supabase.schema('ops')

export interface StreamCompleteness {
  branch_id: string
  activity: ProductionActivity
  confirmed_by: string
  confirmed_at: string
}

/**
 * Every confirmation the caller's org has recorded. Read is org-wide by policy — deliberately,
 * since a gap that only its own lead can see is the tribal knowledge FR-031 ends — so one read
 * serves a whole surface however its stream filter moves.
 */
export async function listStreamCompleteness(): Promise<StreamCompleteness[]> {
  const { data, error } = await ops()
    .from('stream_completeness')
    .select('branch_id,activity,confirmed_by,confirmed_at')
  if (error) throw new Error(`listStreamCompleteness failed — ${error.message}`)
  return (data ?? []) as StreamCompleteness[]
}

/**
 * Confirm (or re-confirm) that a stream's item list is complete. Upserted on the stream: the
 * record is a current state — "complete as of when" — not an archive of past claims, so
 * confirming again re-stamps who/when rather than adding a rival row.
 *
 * Refused server-side for anyone but the stream's supervisor/lead or ops_lead/admin
 * (ops.can_review_stream, the same predicate that decides who may approve the stream's rows).
 * The surface hides the control for everyone else; the policy is what makes it true.
 */
export async function confirmStreamComplete(
  branchId: string,
  activity: ProductionActivity,
): Promise<StreamCompleteness> {
  const { data, error } = await ops()
    .from('stream_completeness')
    .upsert(
      { branch_id: branchId, activity },
      { onConflict: 'org_id,branch_id,activity' },
    )
    .select('branch_id,activity,confirmed_by,confirmed_at')
    .single()
  if (error) throw new Error(`confirmStreamComplete failed — ${error.message}`)
  return data as StreamCompleteness
}
