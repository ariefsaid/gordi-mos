import { AC204, TASKS } from './tasks'

// Only fixed IDs declared by this harness are owned. Titles, dates, authors and org membership
// do not establish ownership. Dynamic UI fixtures must be cleaned by their creating journey.
const taskIds = [TASKS.VIEWER_ACCOUNTABLE.id, ...Object.values(AC204.tasks).map((task) => task.id)]
const ids = (values: readonly string[]) => values.map((id) => `'${id}'`).join(', ')
const org = TASKS.VIEWER_ACCOUNTABLE.orgId

export const fixtureCleanupSql = `
  DELETE FROM mos.task_events WHERE org_id = '${org}' AND task_id IN (${ids(taskIds)});
  DELETE FROM mos.task_checklist_items WHERE org_id = '${org}' AND task_id IN (${ids(taskIds)});
  DELETE FROM mos.tasks WHERE org_id = '${org}' AND id IN (${ids(taskIds)});
  DELETE FROM mos.work_lines WHERE org_id = '${org}' AND id IN (${ids([AC204.launch.id, AC204.loose.id])});
  DELETE FROM mos.objectives WHERE org_id = '${org}' AND id IN (${ids([AC204.objective.id])});
`

/** Fail closed before transport if a hook adds a delete outside the fixed fixture boundary. */
export function assertFixtureSqlSafe(query: string): void {
  const normalize = (sql: string) => sql.trim().replace(/\s+/g, ' ').toLowerCase()
  const allowed = new Set(fixtureCleanupSql.split(';').filter((sql) => sql.trim()).map(normalize))
  if (/\b(truncate|drop)\b/i.test(query)) throw new Error('E2E SQL cannot truncate or drop data')
  for (const statement of query.split(';')) {
    if (/\bdelete\b/i.test(statement) && !allowed.has(normalize(statement))) {
      throw new Error('E2E deletion must use the fixed fixture cleanup boundary')
    }
  }
}

export function assertLocalFixtureDatabase(url: string): void {
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('E2E fixtures require a local database')
  }
}
