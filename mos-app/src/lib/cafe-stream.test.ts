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

beforeEach(() => { rememberStream(null) })

describe('cafe-stream — the module remembers ONE stream', () => {
  it('a surface that resolves a stream leaves it for the next surface', () => {
    // Log opens on the person's own stream…
    expect(resolveCafeStream(CATALOG, RR_KITCHEN)).toEqual(RR_KITCHEN)
    // …and Stock, mounting later with the SAME catalog, opens on it without asking again.
    expect(resolveCafeStream(CATALOG, null)).toEqual(RR_KITCHEN)
  })

  it('a switch outranks the person\'s own default on every later surface', () => {
    rememberStream(RAD_BAR) // the person switched on Log
    expect(resolveCafeStream(CATALOG, RR_KITCHEN)).toEqual(RAD_BAR)
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

  it('a remembered stream that has left the catalog falls back to the own stream, never to itself', () => {
    // The Radiant bar Team was archived: the pair is no longer a stream. A surface that kept
    // reading it would be reading books that no longer exist.
    rememberStream(RAD_BAR)
    const shrunk = [RR_KITCHEN]
    expect(resolveCafeStream(shrunk, RR_KITCHEN)).toEqual(RR_KITCHEN)
    expect(rememberedStreamKey()).toBe(`${RR.id}|kitchen`)
  })

  it('an own stream outside the live catalog resolves to "choose", never to a guess', () => {
    const stale: ProductionStream = { branch: { id: 'b-gone', code: 'gone', name: 'Gone' }, activity: 'bar' }
    expect(resolveCafeStream(CATALOG, stale)).toBeNull()
  })
})
