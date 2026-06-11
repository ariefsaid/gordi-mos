import { describe, it, expect } from 'vitest'
import { deriveIsManager } from './viewer'

// Roles fixture
// md     = Managing Director  (no parent)
// cafe   = Cafe Ops Lead      (reports to md)
// sales  = Sales Lead         (reports to md)
// sub    = Sub Lead           (reports to cafe)
const MD_ID = 'r-md'
const CAFE_ID = 'r-cafe'
const SALES_ID = 'r-sales'
const SUB_ID = 'r-sub'

const ALL_ROLES = [
  { id: MD_ID, reports_to_role_id: null },
  { id: CAFE_ID, reports_to_role_id: MD_ID },
  { id: SALES_ID, reports_to_role_id: MD_ID },
  { id: SUB_ID, reports_to_role_id: CAFE_ID },
]

describe('deriveIsManager', () => {
  it('AC-010: isManager — (a) holds a role with a held subordinate role → true', () => {
    // MD holds MD role; Cafe Lead (café) holds CAFE_ID — café reports to md → md is a manager
    expect(
      deriveIsManager({
        viewerRoleIds: [MD_ID],
        roles: ALL_ROLES,
        heldRoleIds: new Set([MD_ID, CAFE_ID]),
      }),
    ).toBe(true)
  })

  it('AC-010: isManager — (b) subordinate roles exist but have no current holder → false', () => {
    // MD role exists and CAFE_ID reports to it, but no one holds CAFE_ID
    expect(
      deriveIsManager({
        viewerRoleIds: [MD_ID],
        roles: ALL_ROLES,
        heldRoleIds: new Set([MD_ID]), // only MD is held — no subordinate held
      }),
    ).toBe(false)
  })

  it('AC-010: isManager — (c) no subordinate roles → false', () => {
    // SUB_ID has no roles reporting to it
    expect(
      deriveIsManager({
        viewerRoleIds: [SUB_ID],
        roles: ALL_ROLES,
        heldRoleIds: new Set([SUB_ID, CAFE_ID, MD_ID]),
      }),
    ).toBe(false)
  })

  it('AC-010: isManager — (d) dual-hat, manages only via the second role → true', () => {
    // Viewer holds both SUB_ID and SALES_ID. SUB_ID has no subordinates with holders.
    // SALES_ID is held, and it has a subordinate that also has holders? No — let's check:
    // SALES_ID reports_to_role_id = MD_ID, so subordinates of SALES_ID = roles where reports_to_role_id = SALES_ID
    // None in our fixture. Let's add a sub-sales role scenario instead:
    // Viewer holds [CAFE_ID, SALES_ID]. CAFE_ID has SUB_ID reporting to it (held). → true via CAFE_ID.
    // This tests union: if first role doesn't manage but second does.
    const SUB2_ID = 'r-sub2'
    const rolesWithSub2 = [
      ...ALL_ROLES,
      { id: SUB2_ID, reports_to_role_id: SALES_ID },
    ]
    expect(
      deriveIsManager({
        viewerRoleIds: [SUB_ID, SALES_ID], // SUB has no held-subordinate; SALES has held SUB2
        roles: rolesWithSub2,
        heldRoleIds: new Set([SUB_ID, SALES_ID, SUB2_ID]),
      }),
    ).toBe(true)
  })
})
