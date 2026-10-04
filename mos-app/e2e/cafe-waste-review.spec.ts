import { mkdir, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { BAR_MEMBER, BAR_SUPERVISOR, BAR_STREAM } from './fixtures/users'
import { CAFE_WASTE_FIXTURE, cafeWasteCleanupSql } from './fixtures/cleanup'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { loginAs } from './helpers/login'

const ORG = CAFE_WASTE_FIXTURE.orgId
const ITEM_ID = CAFE_WASTE_FIXTURE.itemId
const UNIT_ID = CAFE_WASTE_FIXTURE.unitId
const SETTING_ID = CAFE_WASTE_FIXTURE.settingId
const SETTING_UNIT_ID = CAFE_WASTE_FIXTURE.settingUnitId
const ITEM_NAME = CAFE_WASTE_FIXTURE.itemName
const PHOTO_PATH = fileURLToPath(new URL('./fixtures/photos/waste-food-photo.jpg', import.meta.url))
const BRANCH_SQL = `(select id from shared.branches where org_id = '${ORG}' and code = '${BAR_STREAM.branchCode}')`
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(readFileSync(new URL('../.env.e2e', import.meta.url), 'utf8')
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

function storageAdmin() {
  if (!SERVICE_KEY) throw new Error('[AC-1241] Local fixture service credential is unavailable')
  if (!['localhost', '127.0.0.1'].includes(new URL(SUPABASE_URL).hostname)) {
    throw new Error('[AC-1241] Waste photo cleanup requires local Supabase')
  }
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

async function cleanupFixture() {
  const logs = await localSqlRead<{ id: string }>(`
    SELECT id FROM ops.kitchen_logs
     WHERE org_id = '${ORG}' AND wip_item_id = '${ITEM_ID}' AND action = 'waste'
  `)
  const logIds = logs.map(({ id }) => {
    if (!UUID.test(id)) throw new Error('[AC-1241] Fixture query returned an invalid log id')
    return `'${id}'`
  })
  if (logIds.length > 0) {
    const paths = await localSqlRead<{ path: string }>(`
      SELECT path FROM ops.kitchen_log_waste_photos
       WHERE org_id = '${ORG}' AND log_id IN (${logIds.join(', ')})
    `)
    if (paths.length > 0) {
      const { error } = await storageAdmin().storage.from('waste-photos').remove(paths.map(({ path }) => path))
      if (error) throw new Error(`[AC-1241] Storage cleanup failed: ${error.message}`)
    }
  }
  await localSql(cafeWasteCleanupSql)
}

async function seedFixture() {
  await localSql(`
    INSERT INTO ops.wip_items (
      id, org_id, name, category, flag_active, esb_bom_id,
      esb_product_detail_id_porsi, esb_product_id, kind, reference_source,
      erp_category_type_name, has_active_bom_output
    ) VALUES (
      '${ITEM_ID}', '${ORG}', '${ITEM_NAME}', 'Drinks', true,
      'BOM-E2E-WASTE-1241', 'PD-E2E-WASTE-1241', 'P-E2E-WASTE-1241',
      NULL, 'erp_catalog', 'Inventory', true
    );

    INSERT INTO ops.item_units (
      id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
      is_default, is_transferable, source_active, erp_is_stock, confirmed_at
    ) VALUES (
      '${UNIT_ID}', '${ORG}', '${ITEM_ID}', 'tray', 'PD-E2E-WASTE-UNIT-1241',
      'P-E2E-WASTE-1241', false, true, true, false, now()
    );

    INSERT INTO ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
    VALUES ('${ORG}', ${BRANCH_SQL}, '${BAR_STREAM.activity}', '${ITEM_ID}', 'manual');

    INSERT INTO ops.cafe_item_settings (
      id, org_id, branch_id, activity, wip_item_id, mos_name, kind, is_active
    ) VALUES (
      '${SETTING_ID}', '${ORG}', ${BRANCH_SQL}, '${BAR_STREAM.activity}', '${ITEM_ID}', '${ITEM_NAME}', 'WIP', true
    );

    INSERT INTO ops.cafe_item_setting_units (id, org_id, cafe_item_setting_id, item_unit_id)
    VALUES ('${SETTING_UNIT_ID}', '${ORG}', '${SETTING_ID}', '${UNIT_ID}');

    UPDATE ops.cafe_item_settings
       SET default_item_unit_id = '${UNIT_ID}'
     WHERE id = '${SETTING_ID}';
  `)
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const reviewDir = process.env.GORDI_CAFE_WASTE_REVIEW_DIR
  const output = reviewDir ? join(reviewDir, `${name}.png`) : testInfo.outputPath(`${name}.png`)
  await new Promise<void>((resolve, reject) => mkdir(dirname(output), { recursive: true }, error => error ? reject(error) : resolve()))
  await page.screenshot({ path: output, fullPage: true, animations: 'disabled' })
}

async function assertNoOverflow(page: Page, width: number) {
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(documentWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width)
}

test.describe('AC-1241: Café waste capture and MOS review', () => {
  test.beforeAll(async () => {
    await cleanupFixture()
    await seedFixture()
  })

  test.afterAll(async () => {
    await cleanupFixture()
  })

  test('captures and uploads real photo evidence at 390px, then reviews it at 1440px without ERP posting', async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
    await page.goto('cafe/waste')
    await page.waitForURL(/\/cafe\/waste$/, { timeout: 15_000 })

    await expect(page.getByTestId('page-head').getByRole('heading', { name: 'Café · Log waste', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Rumah Rames · Bar/i })).toBeVisible()
    await expect(page.getByText('Waste stays in MOS review. Posting to the ERP is held.', { exact: true })).toBeVisible()
    const quantity = page.getByRole('spinbutton', { name: `Waste quantity for ${ITEM_NAME}` })
    await expect(quantity).toBeVisible()
    await assertNoOverflow(page, 390)
    await capture(page, testInfo, 'cafe-waste-capture-390')

    await quantity.fill('2')
    await page.getByRole('button', { name: 'Add photo', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Waste photos' })).toBeVisible()
    const photoInput = page.getByLabel('Take or choose photos')
    await photoInput.setInputFiles(PHOTO_PATH)
    await expect(page.getByRole('img', { name: 'Photo 1 preview' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove photo 1', exact: true }).click()
    await expect(page.getByRole('img', { name: 'Photo 1 preview' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Submit waste', exact: true })).toBeDisabled()
    await capture(page, testInfo, 'cafe-waste-photo-removed-390')

    await photoInput.setInputFiles(PHOTO_PATH)
    await expect(page.getByRole('img', { name: 'Photo 1 preview' })).toBeVisible()
    await capture(page, testInfo, 'cafe-waste-photo-readded-390')
    await page.getByRole('button', { name: 'Upload photos', exact: true }).click()
    await expect(page.getByText('1 photo uploaded', { exact: true })).toBeVisible({ timeout: 20_000 })
    const submit = page.getByRole('button', { name: 'Submit waste', exact: true })
    await expect(submit).toBeEnabled()
    await assertNoOverflow(page, 390)
    await capture(page, testInfo, 'cafe-waste-photo-uploaded-390')

    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(page.locator('.cwl-list .dt-table')).toBeVisible()
    await assertNoOverflow(page, 1920)
    await capture(page, testInfo, 'cafe-waste-capture-1920')

    await page.setViewportSize({ width: 1440, height: 960 })
    await expect(page.locator('.cwl-list .dt-table')).toBeVisible()
    await assertNoOverflow(page, 1440)
    await capture(page, testInfo, 'cafe-waste-capture-1440')

    await submit.click()
    await expect(page.getByRole('status').filter({ hasText: '1 waste entry submitted for review.' })).toBeVisible({ timeout: 20_000 })

    const [landed] = await localSqlRead<{
      id: string
      action: string
      status: string
      qty: number
      item_unit_id: string
      batch_id: string | null
      posted_to_esb: boolean
      esb_doc_num: string | null
      push_count: number
    }>(`
      SELECT log.id, log.action, log.status, log.qty_porsi::integer AS qty,
             log.item_unit_id, log.batch_id, log.posted_to_esb, log.esb_doc_num,
             (SELECT count(*)::integer FROM integrations.esb_push push
               WHERE push.org_id = log.org_id AND push.source_module = 'kitchen'
                 AND push.source_ref IN (log.id::text, coalesce(log.batch_id, ''))) AS push_count
        FROM ops.kitchen_logs log
       WHERE log.org_id = '${ORG}' AND log.wip_item_id = '${ITEM_ID}' AND log.action = 'waste'
    `)
    expect(landed).toMatchObject({
      action: 'waste', status: 'Submitted', qty: 2, item_unit_id: UNIT_ID,
      batch_id: null, posted_to_esb: false, esb_doc_num: null, push_count: 0,
    })

    const photos = await localSqlRead<{ path: string }>(`
      SELECT path FROM ops.kitchen_log_waste_photos WHERE log_id = '${landed.id}'
    `)
    expect(photos).toHaveLength(1)

    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
    await page.waitForTimeout(500)
    await loginAs(page, BAR_SUPERVISOR.email, BAR_SUPERVISOR.password)
    await page.goto('cafe/review')
    await page.waitForURL(/\/cafe\/review$/, { timeout: 15_000 })
    const queue = page.getByRole('table', { name: /Submitted logs awaiting review/i })
    const reviewRow = queue.getByRole('row', { name: new RegExp(ITEM_NAME) })
    await expect(reviewRow).toBeVisible({ timeout: 20_000 })
    const photoLink = reviewRow.getByRole('link', { name: 'Open waste photo 1 of 1' })
    await expect(photoLink).toBeVisible()
    const reviewImage = photoLink.locator('img')
    await expect(reviewImage).toBeVisible()
    await expect.poll(() => reviewImage.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
    await expect(reviewRow.getByRole('button', { name: new RegExp(`Approve ${ITEM_NAME}`, 'i') })).toBeEnabled()
    await assertNoOverflow(page, 1440)
    await capture(page, testInfo, 'cafe-waste-review-1440')
  })
})
