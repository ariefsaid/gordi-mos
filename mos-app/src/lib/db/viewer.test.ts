import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { PeopleRow, RolesRow } from '../database.types'

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
import { supabase } from '../supabase'

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
})
