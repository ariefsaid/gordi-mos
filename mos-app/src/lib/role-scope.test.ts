import { describe, it, expect } from 'vitest'
import { isOwnerDirector, buHeadsForViewer, type RoleScopeNode } from './role-scope'

const BU_RETAIL = '20000000-0000-0000-0000-000000000014'
const BU_B2B_SALES = '20000000-0000-0000-0000-000000000016'
const BU_FINANCE = '20000000-0000-0000-0000-000000000013'
const BU_B2B_OPS = '20000000-0000-0000-0000-000000000015'
const MD: RoleScopeNode = { id: 'r-md', business_unit_id: null, reports_to_role_id: null }
const CAFE_LEAD: RoleScopeNode = { id: 'r-cafe', business_unit_id: BU_RETAIL, reports_to_role_id: 'r-md' }
const SALES_LEAD: RoleScopeNode = { id: 'r-sales', business_unit_id: BU_B2B_SALES, reports_to_role_id: 'r-md' }
const FINANCE_LEAD: RoleScopeNode = { id: 'r-fin', business_unit_id: BU_FINANCE, reports_to_role_id: 'r-md' }
const ROAST_LEAD: RoleScopeNode = { id: 'r-roast', business_unit_id: BU_B2B_OPS, reports_to_role_id: 'r-md' }
const BARISTA: RoleScopeNode = { id: 'r-barista', business_unit_id: BU_RETAIL, reports_to_role_id: 'r-cafe' }
const ALL_ROLES = [MD, CAFE_LEAD, SALES_LEAD, FINANCE_LEAD, ROAST_LEAD, BARISTA]

describe('isOwnerDirector', () => {
  it('true when viewer holds the top-of-chain role', () => {
    expect(isOwnerDirector([MD])).toBe(true)
    expect(isOwnerDirector([CAFE_LEAD])).toBe(false)
  })
})

describe('buHeadsForViewer', () => {
  it('returns distinct BUs whose apex role viewer holds', () => {
    expect(buHeadsForViewer([CAFE_LEAD], ALL_ROLES)).toEqual([{ buId: BU_RETAIL }])
    expect(buHeadsForViewer([CAFE_LEAD, SALES_LEAD], ALL_ROLES)).toEqual([
      { buId: BU_RETAIL }, { buId: BU_B2B_SALES },
    ])
  })
  it('does not count a mid-chain role', () => expect(buHeadsForViewer([BARISTA], ALL_ROLES)).toEqual([]))
  it('does not count the owner-director role', () => expect(buHeadsForViewer([MD], ALL_ROLES)).toEqual([]))
  it('dedupes two held roles apexing the same BU', () => {
    const r1: RoleScopeNode = { id: 'r1', business_unit_id: BU_RETAIL, reports_to_role_id: null }
    const r2: RoleScopeNode = { id: 'r2', business_unit_id: BU_RETAIL, reports_to_role_id: MD.id }
    expect(buHeadsForViewer([r1, r2], ALL_ROLES)).toEqual([{ buId: BU_RETAIL }])
  })
})
