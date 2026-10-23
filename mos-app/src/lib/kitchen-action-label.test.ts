// Stream keys, and the movements a production Location offers: Production, then one transfer per
// destination Location the database lists. No branch, activity or place rule lives here.

import { describe, it, expect } from 'vitest'
import {
  deriveActionLabel,
  isIntraBranch,
  movementKey,
  movementsFromDestinations,
  streamLabel,
  streamKey,
  streamOptionKey,
  PRODUCE,
} from './kitchen-action-label'
import type { DestinationLocation } from './db/cafe-locations'
import type { BranchOption, ProductionStream } from './db/kitchen-logs.types'

describe('streamKey', () => {
  it('joins branchId and activity with a separator', () => {
    expect(streamKey('branch-1', 'kitchen')).toBe('branch-1|kitchen')
  })

  it('produces distinct keys for the same branch across activities', () => {
    expect(streamKey('branch-1', 'kitchen')).not.toBe(streamKey('branch-1', 'bar'))
  })
})

const RRS: BranchOption = { id: 'b-rrs', code: 'rumah_rames', name: 'Rumah Rames' }
const RADIANT: BranchOption = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const CIKAL: BranchOption = { id: 'b-cikal', code: 'cikal', name: 'Cikal' }
const RRS_CENTRAL: ProductionStream = {
  branch: RRS, activity: 'kitchen', produces: true,
  location: { id: 'loc-central', name: 'RRS Central', siteName: 'GHQ', holdsStock: true },
}
const place = (id: string, name: string, branch: BranchOption, same: boolean): DestinationLocation =>
  ({ location_id: id, name, branch_id: branch.id, same_branch: same })
// What ops.list_cafe_destination_locations returns for RRS Central: own branch first, then routed branches.
const FROM_RRS_CENTRAL: DestinationLocation[] = [
  place('loc-outlet', 'RRS Outlet', RRS, true),
  place('loc-radiant', 'Radiant', RADIANT, false),
  place('loc-cikal', 'Cikal', CIKAL, false),
]

describe('movementsFromDestinations', () => {
  it('AC-001: a planner at RRS Central gets Production, then RRS Outlet, Radiant and Cikal', () => {
    const moves = movementsFromDestinations(FROM_RRS_CENTRAL)
    expect(moves[0]).toEqual(PRODUCE)
    expect(moves.slice(1).map(move => move.toLocationName)).toEqual(['RRS Outlet', 'Radiant', 'Cikal'])
    expect(moves.slice(1).map(move => move.toLocationId)).toEqual(['loc-outlet', 'loc-radiant', 'loc-cikal'])
  })

  it('AC-005: a new storage Location in a routed branch is a destination with no code change', () => {
    const grown = [...FROM_RRS_CENTRAL, place('loc-fridge', 'Radiant Fridge', RADIANT, false)]
    const names = movementsFromDestinations(grown).map(move => move.toLocationName)
    expect(names).toContain('Radiant Fridge')
    // Two Locations of one branch are two destinations, each with its own key.
    const keys = movementsFromDestinations(grown).map(movementKey)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('offers nothing for a stream that cannot produce, and Production alone with no destinations', () => {
    expect(movementsFromDestinations(FROM_RRS_CENTRAL, false)).toEqual([])
    expect(movementsFromDestinations([])).toEqual([PRODUCE])
  })

  it('lists a Location once even when it appears under several branches', () => {
    const twice = [place('loc-shared', 'Shared Fridge', RRS, true), place('loc-shared', 'Shared Fridge', RADIANT, false)]
    expect(movementsFromDestinations(twice)).toHaveLength(2)
  })
})

describe('movementKey and labels', () => {
  it('keys a transfer by its destination Location, falling back to the branch for older history', () => {
    expect(movementKey({ action: 'transfer', destinationBranchId: 'b-rrs', toLocationId: 'loc-outlet' })).toBe('transfer:loc-outlet')
    expect(movementKey({ action: 'transfer', destinationBranchId: 'b-rrs' })).toBe('transfer:b-rrs')
  })

  it('reads "Transfer to <location name>" with no alias for any branch', () => {
    const t = ((key: string, params?: Record<string, string>) =>
      key === 'kitchen.actionType.transferTo' ? `Transfer to ${params?.branch}` : key) as never
    const [, toOutlet] = movementsFromDestinations(FROM_RRS_CENTRAL)
    expect(deriveActionLabel(t, toOutlet, [RRS])).toBe('Transfer to RRS Outlet')
    expect(deriveActionLabel(t, { action: 'transfer', destinationBranchId: RRS.id }, [RRS])).toBe('Transfer to Rumah Rames')
  })

  it('names the picker entry by the Location and where it physically is', () => {
    const t = ((key: string, params?: Record<string, string>) =>
      key === 'cafe.stream.locationAt' ? `${params?.location} · at ${params?.site}` : key) as never
    expect(streamLabel(t, RRS_CENTRAL)).toBe('RRS Central · at GHQ')
    expect(streamOptionKey(RRS_CENTRAL)).toBe('b-rrs|kitchen|loc-central')
  })
})

describe('isIntraBranch', () => {
  it('is true for a transfer to the origin branch, from either activity', () => {
    const own = { action: 'transfer' as const, destinationBranchId: RRS.id }
    expect(isIntraBranch(own, { branch: RRS, activity: 'bar' })).toBe(true)
    expect(isIntraBranch(own, RRS_CENTRAL)).toBe(true)
  })

  it('is false for another branch, a produce, and an unresolved origin', () => {
    expect(isIntraBranch({ action: 'transfer', destinationBranchId: RADIANT.id }, RRS_CENTRAL)).toBe(false)
    expect(isIntraBranch(PRODUCE, RRS_CENTRAL)).toBe(false)
    expect(isIntraBranch({ action: 'transfer', destinationBranchId: RRS.id }, null)).toBe(false)
  })
})
