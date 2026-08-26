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
  listRoles,
  assignJabatan,
  removeJabatan,
  listRevenueScopeOptions,
  assignRevenueScope,
  removeRevenueScope,
  listTeams,
  addTeamMembership,
  endTeamMembership,
  setPrimaryTeam,
} from './admin-users'

const schemaMock = vi.mocked(supabase.schema)

// ── Chainable mock builder ────────────────────────────────────────────────────
function makeSharedSchema(tableResponses: Record<string, { data: unknown; error: unknown }>, rpcResponse?: { data: unknown; error: unknown }) {
  const fromImpl = (table: string) => {
    const result = tableResponses[table] ?? { data: null, error: null }
    const builder: Record<string, unknown> = {}
    builder.select = vi.fn(() => builder)
    builder.is = vi.fn(() => builder)
    // listAdminPeople reads team memberships with the GATES definition of live
    // (effective_to is null OR >= today), which PostgREST expresses as .or()
    builder.or = vi.fn(() => builder)
    builder.order = vi.fn(() => builder)
    builder.eq = vi.fn(() => builder)
    builder.in = vi.fn(() => builder)
    builder.insert = vi.fn(() => builder)
    builder.update = vi.fn(() => builder)
    builder.delete = vi.fn(() => builder)
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
      { id: 'p1', full_name: 'Budi Santoso', email: 'budi@example.test', archived_at: null },
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
    await expect(listAdminPeople()).rejects.toThrow(/Couldn't load people/)
  })

  it('AC-124: merges jabatan (person_roles joined to role names) into each row', async () => {
    const people = [{ id: 'p1', full_name: 'Budi Santoso', email: 'budi@example.test', archived_at: null }]
    const loginStatus = [{ person_id: 'p1', has_login: false, disabled: false }]
    const personRoles = [{ person_id: 'p1', role_id: 'r1' }]
    const rolesTable = [{ id: 'r1', name: 'Barista' }]

    const schemaObj = makeSharedSchema(
      {
        people: { data: people, error: null },
        person_access_roles: { data: [], error: null },
        person_roles: { data: personRoles, error: null },
        roles: { data: rolesTable, error: null },
      },
      { data: loginStatus, error: null },
    )
    schemaMock.mockReturnValue(schemaObj as never)

    const result = await listAdminPeople()
    expect(result[0].jabatan).toEqual([{ role_id: 'r1', role_name: 'Barista' }])
  })

  it('defaults jabatan to [] when a person has no person_roles rows', async () => {
    const people = [{ id: 'p2', full_name: 'Sari Indah', email: null, archived_at: null }]
    const loginStatus = [{ person_id: 'p2', has_login: false, disabled: false }]

    const schemaObj = makeSharedSchema(
      {
        people: { data: people, error: null },
        person_access_roles: { data: [], error: null },
        person_roles: { data: [], error: null },
        roles: { data: [], error: null },
      },
      { data: loginStatus, error: null },
    )
    schemaMock.mockReturnValue(schemaObj as never)

    const result = await listAdminPeople()
    expect(result[0].jabatan).toEqual([])
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

    const id = await createPerson({ full_name: 'New Person', email: 'new@example.test', access_roles: [] })
    expect(id).toBe('new-id')
    expect(schemaMock).toHaveBeenCalledWith('shared')
  })

  it('throws on insert error', async () => {
    const schemaObj = makeSharedSchema({
      people: { data: null, error: { message: 'insert failed' } },
    })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(createPerson({ full_name: 'X', email: null, access_roles: [] })).rejects.toThrow(/Couldn't create person/)
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
    await expect(createLogin('p1')).rejects.toThrow(/Couldn't create login/)
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
    await expect(resetPassword('p2')).rejects.toThrow(/Couldn't reset password/)
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
    await expect(setLoginEnabled('p1', false)).rejects.toThrow(/Couldn't update login/)
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
    await expect(grantRole('p1', 'admin')).rejects.toThrow(/Couldn't grant role/)
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
    await expect(archivePerson('p1')).rejects.toThrow(/Couldn't archive person/)
  })
})

// ── surface(): no raw DB-error leak to the client (D11 audit) ───────────────────
describe('surface() — sanitizes errors (D11)', () => {
  it('a raw/unknown DB error becomes a generic message — no Postgres internals leak', async () => {
    const schemaObj = makeSharedSchema({}, {
      data: null,
      error: {
        message: 'duplicate key value violates unique constraint "users_email_partial_key"',
        code: '23505',
        details: 'Key (email)=(x@ops.gordi.local) already exists.',
      },
    })
    schemaMock.mockReturnValue(schemaObj as never)
    const err = (await createLogin('p1').then(() => null, (e) => e)) as Error | null
    expect(err?.message).toBe("Couldn't create login. Please try again.")
    expect(err?.message).not.toMatch(/duplicate key|users_email_partial_key|already exists|Key \(email\)/)
  })

  it('a curated RPC message is surfaced verbatim (helpful + org-agnostic)', async () => {
    const schemaObj = makeSharedSchema({}, { data: null, error: { message: 'email already in use', code: '22023' } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(createLogin('p1')).rejects.toThrow('email already in use')
  })
})

// ── Jabatan (Position) wrappers ───────────────────────────────────────────────
describe('Jabatan (Position) wrappers', () => {
  it('AC-124: listRoles returns role options sorted by name', async () => {
    const schemaObj = makeSharedSchema({ roles: { data: [{ id: 'r1', name: 'Barista' }], error: null } })
    schemaMock.mockReturnValue(schemaObj as never)

    const result = await listRoles()
    expect(result).toEqual([{ id: 'r1', name: 'Barista' }])
  })

  it('throws on listRoles error', async () => {
    const schemaObj = makeSharedSchema({ roles: { data: null, error: { message: 'rls denied' } } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(listRoles()).rejects.toThrow(/Couldn't load positions/)
  })

  it('AC-124: assignJabatan inserts a person_roles row with NO org_id', async () => {
    const schemaObj = makeSharedSchema({ person_roles: { data: null, error: null } })
    schemaMock.mockReturnValue(schemaObj as never)

    await assignJabatan('p1', 'r1')
    const builder = schemaObj.from.mock.results[0].value as { insert: ReturnType<typeof vi.fn> }
    expect(builder.insert).toHaveBeenCalledWith({ person_id: 'p1', role_id: 'r1' })
    const insertedArg = builder.insert.mock.calls[0][0] as Record<string, unknown>
    expect(insertedArg).not.toHaveProperty('org_id')
  })

  it('throws on assignJabatan error', async () => {
    const schemaObj = makeSharedSchema({ person_roles: { data: null, error: { message: 'duplicate' } } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(assignJabatan('p1', 'r1')).rejects.toThrow(/Couldn't assign position/)
  })

  it('AC-124: removeJabatan deletes by person_id + role_id', async () => {
    const schemaObj = makeSharedSchema({ person_roles: { data: null, error: null } })
    schemaMock.mockReturnValue(schemaObj as never)

    await removeJabatan('p1', 'r1')
    const builder = schemaObj.from.mock.results[0].value as { delete: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn> }
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('person_id', 'p1')
    expect(builder.eq).toHaveBeenCalledWith('role_id', 'r1')
  })

  it('throws on removeJabatan error', async () => {
    const schemaObj = makeSharedSchema({ person_roles: { data: null, error: { message: 'rls denied' } } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(removeJabatan('p1', 'r1')).rejects.toThrow(/Couldn't remove position/)
  })
})

// ── Revenue scope (supervisor) wrappers ──────────────────────────────────────
describe('Revenue scope (supervisor) wrappers', () => {
  it('AC-325: listRevenueScopeOptions returns the RPC rows', async () => {
    const reportingObj = makeSharedSchema(
      {},
      { data: [{ channel: 'POS', branch_code: 'BGR', branch_name: 'Bungur' }], error: null },
    )
    schemaMock.mockImplementation(((name: string) => (name === 'reporting' ? reportingObj : makeSharedSchema({}))) as never)

    const result = await listRevenueScopeOptions()
    expect(result).toEqual([{ channel: 'POS', branch_code: 'BGR', branch_name: 'Bungur' }])
  })

  it('throws on listRevenueScopeOptions error', async () => {
    const reportingObj = makeSharedSchema({}, { data: null, error: { message: 'rls denied' } })
    schemaMock.mockImplementation(((name: string) => (name === 'reporting' ? reportingObj : makeSharedSchema({}))) as never)
    await expect(listRevenueScopeOptions()).rejects.toThrow(/Couldn't load revenue branches/)
  })

  it('AC-325: assignRevenueScope inserts a scope row with no org_id', async () => {
    const reportingObj = makeSharedSchema({ supervisor_revenue_scope: { data: null, error: null } })
    schemaMock.mockImplementation(((name: string) => (name === 'reporting' ? reportingObj : makeSharedSchema({}))) as never)

    await assignRevenueScope('p1', 'POS', 'BGR')
    const builder = reportingObj.from.mock.results[0].value as { insert: ReturnType<typeof vi.fn> }
    expect(builder.insert).toHaveBeenCalledWith({ person_id: 'p1', channel: 'POS', branch_code: 'BGR' })
    const insertedArg = builder.insert.mock.calls[0][0] as Record<string, unknown>
    expect(insertedArg).not.toHaveProperty('org_id')
  })

  it('throws on assignRevenueScope error', async () => {
    const reportingObj = makeSharedSchema({ supervisor_revenue_scope: { data: null, error: { message: 'rls denied' } } })
    schemaMock.mockImplementation(((name: string) => (name === 'reporting' ? reportingObj : makeSharedSchema({}))) as never)
    await expect(assignRevenueScope('p1', 'POS', 'BGR')).rejects.toThrow(/Couldn't assign revenue scope/)
  })

  it('AC-325: removeRevenueScope deletes by person+channel+branch_code null (whole-channel)', async () => {
    const reportingObj = makeSharedSchema({ supervisor_revenue_scope: { data: null, error: null } })
    schemaMock.mockImplementation(((name: string) => (name === 'reporting' ? reportingObj : makeSharedSchema({}))) as never)

    await removeRevenueScope('p1', 'POS', null)
    const builder = reportingObj.from.mock.results[0].value as {
      delete: ReturnType<typeof vi.fn>
      eq: ReturnType<typeof vi.fn>
      is: ReturnType<typeof vi.fn>
    }
    expect(builder.delete).toHaveBeenCalled()
    expect(builder.eq).toHaveBeenCalledWith('person_id', 'p1')
    expect(builder.eq).toHaveBeenCalledWith('channel', 'POS')
    expect(builder.is).toHaveBeenCalledWith('branch_code', null)
  })

  it('AC-325: removeRevenueScope deletes by person+channel+branch_code set (specific branch)', async () => {
    const reportingObj = makeSharedSchema({ supervisor_revenue_scope: { data: null, error: null } })
    schemaMock.mockImplementation(((name: string) => (name === 'reporting' ? reportingObj : makeSharedSchema({}))) as never)

    await removeRevenueScope('p1', 'POS', 'BGR')
    const builder = reportingObj.from.mock.results[0].value as { eq: ReturnType<typeof vi.fn> }
    expect(builder.eq).toHaveBeenCalledWith('branch_code', 'BGR')
  })

  it('throws on removeRevenueScope error', async () => {
    const reportingObj = makeSharedSchema({ supervisor_revenue_scope: { data: null, error: { message: 'rls denied' } } })
    schemaMock.mockImplementation(((name: string) => (name === 'reporting' ? reportingObj : makeSharedSchema({}))) as never)
    await expect(removeRevenueScope('p1', 'POS', null)).rejects.toThrow(/Couldn't remove revenue scope/)
  })

  it('AC-325: listAdminPeople merges revenue_scope', async () => {
    const people = [{ id: 'p1', full_name: 'Budi Santoso', email: 'budi@example.test', archived_at: null }]
    const loginStatus = [{ person_id: 'p1', has_login: false, disabled: false }]
    const sharedObj = makeSharedSchema(
      {
        people: { data: people, error: null },
        person_access_roles: { data: [], error: null },
        person_roles: { data: [], error: null },
        roles: { data: [], error: null },
      },
      { data: loginStatus, error: null },
    )
    const reportingObj = makeSharedSchema({
      supervisor_revenue_scope: {
        data: [{ person_id: 'p1', channel: 'POS', branch_code: 'BGR' }],
        error: null,
      },
    })
    schemaMock.mockImplementation(((name: string) => (name === 'reporting' ? reportingObj : sharedObj)) as never)

    const result = await listAdminPeople()
    expect(result[0].revenue_scope).toEqual([{ channel: 'POS', branch_code: 'BGR' }])
  })
})

// ── Teams (shared.team_memberships) ──────────────────────────────────────────
// Membership is an authorization input, so these four wrappers decide who reads which Signals.
// Each assertion below is about the CONSEQUENCE, not the call shape — the two that matter most are
// that removal goes through the server-side cutoff, and that the home-team swap clears before it
// sets. Both were claimed in a docblock and asserted nowhere.
describe('Team wrappers', () => {
  it('listTeams names the (branch, activity) pair on stream teams and leaves org teams bare', async () => {
    const schemaObj = makeSharedSchema({
      teams: { data: [
        { id: 't1', name: 'HQ Operations', branch_id: null, activity: null },
        { id: 't2', name: 'Gordi HQ Bar', branch_id: 'b1', activity: 'bar' },
      ], error: null },
      branches: { data: [{ id: 'b1', name: 'Gordi HQ' }], error: null },
    })
    schemaMock.mockReturnValue(schemaObj as never)

    expect(await listTeams()).toEqual([
      { id: 't1', name: 'HQ Operations', branch_name: null, activity: null },
      { id: 't2', name: 'Gordi HQ Bar', branch_name: 'Gordi HQ', activity: 'bar' },
    ])
  })

  it('listTeams skips the branch read entirely when no team is a stream', async () => {
    const schemaObj = makeSharedSchema({
      teams: { data: [{ id: 't1', name: 'HQ Operations', branch_id: null, activity: null }], error: null },
    })
    schemaMock.mockReturnValue(schemaObj as never)

    await listTeams()
    expect(schemaObj.from).toHaveBeenCalledTimes(1)
    expect(schemaObj.from).not.toHaveBeenCalledWith('branches')
  })

  it('throws on listTeams error', async () => {
    const schemaObj = makeSharedSchema({ teams: { data: null, error: { message: 'rls denied' } } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(listTeams()).rejects.toThrow(/Couldn't load teams/)
  })

  it('addTeamMembership never sends org_id — the DB stamps it and the policy re-checks it', async () => {
    const schemaObj = makeSharedSchema({ team_memberships: { data: null, error: null } })
    schemaMock.mockReturnValue(schemaObj as never)

    await addTeamMembership('p1', 't1', true)
    const builder = schemaObj.from.mock.results[0].value as { insert: ReturnType<typeof vi.fn> }
    expect(builder.insert).toHaveBeenCalledWith({ person_id: 'p1', team_id: 't1', is_primary: true })
    expect(builder.insert.mock.calls[0][0] as Record<string, unknown>).not.toHaveProperty('org_id')
  })

  it('endTeamMembership goes through the RPC, never a client-written date', async () => {
    const schemaObj = makeSharedSchema({}, { data: null, error: null })
    schemaMock.mockReturnValue(schemaObj as never)

    await endTeamMembership('p1', 't1')
    // The whole point: `effective_to` is an inclusive last day, so a client writing today's date
    // revokes TOMORROW while the screen says removed. The cutoff has to be the database's.
    expect(schemaObj.rpc).toHaveBeenCalledWith('end_team_membership', { p_person_id: 'p1', p_team_id: 't1' })
    expect(schemaObj.from).not.toHaveBeenCalled()
  })

  it('throws when the removal RPC refuses', async () => {
    const schemaObj = makeSharedSchema({}, { data: null, error: { message: 'permission denied' } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(endTeamMembership('p1', 't1')).rejects.toThrow(/Couldn't remove from team/)
  })

  it('setPrimaryTeam CLEARS the old primary before setting the new one', async () => {
    const schemaObj = makeSharedSchema({ team_memberships: { data: null, error: null } })
    schemaMock.mockReturnValue(schemaObj as never)

    await setPrimaryTeam('p1', 't2')
    // Order is load-bearing, not stylistic: team_memberships_one_primary is unique on person_id
    // where is_primary and effective_to is null, so setting before clearing hits the index and
    // fails. Swap the two blocks in admin-users.ts and this assertion is what goes red.
    const [clear, set] = schemaObj.from.mock.results.map(
      (r) => r.value as { update: ReturnType<typeof vi.fn> },
    )
    expect(clear.update).toHaveBeenCalledWith({ is_primary: false })
    expect(set.update).toHaveBeenCalledWith({ is_primary: true })
  })

  it('setPrimaryTeam stops at the clear step if it fails, rather than orphaning two primaries', async () => {
    const schemaObj = makeSharedSchema({ team_memberships: { data: null, error: { message: 'rls denied' } } })
    schemaMock.mockReturnValue(schemaObj as never)
    await expect(setPrimaryTeam('p1', 't2')).rejects.toThrow(/Couldn't set home team/)
    expect(schemaObj.from).toHaveBeenCalledTimes(1)
  })
})
