import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '@/lib/supabase'
import { askBranchLead, listUncoveredCafeItems } from './money-branch'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
const schemaMock = vi.mocked(supabase.schema)

beforeEach(() => vi.clearAllMocks())

describe('askBranchLead', () => {
  it('sends only the view (code, period, day), the app base URL and the locale — no figure, no free text', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'task-1', error: null })
    schemaMock.mockReturnValue({ rpc } as never)
    await expect(askBranchLead({ code: 'GHQ', period: 7, day: '2026-10-05', locale: 'en' }))
      .resolves.toEqual({ kind: 'created', taskId: 'task-1' })
    expect(schemaMock).toHaveBeenCalledWith('mos')
    const [name, args] = rpc.mock.calls[0]
    expect(name).toBe('ask_branch_lead')
    expect(Object.keys(args).sort()).toEqual(['p_app_url', 'p_branch_code', 'p_day', 'p_locale', 'p_period'])
    expect(args).toMatchObject({ p_branch_code: 'GHQ', p_period: 7, p_day: '2026-10-05', p_locale: 'en' })
    expect(args.p_app_url).toMatch(/^https?:\/\/[^/?#\s]+(\/[^?#\s]*)?$/)
    expect(args.p_app_url.endsWith('/')).toBe(false)
  })

  it('a branch with nobody to ask is an answer, not a failure', async () => {
    schemaMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'P0002', message: 'the branch has no Team lead' } }) } as never)
    await expect(askBranchLead({ code: 'GHQ', period: 7, day: '2026-10-05', locale: 'id' })).resolves.toEqual({ kind: 'no-lead' })
  })

  it('any other refusal throws', async () => {
    schemaMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'nope' } }) } as never)
    await expect(askBranchLead({ code: 'GHQ', period: 7, day: '2026-10-05', locale: 'en' })).rejects.toThrow('askBranchLead failed')
  })
})

describe('listUncoveredCafeItems', () => {
  it('reads the branch\'s active prep items without a recipe, one row per item with its streams', async () => {
    const calls: [string, unknown][] = []
    const builder: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) builder[m] = vi.fn((...a: unknown[]) => { calls.push([m, a]); return builder })
    builder.order = vi.fn().mockResolvedValue({
      data: [
        { item_id: 'i1', name: 'Cold brew base', activity: 'bar' },
        { item_id: 'i1', name: 'Cold brew base', activity: 'kitchen' },
        { item_id: 'i2', name: 'Sambal', activity: 'kitchen' },
      ],
      error: null,
    })
    schemaMock.mockReturnValue({ from: vi.fn(() => builder) } as never)
    await expect(listUncoveredCafeItems('b-1')).resolves.toEqual([
      { id: 'i1', name: 'Cold brew base', activities: ['kitchen', 'bar'] },
      { id: 'i2', name: 'Sambal', activities: ['kitchen'] },
    ])
    expect(calls.filter(([m]) => m === 'eq').map(([, a]) => a)).toEqual([
      ['branch_id', 'b-1'], ['kind', 'WIP'], ['has_active_bom_output', false], ['is_active', true],
    ])
  })
})
