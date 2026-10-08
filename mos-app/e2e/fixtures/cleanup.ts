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

// OD-CAFE-MVP-12: Café capture fixtures must explicitly configure team-owned kind + active
// state. Unclassified/inactive ERP seed items intentionally do not appear in capture anymore.
export const CAFE_PLAN_GUARD_FIXTURE = {
  orgId: org,
  itemId: 'a11e2e00-0000-0000-0000-000000013100',
  unitId: 'a11e2e00-0000-0000-0000-000000013101',
  gordiBarSettingId: 'a11e2e00-0000-0000-0000-000000013102',
  gordiBarSettingUnitId: 'a11e2e00-0000-0000-0000-000000013103',
  rumahKitchenSettingId: 'a11e2e00-0000-0000-0000-000000013104',
  rumahKitchenSettingUnitId: 'a11e2e00-0000-0000-0000-000000013105',
  itemName: 'E2E Plan Guard WIP Item',
} as const

export const cafePlanGuardCleanupSql = `
  DELETE FROM ops.cafe_item_settings WHERE org_id = '${CAFE_PLAN_GUARD_FIXTURE.orgId}' AND wip_item_id = '${CAFE_PLAN_GUARD_FIXTURE.itemId}';
  DELETE FROM ops.stream_items WHERE org_id = '${CAFE_PLAN_GUARD_FIXTURE.orgId}' AND wip_item_id = '${CAFE_PLAN_GUARD_FIXTURE.itemId}';
  DELETE FROM ops.item_units WHERE org_id = '${CAFE_PLAN_GUARD_FIXTURE.orgId}' AND wip_item_id = '${CAFE_PLAN_GUARD_FIXTURE.itemId}';
  DELETE FROM ops.wip_items WHERE org_id = '${CAFE_PLAN_GUARD_FIXTURE.orgId}' AND id = '${CAFE_PLAN_GUARD_FIXTURE.itemId}';
`

const PENDING_BILLS_FIXTURE_CONTRACT = 'e2e-ac-1141-v1'
const PENDING_BILL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PENDING_BILL_TEXT = /^[A-Za-z0-9-]+$/

export type PendingBillsFixtureCleanup = {
  orgId: string
  esbCode: string
  branchCode: string
  billNumbers: readonly string[]
  snapshotAsOf: string
  idempotencyKey: string
}

/** Remove only AC-1141 rows; the local journey's immutable payment rows need their trigger temporarily disabled. */
export function pendingBillsFixtureCleanupSql(fixture: PendingBillsFixtureCleanup): string {
  const { orgId, esbCode, branchCode, billNumbers, snapshotAsOf, idempotencyKey } = fixture
  if (!PENDING_BILL_UUID.test(orgId) || !PENDING_BILL_UUID.test(idempotencyKey)
    || !PENDING_BILL_TEXT.test(esbCode) || !PENDING_BILL_TEXT.test(branchCode)
    || billNumbers.length !== 2 || billNumbers.some((billNo) => !/^E2E-PB-[0-9]+-[0-9]+$/.test(billNo))
    || !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?Z$/.test(snapshotAsOf)) {
    throw new Error('E2E pending-bill cleanup requires fixed fixture identities')
  }
  const bills = billNumbers.map((billNo) => `'${billNo}'`).join(', ')
  return `
    BEGIN;
    DELETE FROM mos.pending_bill_payment_batches
     WHERE org_id = '${orgId}' AND idempotency_key = '${idempotencyKey}';
    ALTER TABLE mos.pending_bill_payments DISABLE TRIGGER pending_bill_payments_append_only;
    DELETE FROM mos.pending_bill_payments p
     USING reporting.pending_bills b
     WHERE p.org_id = '${orgId}' AND b.org_id = '${orgId}'
       AND p.esb_code = b.esb_code AND p.branch_code = b.branch_code AND p.bill_no = b.bill_no
       AND b.esb_code = '${esbCode}' AND b.branch_code = '${branchCode}'
       AND b.source_contract_version = '${PENDING_BILLS_FIXTURE_CONTRACT}' AND b.bill_no IN (${bills});
    ALTER TABLE mos.pending_bill_payments ENABLE TRIGGER pending_bill_payments_append_only;
    DELETE FROM reporting.pending_bills
     WHERE org_id = '${orgId}' AND esb_code = '${esbCode}' AND branch_code = '${branchCode}'
       AND source_contract_version = '${PENDING_BILLS_FIXTURE_CONTRACT}' AND bill_no IN (${bills});
    DELETE FROM reporting.pending_bill_snapshots
     WHERE org_id = '${orgId}' AND snapshot_as_of = '${snapshotAsOf}'
       AND source_contract_version = '${PENDING_BILLS_FIXTURE_CONTRACT}' AND bill_count = 2;
    COMMIT;
  `
}

