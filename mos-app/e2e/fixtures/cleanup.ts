import { AC204, TASKS } from './tasks'

// Only fixed IDs declared by this harness are owned. Titles, dates, authors and org membership
// do not establish ownership. Dynamic UI fixtures must be cleaned by their creating journey.
const taskIds = [TASKS.VIEWER_ACCOUNTABLE.id, ...Object.values(AC204.tasks).map((task) => task.id)]
const ids = (values: readonly string[]) => values.map((id) => `'${id}'`).join(', ')
const org = TASKS.VIEWER_ACCOUNTABLE.orgId
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const CAFE_WASTE_FIXTURE = {
  orgId: org,
  itemId: 'a11e2e00-0000-0000-0000-000000001241',
  unitId: 'a11e2e00-0000-0000-0000-000000001242',
  settingId: 'a11e2e00-0000-0000-0000-000000001243',
  settingUnitId: 'a11e2e00-0000-0000-0000-000000001244',
  itemName: 'E2E Waste Item',
} as const

export const fixtureCleanupSql = `
  DELETE FROM mos.task_events WHERE org_id = '${org}' AND task_id IN (${ids(taskIds)});
  DELETE FROM mos.task_checklist_items WHERE org_id = '${org}' AND task_id IN (${ids(taskIds)});
  DELETE FROM mos.tasks WHERE org_id = '${org}' AND id IN (${ids(taskIds)});
  DELETE FROM mos.work_lines WHERE org_id = '${org}' AND id IN (${ids([AC204.launch.id, AC204.loose.id])});
  DELETE FROM mos.objectives WHERE org_id = '${org}' AND id IN (${ids([AC204.objective.id])});
`

/** Fixed test data cleanup. Private Storage objects are removed through the Storage API first. */
export const cafeWasteCleanupSql = `
  DELETE FROM ops.kitchen_logs WHERE org_id = '${CAFE_WASTE_FIXTURE.orgId}' AND wip_item_id = '${CAFE_WASTE_FIXTURE.itemId}';
  DELETE FROM ops.cafe_item_settings WHERE org_id = '${CAFE_WASTE_FIXTURE.orgId}' AND wip_item_id = '${CAFE_WASTE_FIXTURE.itemId}';
  DELETE FROM ops.stream_items WHERE org_id = '${CAFE_WASTE_FIXTURE.orgId}' AND wip_item_id = '${CAFE_WASTE_FIXTURE.itemId}';
  DELETE FROM ops.item_units WHERE org_id = '${CAFE_WASTE_FIXTURE.orgId}' AND wip_item_id = '${CAFE_WASTE_FIXTURE.itemId}';
  DELETE FROM ops.wip_items WHERE org_id = '${CAFE_WASTE_FIXTURE.orgId}' AND id = '${CAFE_WASTE_FIXTURE.itemId}';
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

/** Remove one or more dynamically captured Process runs and only their owned dependent rows. */
export function processRunCleanupSql(runIds: readonly string[], runOrg = org): string {
  if (!UUID.test(runOrg) || runIds.some((id) => !UUID.test(id))) {
    throw new Error('E2E process-run cleanup requires UUID-owned rows')
  }
  if (runIds.length === 0) return ''
  const owned = ids(runIds)
  return `
    DELETE FROM mos.process_run_pending_tasks WHERE org_id = '${runOrg}' AND process_run_id IN (${owned});
    DELETE FROM mos.tasks WHERE org_id = '${runOrg}' AND process_run_id IN (${owned});
    DELETE FROM mos.process_runs WHERE org_id = '${runOrg}' AND id IN (${owned});
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

export const processRunPendingCleanupSql = (pendingIds: readonly string[], pendingOrg = org) =>
  capturedRowCleanupSql('mos.process_run_pending_tasks', pendingIds, pendingOrg)

/** Remove the saved preferences of fixed e2e people. */
export function personPreferenceCleanupSql(personIds: readonly string[]): string {
  if (personIds.some((id) => !UUID.test(id))) throw new Error('E2E preference cleanup requires UUID-owned rows')
  if (personIds.length === 0) return ''
  return `DELETE FROM shared.person_preferences WHERE person_id IN (${ids(personIds)});`
}

/** Remove notifications created by a journey, optionally asserting their owning person. */
export function notificationCleanupSql(
  notificationIds: readonly string[],
  notificationOrg = org,
  ownerId?: string,
): string {
  if (!UUID.test(notificationOrg) || notificationIds.some((id) => !UUID.test(id))
    || (ownerId !== undefined && !UUID.test(ownerId))) {
    throw new Error('E2E notification cleanup requires UUID-owned rows')
  }
  if (notificationIds.length === 0) return ''
  const ownerClause = ownerId ? ` AND owner_id = '${ownerId}'` : ''
  return `DELETE FROM mos.notifications WHERE org_id = '${notificationOrg}' AND id IN (${ids(notificationIds)})${ownerClause};`
}

