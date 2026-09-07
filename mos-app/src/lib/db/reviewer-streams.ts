// The (branch, activity) streams the caller reviews — the client mirror of
// `ops.is_stream_reviewer` (OD-WAY-95 (7), 2026-09-06 migration): a supervisor of two
// streams reviews both. The predicate on the DB side asks per-stream; this returns
// the SET so the review page's stream switch can offer exactly the streams the viewer
// supervises and nothing else (#783 AC-050).
//
// Not a permission proof — the RLS policy is what admits a decision. This only decides
// which options are honest to offer; a stream missing here on a real reviewer would
// simply hide a legitimate switch option, not open one that would then be refused.

import { supabase } from '@/lib/supabase'
import type { StreamPair } from './kitchen-logs.types'
import { PRODUCTION_ACTIVITIES } from './kitchen-logs.types'

const shared = () => supabase.schema('shared')

interface MembershipRow {
  team_id: string
  effective_from: string
  effective_to: string | null
}

interface TeamStreamRow {
  id: string
  branch_id: string | null
  activity: string | null
}

/**
 * The stream pairs the caller REVIEWS — every (branch, activity) where the caller has an
 * open-ended live membership in the stream Team, mirroring the DB predicate exactly:
 *
 *   supervisor
 *   ∧ shared.team_memberships row for the current person with `effective_to is null`
 *     and `effective_from <= current_date`
 *   ∧ team is a stream team (branch_id + activity set) and non-archived
 *
 * ops_lead/admin reviewers are handled at the page — this predicate is the supervisor
 * question ("which streams does THIS reviewer supervise?"), not a permission map.
 *
 * A caller with no live open-ended memberships returns an empty list.
 */
export async function listReviewerStreams(): Promise<StreamPair[]> {
  const { data: memberships, error: mErr } = await shared()
    .from('team_memberships')
    .select('team_id,effective_from,effective_to')
    .is('effective_to', null)
  if (mErr) throw new Error(`listReviewerStreams memberships failed — ${mErr.message}`)
  const rows = (memberships ?? []) as MembershipRow[]
  const today = wibToday()
  const teamIds = Array.from(new Set(
    rows.filter(r => r.effective_from <= today).map(r => r.team_id),
  ))
  if (teamIds.length === 0) return []

  const { data: teams, error: tErr } = await shared()
    .from('teams')
    .select('id,branch_id,activity')
    .in('id', teamIds)
    .not('branch_id', 'is', null)
    .is('archived_at', null)
  if (tErr) throw new Error(`listReviewerStreams teams failed — ${tErr.message}`)

  const pairs: StreamPair[] = []
  const seen = new Set<string>()
  for (const t of (teams ?? []) as TeamStreamRow[]) {
    if (!t.branch_id || !t.activity) continue
    if (!(PRODUCTION_ACTIVITIES as readonly string[]).includes(t.activity)) continue
    const key = `${t.branch_id}|${t.activity}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({ branch_id: t.branch_id, activity: t.activity as StreamPair['activity'] })
  }
  return pairs
}

function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}
