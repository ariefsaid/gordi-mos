// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { afterEach, expect, test, vi } from 'vitest'
import { AC204, TASKS } from '@/../e2e/fixtures/tasks'
import { localSql } from '@/../e2e/helpers/local-sql'
import { localSqlRead } from '@/../e2e/helpers/local-sql-read'
import {
  assertFixtureSqlSafe,
  assertFixtureSqlReadOnly,
  assertLocalFixtureDatabase,
  E2E_CLEANUP_REGISTRY,
  budgetCleanupSql,
  fixtureCleanupSql,
  notificationCleanupSql,
  objectiveCleanupSql,
  processRunCleanupSql,
  signalCleanupSql,
  taskCleanupSql,
  userViewCleanupSql,
} from '@/../e2e/fixtures/cleanup'

vi.mock('fs', async (original) => {
  const fs = await original<typeof import('fs')>()
  return { ...fs, readFileSync: (path: string, encoding: BufferEncoding) =>
    String(path).endsWith('.env.e2e')
      ? 'VITE_SUPABASE_URL=http://localhost:1\nSUPABASE_SERVICE_ROLE_KEY=unit-test-only'
      : fs.readFileSync(path, encoding) }
})
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: {
  listUsers: async () => ({ data: { users: [] } }),
  createUser: async () => ({ data: { user: { id: 'test-user' } } }),
} } }) }))
vi.mock('../lib/dev-server', () => ({
  MOS_DEV_PORT_ENV: 'MOS_DEV_PORT', devServerPort: () => 1,
  worktreeFingerprint: () => 'unit-test', devServerIdentityUrl: () => 'http://localhost:1/identity',
  assertDevServerOwnership: () => {},
}))

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

test('setup and teardown preserve unowned business rows, including misleading fixture-like titles', async () => {
  const queries: string[] = []
  vi.stubEnv('MOS_DB_LOCK_HELD', '1')
  vi.spyOn(console, 'log').mockImplementation(() => {})
  // No request can leave this process, including auth and server identity checks.
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.body) queries.push(JSON.parse(String(options.body)).query)
    return { ok: true, text: async () => 'unit-test' }
  }))
  const setup = (await import('@/../e2e/global-setup')).default
  const teardown = (await import('@/../e2e/global-teardown')).default
  await setup()
  const setupQueries = queries.splice(0)
  await teardown()

  const stages = [setupQueries, queries].map((stage) => stage.flatMap((query) =>
    query.match(/DELETE\s+FROM\s+[\s\S]*?;/gi) ?? []))
  // Replay the actual hook DELETE statements in private, in-memory SQLite schemas.
  // The fixture subset needs only standard SQL; no shared database or PostgreSQL endpoint.
  const result = execFileSync('python3', ['-c', `
import json, sqlite3, sys
data = json.load(sys.stdin)
db = sqlite3.connect(':memory:')
for schema in ['mos', 'ops']:
    db.execute("ATTACH DATABASE ':memory:' AS " + schema)
tables = ['mos.tasks', 'mos.task_events', 'mos.task_checklist_items',
          'mos.weekly_updates', 'mos.weekly_update_items', 'ops.log_entries',
          'mos.work_lines', 'mos.objectives']
before = {}
for table in tables:
    db.execute('CREATE TABLE ' + table + ' (id TEXT, org_id TEXT, title TEXT, name TEXT, task_id TEXT)')
    for title in ['Owner note', 'E2E sentinel', 'AC204 sentinel', 'Invoice 1784742614442']:
        db.execute('INSERT INTO ' + table + ' VALUES (?, ?, ?, ?, ?)',
                   (title, data['org'], title, title, 'Owner note'))
    before[table] = db.execute('SELECT * FROM ' + table + ' ORDER BY id').fetchall()
for stage in data['stages']:
    for table, ids in data['owned'].items():
        for id in ids:
            db.execute('INSERT INTO ' + table + ' VALUES (?, ?, ?, ?, ?)',
                       (id, data['org'], 'renamed fixture', 'renamed fixture', id))
    for statement in stage:
        db.execute(statement)
    for table in tables:
        assert db.execute('SELECT * FROM ' + table + ' ORDER BY id').fetchall() == before[table], table
print('sentinels survive setup and teardown; owned fixtures removed')
`], { input: JSON.stringify({
    org: TASKS.VIEWER_ACCOUNTABLE.orgId,
    stages,
    owned: {
      'mos.tasks': [TASKS.VIEWER_ACCOUNTABLE.id, ...Object.values(AC204.tasks).map((t) => t.id)],
      'mos.task_events': [TASKS.VIEWER_ACCOUNTABLE.id, ...Object.values(AC204.tasks).map((t) => t.id)],
      'mos.task_checklist_items': [TASKS.VIEWER_ACCOUNTABLE.id, ...Object.values(AC204.tasks).map((t) => t.id)],
      'mos.work_lines': [AC204.launch.id, AC204.loose.id],
      'mos.objectives': [AC204.objective.id],
    },
  }), encoding: 'utf8' })
  expect(result).toContain('sentinels survive setup and teardown; owned fixtures removed')
})

