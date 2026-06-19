import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PeopleRow, RolesRow } from '@/lib/database.types'

// T-100: base64url helper for building fake JWTs (decode-only; no signature needed)
function fakeJwt(payload: object): string {
  const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '')
  return `${b64({ alg: 'none', typ: 'JWT' })}.${b64(payload)}.`
}

// Mock the supabase module before importing resolveViewer
vi.mock('../supabase', () => {
  const mockFrom = vi.fn()
  return {
    supabase: {
      from: mockFrom,
    },
  }
})

import { resolveViewer } from './viewer'
import { supabase } from '@/lib/supabase'

const mockFrom = vi.mocked(supabase.from)

// Type helper: cast a mock object to the postgrest chain type.
// Tests are intentionally partial mocks — we use unknown intermediate cast as permitted in tests.
function asChain(obj: unknown): ReturnType<typeof supabase.from> {
  return obj as ReturnType<typeof supabase.from>
}

// Fixtures
const ORG_ID = '10000000-0000-0000-0000-000000000001'
const USER_ID = 'auth-user-001'
const PERSON_ID = '40000000-0000-0000-0000-000000000001'
const ROLE_A_ID = '30000000-0000-0000-0000-000000000001'
const ROLE_B_ID = '30000000-0000-0000-0000-000000000004'

