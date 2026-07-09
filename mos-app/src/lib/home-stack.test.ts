// home-stack.test.ts — the pure role-union → ordered-sections selector (AC-HS01..HS07).
// Each persona combo → the right stacked sections in the right order; the visibility-direction
// guarantees (member → capture-first, BU-head → own-BU function-cockpit) live in the render test.
import { describe, it, expect } from 'vitest'
import {
  deriveHomeStack,
  isOwnerDirector,
  buHeadsForViewer,
  type RoleScopeNode,
} from './home-stack'

// ── Role tree fixtures (mirror the shared.roles seed shape) ──────────────────
// BU ids
const BU_RETAIL = '20000000-0000-0000-0000-000000000014' // Retail Ops
const BU_B2B_SALES = '20000000-0000-0000-0000-000000000016' // B2B Sales
const BU_FINANCE = '20000000-0000-0000-0000-000000000013' // Finance
const BU_B2B_OPS = '20000000-0000-0000-0000-000000000015' // B2B Ops

// Roles
const MD: RoleScopeNode = { id: 'r-md', business_unit_id: null, reports_to_role_id: null } // top-of-chain
const CAFE_LEAD: RoleScopeNode = { id: 'r-cafe', business_unit_id: BU_RETAIL, reports_to_role_id: 'r-md' } // apex of Retail Ops
const SALES_LEAD: RoleScopeNode = { id: 'r-sales', business_unit_id: BU_B2B_SALES, reports_to_role_id: 'r-md' } // apex of B2B Sales
const FINANCE_LEAD: RoleScopeNode = { id: 'r-fin', business_unit_id: BU_FINANCE, reports_to_role_id: 'r-md' } // apex of Finance
const ROAST_LEAD: RoleScopeNode = { id: 'r-roast', business_unit_id: BU_B2B_OPS, reports_to_role_id: 'r-md' } // apex of B2B Ops
// A mid-chain role inside Retail Ops (reports up to Cafe Lead, same BU) — NOT an apex
const BARISTA: RoleScopeNode = { id: 'r-barista', business_unit_id: BU_RETAIL, reports_to_role_id: 'r-cafe' }

const ALL_ROLES: RoleScopeNode[] = [MD, CAFE_LEAD, SALES_LEAD, FINANCE_LEAD, ROAST_LEAD, BARISTA]

const BUSINESS_UNITS = [
  { id: BU_B2B_OPS, name: 'B2B Ops' },
  { id: BU_B2B_SALES, name: 'B2B Sales' },
  { id: BU_FINANCE, name: 'Finance' },
  { id: BU_RETAIL, name: 'Retail Ops' },
]

describe('isOwnerDirector', () => {
  it('true when the viewer holds the top-of-chain role (reports_to_role_id null)', () => {
    expect(isOwnerDirector([MD])).toBe(true)
    expect(isOwnerDirector([CAFE_LEAD])).toBe(false)
  })
})

describe('buHeadsForViewer', () => {
  it('returns the distinct BUs whose apex role the viewer holds', () => {
    expect(buHeadsForViewer([CAFE_LEAD], ALL_ROLES)).toEqual([{ buId: BU_RETAIL }])
    // dual-hat: cafe + sales → two BUs
    expect(buHeadsForViewer([CAFE_LEAD, SALES_LEAD], ALL_ROLES)).toEqual([
      { buId: BU_RETAIL },
      { buId: BU_B2B_SALES },
    ])
  })

  it('a mid-chain role (reports up within the SAME BU) is NOT a BU-head', () => {
    expect(buHeadsForViewer([BARISTA], ALL_ROLES)).toEqual([])
  })

  it('the owner-director role (null BU) is never counted as a BU-head', () => {
    expect(buHeadsForViewer([MD], ALL_ROLES)).toEqual([])
  })

  it('dedupes when two held roles apex the same BU', () => {
    // two roles both apex Retail Ops (parent null + same BU) → one BU
    const r1: RoleScopeNode = { id: 'r1', business_unit_id: BU_RETAIL, reports_to_role_id: null }
    const r2: RoleScopeNode = { id: 'r2', business_unit_id: BU_RETAIL, reports_to_role_id: MD.id }
    expect(buHeadsForViewer([r1, r2], ALL_ROLES)).toEqual([{ buId: BU_RETAIL }])
  })
})

