// AC-008 (#801): canManageDefinition mirrors the AC-002 truth table of mos.can_manage_definition,
// on the seeded shapes — Dewi, Cahya, Krishna, Maya, Bulan, Fitri against Retail Ops and Marketing.
import { describe, it, expect } from 'vitest'
import { canManageDefinition, type DefinitionViewer } from './definition-permissions'
import type { RoleScopeNode } from './role-scope'

const RETAIL = 'bu-retail-ops'
const MARKETING = 'bu-marketing'
const FINANCE = 'bu-finance'

const MD: RoleScopeNode = { id: 'r-md', business_unit_id: null, reports_to_role_id: null }
const CAFE_OPS_LEAD: RoleScopeNode = { id: 'r-cafe', business_unit_id: RETAIL, reports_to_role_id: 'r-md' }
const KITCHEN_LEAD: RoleScopeNode = { id: 'r-kitchen', business_unit_id: RETAIL, reports_to_role_id: 'r-md' }
const KITCHEN_SUP: RoleScopeNode = { id: 'r-ksup', business_unit_id: RETAIL, reports_to_role_id: 'r-kitchen' }
const HEAD_BARISTA: RoleScopeNode = { id: 'r-hbar', business_unit_id: RETAIL, reports_to_role_id: 'r-cafe' }
const BARISTA: RoleScopeNode = { id: 'r-bar', business_unit_id: RETAIL, reports_to_role_id: 'r-hbar' }
const MARKETING_LEAD: RoleScopeNode = { id: 'r-mkt', business_unit_id: MARKETING, reports_to_role_id: 'r-md' }
const FINANCE_LEAD: RoleScopeNode = { id: 'r-fin', business_unit_id: FINANCE, reports_to_role_id: 'r-md' }
const ALL = [MD, CAFE_OPS_LEAD, KITCHEN_LEAD, KITCHEN_SUP, HEAD_BARISTA, BARISTA, MARKETING_LEAD, FINANCE_LEAD]

const viewer = (v: Partial<DefinitionViewer>): DefinitionViewer => ({
  accessRoles: ['member'], isManager: false, roles: [], allRoles: ALL, teamBuIds: [], ...v,
})

const dewi = viewer({ accessRoles: ['admin'], isManager: true, roles: [MD] })
const cahya = viewer({ accessRoles: ['member', 'ops_lead'], isManager: true, roles: [CAFE_OPS_LEAD], teamBuIds: [RETAIL] })
// Kitchen Lead: holds reports (Kitchen Supervisor is held), Retail Ops role + team.
const krishna = viewer({ isManager: true, roles: [KITCHEN_LEAD], teamBuIds: [RETAIL] })
// Heads Marketing with no reports.
const maya = viewer({ accessRoles: ['manager'], roles: [MARKETING_LEAD], teamBuIds: [MARKETING] })
// On the Retail Ops floor, no reports, not a unit head.
const bulan = viewer({ roles: [BARISTA], teamBuIds: [RETAIL] })
// A lead of Finance — neither unit under test.
const fitri = viewer({ accessRoles: ['member', 'finance'], roles: [FINANCE_LEAD], teamBuIds: [FINANCE] })

describe('canManageDefinition — AC-002 truth table', () => {
  it('Dewi (admin) everywhere, the null unit included', () => {
    expect(canManageDefinition(dewi, RETAIL)).toBe(true)
    expect(canManageDefinition(dewi, MARKETING)).toBe(true)
    expect(canManageDefinition(dewi, null)).toBe(true)
  })
  it('Cahya (ops_lead) everywhere', () => {
    expect(canManageDefinition(cahya, RETAIL)).toBe(true)
    expect(canManageDefinition(cahya, MARKETING)).toBe(true)
    expect(canManageDefinition(cahya, null)).toBe(true)
  })
  it('Krishna (holds reports) in Retail Ops only, and never the null unit', () => {
    expect(canManageDefinition(krishna, RETAIL)).toBe(true)
    expect(canManageDefinition(krishna, MARKETING)).toBe(false)
    expect(canManageDefinition(krishna, null)).toBe(false)
  })
  it('Maya (heads Marketing, no reports) in Marketing only', () => {
    expect(canManageDefinition(maya, MARKETING)).toBe(true)
    expect(canManageDefinition(maya, RETAIL)).toBe(false)
  })
  it('Bulan (member, no reports) nowhere — not even her own unit', () => {
    expect(canManageDefinition(bulan, RETAIL)).toBe(false)
    expect(canManageDefinition(bulan, MARKETING)).toBe(false)
  })
  it('Fitri (finance) nowhere under test', () => {
    expect(canManageDefinition(fitri, RETAIL)).toBe(false)
    expect(canManageDefinition(fitri, MARKETING)).toBe(false)
  })
  it('a Team membership alone places a lead in a unit', () => {
    const leadByTeam = viewer({ isManager: true, roles: [KITCHEN_LEAD], teamBuIds: [MARKETING] })
    expect(canManageDefinition(leadByTeam, MARKETING)).toBe(true)
  })
})
