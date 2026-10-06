// #1242 / #1345 / #1383 — the stream's chosen default ERP detail and its configured multiples
// survive Café capture, approval, and posting. Fixture identities/personas are local and self-cleaning.

import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { VIEWER, MANAGER } from './fixtures/users'
import { assertLocalFixtureDatabase } from './fixtures/cleanup'
import { loginAs } from './helpers/login'
import { streamStatement, streamSwitch, STREAM_CONTROL_NAME } from './helpers/cafe-stream'

const ORG = '10000000-0000-0000-0000-000000000001'
const ITEM_ID = 'a11e2e00-0000-0000-0000-000000012421'
const DEFAULT_UNIT_ID = 'a11e2e00-0000-0000-0000-000000012422'
const ALT_UNIT_ID = 'a11e2e00-0000-0000-0000-000000012423'
const PLAN_ID = 'a11e2e00-0000-0000-0000-000000012424'
const PRODUCT_ID = 'SYNTH-ERP-P-1242-E2E'
const DEFAULT_DETAIL_ID = 'SYNTH-ERP-PD-1242-E2E-A'
const ALT_DETAIL_ID = 'SYNTH-ERP-PD-1242-E2E-B'
const ERP_NAME = 'E2E ERP Unit Dish'
const MOS_NAME = 'E2E MOS Unit Dish'
const DEFAULT_UNIT_NAME = 'ERP pack'
const ALT_UNIT_NAME = 'ERP each'
const STREAM_BRANCH_ID = '25000000-0000-0000-0000-000000000002'
const STREAM_ACTIVITY = 'kitchen'
const STREAM_LABEL = 'Rumah Rames · Kitchen'
const PLAN_QTY = 50
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function wibToday(): string {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

function uuidLiteral(value: string): string {
  if (!UUID.test(value)) throw new Error('[#1242] fixture SQL received a non-UUID')
  return `'${value}'`
}

function sqlText(value: string): string {
  if (!/^[A-Za-z0-9 -]+$/.test(value)) throw new Error('[#1242] fixture SQL received unexpected text')
  return `'${value}'`
}

function batchLiteral(value: string): string {
  if (!/^PR-[0-9]{8}-[0-9]{3}$/.test(value)) throw new Error('[#1242] unexpected batch id')
  return `'${value}'`
}

function readEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(readFileSync(fileURLToPath(new URL('../.env.e2e', import.meta.url)), 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]))
  } catch {
    return {}
  }
}

const e2eEnv = readEnvFile()
const SUPABASE_URL = e2eEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
const SERVICE_KEY = e2eEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

async function execSqlRead<T = Record<string, unknown>>(query: string): Promise<T[]> {
  if (!SERVICE_KEY) throw new Error('[#1242] local fixture service key is not set')
  assertLocalFixtureDatabase(SUPABASE_URL)
  const response = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`[#1242] local fixture SQL failed (${response.status}): ${body.slice(0, 400)}`)
  }
  return await response.json() as T[]
}

async function execSql(query: string): Promise<void> {
  await execSqlRead(query)
}

async function capture(page: Page, testInfo: TestInfo, surface: string, width: number): Promise<void> {
  const reviewDir = process.env.GORDI_CAFE_UNIT_REVIEW_DIR
  const filename = `${surface}-${width}.png`
  const output = reviewDir
    ? join(reviewDir, filename)
    : testInfo.outputPath(filename)
  await mkdir(dirname(output), { recursive: true })
  await page.screenshot({ path: output, fullPage: true, animations: 'disabled' })
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(documentWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width)
}

async function stateOnFixtureStream(page: Page): Promise<void> {
  const statement = streamStatement(page)
  const choices = page.getByRole('group', { name: STREAM_CONTROL_NAME })
  await expect(statement.or(choices).first()).toBeVisible()
  if (!(await statement.isVisible())) {
    const options = choices.getByRole('button')
    const labels = await options.allTextContents()
    const index = labels.findIndex(label => label.trim().startsWith(STREAM_LABEL))
    if (index < 0) throw new Error(`[#1242] no direct choice for ${STREAM_LABEL}`)
    await options.nth(index).click()
    await expect(statement).toContainText(STREAM_LABEL)
    return
  }
  if ((await statement.locator('h2').textContent())?.trim() === STREAM_LABEL) return
  await streamSwitch(page).click()
  const options = page.getByRole('listbox', { name: STREAM_CONTROL_NAME }).getByRole('option')
  await options.filter({ hasText: STREAM_LABEL }).first().click()
  await expect(statement).toContainText(STREAM_LABEL)
}

