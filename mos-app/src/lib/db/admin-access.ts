import { supabase } from '@/lib/supabase'
import type {
  RoleAuthorityRow,
  TeamLeadAssignment,
  TeamLeadCandidate,
} from './admin-access.types'

const shared = () => supabase.schema('shared')

function fail(action: string): Error {
  return new Error(`Couldn't ${action}. Try again.`)
}

export async function listRoleAuthority(): Promise<RoleAuthorityRow[]> {
  const { data, error } = await shared().rpc('list_role_authority')
  if (error) throw fail('load access rules')
  return (data ?? []) as RoleAuthorityRow[]
}

export async function saveRoleAuthority(changes: RoleAuthorityRow[]): Promise<void> {
  const { error } = await shared().rpc('save_role_authority', { p_changes: changes })
  if (error) throw fail('save access rules')
}

export async function listTeamLeadAssignments(): Promise<TeamLeadAssignment[]> {
  const { data, error } = await shared().rpc('list_team_lead_assignments')
  if (error) throw fail('load Team leads')
  return (data ?? []) as TeamLeadAssignment[]
}

export async function listTeamLeadCandidates(teamId: string): Promise<TeamLeadCandidate[]> {
  const { data, error } = await shared().rpc('list_team_lead_candidates', { p_team_id: teamId })
  if (error) throw fail('load Team lead candidates')
  return (data ?? []) as TeamLeadCandidate[]
}

export async function saveTeamLeadAssignment(teamId: string, leadPersonId: string | null): Promise<void> {
  const { error } = await shared().rpc('save_team_lead_assignment', {
    p_team_id: teamId,
    p_lead_person_id: leadPersonId,
  })
  if (error) throw fail('save Team lead')
}
