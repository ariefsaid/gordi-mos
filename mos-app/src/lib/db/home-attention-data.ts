import { supabase } from '@/lib/supabase'
import type { AttentionItem } from '@/lib/home-attention'

const ops = () => supabase.schema('ops')
// Café route the barista returns to in order to re-log a rejected check (RATIFY-3 — v1 failed-check source).
const CAFE_LOG_ROUTE = '/cafe/log'

// `action_label` is `ops.action_label(ops.kitchen_logs)` — a PostgREST computed column, not a
// stored one. #191 port note: v4 authored this file against a stored `action_type` column; the
// Stage 1 schema squash (FR-007, DD-WAY-13) removed that column in favour of deriving the label
// from `action` + `destination_branch_id` at read time (`ops.kitchen_action_label`,
// `supabase/migrations/20260805000011_ops_functions.sql`). Selecting the computed column here is
// the fix — the app conforms to the ruled contract, not the v4 source that predates it.
interface RejectedLogRow { id: string; log_date: string; action_label: string; review_note: string | null }

/** v1 "failed checks" = the viewer's RLS-readable rejected kitchen logs (spec §2, RATIFY-3). Never sends
 *  org_id/person_id (RLS is the authority); returns [] when none (fail-closed), throws only on a real error.
 *  Step 6's Check/Exception object replaces this adapter body without touching AttentionBrief/HomePage. */
export async function loadFailedChecksForViewer(limit = 20): Promise<AttentionItem[]> {
  const { data, error } = await ops()
    .from('kitchen_logs')
    .select('id,log_date,action_label,review_note')
    .eq('status', 'Rejected')
    .order('log_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`loadFailedChecksForViewer failed — ${error.message}`)
  return ((data ?? []) as RejectedLogRow[]).map(r => ({
    id: r.id,
    title: `${r.action_label} · ${r.log_date}`,
    meta: r.review_note ?? undefined,
    route: CAFE_LOG_ROUTE,
  }))
}
