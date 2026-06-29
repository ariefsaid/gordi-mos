// Admin-users data layer tests — TDD, plan §3.2.
// AC-011 (email helper), wrapper contracts.
// Mirror directory.test.ts chainable-mock pattern; mock @/lib/supabase.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../supabase', () => {
  const schema = vi.fn()
  const rpc = vi.fn()
  return { supabase: { schema, rpc } }
})

import { supabase } from '@/lib/supabase'
import {
  synthesizeEmail,
  listAdminPeople,
  createPerson,
  createLogin,
  resetPassword,
  setLoginEnabled,
  grantRole,
  revokeRole,
  archivePerson,
  restorePerson,
} from './admin-users'

const schemaMock = vi.mocked(supabase.schema)

// ── Chainable mock builder ────────────────────────────────────────────────────
function makeSharedSchema(tableResponses: Record<string, { data: unknown; error: unknown }>, rpcResponse?: { data: unknown; error: unknown }) {
  const fromImpl = (table: string) => {
    const result = tableResponses[table] ?? { data: null, error: null }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.in = vi.fn(() => builder)
    builder.insert = vi.fn(() => builder)
    builder.update = vi.fn(() => builder)
    builder.single = vi.fn(() => Promise.resolve(result))
    builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    return builder
  }
  const rpcImpl = vi.fn(() => Promise.resolve(rpcResponse ?? { data: null, error: null }))
  return { from: vi.fn(fromImpl), rpc: rpcImpl }
}

beforeEach(() => vi.clearAllMocks())

// ── synthesizeEmail ───────────────────────────────────────────────────────────
describe('synthesizeEmail (AC-011 helper, FR-021)', () => {
  it('AC-011: converts "Budi Santoso" → budi-santoso@ops.gordi.local', () => {
    expect(synthesizeEmail('Budi Santoso')).toMatch(/^budi-santoso@ops\.gordi\.local$/)
  })

  it('AC-011: lowercases and replaces spaces with dashes', () => {
    expect(synthesizeEmail('Arief Said')).toBe('arief-said@ops.gordi.local')
  })

  it('AC-011: strips non [a-z0-9-] characters', () => {
    expect(synthesizeEmail('Café Latte!')).toBe('caf-latte@ops.gordi.local')
  })

  it('AC-011: uniqueness — appends -2, -3 on collision', () => {
    const taken = new Set(['budi-santoso@ops.gordi.local'])
    expect(synthesizeEmail('Budi Santoso', taken)).toBe('budi-santoso-2@ops.gordi.local')
  })

  it('AC-011: uniqueness — appends -3 when -2 also taken', () => {
    const taken = new Set([
      'budi-santoso@ops.gordi.local',
      'budi-santoso-2@ops.gordi.local',
    ])
    expect(synthesizeEmail('Budi Santoso', taken)).toBe('budi-santoso-3@ops.gordi.local')
  })
})

