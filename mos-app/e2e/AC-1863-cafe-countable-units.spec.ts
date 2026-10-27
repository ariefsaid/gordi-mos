// #1863 — a later stream's synced units need no confirmation backfill.
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { MANAGER } from './fixtures/users'
import { assertLocalFixtureDatabase } from './fixtures/cleanup'
import { loginViaForm } from './helpers/login'
import { streamStatement, streamSwitch, STREAM_CONTROL_NAME } from './helpers/cafe-stream'

const ORG = '10000000-0000-0000-0000-000000000001'
const BRANCH = '25000000-0000-0000-0000-000000000002'
const NAME = 'Countable fixture rice'
const EXCLUDED = 'Countable fixture packaging'
const api = process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321'

async function sql(query: string) {
  assertLocalFixtureDatabase(api)
  if (!process.env.CI && new URL(api).port === '44321') throw new Error('Use the disposable e2e stack')
  const response = await fetch(`${api}/pg/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) throw new Error(`Fixture SQL failed: ${response.status} ${await response.text()}`)
}

async function chooseRrs(page: Page) {
  const statement = streamStatement(page)
  const choices = page.getByRole('group', { name: STREAM_CONTROL_NAME })
  await expect(statement.or(choices).first()).toBeVisible()
  if (await statement.isVisible()) {
    if ((await statement.textContent())?.includes('Rumah Rames')) return
    await streamSwitch(page).click()
    await page.getByRole('option').filter({ hasText: 'Rumah Rames · Kitchen' }).click()
  } else {
    await choices.getByRole('button').filter({ hasText: 'Rumah Rames · Kitchen' }).click()
  }
  await expect(statement).toContainText('Rumah Rames')
}

async function cleanup() {
  await sql(`DELETE FROM ops.cafe_item_settings WHERE org_id='${ORG}' AND wip_item_id IN
    (SELECT id FROM ops.wip_items WHERE org_id='${ORG}' AND esb_product_id LIKE 'SYNTH-1863-E2E-%');
    DELETE FROM ops.stream_items WHERE org_id='${ORG}' AND wip_item_id IN
    (SELECT id FROM ops.wip_items WHERE org_id='${ORG}' AND esb_product_id LIKE 'SYNTH-1863-E2E-%');
    DELETE FROM ops.item_units WHERE org_id='${ORG}' AND esb_product_id LIKE 'SYNTH-1863-E2E-%';
    DELETE FROM ops.wip_items WHERE org_id='${ORG}' AND esb_product_id LIKE 'SYNTH-1863-E2E-%';`)
}

test.beforeAll(async () => {
  await cleanup()
  await sql(`BEGIN;
    INSERT INTO ops.wip_items(org_id,name,flag_active,esb_product_id,reference_source,erp_category_type_name)
    VALUES ('${ORG}','${NAME}',true,'SYNTH-1863-E2E-RICE','erp_catalog','Inventory'),
           ('${ORG}','${EXCLUDED}',true,'SYNTH-1863-E2E-PACK','erp_catalog','Inventory');
    INSERT INTO ops.item_units(org_id,wip_item_id,unit_name,esb_product_id,esb_product_detail_id,is_default,source_active,erp_is_stock)
    SELECT '${ORG}',id,'batch',esb_product_id,esb_product_id||'-BATCH',true,true,false
    FROM ops.wip_items WHERE org_id='${ORG}' AND esb_product_id LIKE 'SYNTH-1863-E2E-%';
    INSERT INTO ops.item_units(org_id,wip_item_id,unit_name,esb_product_id,esb_product_detail_id,source_active,erp_is_stock)
    SELECT '${ORG}',id,'kg',esb_product_id,esb_product_id||'-KG',true,true
    FROM ops.wip_items WHERE org_id='${ORG}' AND esb_product_id='SYNTH-1863-E2E-RICE';
    INSERT INTO ops.stream_items(org_id,branch_id,activity,wip_item_id,source)
    SELECT '${ORG}','${BRANCH}','kitchen',id,'esb' FROM ops.wip_items
    WHERE org_id='${ORG}' AND esb_product_id LIKE 'SYNTH-1863-E2E-%';
    SET LOCAL ROLE authenticated;
    SET LOCAL request.jwt.claims='{"org_id":"${ORG}","person_id":"${MANAGER.personId}","access_roles":["admin"]}';
    SELECT ops.save_cafe_item_settings('${BRANCH}','kitchen',i.id,i.name,u.id,array[u.id],'RAW',true)
    FROM ops.wip_items i JOIN ops.item_units u ON u.org_id=i.org_id AND u.wip_item_id=i.id AND u.is_default
    WHERE i.org_id='${ORG}' AND i.esb_product_id LIKE 'SYNTH-1863-E2E-%';
    COMMIT;`)
})
test.afterAll(cleanup)

test('RRS synced stock unit is usable across Count, Receive, Request and comparison', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await loginViaForm(page, MANAGER.email, MANAGER.password)
  await page.goto('cafe/count')
  await chooseRrs(page)
  await expect(page.getByRole('textbox', { name: `${NAME}, counted, kg` })).toBeVisible()
  const summary = page.locator('summary').filter({ hasText: /items? cannot be counted/ })
  await expect(summary).toBeVisible()
  const disclosure = summary.locator('..')
  await expect(disclosure).not.toHaveAttribute('open', '')
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(disclosure.getByText(EXCLUDED, { exact: true })).toBeVisible()
  await page.keyboard.press('Enter')
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    const dir = process.env.GORDI_CAFE_COUNTABLE_REVIEW_DIR ?? testInfo.outputPath('captures')
    await mkdir(dir, { recursive: true })
    await page.screenshot({ path: join(dir, `stock-count-${width}.png`), fullPage: true, animations: 'disabled' })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    if (width === 390) expect((await summary.boundingBox())?.height).toBeGreaterThanOrEqual(44)
  }
  for (const route of ['cafe/receive', 'cafe/request', 'cafe/stock-comparison']) {
    await page.goto(route === 'cafe/stock-comparison' ? `${route}?q=${encodeURIComponent(NAME)}` : route)
    await chooseRrs(page)
    await expect(page.getByText(NAME, { exact: true }).first()).toBeVisible()
  }
})
