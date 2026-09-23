import { describe, expect, it } from 'vitest'
import { POPOVER_GAP_PX, shouldFlipUp, shouldPullIn } from './signal-attention-placement'

// Pure flip decision (#768 round 5): the menu opens below the trigger, and flips ABOVE it only
// when opening downward would cross the available bottom edge AND the space above is real. Both
// edges are live geometry: 390×844 composer — pill 710.8…754.8, menu 171 tall → downward bottom
// 929.8, 86px below the fold (the round-4 defect), and 535.8 above the fold going up. The record
// panel is the counter-case: its scroll container starts below the chrome bar (top 648), so a pill
// at 770…814 has no room either way — flipping up would put the menu at 595, clipped out of the
// container and unhittable, while staying down leaves it on a page the reader can scroll.
describe('signal-attention-placement — the flip decision (pure function of trigger rect + clip edges)', () => {
  it('flips when the downward menu would cross the viewport bottom and there is room above (390 composer)', () => {
    expect(shouldFlipUp(710.8, 754.8, 171, 0, 844)).toBe(true)
  })

  it('stays below when the downward menu fits (desktop case)', () => {
    expect(shouldFlipUp(476.8, 520.8, 171, 0, 900)).toBe(false)
  })

  it('stays below when downward overflows but the flip would cross the container TOP (record panel)', () => {
    // Live record geometry: trigger 770…814, menu 171, container clipped to 648…900.
    // Up would land at 595 — 53px above the container's top edge, clipped and unhittable.
    expect(shouldFlipUp(770, 814, 171, 648, 900)).toBe(false)
  })

  it('touching either boundary exactly is not a crossing; half a pixel past it is', () => {
    const fits = 844 - POPOVER_GAP_PX - 171
    expect(shouldFlipUp(fits - 44, fits, 171, 0, 844)).toBe(false)
    expect(shouldFlipUp(fits - 43.5, fits + 0.5, 171, 0, 844)).toBe(true)
    // Exactly enough room above still flips; one pixel less does not.
    const top = POPOVER_GAP_PX + 171
    expect(shouldFlipUp(top, top + 44, 171, 0, 200)).toBe(true)
    expect(shouldFlipUp(top - 1, top + 43, 171, 0, 200)).toBe(false)
  })

  it('a taller menu flips where a shorter one fits, same trigger', () => {
    expect(shouldFlipUp(656, 700, 171, 0, 844)).toBe(true)
    expect(shouldFlipUp(656, 700, 100, 0, 844)).toBe(false)
  })

  it('pulls in when the left-aligned menu would cross the viewport right edge (390: trigger at x=205)', () => {
    expect(shouldPullIn(205, 220, 390)).toBe(true)
    expect(shouldPullIn(205, 220, 433)).toBe(false)
    expect(shouldPullIn(16, 220, 390)).toBe(false)
  })
})
