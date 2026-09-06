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
const RRS_BAR: ProductionStream = { branch: RRS, activity: 'bar', produces: true }
const RRS_KITCHEN: ProductionStream = { branch: RRS, activity: 'kitchen', produces: true }
const RADIANT_KITCHEN: ProductionStream = { branch: RADIANT, activity: 'kitchen', produces: false }
const GHQ: BranchOption = { id: 'b-ghq', code: 'gordi_hq', name: 'Gordi HQ' }
const CIKAL: BranchOption = { id: 'b-cikal', code: 'cikal', name: 'Cikal' }
const GHQ_KITCHEN: ProductionStream = { branch: GHQ, activity: 'kitchen', produces: true }
const GHQ_BAR: ProductionStream = { branch: GHQ, activity: 'bar', produces: true }
const CIKAL_BAR: ProductionStream = { branch: CIKAL, activity: 'bar', produces: true }
const STREAM_CATALOG: ProductionStream[] = [
  GHQ_KITCHEN, GHQ_BAR, RRS_KITCHEN, RRS_BAR,
  RADIANT_KITCHEN, { branch: RADIANT, activity: 'bar', produces: true }, CIKAL_BAR,
]

describe('movementsForStream', () => {
  it('derives produce plus allowed destinations from the origin and catalog', () => {
    expect(movementsForStream(RRS_KITCHEN, STREAM_CATALOG)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: GHQ.id },
      { action: 'transfer', destinationBranchId: RADIANT.id },
      { action: 'transfer', destinationBranchId: CIKAL.id },
    ])
  })

  it('returns no movements for a receive-only kitchen', () => {
    expect(movementsForStream(RADIANT_KITCHEN, STREAM_CATALOG)).toEqual([])
  })

  it('matches the seeded seven-stream destination matrix', () => {
    const expected: Record<string, string[]> = {
      'gordi_hq|kitchen': [RRS.id, RADIANT.id, CIKAL.id],
      'rumah_rames|kitchen': [GHQ.id, RADIANT.id, CIKAL.id],
      'radiant|kitchen': [],
      'gordi_hq|bar': [GHQ.id, RRS.id, RADIANT.id, CIKAL.id],
      'rumah_rames|bar': [GHQ.id, RRS.id, RADIANT.id, CIKAL.id],
      'radiant|bar': [GHQ.id, RRS.id, RADIANT.id, CIKAL.id],
      'cikal|bar': [GHQ.id, RRS.id, RADIANT.id],
    }
    for (const stream of STREAM_CATALOG) {
      expect(movementsForStream(stream, STREAM_CATALOG).map(m => m.destinationBranchId).filter(Boolean))
        .toEqual(expected[`${stream.branch.code}|${stream.activity}`])
    }
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
