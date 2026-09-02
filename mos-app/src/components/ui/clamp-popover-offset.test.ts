import { describe, it, expect } from 'vitest'
import { clampPopoverGeometry } from './clamp-popover-offset'

// #621: consolidates the three hand-rolled viewport clamps (help tip, admin ⋯ menu, signal
// category picker) onto this one pure helper. Pinned against stubbed viewports, independent of
// real layout.
describe('clampPopoverGeometry', () => {
  it('leaves left untouched and width unclamped when the popover already fits (the common case)', () => {
    expect(clampPopoverGeometry({ anchorLeft: 20, popoverWidth: 200, viewportWidth: 1280 })).toEqual({
      left: 20,
      maxWidth: 200,
    })
  })

  it('shifts left just enough to clear the right edge (right overflow)', () => {
    // Anchor at 1150 + 200px popover = 1350 right edge, past the 1280px viewport; the max left
    // that keeps an 8px margin is 1280 - 200 - 8 = 1072.
    const { left, maxWidth } = clampPopoverGeometry({ anchorLeft: 1150, popoverWidth: 200, viewportWidth: 1280 })
    expect(left).toBe(1072)
    expect(maxWidth).toBe(200)
    expect(left + maxWidth).toBeLessThanOrEqual(1280 - 8)
  })

  it('floors left at the margin rather than going negative (left overflow)', () => {
    const { left } = clampPopoverGeometry({ anchorLeft: -50, popoverWidth: 200, viewportWidth: 1280 })
    expect(left).toBe(8)
  })

  it('shrinks maxWidth and still keeps the popover on-screen when it is wider than the viewport', () => {
    // A 400px popover cannot fit a 375px viewport even with zero left offset; maxWidth shrinks to
    // 375 - 8*2 = 359, and left floors at the margin.
    const { left, maxWidth } = clampPopoverGeometry({ anchorLeft: 300, popoverWidth: 400, viewportWidth: 375 })
    expect(maxWidth).toBe(359)
    expect(left).toBe(8)
    expect(left + maxWidth).toBeLessThanOrEqual(375 - 8)
  })

  it('respects a custom margin on both the left floor and the right/width bound', () => {
    const { left, maxWidth } = clampPopoverGeometry({
      anchorLeft: 300,
      popoverWidth: 200,
      viewportWidth: 400,
      margin: 20,
    })
    expect(maxWidth).toBe(200)
    expect(left + maxWidth).toBe(400 - 20)
  })
})
