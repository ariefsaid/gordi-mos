// streamKey — the (branch, activity) compound index (#197/#198, OD-WAY-28). Added
// alongside movementKey so maps that must distinguish rows across streams (the review
// queue's per-row plan lookup) have a stable, collision-safe key.

import { describe, it, expect } from 'vitest'
import {
  counterpartActivity,
  isIntraBranch,
  movementsForStream,
  streamProduces,
  streamKey,
  PRODUCE,
} from './kitchen-action-label'
import type { BranchOption, ProductionStream } from './db/kitchen-logs.types'

describe('streamKey', () => {
  it('joins branchId and activity with a separator', () => {
    expect(streamKey('branch-1', 'kitchen')).toBe('branch-1|kitchen')
  })

  it('produces distinct keys for the same branch across activities', () => {
    expect(streamKey('branch-1', 'kitchen')).not.toBe(streamKey('branch-1', 'bar'))
  })

  it('produces distinct keys for different branches with the same activity', () => {
    expect(streamKey('branch-1', 'kitchen')).not.toBe(streamKey('branch-2', 'kitchen'))
  })
})

// ── FR-013 (#235): the two movement classes come out of one derivation ─────────
const RRS: BranchOption = { id: 'b-rrs', code: 'rumah_rames', name: 'Rumah Rames' }
const RADIANT: BranchOption = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const GHQ: BranchOption = { id: 'b-ghq', code: 'gordi_hq', name: 'Gordi HQ' }
const CIKAL: BranchOption = { id: 'b-cikal', code: 'cikal', name: 'Cikal' }
const RRS_BAR: ProductionStream = { branch: RRS, activity: 'bar' }
const RRS_KITCHEN: ProductionStream = { branch: RRS, activity: 'kitchen' }
const GHQ_BAR: ProductionStream = { branch: GHQ, activity: 'bar' }
const GHQ_KITCHEN: ProductionStream = { branch: GHQ, activity: 'kitchen' }
const RADIANT_BAR: ProductionStream = { branch: RADIANT, activity: 'bar' }
const RADIANT_KITCHEN: ProductionStream = { branch: RADIANT, activity: 'kitchen' }
const CIKAL_BAR: ProductionStream = { branch: CIKAL, activity: 'bar' }
const STREAMS = [
  { ...GHQ_KITCHEN, produces: true },
  { ...GHQ_BAR, produces: true },
  { ...RRS_KITCHEN, produces: true },
  { ...RRS_BAR, produces: true },
  { ...RADIANT_KITCHEN, produces: false },
  { ...RADIANT_BAR, produces: true },
  { ...CIKAL_BAR, produces: true },
]

describe('movementsForStream', () => {
  it('AC-001/002: the catalog makes Radiant kitchen receive-only', () => {
    expect(streamProduces(RADIANT_KITCHEN, STREAMS)).toBe(false)
    expect(movementsForStream(RADIANT_KITCHEN, STREAMS)).toEqual([])
  })

  it('AC-006: derives every producing stream\'s matrix from the live stream catalog', () => {
    expect(movementsForStream(GHQ_KITCHEN, STREAMS)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: RRS.id },
      { action: 'transfer', destinationBranchId: RADIANT.id },
      { action: 'transfer', destinationBranchId: CIKAL.id },
    ])
    expect(movementsForStream(RRS_KITCHEN, STREAMS)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: GHQ.id },
      { action: 'transfer', destinationBranchId: RADIANT.id },
      { action: 'transfer', destinationBranchId: CIKAL.id },
    ])
    expect(movementsForStream(GHQ_BAR, STREAMS)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: GHQ.id }, // held intra-branch movement
      { action: 'transfer', destinationBranchId: RRS.id },
      { action: 'transfer', destinationBranchId: RADIANT.id },
      { action: 'transfer', destinationBranchId: CIKAL.id },
    ])
    expect(movementsForStream(RRS_BAR, STREAMS)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: GHQ.id },
      { action: 'transfer', destinationBranchId: RRS.id }, // held intra-branch movement
      { action: 'transfer', destinationBranchId: RADIANT.id },
      { action: 'transfer', destinationBranchId: CIKAL.id },
    ])
    expect(movementsForStream(RADIANT_BAR, STREAMS)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: GHQ.id },
      { action: 'transfer', destinationBranchId: RRS.id },
      { action: 'transfer', destinationBranchId: RADIANT.id }, // held intra-branch movement
      { action: 'transfer', destinationBranchId: CIKAL.id },
    ])
    expect(movementsForStream(CIKAL_BAR, STREAMS)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: GHQ.id },
      { action: 'transfer', destinationBranchId: RRS.id },
      { action: 'transfer', destinationBranchId: RADIANT.id },
    ])
  })

  it('AC-063: never offers a non-catalog branch as a destination', () => {
    expect(movementsForStream(GHQ_BAR, STREAMS)).not.toContainEqual({
      action: 'transfer', destinationBranchId: 'roastery',
    })
  })
})

describe('isIntraBranch', () => {
  it('is true for a transfer to the origin branch, from EITHER activity surface', () => {
    const own = { action: 'transfer' as const, destinationBranchId: RRS.id }
    expect(isIntraBranch(own, RRS_BAR)).toBe(true)
    expect(isIntraBranch(own, RRS_KITCHEN)).toBe(true)
  })

  it('is false for a transfer to another branch, and for a produce', () => {
    expect(isIntraBranch({ action: 'transfer', destinationBranchId: RADIANT.id }, RRS_BAR)).toBe(false)
    expect(isIntraBranch(PRODUCE, RRS_BAR)).toBe(false)
  })

  it('is false with no resolved origin stream — nothing is intra-branch yet (FR-002)', () => {
    expect(isIntraBranch({ action: 'transfer', destinationBranchId: RRS.id }, null)).toBe(false)
  })
})

describe('counterpartActivity', () => {
  it('names the other activity of the same branch', () => {
    expect(counterpartActivity('bar')).toBe('kitchen')
    expect(counterpartActivity('kitchen')).toBe('bar')
  })
})
