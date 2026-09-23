import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./branches', () => ({ listActiveBranches: vi.fn() }))
vi.mock('./default-stream', () => ({ fetchDefaultStream: vi.fn() }))
vi.mock('./cafe-opening', () => ({
  getCafeOpeningProcessId: vi.fn(),
  getCafeOpeningTeamId: vi.fn(),
  getTodayOpeningForTeam: vi.fn(),
}))

import { listActiveBranches } from './branches'
import { fetchDefaultStream } from './default-stream'
import { getCafeOpeningProcessId, getCafeOpeningTeamId, getTodayOpeningForTeam } from './cafe-opening'
import { loadHomeCafeDoor } from './home-cafe'

const branchesMock = vi.mocked(listActiveBranches)
const streamMock = vi.mocked(fetchDefaultStream)
const processMock = vi.mocked(getCafeOpeningProcessId)
const openingTeamMock = vi.mocked(getCafeOpeningTeamId)
const openingMock = vi.mocked(getTodayOpeningForTeam)

beforeEach(() => {
  vi.clearAllMocks()
  branchesMock.mockResolvedValue([{ id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' }])
  streamMock.mockResolvedValue({
    branch: { id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' },
    activity: 'bar',
  })
  processMock.mockResolvedValue('process-1')
  openingTeamMock.mockResolvedValue('team-kitchen')
  openingMock.mockResolvedValue({ started: false, runId: null, rollup: null })
})

describe('loadHomeCafeDoor', () => {
  it('uses the canonical branch opening Team when the viewer primary stream is Bar', async () => {
    const result = await loadHomeCafeDoor()

    expect(result?.branchName).toBe('Gordi HQ')
    expect(openingTeamMock).toHaveBeenCalledWith('branch-1')
    expect(openingMock).toHaveBeenCalledWith('process-1', 'team-kitchen')
    expect(openingMock).not.toHaveBeenCalledWith('process-1', 'team-bar')
    expect(streamMock).toHaveBeenCalledWith([{ id: 'branch-1', code: 'gordi_hq', name: 'Gordi HQ' }])
  })

  it('returns an honest empty door when the branch has no canonical opening Team', async () => {
    openingTeamMock.mockResolvedValue(null)

    expect(await loadHomeCafeDoor()).toBeNull()
    expect(openingMock).not.toHaveBeenCalled()
  })

  it('returns an honest empty door when no Café Opening process exists', async () => {
    processMock.mockResolvedValue(null)

    expect(await loadHomeCafeDoor()).toBeNull()
    expect(streamMock).not.toHaveBeenCalled()
    expect(openingMock).not.toHaveBeenCalled()
  })

  it('surfaces a canonical opening Team read failure for Home retry', async () => {
    openingTeamMock.mockRejectedValue(new Error('offline'))

    await expect(loadHomeCafeDoor()).rejects.toThrow(/offline/)
  })
})