async function cleanupFixture(): Promise<void> {
  const rows = await execSqlRead<{ id: string; batch_id: string | null }>(`
    SELECT id::text AS id, batch_id FROM ops.kitchen_logs
     WHERE org_id=${uuidLiteral(ORG)} AND wip_item_id=${uuidLiteral(ITEM_ID)}
  `)
  const batchIds = rows.flatMap(row => row.batch_id ? [row.batch_id] : [])
  batchIds.forEach(batchId => { if (!/^PR-[0-9]{8}-[0-9]{3}$/.test(batchId)) throw new Error('[#1242] unexpected batch id') })
  const deletePushes = batchIds.length > 0
    ? `DELETE FROM integrations.esb_push WHERE org_id=${uuidLiteral(ORG)} AND source_module='kitchen' AND source_ref IN (${batchIds.map(batchLiteral).join(',')});`
    : ''
  await execSql(`${deletePushes}
    DELETE FROM ops.kitchen_stock WHERE org_id=${uuidLiteral(ORG)} AND wip_item_id=${uuidLiteral(ITEM_ID)};
    DELETE FROM ops.kitchen_logs WHERE org_id=${uuidLiteral(ORG)} AND wip_item_id=${uuidLiteral(ITEM_ID)};
    DELETE FROM ops.kitchen_plans WHERE org_id=${uuidLiteral(ORG)} AND id=${uuidLiteral(PLAN_ID)};
    DELETE FROM ops.stream_items WHERE org_id=${uuidLiteral(ORG)} AND wip_item_id=${uuidLiteral(ITEM_ID)};
    DELETE FROM ops.item_units WHERE org_id=${uuidLiteral(ORG)} AND wip_item_id=${uuidLiteral(ITEM_ID)};
    DELETE FROM ops.wip_items WHERE org_id=${uuidLiteral(ORG)} AND id=${uuidLiteral(ITEM_ID)};
  `)
}

const today = wibToday()
let submittedLogId: string | null = null

