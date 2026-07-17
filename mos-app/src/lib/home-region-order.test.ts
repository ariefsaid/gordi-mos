// home-region-order.ts tests — TDD (AC-505..506, Step 5 Track P).
// Per-user Home region order (OD-18), v1 stored in localStorage (RATIFY-1).

import { describe, it, expect, beforeEach } from 'vitest'
import { resolveRegionOrder } from './home-region-order'

beforeEach(() => {
  window.localStorage.clear()
})

describe('AC-505: resolveRegionOrder — default with no stored preference', () => {
  it("returns 'attention-first' when nothing is stored for the person", () => {
    expect(resolveRegionOrder('p1')).toBe('attention-first')
  })
})
