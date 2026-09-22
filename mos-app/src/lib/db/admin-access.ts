import { supabase } from '@/lib/supabase'
import type {
  RoleAuthorityRow,
  TeamLeadAssignment,
  TeamLeadCandidate,
} from './admin-access.types'

const shared = () => supabase.schema('shared')

// The raw error goes to the console only, as admin-users.ts does; the client gets the plain sentence.
function fail(action: string, error: unknown): Error {
  console.error(`[admin-access] ${action} failed`, error)
  return new Error(`Couldn't ${action}. Try again.`)
}

export async function listRoleAuthority(): Promise<RoleAuthorityRow[]> {
  const { data, error } = await shared().rpc('list_role_authority')
  if (error) throw fail('load access rules', error)
  return (data ?? []) as RoleAuthorityRow[]
}

export async function saveRoleAuthority(changes: RoleAuthorityRow[]): Promise<void> {
  const { error } = await shared().rpc('save_role_authority', { p_changes: changes })
  if (error) throw fail('save access rules', error)
}

export async function listTeamLeadAssignments(): Promise<TeamLeadAssignment[]> {
  const { data, error } = await shared().rpc('list_team_lead_assignments')
  if (error) throw fail('load Team leads', error)
  return (data ?? []) as TeamLeadAssignment[]
}

export async function listTeamLeadCandidates(teamId: string): Promise<TeamLeadCandidate[]> {
  const { data, error } = await shared().rpc('list_team_lead_candidates', { p_team_id: teamId })
  if (error) throw fail('load Team lead candidates', error)
  return (data ?? []) as TeamLeadCandidate[]
}

export async function saveTeamLeadAssignment(teamId: string, leadPersonId: string | null): Promise<void> {
  const { error } = await shared().rpc('save_team_lead_assignment', {
    p_team_id: teamId,
    p_lead_person_id: leadPersonId,
  })
  if (error) throw fail('save Team lead', error)
}
