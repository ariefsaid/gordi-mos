import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: { schema: vi.fn() } }))
vi.mock('./branches', () => ({ listActiveBranches: vi.fn() }))
vi.mock('./default-stream', () => ({ fetchDefaultStream: vi.fn() }))
vi.mock('./cafe-opening', () => ({
  getCafeOpeningProcessId: vi.fn(),
  getTodayOpeningForTeam: vi.fn(),
  wibToday: vi.fn(() => '2026-09-09'),
}))

import { supabase } from '@/lib/supabase'
import { listActiveBranches } from './branches'
import { fetchDefaultStream } from './default-stream'
import { getCafeOpeningProcessId, getTodayOpeningForTeam } from './cafe-opening'
import { loadHomeCafeDoor } from './home-cafe'

const schemaMock = vi.mocked(supabase.schema)
const branchesMock = vi.mocked(listActiveBranches)
const streamMock = vi.mocked(fetchDefaultStream)
const processMock = vi.mocked(getCafeOpeningProcessId)
const openingMock = vi.mocked(getTodayOpeningForTeam)

function mockPrimaryTeam(data: unknown = { team_id: 'team-1' }, error: unknown = null) {
  const builder: Record<string, unknown> = {}
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.lte = vi.fn(() => builder)
  builder.is = vi.fn(() => builder)
  builder.limit = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data, error }))
  schemaMock.mockReturnValue({ from: vi.fn(() => builder) } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  branchesMock.mockResolvedValue([{ id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' }])
  streamMock.mockResolvedValue({
    branch: { id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' },
    activity: 'bar',
  })
  processMock.mockResolvedValue('process-1')
  openingMock.mockResolvedValue({ started: false, runId: null, rollup: null })
  mockPrimaryTeam()
})

describe('loadHomeCafeDoor', () => {
  it('resolves the viewer primary stream and reads, but does not start, today’s opening', async () => {
    const result = await loadHomeCafeDoor('person-1')

    expect(result?.branchName).toBe('Gordi HQ')
    expect(openingMock).toHaveBeenCalledWith('process-1', 'team-1')
    expect(streamMock).toHaveBeenCalledWith([{ id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' }])
  })

  it('returns an honest empty door when no Café Opening process exists', async () => {
    processMock.mockResolvedValue(null)

    expect(await loadHomeCafeDoor('person-1')).toBeNull()
    expect(streamMock).not.toHaveBeenCalled()
    expect(openingMock).not.toHaveBeenCalled()
  })

  it('surfaces a primary-membership read failure for Home retry', async () => {
    mockPrimaryTeam(null, { message: 'offline' })

    await expect(loadHomeCafeDoor('person-1')).rejects.toThrow(/offline/)
  })
})