export const cafePlanGuardSeedSql = `
  INSERT INTO ops.wip_items (
    id, org_id, name, category, flag_active, esb_bom_id,
    esb_product_detail_id_porsi, esb_product_id, kind, reference_source,
    erp_category_type_name, has_active_bom_output
  ) VALUES (
    '${CAFE_PLAN_GUARD_FIXTURE.itemId}', '${CAFE_PLAN_GUARD_FIXTURE.orgId}',
    '${CAFE_PLAN_GUARD_FIXTURE.itemName}', 'Bar', true, 'BOM-E2E-PLAN-GUARD',
    'PD-E2E-PLAN-GUARD-PORSI', 'P-E2E-PLAN-GUARD', NULL, 'erp_catalog', 'Inventory', true
  );

  INSERT INTO ops.item_units (
    id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
    is_default, is_transferable, source_active, erp_is_stock, confirmed_at
  ) VALUES (
    '${CAFE_PLAN_GUARD_FIXTURE.unitId}', '${CAFE_PLAN_GUARD_FIXTURE.orgId}',
    '${CAFE_PLAN_GUARD_FIXTURE.itemId}', 'portion', 'PD-E2E-PLAN-GUARD-UNIT',
    'P-E2E-PLAN-GUARD', false, true, true, false, now()
  );

  INSERT INTO ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
  VALUES
    ('${CAFE_PLAN_GUARD_FIXTURE.orgId}', '25000000-0000-0000-0000-000000000001', 'bar', '${CAFE_PLAN_GUARD_FIXTURE.itemId}', 'manual'),
    ('${CAFE_PLAN_GUARD_FIXTURE.orgId}', '25000000-0000-0000-0000-000000000002', 'kitchen', '${CAFE_PLAN_GUARD_FIXTURE.itemId}', 'manual');

  INSERT INTO ops.cafe_item_settings (
    id, org_id, branch_id, activity, wip_item_id, mos_name, kind, is_active
  ) VALUES
    ('${CAFE_PLAN_GUARD_FIXTURE.gordiBarSettingId}', '${CAFE_PLAN_GUARD_FIXTURE.orgId}', '25000000-0000-0000-0000-000000000001', 'bar', '${CAFE_PLAN_GUARD_FIXTURE.itemId}', '${CAFE_PLAN_GUARD_FIXTURE.itemName}', 'WIP', true),
    ('${CAFE_PLAN_GUARD_FIXTURE.rumahKitchenSettingId}', '${CAFE_PLAN_GUARD_FIXTURE.orgId}', '25000000-0000-0000-0000-000000000002', 'kitchen', '${CAFE_PLAN_GUARD_FIXTURE.itemId}', '${CAFE_PLAN_GUARD_FIXTURE.itemName}', 'WIP', true);

  INSERT INTO ops.cafe_item_setting_units (id, org_id, cafe_item_setting_id, item_unit_id)
  VALUES
    ('${CAFE_PLAN_GUARD_FIXTURE.gordiBarSettingUnitId}', '${CAFE_PLAN_GUARD_FIXTURE.orgId}', '${CAFE_PLAN_GUARD_FIXTURE.gordiBarSettingId}', '${CAFE_PLAN_GUARD_FIXTURE.unitId}'),
    ('${CAFE_PLAN_GUARD_FIXTURE.rumahKitchenSettingUnitId}', '${CAFE_PLAN_GUARD_FIXTURE.orgId}', '${CAFE_PLAN_GUARD_FIXTURE.rumahKitchenSettingId}', '${CAFE_PLAN_GUARD_FIXTURE.unitId}');

  -- CAFE_DEFAULT_UNIT_MUST_BE_SHOWN: the trigger requires the shown-unit links above first.
  UPDATE ops.cafe_item_settings
     SET default_item_unit_id = '${CAFE_PLAN_GUARD_FIXTURE.unitId}'
   WHERE id IN ('${CAFE_PLAN_GUARD_FIXTURE.gordiBarSettingId}', '${CAFE_PLAN_GUARD_FIXTURE.rumahKitchenSettingId}');
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
  'AC-1242-cafe-unit-wiring.spec.ts': 'fixed-item-unit-plan-and-captured-log-batch-ids',
  'AC-1141-pending-bills-journey.spec.ts': 'fixed-bill-keys-and-owned-append-only-ledger-cleanup',
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
function isPendingBillsFixtureCleanup(query: string): boolean {
  const compact = query.trim().replace(/\s+/g, ' ')
  const match = compact.match(/^begin; delete from mos\.pending_bill_payment_batches where org_id = '([0-9a-f-]+)' and idempotency_key = '([0-9a-f-]+)'; alter table mos\.pending_bill_payments disable trigger pending_bill_payments_append_only; delete from mos\.pending_bill_payments p using reporting\.pending_bills b where p\.org_id = '([0-9a-f-]+)' and b\.org_id = '([0-9a-f-]+)' and p\.esb_code = b\.esb_code and p\.branch_code = b\.branch_code and p\.bill_no = b\.bill_no and b\.esb_code = '([a-z0-9-]+)' and b\.branch_code = '([a-z0-9-]+)' and b\.source_contract_version = 'e2e-ac-1141-v1' and b\.bill_no in \(([^)]+)\); alter table mos\.pending_bill_payments enable trigger pending_bill_payments_append_only; delete from reporting\.pending_bills where org_id = '([0-9a-f-]+)' and esb_code = '([a-z0-9-]+)' and branch_code = '([a-z0-9-]+)' and source_contract_version = 'e2e-ac-1141-v1' and bill_no in \(([^)]+)\); delete from reporting\.pending_bill_snapshots where org_id = '([0-9a-f-]+)' and snapshot_as_of = '([^']+)' and source_contract_version = 'e2e-ac-1141-v1' and bill_count = 2; commit;$/i)
  if (!match) return false
  const [, orgId, idempotencyKey, paymentOrg, billOrg, esbCode, branchCode, paymentBills,
    billDeleteOrg, billDeleteEsb, billDeleteBranch, billDeleteBills, snapshotOrg, snapshotAsOf] = match
  if (orgId !== paymentOrg || orgId !== billOrg || orgId !== billDeleteOrg || orgId !== snapshotOrg
    || esbCode !== billDeleteEsb || branchCode !== billDeleteBranch || paymentBills !== billDeleteBills) return false
  const billNumbers = [...paymentBills.matchAll(/'([^']+)'/g)].map(([, billNo]) => billNo)
  if (billNumbers.length !== 2 || billNumbers.some((billNo) => !/^E2E-PB-[0-9]+-[0-9]+$/i.test(billNo))) return false
  try {
    const expected = pendingBillsFixtureCleanupSql({ orgId, esbCode, branchCode, billNumbers, snapshotAsOf, idempotencyKey })
    return compact.toLowerCase() === expected.trim().replace(/\s+/g, ' ').toLowerCase()
  } catch {
    return false
  }
}

export function assertFixtureSqlSafe(query: string): void {
  const normalize = (sql: string) => sql.trim().replace(/\s+/g, ' ').toLowerCase()
  const executableSql = executableSqlOnly(query)
  if (/\bpending_bill_payments_append_only\b/i.test(executableSql)) {
    if (!isPendingBillsFixtureCleanup(query)) throw new Error('E2E pending-bill cleanup must use its fixed local fixture boundary')
    return
  }
  const allowed = new Set(
    [...fixtureCleanupSql.split(';'), ...cafeWasteCleanupSql.split(';'), ...cafePlanGuardCleanupSql.split(';')]
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