test('global hooks delegate all business deletion to the fixture cleanup boundary', () => {
  for (const file of ['global-setup.ts', 'global-teardown.ts']) {
    const source = readFileSync(new URL(`../../e2e/${file}`, import.meta.url), 'utf8')
    expect(source).not.toMatch(/DELETE\s+FROM|TRUNCATE\s|\.delete\s*\(/i)
    expect(source).toContain('fixtureCleanupSql')
  }
})

test('captured task writers use the owned-ID fixture and its SQL guard', () => {
  const e2eDir = new URL('../../e2e/', import.meta.url)
  const specFiles = readdirSync(e2eDir).filter((file) => file.endsWith('.spec.ts'))
  const taskWriterFiles = specFiles.filter((file) => {
    const source = readFileSync(new URL(`../../e2e/${file}`, import.meta.url), 'utf8')
    return /\bcreateTaskViaUI\s*\(/.test(source)
  })
  const explicitTaskWriter = 'shell-url-state.spec.ts'
  expect(taskWriterFiles).toContain('guards.geometry.spec.ts')
  for (const file of [...taskWriterFiles, explicitTaskWriter]) {
    const source = readFileSync(new URL(`../../e2e/${file}`, import.meta.url), 'utf8')
    expect(source, `${file} must use captured task-ID cleanup`).toContain("./fixtures/task-browser")
  }
  expect(readFileSync(new URL(`../../e2e/${explicitTaskWriter}`, import.meta.url), 'utf8'))
    .toContain('@e2e-owned-cleanup: captured-task-ids')

  const fixtureSource = readFileSync(new URL('../../e2e/fixtures/task-browser.ts', import.meta.url), 'utf8')
  expect(fixtureSource).toContain('assertFixtureSqlSafe')
  expect(fixtureSource).toMatch(/assertFixtureSqlSafe\(cleanup\)[\s\S]*await localSql\(cleanup\)/)
})

test('every Playwright data writer is registered with an owned cleanup contract', () => {
  const e2eDir = new URL('../../e2e/', import.meta.url)
  const specFiles = readdirSync(e2eDir).filter((file) => file.endsWith('.spec.ts'))
  const sources = new Map(specFiles.map((file) => [
    file,
    readFileSync(new URL(`../../e2e/${file}`, import.meta.url), 'utf8'),
  ]))
  const detected = [...sources.entries()]
    .filter(([, source]) => /localSql\(|\/pg\/query|from ['"]\.\/fixtures\/(?:task|signal|user-view|budget)-browser['"]|@e2e-owned-cleanup:/.test(source))
    .map(([file]) => file)
    .sort()
  expect(detected).toEqual(Object.keys(E2E_CLEANUP_REGISTRY).sort())
  for (const [file, contract] of Object.entries(E2E_CLEANUP_REGISTRY)) {
    const source = sources.get(file)
    expect(source, `${file} must remain in e2e`).toBeDefined()
    expect(source, `${file} must own a cleanup path`).toMatch(/localSql\(|\/pg\/query|fixtures\/(?:task|signal|user-view|budget)-browser|@e2e-owned-cleanup:/)
    if (contract === 'captured-task-ids') {
      expect(source, `${file} must use the task browser fixture`).toContain("./fixtures/task-browser")
    }
    if (contract === 'captured-signal-ids') {
      expect(source, `${file} must declare signal capture`).toContain('@e2e-owned-cleanup: captured-signal-ids')
    }
    if (contract === 'captured-user-view-id') {
      expect(source, `${file} must declare user-view capture`).toContain('@e2e-owned-cleanup: captured-user-view-ids')
    }
    if (contract === 'captured-budget-id') {
      expect(source, `${file} must declare budget capture`).toContain('@e2e-owned-cleanup: captured-budget-ids')
    }
    if (contract === 'captured-process-run-id') {
      expect(source, `${file} must use guarded process-run cleanup`).toContain('processRunCleanupSql')
    }
  }
})

test('SQL guard rejects broad and disguised deletes and allows the owned cleanup', () => {
  expect(() => assertFixtureSqlSafe(fixtureCleanupSql)).not.toThrow()
  const capturedCleanup = taskCleanupSql(['a1000000-0000-0000-0000-000000000001'])
  expect(() => assertFixtureSqlSafe(capturedCleanup)).not.toThrow()
  expect(() => taskCleanupSql(['not-a-uuid'])).toThrow(/UUID-owned/)
  for (const cleanup of [
    signalCleanupSql(['a1000000-0000-0000-0000-000000000002']),
    userViewCleanupSql(['a1000000-0000-0000-0000-000000000003']),
    budgetCleanupSql(['a1000000-0000-0000-0000-000000000004']),
    objectiveCleanupSql(['a1000000-0000-0000-0000-000000000005']),
  ]) expect(() => assertFixtureSqlSafe(cleanup)).not.toThrow()
  const runCleanup = processRunCleanupSql(['a1000000-0000-0000-0000-000000000006'])
  expect(() => assertFixtureSqlSafe(runCleanup)).not.toThrow()
  expect(() => processRunCleanupSql(['not-a-uuid'])).toThrow(/UUID-owned/)
  expect(() => assertFixtureSqlSafe(
    "INSERT INTO mos.tasks (title) VALUES ('-- quoted text') ON CONFLICT (id) DO NOTHING",
  )).not.toThrow()
  for (const sql of [
    "DELETE FROM mos.tasks WHERE org_id = 'demo';",
    "DELETE FROM mos.weekly_updates WHERE org_id = 'demo';",
    "DELETE FROM ops.log_entries WHERE org_id = 'demo';",
    "DELETE FROM mos.tasks WHERE title LIKE 'E2E %';",
    "WITH doomed AS (DELETE FROM mos.tasks RETURNING *) SELECT * FROM doomed;",
    'TRUNCATE mos.tasks CASCADE;',
    'DROP TABLE mos.tasks;',
    fixtureCleanupSql.replace(/ AND id IN \([^)]*\)/, ''),
    fixtureCleanupSql + "DELETE FROM mos.tasks WHERE org_id = 'demo';",
    capturedCleanup.replace(');', ") AND title = 'E2E';"),
    "DO $$ BEGIN EXECUTE chr(68)||chr(69)||chr(76)||chr(69)||chr(84)||chr(69)||' FROM mos.tasks'; END $$;",
    "DO 'BEGIN PERFORM wipe_everything(); END';",
    "/* harmless */ DO 'BEGIN PERFORM wipe_everything(); END';",
    "SELECT '--'; DO 'BEGIN PERFORM wipe_everything(); END';",
    "SELECT foo$tag$; DO 'BEGIN PERFORM wipe_everything(); END';",
    "CALL delete_everything();",
  ]) expect(() => assertFixtureSqlSafe(sql)).toThrow(/E2E/)
})

test('fixture database must be local', () => {
  for (const url of ['http://localhost:1', 'http://127.0.0.1:1']) {
    expect(() => assertLocalFixtureDatabase(url)).not.toThrow()
  }
  for (const url of ['https://example.test', 'http://localhost.example.test', 'invalid']) {
    expect(() => assertLocalFixtureDatabase(url)).toThrow()
  }
})

test('local SQL helpers enforce their safety contracts before transport', async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => [], text: async () => '' }))
  vi.stubGlobal('fetch', fetch)

  await expect(localSql("DELETE FROM mos.tasks WHERE org_id = 'demo';")).rejects.toThrow(/E2E deletion/)
  expect(fetch).not.toHaveBeenCalled()

  await expect(localSqlRead("UPDATE mos.tasks SET title = 'oops';")).rejects.toThrow(/read-only/)
  expect(fetch).not.toHaveBeenCalled()

  await localSql(notificationCleanupSql(['a1000000-0000-0000-0000-000000000007']))
  expect(fetch).toHaveBeenCalledTimes(1)
})

test('read-only SQL guard ignores comments and quoted text but rejects procedural or mutating statements', () => {
  expect(() => assertFixtureSqlReadOnly("SELECT '-- DELETE FROM mos.tasks'; -- UPDATE is prose\nSELECT 1;"))
    .not.toThrow()
  for (const query of [
    'INSERT INTO mos.tasks (title) VALUES (\'new\');',
    'UPDATE mos.tasks SET title = \'new\';',
    'DELETE FROM mos.tasks WHERE id = \'a1000000-0000-0000-0000-000000000001\';',
    "DO $$ BEGIN PERFORM wipe_everything(); END $$;",
  ]) expect(() => assertFixtureSqlReadOnly(query)).toThrow(/read-only/)
})

test('process-run journeys never sweep seeded runs by process and team', () => {
  const ac720 = readFileSync(new URL('../../e2e/AC-720-cafe-today-opening.spec.ts', import.meta.url), 'utf8')
  const geometry = readFileSync(new URL('../../e2e/guards.geometry.spec.ts', import.meta.url), 'utf8')
  for (const source of [ac720, geometry]) {
    expect(source).not.toMatch(/delete\s+from\s+mos\.process_runs\s+where\s+work_line_id/i)
    expect(source).not.toMatch(/delete\s+from\s+mos\.tasks\s+where\s+process_run_id\s+in\s*\(/i)
  }
  expect(ac720).toContain('processRunCleanupSql')
})

test('global setup relinks only the canonical demo organization', () => {
  const source = readFileSync(new URL('../../e2e/global-setup.ts', import.meta.url), 'utf8')
  expect(source).toContain("WHERE p.org_id = '${ORG}'")
  expect(source).toContain('u.email = p.email')
  expect(source).toContain('p.email IN')
})

test('process-spawning café journeys are opt-in before hooks register', () => {
  const cases = [
    ['../../e2e/AC-720-cafe-today-opening.spec.ts', 'ALLOW_SHARED_CAFE_OPENING_FIXTURE', 'MOS_E2E_ALLOW_SHARED_CAFE_OPENING_FIXTURE', 'test.afterEach'],
    ['../../e2e/home-cafe-parity.spec.ts', 'ALLOW_SHARED_HOME_CAFE_FIXTURE', 'MOS_E2E_ALLOW_SHARED_HOME_CAFE_FIXTURE', 'test.beforeAll'],
  ] as const
  for (const [file, marker, envName, hook] of cases) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    const gateIndex = source.indexOf(`if (!${marker})`)
    expect(source).toContain(envName)
    expect(source).toContain('spawn_process_run')
    expect(source).toContain('idempotent')
    expect(source).toContain('createdRunId = spawned.run_id')
    expect(gateIndex).toBeGreaterThan(-1)
    expect(source.indexOf(hook)).toBeGreaterThan(gateIndex)
  }
})
