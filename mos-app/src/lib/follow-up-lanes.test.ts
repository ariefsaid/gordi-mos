import { describe, expect, it } from 'vitest'
import { canWorkAnyLane } from './follow-up-lanes'

const businessUnits = [
  { id: 'bu-sales', code: 'b2b_sales' },
  { id: 'bu-retail', code: 'retail_ops' },
  { id: 'bu-people', code: 'people' },
]

describe('follow-up queue lane access', () => {
  it.each([
    ['B2B Sales', 'bu-sales'],
    ['Retail Ops', 'bu-retail'],
  ])('%s staff can work the queue for their lane', (_lane, businessUnitId) => {
    expect(canWorkAnyLane([{ business_unit_id: businessUnitId }], businessUnits)).toBe(true)
  })

  it('people outside both queue lanes do not get follow-up actions from their access role alone', () => {
    expect(canWorkAnyLane([{ business_unit_id: 'bu-people' }], businessUnits, ['manager', 'ops_lead', 'supervisor'])).toBe(false)
  })

  it('an admin can work the queue without a lane assignment', () => {
    expect(canWorkAnyLane([], businessUnits, ['admin'])).toBe(true)
  })
})
