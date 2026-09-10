// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterEach, expect, test, vi } from 'vitest'
import { AC204, TASKS } from '@/../e2e/fixtures/tasks'
import { assertFixtureSqlSafe, assertLocalFixtureDatabase, fixtureCleanupSql } from '@/../e2e/fixtures/cleanup'

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

test('SQL guard rejects broad and disguised deletes and allows the owned cleanup', () => {
  expect(() => assertFixtureSqlSafe(fixtureCleanupSql)).not.toThrow()
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