const personRow: PeopleRow = {
  id: PERSON_ID,
  org_id: ORG_ID,
  user_id: USER_ID,
  full_name: 'Cahya Cafe',
  email: 'cahya.dev@example.test',
  archived_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const roleA: RolesRow = {
  id: ROLE_A_ID,
  org_id: ORG_ID,
  business_unit_id: '20000000-0000-0000-0000-000000000001',
  name: 'Cafe Ops Lead',
  reports_to_role_id: '30000000-0000-0000-0000-000000000000',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const roleB: RolesRow = {
  id: ROLE_B_ID,
  org_id: ORG_ID,
  business_unit_id: '20000000-0000-0000-0000-000000000004',
  name: 'Sales Lead',
  reports_to_role_id: '30000000-0000-0000-0000-000000000000',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('resolveViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('AC-012: resolveViewer returns Person + held Roles', async () => {
    // Track eq calls to assert no org_id filter
    const eqCalls: Array<[string, string]> = []

    // people chain
    const peopleChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((col: string, val: string) => {
        eqCalls.push([col, val])
        return peopleChain
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: personRow, error: null }),
    }

    // person_roles chain (viewer's roles) - returns role_id rows for this person
    const personRolesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((col: string, val: string) => {
        eqCalls.push([col, val])
        return personRolesChain
      }),
      // T-013: .order('created_at') is now called on this chain (FR-007)
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [{ role_id: ROLE_A_ID }, { role_id: ROLE_B_ID }], error: null }).then(resolve),
    }

    // roles chain (all org roles)
    const rolesChain = {
      select: vi.fn().mockReturnThis(),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: [roleA, roleB], error: null }).then(resolve),
    }

    // all person_roles chain (for heldRoleIds)
    let personRolesCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') return asChain(peopleChain)
      if (table === 'person_roles') {
        personRolesCallCount++
        if (personRolesCallCount === 1) return asChain(personRolesChain)
        // Second call returns all person_roles (for heldRoleIds)
        const allPrChain = {
          select: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
              data: [{ role_id: ROLE_A_ID }, { role_id: ROLE_B_ID }],
              error: null,
            }).then(resolve),
        }
        return asChain(allPrChain)
      }
      if (table === 'roles') return asChain(rolesChain)
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await resolveViewer(USER_ID)

    expect(result.person).toEqual(personRow)
    expect(result.roles).toHaveLength(2)
    expect(result.roles.map((r) => r.id)).toContain(ROLE_A_ID)
    expect(result.roles.map((r) => r.id)).toContain(ROLE_B_ID)

    // Assert the query never filters by org_id (RLS scopes it — §8)
    const orgIdFilters = eqCalls.filter(([col]) => col === 'org_id')
    expect(orgIdFilters).toHaveLength(0)
  })

  it('AC-012: resolveViewer returns { person: null } for orphan (no people row)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const result = await resolveViewer(USER_ID)

    expect(result.person).toBeNull()
    expect(result.roles).toHaveLength(0)
    expect(result.isManager).toBe(false)
  })

  // --- T-100: AC-060 — effective roles = assigned claim when isManager is false ---
  it('AC-060: resolveViewer exposes accessRoles = assigned claim when isManager is false', async () => {
    // Mock: person resolves, no roles held => isManager = false
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: personRow, error: null }),
        })
      }
      if (table === 'person_roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      if (table === 'roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const token = fakeJwt({ access_roles: ['ops_lead', 'member'] })
    const result = await resolveViewer(USER_ID, token)

    expect(result.isManager).toBe(false)
    // AC-060: effective = assigned only; no 'manager'
    expect(result.accessRoles).toEqual(expect.arrayContaining(['ops_lead', 'member']))
    expect(result.accessRoles).toHaveLength(2)
    expect(result.accessRoles).not.toContain('manager')
  })

  // --- T-101: AC-061 — assigned ∪ derived manager when isManager is true ---
  it('AC-061: resolveViewer includes manager in accessRoles when isManager is true', async () => {
    // Manager derivation: viewer holds ROLE_A_ID; roleA reports_to_role_id = '30000000-0000-0000-0000-000000000000'
    // We need a role whose reports_to_role_id = ROLE_A_ID and which is currently held.
    const subordinateRoleId = '30000000-0000-0000-0000-000000000099'
    const subordinateRole: RolesRow = {
      id: subordinateRoleId,
      org_id: ORG_ID,
      business_unit_id: null,
      name: 'Subordinate',
      reports_to_role_id: ROLE_A_ID, // viewer's role is the parent
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }

    let personRolesCallCount = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: personRow, error: null }),
        })
      }
      if (table === 'person_roles') {
        personRolesCallCount++
        if (personRolesCallCount === 1) {
          // Viewer's roles: holds ROLE_A_ID
          return asChain({
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: [{ role_id: ROLE_A_ID }], error: null }).then(resolve),
          })
        }
        // Second call: all org person_roles — subordinate role is also held
        return asChain({
          select: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({
              data: [{ role_id: ROLE_A_ID }, { role_id: subordinateRoleId }],
              error: null,
            }).then(resolve),
        })
      }
      if (table === 'roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [roleA, subordinateRole], error: null }).then(resolve),
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const token = fakeJwt({ access_roles: ['member'] })
    const result = await resolveViewer(USER_ID, token)

    expect(result.isManager).toBe(true)
    // AC-061: assigned ∪ derived manager
    expect(result.accessRoles).toEqual(expect.arrayContaining(['member', 'manager']))
    expect(result.accessRoles).toHaveLength(2)
  })

  // --- T-102: AC-062 — orphan / absent token → empty accessRoles, no throw ---
  it('AC-062: resolveViewer returns empty accessRoles for orphan person', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const token = fakeJwt({ access_roles: ['admin'] })
    const result = await resolveViewer(USER_ID, token)

    // AC-062: orphan → empty, no throw
    expect(result.person).toBeNull()
    expect(result.accessRoles).toEqual([])
    expect(result.isManager).toBe(false)
  })

  it('AC-062: resolveViewer with undefined token yields empty assigned set (fail-closed)', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: personRow, error: null }),
        })
      }
      if (table === 'person_roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      if (table === 'roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    // Absent token → accessRoles empty (isManager also false since no roles)
    const result = await resolveViewer(USER_ID, undefined)

    expect(result.accessRoles).toEqual([])
    expect(result.isManager).toBe(false)
  })

  // --- FR-071: decodeAccessRolesClaim fail-closed on malformed / non-array claims ---
  // The decoder is the client's only source of the effective assigned set; every parse
  // failure must collapse to [] (never throw, never surface a partial/garbage value).
  it('AC-062: malformed (undecodable) token yields empty accessRoles, no throw', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: personRow, error: null }),
        })
      }
      if (table === 'person_roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      if (table === 'roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    // Not a valid JWT shape (no payload segment) and outright garbage — both fail closed.
    const result = await resolveViewer(USER_ID, 'not-a-real-jwt')

    expect(result.accessRoles).toEqual([])
    expect(result.isManager).toBe(false)
  })

  it('AC-062: access_roles claim that is not an array (string/object) yields empty accessRoles', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: personRow, error: null }),
        })
      }
      if (table === 'person_roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      if (table === 'roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    // A claim that parses as JSON but is the wrong shape (string, not array) must fail closed,
    // as must an array containing non-string junk.
    const stringClaim = await resolveViewer(USER_ID, fakeJwt({ access_roles: 'ops_lead' }))
    expect(stringClaim.accessRoles).toEqual([])

    const junkArray = await resolveViewer(
      USER_ID,
      fakeJwt({ access_roles: ['member', 42, null, { x: 1 }] }),
    )
    // Non-string elements are dropped; only the valid string survives.
    expect(junkArray.accessRoles).toEqual(['member'])
  })

  // --- T-103: AC-063 + AC-064 — prior contract preserved + no person_access_roles round-trip ---
  it('AC-063: resolveViewer result still contains person/roles/isManager in original shape', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'people') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: personRow, error: null }),
        })
      }
      if (table === 'person_roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [{ role_id: ROLE_A_ID }], error: null }).then(resolve),
        })
      }
      if (table === 'roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [roleA], error: null }).then(resolve),
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const token = fakeJwt({ access_roles: ['member'] })
    const result = await resolveViewer(USER_ID, token)

    // AC-063: prior contract preserved — person, roles, isManager still present
    expect(result.person).toEqual(personRow)
    expect(result.roles).toHaveLength(1)
    expect(result.roles[0].id).toBe(ROLE_A_ID)
    expect(typeof result.isManager).toBe('boolean')
    // and accessRoles is an added field
    expect(Array.isArray(result.accessRoles)).toBe(true)
  })

  it('AC-064: resolveViewer never calls supabase.from with person_access_roles', async () => {
    const tablesQueried: string[] = []

    mockFrom.mockImplementation((table: string) => {
      tablesQueried.push(table)
      if (table === 'people') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: personRow, error: null }),
        })
      }
      if (table === 'person_roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      if (table === 'roles') {
        return asChain({
          select: vi.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: [], error: null }).then(resolve),
        })
      }
      throw new Error(`Unexpected table: ${table}`)
    })

    const token = fakeJwt({ access_roles: ['ops_lead'] })
    await resolveViewer(USER_ID, token)

    // AC-064: no DB round-trip for access roles — decode only from token
    expect(tablesQueried).not.toContain('person_access_roles')
  })
})
