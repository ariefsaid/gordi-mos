import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.unmock('@/lib/cafe-visit-cache')

const reads = vi.hoisted(() => ({ locations: vi.fn() }))
vi.mock('@/lib/db/cafe-locations', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/db/cafe-locations')>()
  return { ...actual, listCafeLocations: reads.locations }
})

import { clearCafeVisitCache } from './cafe-visit-cache'
import { defaultStorageLocationId, readCafeLocationChoices, useCafeLocationChoices } from './use-cafe-location-choices'

const BRANCH = { id: 'branch-1', code: 'branch', name: 'Branch' }
const STREAM = { branch: BRANCH, activity: 'kitchen' as const }
const LOCATION = {
  id: 'location-1', name: 'Chiller', use: 'storage' as const, parent_id: null, branch_ids: ['branch-1'],
  archived_at: null, row_version: 1, updated_at: '', updated_by: null, site_id: null, activities: [],
}
const ELSEWHERE = { ...LOCATION, id: 'location-2', name: 'Elsewhere', branch_ids: ['branch-2'] }

beforeEach(() => {
  vi.clearAllMocks()
  clearCafeVisitCache()
  reads.locations.mockResolvedValue([LOCATION, ELSEWHERE])
})

describe('useCafeLocationChoices', () => {
  it('offers only the selected branch\'s places, from the visit\'s single read', async () => {
    const { result } = renderHook(() => useCafeLocationChoices(STREAM))
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.locations).toEqual([LOCATION])
    await readCafeLocationChoices(null, 'branch-2')
    expect(reads.locations).toHaveBeenCalledTimes(1)
  })

  it('keeps a failed read unavailable and retries it', async () => {
    reads.locations.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([LOCATION])
    const { result } = renderHook(() => useCafeLocationChoices(STREAM))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.locations).toEqual([])
    result.current.retry()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(reads.locations).toHaveBeenCalledTimes(2)
  })

  it('drops the previous branch choices when the stream is cleared', async () => {
    const { result, rerender } = renderHook(({ selected }) => useCafeLocationChoices(selected), { initialProps: { selected: STREAM as typeof STREAM | null } })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    rerender({ selected: null })
    expect(result.current).toMatchObject({ status: 'idle', locations: [] })
  })
})

describe('defaultStorageLocationId', () => {
  const own = (id: string, extra: Record<string, unknown> = {}) => ({
    ...LOCATION, id, use: 'both' as const, branch_ids: [STREAM.branch.id], activities: [STREAM.activity], ...extra,
  })

  it('starts at the stream\'s own place for its output when it has exactly one that can hold stock', () => {
    expect(defaultStorageLocationId(STREAM, [own('central'), LOCATION])).toBe('central')
  })

  it('uses the designated output place when Central and Outlet Kitchen share the stream', () => {
    expect(defaultStorageLocationId(STREAM, [own('central', { is_stream_output: true }), own('outlet')])).toBe('central')
  })

  it('never guesses between designated places or uses an ineligible designation', () => {
    expect(defaultStorageLocationId(STREAM, [own('a', { is_stream_output: true }), own('b', { is_stream_output: true })])).toBeNull()
    expect(defaultStorageLocationId(STREAM, [own('a'), own('b'), own('archived', { is_stream_output: true, archived_at: '2026-01-01' })])).toBeNull()
    expect(defaultStorageLocationId(STREAM, [own('a'), own('b'), own('bar', { is_stream_output: true, activities: ['bar'] })])).toBeNull()
    expect(defaultStorageLocationId(STREAM, [own('a'), own('b'), own('other', { is_stream_output: true, branch_ids: ['other'] })])).toBeNull()
  })

  it('guesses nothing otherwise: several places, a production-only place, another stream\'s place, or none is Unassigned', () => {
    expect(defaultStorageLocationId(STREAM, [own('a'), own('b')])).toBeNull()
    expect(defaultStorageLocationId(STREAM, [own('p', { use: 'production' })])).toBeNull()
    expect(defaultStorageLocationId(STREAM, [own('bar', { activities: ['bar'] })])).toBeNull()
    expect(defaultStorageLocationId(STREAM, [LOCATION])).toBeNull()
    expect(defaultStorageLocationId(null, [own('central')])).toBeNull()
  })
})
