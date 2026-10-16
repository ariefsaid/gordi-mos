import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { listBranchesByIds } from './branches'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
const schemaMock = vi.mocked(supabase.schema)

beforeEach(() => vi.clearAllMocks())

describe('listBranchesByIds', () => {
  it('returns linked names including archived branches for historical reporting rows', async () => {
    const branch = { id: 'branch-archived', name: 'Old Branch' }
    const query = {
      select: vi.fn(),
      in: vi.fn().mockResolvedValue({ data: [branch], error: null }),
    }
    query.select.mockReturnValue(query as never)
    schemaMock.mockReturnValue({ from: vi.fn(() => query) } as never)

    await expect(listBranchesByIds(['branch-archived'])).resolves.toEqual([branch])
    expect(schemaMock).toHaveBeenCalledWith('shared')
    expect(query.select).toHaveBeenCalledWith('id,name')
    expect(query.in).toHaveBeenCalledWith('id', ['branch-archived'])
  })

  it('does not issue a query when there are no linked branch ids', async () => {
    schemaMock.mockReturnValue({ from: vi.fn() } as never)

    await expect(listBranchesByIds([])).resolves.toEqual([])
    expect(schemaMock).not.toHaveBeenCalled()
  })
})
