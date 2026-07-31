// DAL tests for the caller's own account operations (#131).
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const rpc = vi.fn()
  const schema = vi.fn(() => ({ rpc }))
  return { supabase: { schema } }
})

import { clearMustChangePassword } from './account'
import { supabase } from '@/lib/supabase'

const schemaMock = vi.mocked(supabase.schema)
function rpcMock() {
  return vi.mocked(schemaMock.mock.results[0].value.rpc as ReturnType<typeof vi.fn>)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('clearMustChangePassword', () => {
  it('calls shared.clear_must_change_password with NO arguments', async () => {
    schemaMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) } as never)

    await clearMustChangePassword()

    expect(schemaMock).toHaveBeenCalledWith('shared')
    // The RPC deliberately takes no person argument — it resolves the caller via auth.uid().
    // A parameter would be a gate-disarming oracle for any authenticated user, so the call site
    // must never grow one.
    expect(rpcMock()).toHaveBeenCalledWith('clear_must_change_password')
  })

  it('throws when the RPC errors, so the caller keeps the gate up (fail-safe)', async () => {
    schemaMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } }),
    } as never)

    await expect(clearMustChangePassword()).rejects.toThrow()
  })
})
