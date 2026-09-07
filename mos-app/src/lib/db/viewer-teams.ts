// Viewer-scoped Team memberships for /profile (#807).
//
// The viewer reads their OWN live team memberships and the team names — no admin-only paths.
// `shared.team_memberships` and `shared.teams` are both org-readable (SELECT policy scoped by
// `org_id = shared.current_org_id()`), so an authenticated request returns just this viewer's
// rows without any extra filter beyond `person_id`. The list orders primary FIRST (AC-031) and
// then by team name; RLS still governs what comes back.

import { supabase } from '@/lib/supabase'

const shared = () => supabase.schema('shared')

export interface ViewerTeam {
  team_id: string
  name: string
  is_primary: boolean
}

/** Return the viewer's live teams — the primary first, then any others by name. */
export async function listViewerTeams(personId: string): Promise<ViewerTeam[]> {
  // Live = the gates' inclusive definition (`effective_to is null or >= today`). Primary matches
  // the strict shape default_stream() reads (`is_primary and effective_to is null and
  // effective_from <= today`) so the row rendered as primary is the same one the stream gates
  // resolve.
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await shared()
    .from('team_memberships')
    .select('team_id,is_primary,effective_from,effective_to')
    .eq('person_id', personId)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
  if (error) throw new Error(`listViewerTeams: ${error.message}`)

  const rows = (data ?? []) as { team_id: string; is_primary: boolean; effective_from: string; effective_to: string | null }[]
  if (rows.length === 0) return []

  const teamIds = [...new Set(rows.map((r) => r.team_id))]
  const { data: teams, error: tErr } = await shared()
    .from('teams')
    .select('id,name,archived_at')
    .in('id', teamIds)
    .is('archived_at', null)
  if (tErr) throw new Error(`listViewerTeams: ${tErr.message}`)
  const nameById = new Map<string, string>()
  for (const t of (teams ?? []) as { id: string; name: string }[]) nameById.set(t.id, t.name)

  const primaryStrict = (r: { is_primary: boolean; effective_from: string; effective_to: string | null }) =>
    r.is_primary && r.effective_to === null && r.effective_from <= today

  return rows
    .filter((r) => nameById.has(r.team_id))
    .map((r) => ({ team_id: r.team_id, name: nameById.get(r.team_id) as string, is_primary: primaryStrict(r) }))
    .sort((a, b) => {
      if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}