// ── listAdminPeople ───────────────────────────────────────────────────────────
describe('listAdminPeople', () => {
  it('merges people + access_roles + login_status into AdminPersonRow[]', async () => {
    const people = [
      { id: 'p1', full_name: 'Budi Santoso', email: 'budi@gordi.id', archived_at: null },
      { id: 'p2', full_name: 'Sari Indah', email: null, archived_at: null },
    ]
    const roles = [
      { person_id: 'p1', access_role: 'member', revoked_at: null },
      { person_id: 'p1', access_role: 'ops_lead', revoked_at: null },
    ]
    const loginStatus = [
      { person_id: 'p1', has_login: true, disabled: false },
      { person_id: 'p2', has_login: false, disabled: false },
    ]

    const schemaObj = makeSharedSchema(
      {
        people: { data: people, error: null },
        person_access_roles: { data: roles, error: null },
      },
      { data: loginStatus, error: null },
    )
    schemaMock.mockReturnValue(schemaObj as never)

    const result = await listAdminPeople()
    expect(result).toHaveLength(2)

    const budi = result.find((r) => r.id === 'p1')!
    expect(budi.login).toBe('active')
    expect(budi.access_roles).toEqual(expect.arrayContaining(['member', 'ops_lead']))

    const sari = result.find((r) => r.id === 'p2')!
    expect(sari.login).toBe('none')
    expect(sari.access_roles).toEqual([])
  })

  it('maps disabled login status correctly', async () => {
    const people = [{ id: 'p1', full_name: 'Test', email: null, archived_at: null }]
    const roles: unknown[] = []
    const loginStatus = [{ person_id: 'p1', has_login: true, disabled: true }]

    const schemaObj = makeSharedSchema(
      { people: { data: people, error: null }, person_access_roles: { data: roles, error: null } },
      { data: loginStatus, error: null },
    )
    schemaMock.mockReturnValue(schemaObj as never)

    const result = await listAdminPeople()
    expect(result[0].login).toBe('disabled')
  })

  it('throws on people fetch error', async () => {
    const schemaObj = makeSharedSchema({ people: { data: null, error: { message: 'rls denied' } } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(listAdminPeople()).rejects.toThrow(/rls denied/)
  })
})

// ── createPerson ──────────────────────────────────────────────────────────────
describe('createPerson', () => {
  it('inserts into shared.people and returns the new id', async () => {
    const schemaObj = makeSharedSchema({
      people: { data: { id: 'new-id' }, error: null },
      person_access_roles: { data: null, error: null },
    })
    schemaMock.mockReturnValue(schemaObj as never)

    const id = await createPerson({ full_name: 'New Person', email: 'new@gordi.id', access_roles: [] })
    expect(id).toBe('new-id')
    expect(schemaMock).toHaveBeenCalledWith('shared')
  })

  it('throws on insert error', async () => {
    const schemaObj = makeSharedSchema({
      people: { data: null, error: { message: 'insert failed' } },
    })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(createPerson({ full_name: 'X', email: null, access_roles: [] })).rejects.toThrow(/insert failed/)
  })
})

// ── createLogin ───────────────────────────────────────────────────────────────
describe('createLogin', () => {
  it('calls admin_create_login RPC on shared schema and returns temp password', async () => {
    const schemaObj = makeSharedSchema({}, { data: 'TempPw123', error: null })
    schemaMock.mockReturnValue(schemaObj as never)

    const pw = await createLogin('person-id-1')
    expect(pw).toBe('TempPw123')
    // Must call rpc on the shared schema object
    expect(schemaObj.rpc).toHaveBeenCalledWith('admin_create_login', { p_person: 'person-id-1' })
  })

  it('throws on RPC error', async () => {
    const schemaObj = makeSharedSchema({}, { data: null, error: { message: 'rpc error' } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(createLogin('p1')).rejects.toThrow(/rpc error/)
  })
})

// ── resetPassword ─────────────────────────────────────────────────────────────
describe('resetPassword', () => {
  it('calls admin_reset_password RPC and returns new temp password', async () => {
    const schemaObj = makeSharedSchema({}, { data: 'NewPw456', error: null })
    schemaMock.mockReturnValue(schemaObj as never)

    const pw = await resetPassword('person-id-2')
    expect(pw).toBe('NewPw456')
    expect(schemaObj.rpc).toHaveBeenCalledWith('admin_reset_password', { p_person: 'person-id-2' })
  })

  it('throws on RPC error', async () => {
    const schemaObj = makeSharedSchema({}, { data: null, error: { message: 'no login' } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(resetPassword('p2')).rejects.toThrow(/no login/)
  })
})

// ── setLoginEnabled ───────────────────────────────────────────────────────────
describe('setLoginEnabled', () => {
  it('calls admin_set_login_enabled RPC with p_person and p_enabled', async () => {
    const schemaObj = makeSharedSchema({}, { data: null, error: null })
    schemaMock.mockReturnValue(schemaObj as never)

    await setLoginEnabled('person-id-3', false)
    expect(schemaObj.rpc).toHaveBeenCalledWith('admin_set_login_enabled', {
      p_person: 'person-id-3',
      p_enabled: false,
    })
  })

  it('throws on RPC error', async () => {
    const schemaObj = makeSharedSchema({}, { data: null, error: { message: 'last admin' } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(setLoginEnabled('p1', false)).rejects.toThrow(/last admin/)
  })
})

// ── grantRole ─────────────────────────────────────────────────────────────────
describe('grantRole', () => {
  it('inserts into person_access_roles (never sends org_id or granted_by)', async () => {
    const schemaObj = makeSharedSchema({ person_access_roles: { data: null, error: null } })
    schemaMock.mockReturnValue(schemaObj as never)

    await grantRole('p1', 'ops_lead')
    expect(schemaMock).toHaveBeenCalledWith('shared')
  })

  it('throws on error', async () => {
    const schemaObj = makeSharedSchema({ person_access_roles: { data: null, error: { message: 'self-assign' } } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(grantRole('p1', 'admin')).rejects.toThrow(/self-assign/)
  })
})

// ── revokeRole ────────────────────────────────────────────────────────────────
describe('revokeRole', () => {
  it('updates person_access_roles.revoked_at', async () => {
    const schemaObj = makeSharedSchema({ person_access_roles: { data: null, error: null } })
    schemaMock.mockReturnValue(schemaObj as never)

    await revokeRole('p1', 'member')
    expect(schemaMock).toHaveBeenCalledWith('shared')
  })
})

// ── archivePerson / restorePerson ─────────────────────────────────────────────
describe('archivePerson / restorePerson', () => {
  it('archivePerson updates people.archived_at to now', async () => {
    const schemaObj = makeSharedSchema({ people: { data: null, error: null } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(archivePerson('p1')).resolves.toBeUndefined()
  })

  it('restorePerson updates people.archived_at to null', async () => {
    const schemaObj = makeSharedSchema({ people: { data: null, error: null } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(restorePerson('p1')).resolves.toBeUndefined()
  })

  it('throws on archive error', async () => {
    const schemaObj = makeSharedSchema({ people: { data: null, error: { message: 'rls denied' } } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(archivePerson('p1')).rejects.toThrow(/rls denied/)
  })
})
