// team.ts — resolve the direct-report roster for a manager viewer (P2-2 review pane).
// Returns the set of people who hold roles that report to (any of) the viewer's held roles.
// This is the "one level" team — not the full transitive chain (which is is_manager_of).
// For the review pane we show the viewer's DIRECT team, which is all people whose held roles
// have reports_to_role_id in the viewer's roleIds set (union over all viewer roles).
//
// No cross-schema embed (PGRST200 lesson). Reads shared.person_roles + shared.people
// using supabase.schema('shared') (org-readable per OD-P1-3).
// Directory name resolution is CLIENT-SIDE (Fix C1, P2-1b).
import { supabase } from '../supabase'
import type { TeamMember } from './weeklyUpdates'

const shared = () => supabase.schema('shared')

/**
 * Build the team roster for a manager: the people who hold roles that report to
 * any of the viewer's held roles. Includes all direct reports (union of all viewer role trees).
 * Returns TeamMember[] ready for listTeamUpdates. Never sends org_id (RLS scopes it).
 * Throws on PostgREST error.
 */
export async function getTeamForManager(
  viewerRoleIds: string[],
): Promise<TeamMember[]> {
  if (viewerRoleIds.length === 0) return []

  // 1. Find all roles whose reports_to_role_id is in the viewer's set
  const { data: subordinateRoles, error: rolesErr } = await shared()
    .from('roles')
    .select('id,name')
    .in('reports_to_role_id', viewerRoleIds)
  if (rolesErr) throw new Error(`getTeamForManager (roles) — ${rolesErr.message}`)

  const subRoleIds = (subordinateRoles ?? []).map((r: { id: string; name: string }) => r.id)
  const subRoleNameById = new Map(
    (subordinateRoles ?? []).map((r: { id: string; name: string }) => [r.id, r.name]),
  )

  if (subRoleIds.length === 0) return []

  // 2. Load person_roles for those subordinate roles (to find people holding them)
  const { data: personRoles, error: prErr } = await shared()
    .from('person_roles')
    .select('person_id,role_id')
    .in('role_id', subRoleIds)
  if (prErr) throw new Error(`getTeamForManager (person_roles) — ${prErr.message}`)

  const prRows = (personRoles ?? []) as { person_id: string; role_id: string }[]
  const personIds = [...new Set(prRows.map(pr => pr.person_id))]
  if (personIds.length === 0) return []

  // 3. Load people rows for those person IDs
  const { data: people, error: peopleErr } = await shared()
    .from('people')
    .select('id,full_name')
    .in('id', personIds)
    .is('archived_at', null)
  if (peopleErr) throw new Error(`getTeamForManager (people) — ${peopleErr.message}`)

  const peopleById = new Map(
    (people ?? []).map((p: { id: string; full_name: string }) => [p.id, p.full_name]),
  )

  // 4. Build TeamMember[] — one entry per person (deduplicated), role_label from first match
  const seen = new Set<string>()
  const team: TeamMember[] = []
  for (const pr of prRows) {
    if (seen.has(pr.person_id)) continue
    seen.add(pr.person_id)
    const full_name = peopleById.get(pr.person_id)
    if (!full_name) continue // archived or missing
    team.push({
      person_id: pr.person_id,
      full_name,
      role_label: subRoleNameById.get(pr.role_id) ?? null,
    })
  }
  return team.sort((a, b) => a.full_name.localeCompare(b.full_name))
}
