import { describe, it, expect } from 'vitest'
import { clampPopoverOffset } from './clamp-popover-offset'

// #577: the 8-family category menu (and any other `left: 0`-anchored popover) hard-clipped
// mid-word when its anchor sat near the viewport's right edge — a right-column feed row. This
// pins the clamp math against a stubbed viewport width, independent of real layout.
describe('clampPopoverOffset', () => {
  it('leaves an offset of 0 when the popover already fits (the common case)', () => {
    expect(clampPopoverOffset({ anchorLeft: 20, popoverWidth: 200, viewportWidth: 1280 })).toBe(0)
  })

  it('shifts the popover left just enough to clear the right edge', () => {
    // Anchor at 1150 + 200px popover = 1350 right edge, past the 1280px viewport; the max
    // left that keeps an 8px margin is 1280 - 200 - 8 = 1072, so it shifts by 1072 - 1150 = -78.
    const offset = clampPopoverOffset({ anchorLeft: 1150, popoverWidth: 200, viewportWidth: 1280 })
    expect(offset).toBe(-78)
    // The resulting absolute left stays fully on-screen: right edge <= viewportWidth - margin.
    const resultingLeft = 1150 + offset
    expect(resultingLeft + 200).toBeLessThanOrEqual(1280 - 8)
  })

  it('never pushes the popover past the left edge on a viewport narrower than the popover', () => {
    const offset = clampPopoverOffset({ anchorLeft: 300, popoverWidth: 400, viewportWidth: 375 })
    const resultingLeft = 300 + offset
    expect(resultingLeft).toBe(8) // clamped to the margin, not shoved negative
  })

  it('respects a custom margin', () => {
    const offset = clampPopoverOffset({ anchorLeft: 300, popoverWidth: 200, viewportWidth: 400, margin: 20 })
    const resultingLeft = 300 + offset
    expect(resultingLeft + 200).toBe(400 - 20)
  })
})