/** Every Playwright data writer has an explicit cleanup contract recorded here. */
export const E2E_CLEANUP_REGISTRY = {
  'AC-014-bar-capture-journey.spec.ts': 'fixed-item-id',
  'AC-018-objective-writeup.spec.ts': 'fixed-objective-id',
  'AC-020-catalog.spec.ts': 'captured-objective-id-and-fixed-task-id',
  'AC-090-kitchen-log-approve.spec.ts': 'fixed-item-id',
  'cafe-waste-review.spec.ts': 'fixed-waste-item-id-with-storage-api-cleanup',
  'AC-134.spec.ts': 'fixed-task-ids',
  'AC-230.spec.ts': 'fixed-task-and-work-line-ids',
  'AC-411-catalog-manage-mode.spec.ts': 'fixed-catalog-ids',
  'AC-430-post-a-signal.spec.ts': 'captured-signal-ids',
  'AC-524-follow-up.spec.ts': 'fixed-follow-up-ids',
  'AC-744-cafe-write-gate.spec.ts': 'fixed-item-id',
  'AC-PB-012-budget-pricing-preflight.spec.ts': 'captured-budget-id',
  'account-language.spec.ts': 'fixed-person-ids',
  'authority-settings-roundtrip.spec.ts': 'captured-tenant-ids',
  'dev-views.spec.ts': 'captured-user-view-id',
  'guards.geometry.spec.ts': 'captured-task-ids',
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
} as const

/** Keep executable SQL tokens while blanking quoted bodies and comments. This lets the safety
 * boundary inspect statement keywords without treating `--` inside a string as a real comment. */
function executableSqlOnly(sql: string): string {
  let output = ''
  let index = 0
  const blank = (value: string) => value.replace(/[^\r\n]/g, ' ')

  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      const end = sql.indexOf('\n', index + 2)
      const next = end === -1 ? sql.length : end
      output += blank(sql.slice(index, next))
      index = next
      continue
    }
    if (sql.startsWith('/*', index)) {
      const start = index
      let depth = 1
      index += 2
      while (index < sql.length && depth > 0) {
        if (sql.startsWith('/*', index)) { depth += 1; index += 2; continue }
        if (sql.startsWith('*/', index)) { depth -= 1; index += 2; continue }
        index += 1
      }
      output += blank(sql.slice(start, index))
      continue
    }
    const quote = sql[index]
    if (quote === "'" || quote === '"') {
      const start = index
      index += 1
      while (index < sql.length) {
        if (sql[index] !== quote) { index += 1; continue }
        if (sql[index + 1] === quote) { index += 2; continue }
        index += 1
        break
      }
      output += blank(sql.slice(start, index))
      continue
    }
    const dollarQuoteBoundary = index === 0 || !/[A-Za-z0-9_$]/.test(sql[index - 1])
    if (quote === '$' && dollarQuoteBoundary) {
      const delimiter = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index))?.[0]
      if (delimiter) {
        const start = index
        const end = sql.indexOf(delimiter, index + delimiter.length)
        index = end === -1 ? sql.length : end + delimiter.length
        output += blank(sql.slice(start, index))
        continue
      }
    }
    output += sql[index]
    index += 1
  }
  return output
}

/** Validate a cleanup query before it reaches the service-role SQL endpoint. */
export function assertFixtureSqlSafe(query: string): void {
  const normalize = (sql: string) => sql.trim().replace(/\s+/g, ' ').toLowerCase()
  const executableSql = executableSqlOnly(query)
  const allowed = new Set(
    [...fixtureCleanupSql.split(';'), ...cafeWasteCleanupSql.split(';')]
      .filter((sql) => sql.trim())
      .map(normalize),
  )
  const uuid = "'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'"
  const uuidList = `${uuid}(?:, ${uuid})*`
  const capturedRowDeletes = [
    new RegExp(`^delete from mos\\.(?:task_events|task_checklist_items) where org_id = ${uuid} and task_id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.tasks where org_id = ${uuid} and id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.process_run_pending_tasks where org_id = ${uuid} and process_run_id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.tasks where org_id = ${uuid} and process_run_id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.process_runs where org_id = ${uuid} and id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.(?:signals|user_views|budgets|objectives) where org_id = ${uuid} and id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.notifications where org_id = ${uuid} and metadata->'entity'->>'type' = 'signal' and metadata->'entity'->>'id' in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.notifications where org_id = ${uuid} and id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from mos\\.notifications where org_id = ${uuid} and id in \\(${uuidList}\\) and owner_id = ${uuid}$`),
    new RegExp(`^delete from mos\\.process_run_pending_tasks where org_id = ${uuid} and id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from shared\\.person_preferences where person_id in \\(${uuidList}\\)$`),
    new RegExp(`^delete from shared\\.orgs where id = ${uuid}$`),
    new RegExp(`^delete from shared\\.role_authority where org_id = ${uuid} and action = 'workline\\.manage' and role = 'team_lead'$`),
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

/** Validate a read-only SQL query before it reaches the service-role SQL endpoint. */
export function assertFixtureSqlReadOnly(query: string): void {
  const executableSql = executableSqlOnly(query).trim()
  if (!/^(?:select|with)\b/i.test(executableSql)
    || /\b(?:insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|execute|prepare|call|do|set|reset|copy|vacuum|refresh)\b/i.test(executableSql)) {
    throw new Error('E2E read-only SQL must be a SELECT/WITH query')
  }
}

export function assertLocalFixtureDatabase(url: string): void {
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('E2E fixtures require a local database')
  }
}
