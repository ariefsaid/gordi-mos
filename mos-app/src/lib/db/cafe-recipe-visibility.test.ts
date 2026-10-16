import { beforeEach, describe, expect, it, vi } from 'vitest'

import { supabase } from '@/lib/supabase'
import { listRecipeVisibility, setRecipeVisibility, type RecipeVisibility } from './cafe-recipe-visibility'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))

const schemaMock = vi.mocked(supabase.schema)
const row: RecipeVisibility = {
  recipe_key: 'TEST:4', hidden: true, row_version: 2,
  updated_at: '2026-10-16T09:00:00Z', updated_by: 'person-1',
}

beforeEach(() => vi.clearAllMocks())

describe('recipe visibility data contract', () => {
  it('reads every visibility row through the org-scoped list RPC', async () => {
    const pages = [
      Array.from({ length: 500 }, (_, index) => ({ ...row, recipe_key: `TEST:${index}` })),
      [{ ...row, recipe_key: 'TEST:500' }],
    ]
    const ranges: number[][] = []
    let page = 0
    const query: Record<string, unknown> = {}
    query.order = vi.fn(() => query)
    query.range = vi.fn((from: number, to: number) => {
      ranges.push([from, to])
      return Promise.resolve({ data: pages[page++], error: null })
    })
    const rpc = vi.fn(() => query)
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(listRecipeVisibility()).resolves.toHaveLength(501)
    expect(schemaMock).toHaveBeenCalledWith('ops')
    expect(rpc).toHaveBeenCalledWith('list_recipe_visibility')
    expect(ranges).toEqual([[0, 499], [500, 999]])
  })

  it('saves a visibility change with the expected version and retry key', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(setRecipeVisibility('TEST:4', true, 1, {
      client_request_id: 'request-1',
    })).resolves.toEqual(row)
    expect(rpc).toHaveBeenCalledWith('set_recipe_visibility', {
      p_recipe_key: 'TEST:4', p_hidden: true, p_expected_version: 1,
      p_client_request_id: 'request-1',
    })
  })

  it.each([
    ['42501', 'FORBIDDEN'],
    ['22023', 'INVALID'],
    ['P0019', 'CONFLICT'],
  ] as const)('maps database error %s to the typed %s contract error', async (code, expected) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: 'request refused' } })
    schemaMock.mockReturnValue({ rpc } as never)

    await expect(setRecipeVisibility('TEST:4', true, 1, {
      client_request_id: 'request-2',
    })).rejects.toMatchObject({ code: expected })
  })
})
