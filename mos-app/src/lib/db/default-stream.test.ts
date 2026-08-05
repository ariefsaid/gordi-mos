// default-stream.ts data module tests — TDD (AC-tagged).
// Proves (unit, #237): fetchDefaultStream resolves shared.default_stream()'s one row
// against the branch catalog (FR-001), and every empty/unusable shape — no row, NULL
// halves (FR-002), a branch missing from the active catalog, a non-production activity —
// resolves to null (no default) rather than a guessed stream. A transport error THROWS,
// so a caller can tell "no default" from "could not ask".

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  return { supabase: { schema } }
})

import { supabase } from '@/lib/supabase'
import { fetchDefaultStream } from './default-stream'
import type { BranchOption } from './kitchen-logs.types'

const schemaMock = vi.mocked(supabase.schema)

const BRANCH_RR: BranchOption = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const BRANCH_RAD: BranchOption = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const CATALOG = [BRANCH_RR, BRANCH_RAD]

function mockRpc(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  schemaMock.mockReturnValue({ rpc } as never)
  return rpc
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchDefaultStream — shared.default_stream() resolved against the catalog (FR-001/002)', () => {
  it('resolves the (branch, activity) pair through the shared schema RPC', async () => {
    const rpc = mockRpc([{ branch_id: BRANCH_RAD.id, activity: 'bar' }])
    const stream = await fetchDefaultStream(CATALOG)
    expect(schemaMock).toHaveBeenCalledWith('shared')
    expect(rpc).toHaveBeenCalledWith('default_stream')
    expect(stream).toEqual({ branch: BRANCH_RAD, activity: 'bar' })
  })

  it('no row → null (no live primary membership)', async () => {
    mockRpc([])
    expect(await fetchDefaultStream(CATALOG)).toBeNull()
  })

  it('NULL halves → null (primary team is not a stream team — FR-002 shape)', async () => {
    mockRpc([{ branch_id: null, activity: null }])
    expect(await fetchDefaultStream(CATALOG)).toBeNull()
  })

  it('branch not in the active catalog → null (archived branch never becomes a default)', async () => {
    mockRpc([{ branch_id: 'b-gone', activity: 'kitchen' }])
    expect(await fetchDefaultStream(CATALOG)).toBeNull()
  })

  it('activity outside the production set → null', async () => {
    mockRpc([{ branch_id: BRANCH_RR.id, activity: 'roastery' }])
    expect(await fetchDefaultStream(CATALOG)).toBeNull()
  })

  it('RPC error → throws (distinguishable from "no default")', async () => {
    mockRpc(null, { message: 'boom' })
    await expect(fetchDefaultStream(CATALOG)).rejects.toThrow('fetchDefaultStream failed — boom')
  })
})
