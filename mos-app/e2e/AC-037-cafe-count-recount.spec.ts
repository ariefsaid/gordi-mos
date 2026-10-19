import { expect, test } from '@playwright/test'
import { BAR_MEMBER, BAR_STREAM, BAR_SUPERVISOR } from './fixtures/users'
import { CAFE_COUNT_FIXTURE, cafeCountCleanupSql } from './fixtures/cleanup'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { loginAs } from './helpers/login'

const ORG = CAFE_COUNT_FIXTURE.orgId
const BRANCH_SQL = `(select id from shared.branches where org_id = '${ORG}' and code = '${BAR_STREAM.branchCode}')`
const TODAY_SQL = `(statement_timestamp() at time zone 'Asia/Jakarta')::date`
const DIFFERS = CAFE_COUNT_FIXTURE.items[2]

function seedSql(): string {
  return CAFE_COUNT_FIXTURE.items.map(item => `
    INSERT INTO ops.wip_items (id, org_id, name, category, flag_active, esb_product_detail_id_porsi, esb_product_id,
      kind, reference_source, erp_category_type_name, has_active_bom_output)
    VALUES ('${item.id}', '${ORG}', '${item.name}', 'Bar', true, 'PD-E2E-${item.id.slice(-4)}', 'P-E2E-${item.id.slice(-4)}',
      NULL, 'erp_catalog', 'Inventory', false);
    INSERT INTO ops.item_units (id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
      is_default, is_transferable, source_active, erp_is_stock, confirmed_at)
    VALUES ('${item.unitId}', '${ORG}', '${item.id}', 'bottle', 'PD-E2E-UNIT-${item.id.slice(-4)}', 'P-E2E-${item.id.slice(-4)}',
      true, true, true, true, now());
    INSERT INTO ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
    VALUES ('${ORG}', ${BRANCH_SQL}, '${BAR_STREAM.activity}', '${item.id}', 'manual');
    INSERT INTO ops.cafe_item_settings (id, org_id, branch_id, activity, wip_item_id, mos_name, kind, is_active)
    VALUES ('${item.settingId}', '${ORG}', ${BRANCH_SQL}, '${BAR_STREAM.activity}', '${item.id}', '${item.name}', 'RAW', true);
    INSERT INTO ops.cafe_item_setting_units (id, org_id, cafe_item_setting_id, item_unit_id)
    VALUES ('${item.settingUnitId}', '${ORG}', '${item.settingId}', '${item.unitId}');
    UPDATE ops.cafe_item_settings SET default_item_unit_id = '${item.unitId}' WHERE id = '${item.settingId}';
  `).join('\n')
}

/** Stands in for the worker: writes each line's Expected balance through the worker-only function. */
function workerSnapshotSql(): string {
  const cases = CAFE_COUNT_FIXTURE.items.map(item => `WHEN '${item.id}' THEN ${item.expected}`).join(' ')
  return `
    SET ROLE service_role;
    SELECT ops.record_cafe_count_expected_balance(line.id, CASE line.wip_item_id::text ${cases} END)
      FROM ops.cafe_count_lines line
     WHERE line.org_id = '${ORG}' AND line.count_date = ${TODAY_SQL}
       AND line.wip_item_id IN (${CAFE_COUNT_FIXTURE.items.map(item => `'${item.id}'`).join(', ')});
    RESET ROLE;
  `
}

test.beforeEach(async () => {
  await localSql(cafeCountCleanupSql)
  await localSql(seedSql())
})
test.afterEach(async () => { await localSql(cafeCountCleanupSql) })

test('AC-037 blind count, one item differs, the floor recounts with a reason, the supervisor confirms it held and nothing reaches the outbox', async ({ page }) => {
  await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
  await page.goto('cafe/count')
  for (const item of CAFE_COUNT_FIXTURE.items) {
    await page.getByRole('textbox', { name: `${item.name}, counted, bottle` }).fill(item.firstCount)
  }
  await page.getByRole('button', { name: 'Submit stock count' }).click()
  await expect(page.getByText('Counted · waiting for the system check')).toHaveCount(3)

  await localSql(workerSnapshotSql())
  await page.reload()
  await expect(page.getByText('This item differs. It needs a recount, and a reason if it still differs.')).toHaveCount(1)
  await expect(page.locator('main')).not.toContainText(/expected|variance|2[.,]5/i)

  await page.getByRole('textbox', { name: `Recount for ${DIFFERS.name}, bottle` }).fill(DIFFERS.recount!)
  await page.getByRole('button', { name: 'Save recount' }).click()
  await page.getByRole('textbox', { name: `Reason for ${DIFFERS.name}` }).fill(DIFFERS.reason!)
  await page.getByRole('button', { name: 'Save reason' }).click()
  await expect(page.getByText('Counted · with the reviewer')).toHaveCount(3)

  await loginAs(page, BAR_SUPERVISOR.email, BAR_SUPERVISOR.password)
  await page.goto('cafe/review?queue=counts')
  await page.getByRole('button', { name: new RegExp(DIFFERS.name) }).click()
  await expect(page.getByText(DIFFERS.reason!)).toBeVisible()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Confirmed, not posted' })).toBeVisible()

  const [line] = await localSqlRead<{ status: string; posting_status: string; counted: string; recounted: string; outbox: number }>(`
    SELECT status, posting_status, counted_quantity::text AS counted, recounted_quantity::text AS recounted,
           (SELECT count(*)::int FROM integrations.esb_push WHERE source_module = 'cafe_count') AS outbox
      FROM ops.cafe_count_lines
     WHERE org_id = '${ORG}' AND wip_item_id = '${DIFFERS.id}' AND count_date = ${TODAY_SQL}
  `)
  expect(line).toMatchObject({ status: 'Confirmed', posting_status: 'held', outbox: 0 })
  expect(Number(line.counted)).toBe(Number(DIFFERS.firstCount))
  expect(Number(line.recounted)).toBe(Number(DIFFERS.recount))
  // Frozen: a confirmed line refuses any change to its facts.
  await expect(localSql(`
    UPDATE ops.cafe_count_lines SET reason = 'changed'
     WHERE org_id = '${ORG}' AND wip_item_id = '${DIFFERS.id}' AND count_date = ${TODAY_SQL}
  `)).rejects.toThrow('Local fixture SQL failed')
})