describe('deriveHomeStack — AC-HS01..HS07 (persona combo → ordered sections)', () => {
  it('AC-HS01: owner-director → [owner-cockpit, my-week]', () => {
    const sections = deriveHomeStack({
      viewerRoles: [MD],
      allRoles: ALL_ROLES,
      isManager: false,
      accessRoles: ['admin'],
      businessUnits: BUSINESS_UNITS,
    })
    expect(sections.map((s) => s.kind)).toEqual(['owner-cockpit', 'my-week'])
  })

  it('AC-HS02: single BU-head (not manager) → [function-cockpit, my-week]', () => {
    const sections = deriveHomeStack({
      viewerRoles: [FINANCE_LEAD],
      allRoles: ALL_ROLES,
      isManager: false,
      accessRoles: ['finance', 'member'],
      businessUnits: BUSINESS_UNITS,
    })
    expect(sections).toHaveLength(2)
    expect(sections[0]).toEqual({ kind: 'function-cockpit', buId: BU_FINANCE, buName: 'Finance' })
    expect(sections[1].kind).toBe('my-week')
  })

  it('AC-HS03: dual-hat BU-head (two BUs, not manager) → two function-cockpits (BU-name order) + my-week', () => {
    const sections = deriveHomeStack({
      viewerRoles: [CAFE_LEAD, SALES_LEAD], // Retail Ops + B2B Sales
      allRoles: ALL_ROLES,
      isManager: false,
      accessRoles: ['member'],
      businessUnits: BUSINESS_UNITS,
    })
    expect(sections.map((s) => s.kind)).toEqual(['function-cockpit', 'function-cockpit', 'my-week'])
    // BU-name order: "B2B Sales" < "Retail Ops"
    expect(sections[0]).toMatchObject({ kind: 'function-cockpit', buName: 'B2B Sales' })
    expect(sections[1]).toMatchObject({ kind: 'function-cockpit', buName: 'Retail Ops' })
  })

  it('AC-HS04: BU-head who is also a manager → [function-cockpit, my-week] (union, no dup my-week)', () => {
    const sections = deriveHomeStack({
      viewerRoles: [CAFE_LEAD],
      allRoles: ALL_ROLES,
      isManager: true,
      accessRoles: ['member', 'manager'],
      businessUnits: BUSINESS_UNITS,
    })
    expect(sections.map((s) => s.kind)).toEqual(['function-cockpit', 'my-week'])
  })

  it('AC-HS05: owner-director who is also a manager → [owner-cockpit, my-week]', () => {
    const sections = deriveHomeStack({
      viewerRoles: [MD],
      allRoles: ALL_ROLES,
      isManager: true,
      accessRoles: ['admin', 'manager'],
      businessUnits: BUSINESS_UNITS,
    })
    expect(sections.map((s) => s.kind)).toEqual(['owner-cockpit', 'my-week'])
  })

  it('AC-HS06: pure contributor/member (no scope) → [capture-first] only', () => {
    const sections = deriveHomeStack({
      viewerRoles: [BARISTA], // mid-chain, not apex, not manager
      allRoles: ALL_ROLES,
      isManager: false,
      accessRoles: ['member'],
      businessUnits: BUSINESS_UNITS,
    })
    expect(sections.map((s) => s.kind)).toEqual(['capture-first'])
  })

  it('AC-HS06b: a viewer holding no org roles at all → [capture-first] (defensive default)', () => {
    const sections = deriveHomeStack({
      viewerRoles: [],
      allRoles: ALL_ROLES,
      isManager: false,
      accessRoles: ['member'],
      businessUnits: BUSINESS_UNITS,
    })
    expect(sections.map((s) => s.kind)).toEqual(['capture-first'])
  })

  it('AC-HS07: a manager (isManager, no apex role) → [my-week] (manager scope alone yields my-week)', () => {
    // A manager whose held role is mid-chain (not apex) — e.g. a team lead who reports to a BU-head.
    const sections = deriveHomeStack({
      viewerRoles: [BARISTA],
      allRoles: ALL_ROLES,
      isManager: true,
      accessRoles: ['member', 'manager'],
      businessUnits: BUSINESS_UNITS,
    })
    expect(sections.map((s) => s.kind)).toEqual(['my-week'])
  })
})
