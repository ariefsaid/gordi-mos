// streamKey — the (branch, activity) compound index (#197/#198, OD-WAY-28). Added
// alongside movementKey so maps that must distinguish rows across streams (the review
// queue's per-row plan lookup) have a stable, collision-safe key.

import { describe, it, expect } from 'vitest'
import {
  counterpartActivity,
  isIntraBranch,
  movementsForStream,
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
const BRANCHES = [RRS, RADIANT]
const RRS_BAR: ProductionStream = { branch: RRS, activity: 'bar' }
const RRS_KITCHEN: ProductionStream = { branch: RRS, activity: 'kitchen' }
const STREAMS = [RRS_KITCHEN, RRS_BAR]
const CIKAL: BranchOption = { id: 'b-cikal', code: 'cikal', name: 'Cikal' }

describe('movementsForStream', () => {
  it('AC-063: never offers Roastery as a Café movement destination', () => {
    expect(movementsForStream(
      [...BRANCHES, { id: 'roastery', code: 'roastery', name: 'Gordi Roastery' }],
      STREAMS,
    )).not.toContainEqual({
      action: 'transfer',
      destinationBranchId: 'roastery',
    })
  })
  it('derives destinations from stream Teams, not branch codes', () => {
    expect(movementsForStream([...BRANCHES, CIKAL], STREAMS)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: RRS.id },
    ])
  })

  it('offers a produce plus a transfer to EVERY stream branch — the origin branch included', () => {
    // The origin's own branch is not filtered out, and must not be: it is the intra-branch
    // cross-activity movement, and dropping it would remove the movement #235 exists to
    // capture rather than tidying the list.
    expect(movementsForStream(BRANCHES, STREAMS)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: RRS.id },
    ])
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
