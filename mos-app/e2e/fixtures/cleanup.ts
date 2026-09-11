import { AC204, TASKS } from './tasks'

// Only fixed IDs declared by this harness are owned. Titles, dates, authors and org membership
// do not establish ownership. Dynamic UI fixtures must be cleaned by their creating journey.
const taskIds = [TASKS.VIEWER_ACCOUNTABLE.id, ...Object.values(AC204.tasks).map((task) => task.id)]
const ids = (values: readonly string[]) => values.map((id) => `'${id}'`).join(', ')
const org = TASKS.VIEWER_ACCOUNTABLE.orgId
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const fixtureCleanupSql = `
  DELETE FROM mos.task_events WHERE org_id = '${org}' AND task_id IN (${ids(taskIds)});
  DELETE FROM mos.task_checklist_items WHERE org_id = '${org}' AND task_id IN (${ids(taskIds)});
  DELETE FROM mos.tasks WHERE org_id = '${org}' AND id IN (${ids(taskIds)});
  DELETE FROM mos.work_lines WHERE org_id = '${org}' AND id IN (${ids([AC204.launch.id, AC204.loose.id])});
  DELETE FROM mos.objectives WHERE org_id = '${org}' AND id IN (${ids([AC204.objective.id])});
`

/** Fail closed before transport if a hook adds a delete outside the fixed fixture boundary. */
export function taskCleanupSql(taskIdsToDelete: readonly string[], taskOrg = org): string {
  if (!UUID.test(taskOrg) || taskIdsToDelete.some((id) => !UUID.test(id))) {
    throw new Error('E2E task cleanup requires UUID-owned rows')
  }
  if (taskIdsToDelete.length === 0) return ''
  const owned = ids(taskIdsToDelete)
  return `
    DELETE FROM mos.task_events WHERE org_id = '${taskOrg}' AND task_id IN (${owned});
    DELETE FROM mos.task_checklist_items WHERE org_id = '${taskOrg}' AND task_id IN (${owned});
    DELETE FROM mos.tasks WHERE org_id = '${taskOrg}' AND id IN (${owned});
  `
}

function capturedRowCleanupSql(table: string, idsToDelete: readonly string[], taskOrg = org): string {
  if (!UUID.test(taskOrg) || idsToDelete.some((id) => !UUID.test(id))) {
    throw new Error('E2E row cleanup requires UUID-owned rows')
  }
  if (idsToDelete.length === 0) return ''
  return `DELETE FROM ${table} WHERE org_id = '${taskOrg}' AND id IN (${ids(idsToDelete)});`
}

export function signalCleanupSql(signalIds: readonly string[], signalOrg = org): string {
  if (signalIds.length === 0) return ''
  const owned = ids(signalIds)
  return `
    DELETE FROM mos.notifications
     WHERE org_id = '${signalOrg}'
       AND metadata->'entity'->>'type' = 'signal'
       AND metadata->'entity'->>'id' IN (${owned});
    ${capturedRowCleanupSql('mos.signals', signalIds, signalOrg)}
  `
}

export const userViewCleanupSql = (viewIds: readonly string[], viewOrg = org) =>
  capturedRowCleanupSql('mos.user_views', viewIds, viewOrg)

export const budgetCleanupSql = (budgetIds: readonly string[], budgetOrg = org) =>
  capturedRowCleanupSql('mos.budgets', budgetIds, budgetOrg)

export const objectiveCleanupSql = (objectiveIds: readonly string[], objectiveOrg = org) =>
  capturedRowCleanupSql('mos.objectives', objectiveIds, objectiveOrg)

/** Every Playwright data writer has an explicit cleanup contract recorded here. */
export const E2E_CLEANUP_REGISTRY = {
  'AC-014-bar-capture-journey.spec.ts': 'fixed-item-id',
  'AC-020-catalog.spec.ts': 'captured-objective-id-and-fixed-task-id',
  'AC-090-kitchen-log-approve.spec.ts': 'fixed-item-id',
  'AC-134.spec.ts': 'fixed-task-ids',
  'AC-230.spec.ts': 'fixed-task-and-work-line-ids',
  'AC-411-catalog-manage-mode.spec.ts': 'fixed-catalog-ids',
  'AC-430-post-a-signal.spec.ts': 'captured-signal-ids',
  'AC-524-follow-up.spec.ts': 'fixed-follow-up-ids',
  'AC-630-start-occurrence.spec.ts': 'captured-process-run-id',
  'AC-720-cafe-today-opening.spec.ts': 'fixed-process-and-team-scope',
  'AC-744-cafe-write-gate.spec.ts': 'fixed-item-id',
  'AC-PB-012-budget-pricing-preflight.spec.ts': 'captured-budget-id',
  'authority-settings-roundtrip.spec.ts': 'captured-tenant-ids',
  'dev-views.spec.ts': 'captured-user-view-id',
  'guards.geometry.spec.ts': 'captured-task-ids-and-fixed-process-scope',
  'home-cafe-parity.spec.ts': 'captured-run-and-pending-ids-plus-fixed-seed-ids',
  'home-tasks-redesign.spec.ts': 'captured-task-ids',
  'home-work-personas.spec.ts': 'captured-task-ids-plus-fixed-seed-ids',
  'shell-count-parity.spec.ts': 'captured-notification-id',
  'shell-url-state.spec.ts': 'captured-task-ids',
  'tasks-archive.spec.ts': 'captured-task-ids',
  'tasks-browser-back-dirty-veto.spec.ts': 'captured-task-ids',
  'tasks-canonical-page.spec.ts': 'captured-task-ids',
  'tasks-create-status.spec.ts': 'captured-task-ids',
  'tasks-deeplink-mobile-keyboard.spec.ts': 'captured-task-ids',
  'tasks-record-close.spec.ts': 'captured-task-ids',
  'tasks-split-view.spec.ts': 'captured-task-ids',
  'work-persona-closure.spec.ts': 'captured-process-run-id',
} as const

/** Validate a cleanup query before it reaches the service-role SQL endpoint. */
export function assertFixtureSqlSafe(query: string): void {
  const normalize = (sql: string) => sql.trim().replace(/\s+/g, ' ').toLowerCase()
  const executableSql = query
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
  const allowed = new Set(fixtureCleanupSql.split(';').filter((sql) => sql.trim()).map(normalize))
  const uuid = "'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'"
  const uuidList = `${uuid}(?:, ${uuid})*`
  const capturedRowDeletes = [
    new RegExp(`^delete from mos\\.(?:task_events|task_checklist_items) where org_id = ${uuid} and task_id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.tasks where org_id = ${uuid} and id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.(?:signals|user_views|budgets|objectives) where org_id = ${uuid} and id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.notifications where org_id = ${uuid} and metadata->'entity'->>'type' = 'signal' and metadata->'entity'->>'id' in \\(${uuidList}\\)$`),
  ]
  if (/\b(truncate|drop|execute|prepare|call)\b/i.test(executableSql) || /(?:^|;)\s*do\b/i.test(executableSql)) {
    throw new Error('E2E SQL cannot use destructive or procedural execution')
  }
  for (const statement of query.split(';')) {
    if (!statement.trim()) continue
    const normalized = normalize(statement)
    if (/\bdelete\b/.test(normalized)
      && !allowed.has(normalized)
      && !capturedRowDeletes.some((pattern) => pattern.test(normalized))) {
      throw new Error('E2E deletion must use the fixed fixture cleanup boundary')
    }
  }
}

export function assertLocalFixtureDatabase(url: string): void {
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('E2E fixtures require a local database')
  }
}
