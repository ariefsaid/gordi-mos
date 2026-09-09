import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => ({
  supabase: { schema: vi.fn() },
}))

import { supabase } from '@/lib/supabase'
import {
  listRoleAuthority,
  listTeamLeadAssignments,
  listTeamLeadCandidates,
  saveRoleAuthority,
  saveTeamLeadAssignment,
} from './admin-access'
import type { RoleAuthorityRow } from './admin-access.types'

const schemaMock = vi.mocked(supabase.schema)

function mockSharedRpc(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  schemaMock.mockReturnValue({ rpc } as never)
  return rpc
}

beforeEach(() => vi.clearAllMocks())

describe('admin access settings data layer', () => {
  it('loads role authority through the shared list_role_authority RPC', async () => {
    const rows: RoleAuthorityRow[] = [{ action: 'signal.post', role: 'member', scope: 'org' }]
    const rpc = mockSharedRpc(rows)

    await expect(listRoleAuthority()).resolves.toEqual(rows)
    expect(schemaMock).toHaveBeenCalledWith('shared')
    expect(rpc).toHaveBeenCalledWith('list_role_authority')
  })

  it('saves the complete role authority draft as p_changes', async () => {
    const rpc = mockSharedRpc(null)
    const changes: RoleAuthorityRow[] = [{ action: 'process.close', role: 'team_lead', scope: 'own_team' }]

    await expect(saveRoleAuthority(changes)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('save_role_authority', { p_changes: changes })
  })

  it('loads Team leads and candidates through the shared settings RPCs', async () => {
    const assignment = {
      team_id: 'team-1', team_name: 'Café', business_unit_id: 'bu-1',
      lead_person_id: 'person-1', lead_name: 'Ari',
    }
    const rpc = mockSharedRpc([assignment])
    await expect(listTeamLeadAssignments()).resolves.toEqual([assignment])
    expect(rpc).toHaveBeenCalledWith('list_team_lead_assignments')

    const candidateRpc = mockSharedRpc([{ person_id: 'person-2', full_name: 'Dina' }])
    await expect(listTeamLeadCandidates('team-1')).resolves.toEqual([{ person_id: 'person-2', full_name: 'Dina' }])
    expect(candidateRpc).toHaveBeenCalledWith('list_team_lead_candidates', { p_team_id: 'team-1' })
  })

  it('saves and clears a Team lead with the nullable p_lead_person_id argument', async () => {
    const rpc = mockSharedRpc(null)

    await expect(saveTeamLeadAssignment('team-1', null)).resolves.toBeUndefined()
    expect(rpc).toHaveBeenCalledWith('save_team_lead_assignment', {
      p_team_id: 'team-1',
      p_lead_person_id: null,
    })
  })

  it('surfaces RPC failures without returning partial settings', async () => {
    mockSharedRpc(null, { message: 'permission denied' })

    await expect(listRoleAuthority()).rejects.toThrow(/load access rules/i)
  })
})
