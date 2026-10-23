import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCafeStreamLocationDefaults, listCafeLocations, type CafeLocation } from '@/lib/db/cafe-locations'
import { readCafeLocationChoices, useCafeLocationChoices } from './use-cafe-location-choices'

vi.mock('@/lib/db/cafe-locations', () => ({ listCafeLocations: vi.fn(), getCafeStreamLocationDefaults: vi.fn() }))

const stream = { branch: { id: 'branch', code: 'branch', name: 'Branch' }, activity: 'kitchen' as const, produces: true }
const locations: CafeLocation[] = [{ id: 'kitchen', name: 'Kitchen', use: 'both', branch_ids: ['branch'], archived_at: null, parent_id: null, row_version: 1, updated_at: '', updated_by: null, site_id: null, activities: [] }]
const defaults = { production_location_id: 'kitchen', storage_location_id: 'kitchen', row_version: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCafeLocations).mockResolvedValue(locations)
  vi.mocked(getCafeStreamLocationDefaults).mockResolvedValue(defaults)
})

describe('location choices for capture restoration', () => {
  it('reads the same active branch places and exact stream defaults used by the mounted fields', async () => {
    expect(await readCafeLocationChoices({ branch_id: 'branch', activity: 'kitchen' })).toEqual({ locations, defaults })
    expect(listCafeLocations).toHaveBeenCalledWith({ branch_id: 'branch', archived: false })
    expect(getCafeStreamLocationDefaults).toHaveBeenCalledWith({ branch_id: 'branch', activity: 'kitchen' })
  })

  it('does not read or invent places without a resolved stream', async () => {
    expect(await readCafeLocationChoices(null)).toEqual({ locations: [], defaults: null })
    expect(listCafeLocations).not.toHaveBeenCalled()
  })

  it('reports a failed read, clears unavailable choices, and supports retry', async () => {
    vi.mocked(listCafeLocations).mockRejectedValueOnce(new Error('offline'))
    const { result } = renderHook(() => useCafeLocationChoices(stream))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.locations).toEqual([])
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current).toMatchObject({ locations, defaults })
  })

  it('drops the previous branch choices when the stream is cleared', async () => {
    const { result, rerender } = renderHook(({ selected }) => useCafeLocationChoices(selected), { initialProps: { selected: stream as typeof stream | null } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ selected: null })
    expect(result.current).toMatchObject({ status: 'idle', locations: [], defaults: null })
  })
})