test.describe('Café default-unit multiples: selected ERP detail survives capture and approval', () => {
  test.beforeAll(async () => {
    await cleanupFixture()
    await execSql(`
      INSERT INTO ops.wip_items
        (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi,
         esb_product_id, kind, reference_source, erp_category_type_name, has_active_bom_output)
      VALUES (${uuidLiteral(ITEM_ID)}, ${uuidLiteral(ORG)}, ${sqlText(ERP_NAME)}, 'Kitchen', true,
              'BOM-E2E-1242', ${sqlText(DEFAULT_DETAIL_ID)}, ${sqlText(PRODUCT_ID)},
              NULL, 'erp_catalog', 'Inventory', true);
      INSERT INTO ops.item_units
        (id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
         is_default, is_transferable, confirmed_at, source_active, erp_is_stock)
      VALUES
        (${uuidLiteral(DEFAULT_UNIT_ID)}, ${uuidLiteral(ORG)}, ${uuidLiteral(ITEM_ID)},
         ${sqlText(DEFAULT_UNIT_NAME)}, ${sqlText(DEFAULT_DETAIL_ID)}, ${sqlText(PRODUCT_ID)},
         false, true, now(), true, false),
        (${uuidLiteral(ALT_UNIT_ID)}, ${uuidLiteral(ORG)}, ${uuidLiteral(ITEM_ID)},
         ${sqlText(ALT_UNIT_NAME)}, ${sqlText(ALT_DETAIL_ID)}, ${sqlText(PRODUCT_ID)},
         false, true, now(), true, false);
      INSERT INTO ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
      VALUES (${uuidLiteral(ORG)}, ${uuidLiteral(STREAM_BRANCH_ID)}, '${STREAM_ACTIVITY}', ${uuidLiteral(ITEM_ID)}, 'esb');
    `)
    await execSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims = '{"org_id":"${ORG}","person_id":"${MANAGER.personId}","access_roles":["admin"]}';
      SELECT ops.save_cafe_item_settings(
        ${uuidLiteral(STREAM_BRANCH_ID)}, '${STREAM_ACTIVITY}', ${uuidLiteral(ITEM_ID)}, ${sqlText(MOS_NAME)},
        ${uuidLiteral(ALT_UNIT_ID)}, ARRAY[${uuidLiteral(ALT_UNIT_ID)}]::uuid[],
        'WIP', true, ARRAY[2]::numeric[]
      );
      COMMIT;
    `)
    await execSql(`
      INSERT INTO ops.kitchen_plans
        (id, org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by)
      VALUES (${uuidLiteral(PLAN_ID)}, ${uuidLiteral(ORG)}, '${today}', ${uuidLiteral(ITEM_ID)},
              ${uuidLiteral(STREAM_BRANCH_ID)}, '${STREAM_ACTIVITY}', 'produce', NULL, ${PLAN_QTY}, ${uuidLiteral(MANAGER.personId)});
    `)
  })

  test.afterAll(async () => {
    await cleanupFixture()
  })

  test('operator captures a configured multiple of the chosen default and approval posts its ERP detail', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('cafe/production')
    await page.waitForURL(/\/cafe\/production$/)
    await stateOnFixtureStream(page)

    const itemRow = page.getByText(MOS_NAME, { exact: true }).first()
    await expect(itemRow).toBeVisible()
    await page.setViewportSize({ width: 390, height: 844 })
    const changeUnit = page.getByRole('button', { name: new RegExp(`change unit for ${MOS_NAME}`, 'i') })
    await expect(changeUnit).toContainText(ALT_UNIT_NAME)
    await changeUnit.click()
    const unitPicker = page.getByRole('combobox', { name: new RegExp(`unit for ${MOS_NAME}`, 'i') })
    await unitPicker.click()
    await page.getByRole('option', { name: `2 ${ALT_UNIT_NAME}`, exact: true }).click()
    const selectedUnit = page.getByRole('button', { name: new RegExp(`change unit for ${MOS_NAME}`, 'i') })
    await expect(selectedUnit).toContainText(`2 ${ALT_UNIT_NAME}`)
    await expect(selectedUnit).toBeFocused()

    for (const width of [390, 1440, 1920]) {
      await page.setViewportSize({ width, height: 960 })
      await expect(page.getByRole('button', { name: new RegExp(`change unit for ${MOS_NAME}`, 'i') })).toContainText(`2 ${ALT_UNIT_NAME}`)
      await capture(page, testInfo, 'log-selected-unit', width)
    }

    const quantity = page.getByRole('spinbutton', { name: new RegExp(`quantity produced for ${MOS_NAME}`, 'i') })
    await quantity.fill(String(PLAN_QTY / 2))
    await quantity.press('Tab')
    const submit = page.getByRole('button', { name: /submit 1 entry/i })
    await expect(submit).toBeEnabled()
    await submit.click()
    await expect(page.getByRole('status').filter({ hasText: /1 line submitted.*pending review/i })).toBeVisible()

    const landed = await execSqlRead<{
      id: string
      item_unit_id: string
      status: string
      qty_porsi: number | string
      entry_quantity: number | string | null
      entry_unit_factor: number | string | null
      entry_unit_name: string | null
    }>(`
      SELECT id::text AS id, item_unit_id::text AS item_unit_id, status, qty_porsi,
             entry_quantity, entry_unit_factor, entry_unit_name
        FROM ops.kitchen_logs
       WHERE org_id=${uuidLiteral(ORG)} AND wip_item_id=${uuidLiteral(ITEM_ID)} AND log_date='${today}'
    `)
    expect(landed).toHaveLength(1)
    submittedLogId = landed[0]?.id ?? null
    expect(submittedLogId).toMatch(UUID)
    expect(landed[0]).toMatchObject({ item_unit_id: ALT_UNIT_ID, status: 'Submitted', entry_unit_name: ALT_UNIT_NAME })
    expect(Number(landed[0]?.qty_porsi)).toBe(PLAN_QTY)
    expect(Number(landed[0]?.entry_quantity)).toBe(PLAN_QTY / 2)
    expect(Number(landed[0]?.entry_unit_factor)).toBe(2)

    await page.evaluate(() => localStorage.clear())
    await page.waitForTimeout(500)
    await loginAs(page, MANAGER.email, MANAGER.password)
    await page.goto('cafe/review')
    await page.waitForURL(/\/cafe\/review$/)
    await expect(page.getByRole('table', { name: /submitted logs awaiting review/i })).toBeVisible()
    await expect(page.getByRole('cell', { name: new RegExp(ERP_NAME, 'i') }).first()).toBeVisible()
    await page.getByRole('button', { name: new RegExp(`approve ${ERP_NAME}`, 'i') }).click()
    await expect(page.getByRole('status').filter({ hasText: /approved/i })).toBeVisible()

    if (!submittedLogId) throw new Error('[#1242] submitted log id was not captured')
    const outbox = await execSqlRead<{ payload_detail_id: string; target_env: string }>(`
      SELECT push.payload ->> 'esb_product_detail_id_porsi' AS payload_detail_id, push.target_env
        FROM ops.kitchen_logs log
        JOIN integrations.esb_push push
          ON push.org_id = log.org_id AND push.source_module = 'kitchen' AND push.source_ref = log.batch_id
       WHERE log.org_id=${uuidLiteral(ORG)} AND log.id=${uuidLiteral(submittedLogId)}
    `)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ payload_detail_id: ALT_DETAIL_ID })
    expect(outbox[0]?.target_env).not.toBe('gkid')

    await page.goto('cafe/plan')
    await page.waitForURL(/\/cafe\/plan$/)
    await stateOnFixtureStream(page)
    await page.setViewportSize({ width: 390, height: 960 })
    await expect(page.getByText(MOS_NAME, { exact: true })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: `Planned quantity for ${MOS_NAME}` })).toHaveValue(String(PLAN_QTY))
    await expect(page.getByText(ALT_UNIT_NAME, { exact: true })).toBeVisible()
    await page.getByText(MOS_NAME, { exact: true }).scrollIntoViewIfNeeded()
    await capture(page, testInfo, 'plan', 390)
    await page.reload()
    await page.waitForURL(/\/cafe\/plan$/)
    await stateOnFixtureStream(page)
    await page.setViewportSize({ width: 1440, height: 960 })
    await expect(page.getByText(MOS_NAME, { exact: true })).toBeVisible()
    await capture(page, testInfo, 'plan', 1440)

    await execSql(`
      BEGIN;
      SET LOCAL ROLE authenticated;
      SET LOCAL request.jwt.claims = '{"org_id":"${ORG}","person_id":"${MANAGER.personId}","access_roles":["admin"]}';
      SELECT ops.save_cafe_item_settings(
        ${uuidLiteral(STREAM_BRANCH_ID)}, '${STREAM_ACTIVITY}', ${uuidLiteral(ITEM_ID)}, ${sqlText(MOS_NAME)},
        ${uuidLiteral(ALT_UNIT_ID)}, ARRAY[${uuidLiteral(ALT_UNIT_ID)}]::uuid[],
        'RAW', true, ARRAY[]::numeric[]
      );
      COMMIT;
    `)
    await page.goto('cafe/transfer')
    await page.waitForURL(/\/cafe\/transfer$/)
    await stateOnFixtureStream(page)
    for (const width of [390, 1440, 1920] as const) {
      await page.setViewportSize({ width, height: 960 })
      await page.getByPlaceholder('Find an item').fill('E2E MOS')
      const rawItem = page.getByText(`RAW - ${MOS_NAME}`, { exact: true })
      await expect(rawItem).toBeInViewport()
      await capture(page, testInfo, 'transfer', width)
    }
  })
})
