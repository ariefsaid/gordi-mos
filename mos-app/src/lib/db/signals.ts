// Data layer for Signals and the shared substrate the Signal surfaces read.
//
// ⚠ THIS IS A SLICE, NOT THE PORT. #196 (Café capture) needs exactly one function from it —
// the viewer's own Teams, which the Café opening surface falls back to when today's opening
// has already been started and so no longer appears in the due list. The rest of v4's
// signals DAL (the feed, mentions, retraction, the composer's option loaders, the Task link)
// lands with the Signals surface itself (#193), which owns this file. Keep additions here
// minimal so that port is a superset rather than a merge.
//
// Reads shared substrate (teams/team_memberships) via supabase.schema('shared') — same
// client, RLS is the authority (mirrors tasks.ts §8): this layer NEVER sends org_id and
// throws on any non-null PostgREST error so the UI can surface failures.

import { supabase } from '@/lib/supabase'
import type { TeamOption } from './signals.types'

const shared = () => supabase.schema('shared')

type TeamJoinRow = { id: string; name: string; business_unit_id: string; site_id: string | null }

/** The author's active membership Teams (owning-Team select options), primary first. Not a
 *  full effective-dated evaluation — approximates "active" as `effective_to is null` for the
 *  picker's convenience; RLS is the write-time authority. */
export async function listAuthorTeams(personId: string): Promise<TeamOption[]> {
  const { data: memberships, error: mErr } = await shared()
    .from('team_memberships')
    .select('team_id,is_primary')
    .eq('person_id', personId)
    .is('effective_to', null)
  if (mErr) throw new Error(`listAuthorTeams failed — ${mErr.message}`)

  const rows = (memberships ?? []) as { team_id: string; is_primary: boolean }[]
  if (rows.length === 0) return []

  const { data: teams, error: tErr } = await shared()
    .from('teams')
    .select('id,name,business_unit_id,site_id')
    .in('id', rows.map((r) => r.team_id))
  if (tErr) throw new Error(`listAuthorTeams teams failed — ${tErr.message}`)

  const primaryById = new Map(rows.map((r) => [r.team_id, r.is_primary]))
  return ((teams ?? []) as TeamJoinRow[])
    .map((team) => ({ ...team, is_primary: primaryById.get(team.id) ?? false }))
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
}
