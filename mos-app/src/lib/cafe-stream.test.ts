// The Café module's remembered stream (#440) — the thing that makes Log · Plan · Stock ·
// Review agree about which books the person is in.
//
// The defect this encodes: each surface used to resolve a stream for itself, so picking one on
// Log and walking to Plan silently changed books. These tests are about the WALK, not about
// storage: what a surface resolves, in what order, and what it leaves behind for the next one.

import { describe, it, expect, beforeEach } from 'vitest'
import { rememberStream, rememberedStreamKey, resolveCafeStream } from './cafe-stream'
import type { ProductionStream } from '@/lib/db/kitchen-logs.types'

const RR = { id: 'b-rr', code: 'rumah_rames', name: 'Rumah Rames' }
const RAD = { id: 'b-rad', code: 'radiant', name: 'Radiant' }
const RR_KITCHEN: ProductionStream = { branch: RR, activity: 'kitchen' }
const RAD_BAR: ProductionStream = { branch: RAD, activity: 'bar' }
const CATALOG: ProductionStream[] = [RR_KITCHEN, { branch: RR, activity: 'bar' }, RAD_BAR]

beforeEach(() => {
  window.sessionStorage.clear()
  rememberStream(null)
})

describe('cafe-stream — the OD-CAFE-6 ladder: home, only team, last used, ask', () => {
  const OTHER_BAR: ProductionStream = { branch: RR, activity: 'bar' }

  it('1. the home stream wins over a stream chosen earlier and over the only-team stream', () => {
    rememberStream(RAD_BAR) // switched on another surface
    expect(resolveCafeStream(CATALOG, RR_KITCHEN, undefined, undefined, OTHER_BAR)).toEqual(RR_KITCHEN)
  })

  it('2. with no home stream, the only Café stream Team wins over a stream chosen earlier', () => {
    rememberStream(RAD_BAR)
    expect(resolveCafeStream(CATALOG, null, undefined, undefined, OTHER_BAR)).toEqual(OTHER_BAR)
  })

  it('3. with neither, the stream last chosen in this session', () => {
    rememberStream(RAD_BAR)
    expect(resolveCafeStream(CATALOG, null)).toEqual(RAD_BAR)
  })

  it('4. with none of them, no default, so the surface asks', () => {
    expect(resolveCafeStream(CATALOG, null)).toBeNull()
    expect(rememberedStreamKey()).toBeNull()
  })

  it('an inferred default is never recorded: only an explicit choice seeds the shared slot', () => {
    expect(resolveCafeStream(CATALOG, RR_KITCHEN)).toEqual(RR_KITCHEN)
    expect(resolveCafeStream(CATALOG, null, undefined, undefined, OTHER_BAR)).toEqual(OTHER_BAR)
    expect(rememberedStreamKey()).toBeNull()
  })

  it('survives a reload: the choice is persisted, not held in a component', () => {
    rememberStream(RAD_BAR)
    expect(window.sessionStorage.getItem('mos.cafe.stream')).toBe(`${RAD.id}|bar`)
    expect(rememberedStreamKey()).toBe(`${RAD.id}|bar`)
  })

  it('FR-002: no remembered stream and no own stream → no default, so the surface must ask', () => {
    expect(resolveCafeStream(CATALOG, null)).toBeNull()
    expect(rememberedStreamKey()).toBeNull()
  })

  it('a remembered stream that has left the catalog is ignored, never resolved', () => {
    // The Radiant bar Team was archived: the pair is no longer a stream. A surface that kept
    // reading it would be reading books that no longer exist.
    rememberStream(RAD_BAR)
    const shrunk = [RR_KITCHEN]
    expect(resolveCafeStream(shrunk, null)).toBeNull()
    expect(resolveCafeStream(shrunk, RR_KITCHEN)).toEqual(RR_KITCHEN)
  })

  it('an own stream outside the live catalog resolves to "choose", never to a guess', () => {
    const stale: ProductionStream = { branch: { id: 'b-gone', code: 'gone', name: 'Gone' }, activity: 'bar' }
    expect(resolveCafeStream(CATALOG, stale)).toBeNull()
  })

  it('does not reuse a remembered stream across authenticated identities', () => {
    rememberStream(RAD_BAR, 'person-a')

    expect(resolveCafeStream(CATALOG, null, 'person-b')).toBeNull()
    expect(resolveCafeStream(CATALOG, null, 'person-a')).toEqual(RAD_BAR)
    expect(rememberedStreamKey('person-b')).toBeNull()
  })

  it('keeps the legacy no-identity reset able to clear all scoped slots', () => {
    rememberStream(RAD_BAR, 'person-a')
    rememberStream(RR_KITCHEN, 'person-b')

    rememberStream(null)

    expect(rememberedStreamKey('person-a')).toBeNull()
    expect(rememberedStreamKey('person-b')).toBeNull()
    expect(window.sessionStorage.getItem('mos.cafe.stream.person-a')).toBeNull()
  })

  it('does not adopt a persisted legacy slot for an identified viewer', () => {
    window.sessionStorage.setItem('mos.cafe.stream', `${RAD.id}|bar`)

    expect(resolveCafeStream(CATALOG, null, 'person-b')).toBeNull()
  })
})

// ── OD-CAFE-1: the memory is scoped by LOCATION as well as identity ──────────────────────────
// A stream belongs to one branch's books, so "the stream I am working in" is only meaningful
// beside where I am working. One shared slot let a choice made on Stock at one branch be read by
// Log at another, which then had to reject it and blame the reader for a choice made elsewhere.
describe('a remembered stream belongs to the location it was chosen at', () => {
  const VIEWER = 'person-1'

  it('does not leak a choice made at one branch into another branch', () => {
    rememberStream(RAD_BAR, VIEWER, RAD.id)

    expect(rememberedStreamKey(VIEWER, RAD.id)).toBe(`${RAD.id}|bar`)
    // Standing at Rumah Rames, that choice is simply not this location's business.
    expect(rememberedStreamKey(VIEWER, RR.id)).toBeNull()
  })

  it('still gives every surface AT THE SAME location one stream (#440 intact)', () => {
    rememberStream(RAD_BAR, VIEWER, RAD.id)
    // Plan, mounting later at the same location with the same catalog, follows the choice.
    expect(resolveCafeStream([RAD_BAR], null, VIEWER, RAD.id)).toEqual(RAD_BAR)
  })

  it('falls through to the person’s own stream rather than a foreign one', () => {
    rememberStream(RAD_BAR, VIEWER, RAD.id)
    // At Rumah Rames the catalog is this location's only, so the Radiant memory cannot resolve.
    const atRumahRames = resolveCafeStream([RR_KITCHEN], RR_KITCHEN, VIEWER, RR.id)
    expect(atRumahRames).toEqual(RR_KITCHEN)
  })

  it('resolves to null rather than guessing when the location has no stream for this person', () => {
    rememberStream(RAD_BAR, VIEWER, RAD.id)
    // No own-stream at this location either: ask, never substitute another branch's books.
    expect(resolveCafeStream([RR_KITCHEN], RAD_BAR, VIEWER, RR.id)).toBeNull()
  })

  it('keeps identity scoping on top of location scoping', () => {
    rememberStream(RAD_BAR, VIEWER, RAD.id)
    expect(rememberedStreamKey('person-2', RAD.id)).toBeNull()
  })
})
