import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db/directory', () => ({ getDirectManagerPersonIds: vi.fn(), getPeople: vi.fn() }))

import { getDirectManagerPersonIds, getPeople } from '@/lib/db/directory'
import { resolvePicSupervisor } from './default-supervisor'

const PEOPLE = [{ id: 'manager', full_name: 'Manager' }, { id: 'other', full_name: 'Other' }]

beforeEach(() => {
  vi.mocked(getDirectManagerPersonIds).mockReset().mockResolvedValue(['manager'])
  vi.mocked(getPeople).mockReset().mockResolvedValue(PEOPLE)
})

describe('PIC manager Supervisor default', () => {
  it('uses exactly one active direct manager, not the PIC themself', async () => {
    vi.mocked(getDirectManagerPersonIds).mockResolvedValue(['pic', 'manager', 'manager'])
    vi.mocked(getPeople).mockResolvedValue([{ id: 'pic', full_name: 'Pic' }, { id: 'manager', full_name: 'Manager' }])
    expect(await resolvePicSupervisor('pic', 'retail')).toEqual({ supervisorId: 'manager', status: 'ready' })
  })

  it('does not guess when no unique active manager exists', async () => {
    vi.mocked(getDirectManagerPersonIds).mockResolvedValue([])
    expect((await resolvePicSupervisor('pic', 'retail')).supervisorId).toBeNull()
    vi.mocked(getDirectManagerPersonIds).mockResolvedValue(['manager', 'other'])
    expect((await resolvePicSupervisor('pic', 'retail')).supervisorId).toBeNull()
    vi.mocked(getDirectManagerPersonIds).mockResolvedValue(['manager'])
    vi.mocked(getPeople).mockResolvedValue([{ id: 'pic', full_name: 'Pic' }])
    expect((await resolvePicSupervisor('pic', 'retail')).supervisorId).toBeNull()
  })

  it('resolves only the PIC manager for the Task BU and reports missing or unreadable data', async () => {
    vi.mocked(getDirectManagerPersonIds).mockImplementation(async (_picId, businessUnitId) =>
      businessUnitId === 'retail' ? ['retail-manager'] : ['sales-manager'])
    vi.mocked(getPeople).mockResolvedValue([
      { id: 'retail-manager', full_name: 'Retail manager' },
      { id: 'sales-manager', full_name: 'Sales manager' },
    ])
    expect(await resolvePicSupervisor('pic', 'retail')).toEqual({ supervisorId: 'retail-manager', status: 'ready' })
    expect(getDirectManagerPersonIds).toHaveBeenCalledWith('pic', 'retail')
    vi.mocked(getDirectManagerPersonIds).mockResolvedValue([])
    expect(await resolvePicSupervisor('pic', 'retail')).toEqual({ supervisorId: null, status: 'missing' })
    vi.mocked(getDirectManagerPersonIds).mockRejectedValue(new Error('denied'))
    expect(await resolvePicSupervisor('pic', 'retail')).toEqual({ supervisorId: null, status: 'error' })
  })
})
