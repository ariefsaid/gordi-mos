import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  schema: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  listGrants: vi.fn(),
  revokeGrant: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    schema: mocks.schema,
    auth: { oauth: { listGrants: mocks.listGrants, revokeGrant: mocks.revokeGrant } },
  },
}))

import {
  addTrustedAgentClient,
  listAdminAgentConnections,
  listOwnAgentConnections,
  revokeAdminAgentConnection,
  revokeOwnAgentConnection,
  setTrustedAgentEnabled,
} from './agent-connections'

const ID_A = '33333333-3333-4333-8333-333333333333'
const ID_B = '44444444-4444-4444-8444-444444444444'

describe('agent connection data access', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.schema.mockReturnValue({ rpc: mocks.rpc, from: mocks.from })
    mocks.from.mockReturnValue({ insert: mocks.insert, update: mocks.update, select: mocks.select })
    mocks.update.mockReturnValue({ eq: mocks.eq })
    mocks.rpc.mockResolvedValue({ data: [], error: null })
    mocks.insert.mockResolvedValue({ error: null })
    mocks.eq.mockResolvedValue({ error: null })
    mocks.select.mockResolvedValue({ data: [], error: null })
    mocks.listGrants.mockResolvedValue({ data: [], error: null })
    mocks.revokeGrant.mockResolvedValue({ error: null })
  })

  it('loads the server-authorized admin projection without sending an org id', async () => {
    const rows = [{ client_id: ID_A, display_name: 'Trusted name', enabled: true }]
    mocks.rpc.mockResolvedValue({ data: rows, error: null })
    await expect(listAdminAgentConnections()).resolves.toEqual(rows)
    expect(mocks.schema).toHaveBeenCalledWith('shared')
    expect(mocks.rpc).toHaveBeenCalledWith('admin_list_agent_connections')
    expect(mocks.rpc.mock.calls[0]).toHaveLength(1)
  })

  it('adds a client without enabling it or trusting caller-supplied org/adder fields', async () => {
    const uppercaseId = 'A3333333-3333-4333-8333-333333333333'
    await addTrustedAgentClient({ client_id: uppercaseId, display_name: 'Reviewed agent' })
    expect(mocks.from).toHaveBeenCalledWith('trusted_agent_clients')
    expect(mocks.insert).toHaveBeenCalledWith({ client_id: uppercaseId.toLowerCase(), display_name: 'Reviewed agent' })
  })

  it('changes only the selected app trust switch', async () => {
    await setTrustedAgentEnabled(ID_A, false)
    expect(mocks.update).toHaveBeenCalledWith({ enabled: false })
    expect(mocks.eq).toHaveBeenCalledWith('client_id', ID_A)
  })

  it('asks the server to revoke exactly the selected person and client', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null })
    await expect(revokeAdminAgentConnection('person-a', ID_A)).resolves.toBe(true)
    expect(mocks.rpc).toHaveBeenCalledWith('admin_revoke_agent_connection', {
      p_person_id: 'person-a',
      p_client_id: ID_A,
    })
  })

  it('keeps every current-user grant but never trusts Auth client metadata for the name', async () => {
    mocks.listGrants.mockResolvedValue({
      data: [
        { client: { id: ID_A, name: 'untrusted upstream title' }, scopes: ['openid'], granted_at: '2026-09-30T00:00:00Z' },
        { client: { id: ID_B, name: 'unknown app' }, scopes: ['openid'], granted_at: '2026-09-29T00:00:00Z' },
      ],
      error: null,
    })
    mocks.select.mockResolvedValue({
      data: [{ client_id: ID_A, display_name: 'Organization label' }],
      error: null,
    })

    await expect(listOwnAgentConnections()).resolves.toEqual({
      oauthAvailable: true,
      connections: [
        {
          clientId: ID_A,
          displayName: 'Organization label',
          grantedAt: '2026-09-30T00:00:00Z',
          scopes: ['openid'],
        },
        {
          clientId: ID_B,
          displayName: null,
          grantedAt: '2026-09-29T00:00:00Z',
          scopes: ['openid'],
        },
      ],
    })
    expect(mocks.listGrants).toHaveBeenCalledOnce()
    expect(mocks.select).toHaveBeenCalledWith('client_id, display_name')
  })

  it('reports unavailable OAuth management only for Auth feature_disabled 404 responses', async () => {
    mocks.listGrants.mockResolvedValue({ data: null, error: { code: 'feature_disabled', status: 404 } })
    await expect(listOwnAgentConnections()).resolves.toEqual({ oauthAvailable: false, connections: [] })

    mocks.listGrants.mockResolvedValue({ data: null, error: { code: 'not_found', status: 404 } })
    await expect(listOwnAgentConnections()).rejects.toThrow("Couldn't load your connected agents. Try again.")
  })

  it('uses Auth’s current-user revoke method without accepting a user id', async () => {
    await revokeOwnAgentConnection(ID_A)
    expect(mocks.revokeGrant).toHaveBeenCalledWith({ clientId: ID_A })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})
