import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.unmock('@/lib/cafe-visit-cache')

const reads = vi.hoisted(() => ({ locations: vi.fn(), destinations: vi.fn(), sites: vi.fn() }))
vi.mock('@/lib/db/cafe-locations', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/db/cafe-locations')>()),
  listCafeLocations: reads.locations, listCafeDestinationLocations: reads.destinations, listCafeSites: reads.sites,
}))

import { clearCafeVisitCache, getCafeDestinationLocations, getCafeLocations } from './cafe-visit-cache'

beforeEach(() => {
  vi.clearAllMocks()
  clearCafeVisitCache()
  reads.locations.mockResolvedValue([])
  reads.destinations.mockResolvedValue([])
})

describe('Café visit cache', () => {
  it('reads Locations once for every page of the visit, and again after an admin change clears it', async () => {
    await Promise.all([getCafeLocations('p1'), getCafeLocations('p1')])
    await getCafeLocations('p1')
    expect(reads.locations).toHaveBeenCalledTimes(1)
    clearCafeVisitCache()
    await getCafeLocations('p1')
    expect(reads.locations).toHaveBeenCalledTimes(2)
  })

  it('never serves one person\'s reads to the next', async () => {
    await getCafeLocations('p1')
    await getCafeLocations('p2')
    expect(reads.locations).toHaveBeenCalledTimes(2)
  })

  it('keeps destinations per origin Location and does not keep a failed read', async () => {
    await getCafeDestinationLocations('p1', 'a')
    await getCafeDestinationLocations('p1', 'a')
    await getCafeDestinationLocations('p1', 'b')
    expect(reads.destinations).toHaveBeenCalledTimes(2)
    reads.destinations.mockRejectedValueOnce(new Error('offline'))
    await expect(getCafeDestinationLocations('p1', 'c')).rejects.toThrow()
    await getCafeDestinationLocations('p1', 'c')
    expect(reads.destinations).toHaveBeenCalledTimes(4)
  })
})
