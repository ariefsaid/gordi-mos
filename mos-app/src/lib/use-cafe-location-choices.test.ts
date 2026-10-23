import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reads = vi.hoisted(() => ({ locations: vi.fn(), defaults: vi.fn() }))
vi.mock('@/lib/db/cafe-locations', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-locations')>()
  return { ...actual, listCafeLocations: reads.locations, getCafeStreamLocationDefaults: reads.defaults }
})

import { availableCafeLocationDefault, useCafeLocationChoices } from './use-cafe-location-choices'

const STREAM = { branch: { id: 'branch-1', code: 'branch', name: 'Branch' }, activity: 'kitchen' as const }
const LOCATION = {
  id: 'location-1', name: 'Chiller', use: 'storage' as const, parent_id: null, branch_ids: ['branch-1'],
  archived_at: null, row_version: 1, updated_at: '', updated_by: null, site_id: null, activities: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  reads.locations.mockResolvedValue([LOCATION])
  reads.defaults.mockResolvedValue({ production_location_id: null, storage_location_id: 'location-1', row_version: 1 })
})

describe('useCafeLocationChoices', () => {
  it('uses a default only when it is active for the requested physical purpose', () => {
    expect(availableCafeLocationDefault([LOCATION], 'location-1', 'storage')).toBe('location-1')
    expect(availableCafeLocationDefault([LOCATION], 'location-1', 'production')).toBeNull()
    expect(availableCafeLocationDefault([], 'location-1', 'storage')).toBeNull()
  })

  it('loads only the selected branch catalog and its stream convenience defaults', async () => {
    const { result } = renderHook(() => useCafeLocationChoices(STREAM))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(reads.locations).toHaveBeenCalledWith({ branch_id: 'branch-1', archived: false })
    expect(reads.defaults).toHaveBeenCalledWith({ branch_id: 'branch-1', activity: 'kitchen' })
    expect(result.current.locations).toEqual([LOCATION])
    expect(result.current.defaults?.storage_location_id).toBe('location-1')
  })

  it('keeps a failed read unavailable and retries the same stream', async () => {
    reads.locations.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([LOCATION])
    const { result } = renderHook(() => useCafeLocationChoices(STREAM))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.locations).toEqual([])
    result.current.retry()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(reads.locations).toHaveBeenCalledTimes(2)
  })
})
