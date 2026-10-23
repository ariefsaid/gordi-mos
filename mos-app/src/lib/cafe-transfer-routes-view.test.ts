import { describe, expect, it } from 'vitest'
import type { BranchOption, CafeDestination, StreamPair } from '@/lib/db/kitchen-logs.types'
import {
  applyRouteFilters, buildRouteRows, derivedMovements, eligibleDestinations, parseRouteFilters,
} from './cafe-transfer-routes-view'

const b = (id: string, name: string, code = id): BranchOption => ({ id, code, name })
const HQ = b('hq', 'Gordi HQ'), RRS = b('rrs', 'Rumah Rames', 'rumah_rames'), CIKAL = b('cikal', 'Cikal')
const branches = [CIKAL, HQ, RRS]
const pairs: StreamPair[] = [
  { branch_id: 'hq', activity: 'kitchen', produces: true }, { branch_id: 'hq', activity: 'bar', produces: true },
  { branch_id: 'rrs', activity: 'kitchen', produces: true }, { branch_id: 'rrs', activity: 'bar', produces: true },
  { branch_id: 'cikal', activity: 'bar', produces: true },
]
const route = (o: string, a: 'kitchen' | 'bar', d: string): CafeDestination => ({ origin_branch_id: o, origin_activity: a, destination_branch_id: d })
const ctx = { activeBranches: branches, extraBranches: [{ id: 'old', name: 'Old Branch' }], pairs }

describe('route rows', () => {
  it('marks a resolvable kitchen route Configured and names the destination branch', () => {
    const [row] = buildRouteRows([route('hq', 'kitchen', 'rrs')], ctx)
    expect(row.problem).toBeNull()
    expect(row.destinationName).toBe('Rumah Rames')
  })

  it('keeps unresolved and archived references as Needs attention instead of dropping them', () => {
    const rows = buildRouteRows([
      route('hq', 'kitchen', 'old'), route('ghost', 'kitchen', 'hq'), route('hq', 'bar', 'hq'),
      route('hq', 'bar', 'cikal'), route('rrs', 'kitchen', 'cikal'),
    ], ctx)
    expect(rows.map((r) => r.problem)).toEqual(['destinationUnknown', 'originUnknown', 'sameBranch', null, null])
    expect(rows[0].destinationName).toBe('Old Branch')
    expect(rows[1].originBranchName).toBeNull()
  })

  it('needs a destination bar stream for a cross-branch bar route', () => {
    const noBar = { ...ctx, pairs: pairs.filter((p) => !(p.branch_id === 'rrs' && p.activity === 'bar')) }
    expect(buildRouteRows([route('hq', 'bar', 'rrs')], noBar)[0].problem).toBe('noDestinationBar')
  })

  it('flags a route whose origin stream no longer produces', () => {
    const stopped = { ...ctx, pairs: pairs.map((p) => (p.branch_id === 'hq' && p.activity === 'kitchen' ? { ...p, produces: false } : p)) }
    expect(buildRouteRows([route('hq', 'kitchen', 'rrs')], stopped)[0].problem).toBe('originNotProducing')
  })
})

describe('eligible destinations and built-in movements', () => {
  it('offers other branches for a kitchen origin, and only branches with a bar for a bar origin', () => {
    expect(eligibleDestinations({ branch: HQ, activity: 'kitchen' }, branches, pairs).map((x) => x.id)).toEqual(['cikal', 'rrs'])
    const noBar = pairs.filter((p) => !(p.branch_id === 'rrs' && p.activity === 'bar'))
    expect(eligibleDestinations({ branch: HQ, activity: 'bar' }, branches, noBar).map((x) => x.id)).toEqual(['cikal'])
    expect(eligibleDestinations(null, branches, pairs)).toEqual([])
  })

  it('derives bar to kitchen only where both streams exist', () => {
    expect(derivedMovements(pairs, branches).map((r) => r.branchId)).toEqual(['hq', 'rrs'])
  })
})

describe('filters', () => {
  it('filters by origin, destination and search, sorted origin A-Z then destination A-Z', () => {
    const rows = buildRouteRows([route('rrs', 'kitchen', 'hq'), route('hq', 'kitchen', 'rrs'), route('hq', 'kitchen', 'cikal')], ctx)
    const label = (r: { originBranchName: string | null; destinationName: string | null }) => `${r.originBranchName} ${r.destinationName}`
    const base = parseRouteFilters(new URLSearchParams())
    expect(applyRouteFilters(rows, base, label).map((r) => r.key)).toEqual(['hq:kitchen:cikal', 'hq:kitchen:rrs', 'rrs:kitchen:hq'])
    expect(applyRouteFilters(rows, { ...base, dir: 'desc' }, label).map((r) => r.key)).toEqual(['rrs:kitchen:hq', 'hq:kitchen:cikal', 'hq:kitchen:rrs'])
    expect(applyRouteFilters(rows, { ...base, origin: 'hq:kitchen', destination: 'rrs' }, label)).toHaveLength(1)
    expect(applyRouteFilters(rows, { ...base, q: 'cikal' }, label)).toHaveLength(1)
    expect(applyRouteFilters(rows, { ...base, sort: 'destination' }, label).map((r) => r.destinationName)).toEqual(['Cikal', 'Gordi HQ', 'Rumah Rames'])
  })
})
