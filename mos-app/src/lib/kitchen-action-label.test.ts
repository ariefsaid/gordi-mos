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
import { streamCatalogFrom } from './db/kitchen-logs'
import type { BranchOption, ProductionStream, StreamPair } from './db/kitchen-logs.types'

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
// Derived through streamCatalogFrom — the same helper production uses (#777) — rather than
// hand-ordered, so the fixture's order tracks the real catalog: branch-catalog order
// (name-sorted, as listActiveBranches returns it) x PRODUCTION_ACTIVITIES ([kitchen, bar]).
const BRANCHES_NAME_SORTED: BranchOption[] = [CIKAL, GHQ, RADIANT, RRS]
const PAIRS: StreamPair[] = [
  { branch_id: GHQ.id, activity: 'kitchen', produces: true },
  { branch_id: GHQ.id, activity: 'bar', produces: true },
  { branch_id: RRS.id, activity: 'kitchen', produces: true },
  { branch_id: RRS.id, activity: 'bar', produces: true },
  { branch_id: RADIANT.id, activity: 'kitchen', produces: false },
  { branch_id: RADIANT.id, activity: 'bar', produces: true },
  { branch_id: CIKAL.id, activity: 'bar', produces: true },
]
const STREAM_CATALOG: ProductionStream[] = streamCatalogFrom(PAIRS, BRANCHES_NAME_SORTED)

describe('movementsForStream', () => {
  it('derives produce plus allowed destinations from the origin and catalog', () => {
    expect(movementsForStream(RRS_KITCHEN, STREAM_CATALOG)).toEqual([
      PRODUCE,
      { action: 'transfer', destinationBranchId: CIKAL.id },
      { action: 'transfer', destinationBranchId: GHQ.id },
      { action: 'transfer', destinationBranchId: RADIANT.id },
    ])
  })

  it('returns no movements for a receive-only kitchen', () => {
    expect(movementsForStream(RADIANT_KITCHEN, STREAM_CATALOG)).toEqual([])
  })

  // The producer fact is a POSITIVE assertion, not the negation of `=== false` (#777): a
  // stream whose `produces` never arrived (legacy fixture, unmigrated pair, catalog pending)
  // must NOT capture — else `produces === false` would let unknown streams write, which is the
  // opposite of the guard the database holds.
  it('returns no movements for a stream whose produces is absent — unknown is not producing', () => {
    const UNKNOWN: ProductionStream = { branch: RRS, activity: 'kitchen' }
    expect(movementsForStream(UNKNOWN, STREAM_CATALOG)).toEqual([])
  })

  it('matches the seeded seven-stream destination matrix', () => {
    const expected: Record<string, string[]> = {
      'gordi_hq|kitchen': [CIKAL.id, RADIANT.id, RRS.id],
      'rumah_rames|kitchen': [CIKAL.id, GHQ.id, RADIANT.id],
      'radiant|kitchen': [],
      'gordi_hq|bar': [CIKAL.id, GHQ.id, RADIANT.id, RRS.id],
      'rumah_rames|bar': [CIKAL.id, GHQ.id, RADIANT.id, RRS.id],
      'radiant|bar': [CIKAL.id, GHQ.id, RADIANT.id, RRS.id],
      'cikal|bar': [GHQ.id, RADIANT.id, RRS.id],
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
