import { describe, expect, it } from 'vitest'
import { besideRecordPlacement } from './use-beside-record-placement'

// Reviewer-measured record geometry: the record's left edge is not viewport − panel token.
describe('besideRecordPlacement — Deputy sits left of the record panel it measured', () => {
  const cases = [
    { viewport: 1920, contentLeft: 232, recordLeft: 1248 },
    { viewport: 2300, contentLeft: 232, recordLeft: 1384 },
    { viewport: 1280, contentLeft: 232, recordLeft: 808 },
  ]
  for (const { viewport, contentLeft, recordLeft } of cases) {
    it(`at ${viewport}px its right edge stays a gap left of the record`, () => {
      const { right, width } = besideRecordPlacement(recordLeft, contentLeft, viewport, 400)
      const deputyRightEdge = viewport - right
      expect(deputyRightEdge).toBe(recordLeft - 12)
      expect(deputyRightEdge - width).toBeGreaterThanOrEqual(contentLeft + 12)
      expect(width).toBeLessThanOrEqual(400)
    })
  }

  it('shrinks to the canvas left of the record rather than overlapping either side', () => {
    expect(besideRecordPlacement(600, 232, 1100, 400).width).toBe(600 - 232 - 24)
    expect(besideRecordPlacement(240, 232, 1100, 400).width).toBe(0)
  })
})
