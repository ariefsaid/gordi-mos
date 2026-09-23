import { describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import { getWorkWriteScopes } from './work-authority'

const schemaMock = vi.mocked(supabase.schema)

function mockRpc(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  schemaMock.mockReturnValue({ rpc } as never)
  return rpc
}

describe('getWorkWriteScopes', () => {
  it('reads the effective Work write scopes from the runtime RPC', async () => {
    const rpc = mockRpc({
      workline_org: true,
      objective_org: false,
      workline_bu_ids: ['bu-1'],
      objective_bu_ids: ['bu-2'],
    })

    await expect(getWorkWriteScopes()).resolves.toEqual({
      workline_org: true,
      objective_org: false,
      workline_bu_ids: ['bu-1'],
      objective_bu_ids: ['bu-2'],
    })
    expect(rpc).toHaveBeenCalledWith('get_work_write_scopes')
  })

  it('fails closed for malformed RPC payloads without inventing authority', async () => {
    mockRpc({ workline_org: 'yes', workline_bu_ids: ['bu-1', 42] })

    await expect(getWorkWriteScopes()).resolves.toEqual({
      workline_org: false,
      objective_org: false,
      workline_bu_ids: ['bu-1'],
      objective_bu_ids: [],
    })
  })

  it('propagates RPC errors so callers can keep the record read independent', async () => {
    mockRpc(null, { message: 'authority unavailable' })

    await expect(getWorkWriteScopes()).rejects.toThrow('authority unavailable')
  })
})
