// Unit tests for getTeamForManager (team.ts).
// Mocks the Supabase client exactly as tasks.test.ts does.
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Supabase client ──────────────────────────────────────────────────────
vi.mock('../supabase', () => {
  const chainFn = vi.fn()
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const makeChain = (): Record<string, ReturnType<typeof vi.fn>> => {
    const obj: Record<string, ReturnType<typeof vi.fn>> = {
      from: vi.fn(() => obj),
      select: vi.fn(() => obj),
      in: vi.fn(() => obj),
      is: vi.fn(() => obj),
      order: vi.fn(() => obj),
      then: undefined as unknown as ReturnType<typeof vi.fn>,
    }
    return obj
  }
  const schemaChain = makeChain()
  Object.assign(chain, schemaChain)
  chainFn.mockReturnValue(chain)
  return {
    supabase: {
      schema: chainFn,
    },
  }
})

import { supabase } from '@/lib/supabase'
import { getTeamForManager } from './team'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChain = (supabase.schema as unknown as ReturnType<typeof vi.fn>)() as any

function mockSelect(overrides: Partial<{ from: unknown; select: unknown; in: unknown; is: unknown }>) {
  if (overrides.from) (mockChain.from as ReturnType<typeof vi.fn>).mockReturnValue(overrides.from)
  if (overrides.select) (mockChain.select as ReturnType<typeof vi.fn>).mockReturnValue(overrides.select)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getTeamForManager', () => {
  it('returns empty array when viewerRoleIds is empty', async () => {
    const result = await getTeamForManager([])
    expect(result).toEqual([])
  })

  it('returns empty array when no subordinate roles exist', async () => {
    // First call: roles.in('reports_to_role_id', [...]) returns []
    const rolesChain = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.schema as any).mockImplementation(() => ({
      from: vi.fn(() => rolesChain),
    }))
    const result = await getTeamForManager(['role-1'])
    expect(result).toEqual([])
  })

  it('builds TeamMember[] from subordinate roles + person_roles + people', async () => {
    let callCount = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.schema as any).mockImplementation(() => ({
      from: vi.fn((table: string) => {
        callCount++
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{ id: 'sub-role-1', name: 'Barista' }],
              error: null,
            }),
          }
        }
        if (table === 'person_roles') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [{ person_id: 'person-a', role_id: 'sub-role-1' }],
              error: null,
            }),
          }
        }
        if (table === 'people') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({
              data: [{ id: 'person-a', full_name: 'Andi Santoso' }],
              error: null,
            }),
          }
        }
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }) }
      }),
    }))

    const result = await getTeamForManager(['manager-role-1'])
    expect(result).toHaveLength(1)
    expect(result[0].person_id).toBe('person-a')
    expect(result[0].full_name).toBe('Andi Santoso')
    expect(result[0].role_label).toBe('Barista')
    // callCount checks that roles, person_roles, people were all queried
    expect(callCount).toBeGreaterThanOrEqual(3)
  })

  it('throws when roles query returns an error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.schema as any).mockImplementation(() => ({
      from: vi.fn((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
          }
        }
        return { select: vi.fn().mockReturnThis(), in: vi.fn() }
      }),
    }))
    await expect(getTeamForManager(['role-1'])).rejects.toThrow('getTeamForManager (roles)')
  })

  it('deduplicates people who hold multiple subordinate roles', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(supabase.schema as any).mockImplementation(() => ({
      from: vi.fn((table: string) => {
        if (table === 'roles') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'sub-role-1', name: 'Lead' },
                { id: 'sub-role-2', name: 'Staff' },
              ],
              error: null,
            }),
          }
        }
        if (table === 'person_roles') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [
                { person_id: 'person-a', role_id: 'sub-role-1' },
                { person_id: 'person-a', role_id: 'sub-role-2' }, // same person, two roles
              ],
              error: null,
            }),
          }
        }
        if (table === 'people') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({
              data: [{ id: 'person-a', full_name: 'Andi Santoso' }],
              error: null,
            }),
          }
        }
        return { select: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [], error: null }) }
      }),
    }))

    const result = await getTeamForManager(['manager-role-1'])
    // Should deduplicate: only one entry for person-a
    expect(result).toHaveLength(1)
    expect(result[0].person_id).toBe('person-a')
  })
})

void mockSelect // suppress unused warning
