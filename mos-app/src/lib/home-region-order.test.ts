// home-region-order.ts tests — TDD (AC-505..506, Step 5 Track P).
// Per-user Home region order (OD-18), v1 stored in localStorage (RATIFY-1).

import { describe, it, expect, beforeEach } from 'vitest'
import { resolveRegionOrder, setRegionOrder } from './home-region-order'

beforeEach(() => {
  window.localStorage.clear()
})

describe('AC-505: resolveRegionOrder — default with no stored preference', () => {
  it("returns 'attention-first' when nothing is stored for the person", () => {
    expect(resolveRegionOrder('p1')).toBe('attention-first')
  })
})

describe('AC-506: setRegionOrder — persists per-user, keyed by person id', () => {
  it("persists 'personal-first' for p1 without affecting p2's default", () => {
    setRegionOrder('p1', 'personal-first')

    expect(resolveRegionOrder('p1')).toBe('personal-first')
    expect(resolveRegionOrder('p2')).toBe('attention-first')
  })
})
