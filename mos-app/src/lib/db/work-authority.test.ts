import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import { __resetReferenceCacheForTests, invalidateReferenceCache } from './reference-cache'
import { publishReadScope } from '@/lib/scoped-reads'
import { getWorkWriteScopes } from './work-authority'

const schemaMock = vi.mocked(supabase.schema)
const READ_SCOPE = Object.freeze({
  generation: 3,
  authUserId: 'auth-1',
  viewerId: 'viewer-1',
  orgId: 'org-1',
  authorityKey: 'member',
})

beforeEach(() => {
  __resetReferenceCacheForTests()
  publishReadScope({ ...READ_SCOPE })
})
afterEach(() => publishReadScope(null))

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
      objective_content_org: true,
      objective_content_bu_ids: ['bu-3'],
    })

    await expect(getWorkWriteScopes()).resolves.toEqual({
      workline_org: true,
      objective_org: false,
      workline_bu_ids: ['bu-1'],
      objective_bu_ids: ['bu-2'],
      objective_content_org: true,
      objective_content_bu_ids: ['bu-3'],
    })
    expect(rpc).toHaveBeenCalledWith('get_work_write_scopes')
  })

  it('reuses scopes within the viewer session and refetches after authority invalidation', async () => {
    const firstRpc = mockRpc({ workline_org: true })
    await getWorkWriteScopes()

    const nextRpc = mockRpc({ workline_org: false })
    await expect(getWorkWriteScopes()).resolves.toMatchObject({ workline_org: true })
    expect(firstRpc).toHaveBeenCalledOnce()
    expect(nextRpc).not.toHaveBeenCalled()

    invalidateReferenceCache('mos.get_work_write_scopes')
    await expect(getWorkWriteScopes()).resolves.toMatchObject({ workline_org: false })
    expect(nextRpc).toHaveBeenCalledOnce()
  })

  it('does not survive a page load: an admin change elsewhere is read on reload', async () => {
    const firstRpc = mockRpc({ workline_org: false })
    await getWorkWriteScopes()
    __resetReferenceCacheForTests(false)

    const nextRpc = mockRpc({ workline_org: true })
    await expect(getWorkWriteScopes()).resolves.toMatchObject({ workline_org: true })
    expect(firstRpc).toHaveBeenCalledOnce()
    expect(nextRpc).toHaveBeenCalledOnce()
  })

  it('fails closed for malformed RPC payloads without inventing authority', async () => {
    mockRpc({ workline_org: 'yes', workline_bu_ids: ['bu-1', 42] })

    await expect(getWorkWriteScopes()).resolves.toEqual({
      workline_org: false,
      objective_org: false,
      workline_bu_ids: ['bu-1'],
      objective_bu_ids: [],
      objective_content_org: false,
      objective_content_bu_ids: [],
    })
  })

  it('propagates RPC errors so callers can keep the record read independent', async () => {
    mockRpc(null, { message: 'authority unavailable' })

    await expect(getWorkWriteScopes()).rejects.toThrow('authority unavailable')
  })
})
