import { describe, expect, it } from 'vitest'
import { dayAt } from './day-chart-geometry'

describe('dayAt — the day under a click or tap', () => {
  // 68px axis + 4px gutter: a 372px chart leaves a 300px plot, 10 days of 30px each.
  it('maps a position to its day band', () => {
    expect(dayAt(68, 372, 10)).toBe(0)
    expect(dayAt(68 + 29, 372, 10)).toBe(0)
    expect(dayAt(68 + 30, 372, 10)).toBe(1)
    expect(dayAt(367, 372, 10)).toBe(9)
  })
  it('is null on the axis, in the gutter, or with no days', () => {
    expect(dayAt(10, 372, 10)).toBeNull()
    expect(dayAt(369, 372, 10)).toBeNull()
    expect(dayAt(100, 372, 0)).toBeNull()
  })
})
