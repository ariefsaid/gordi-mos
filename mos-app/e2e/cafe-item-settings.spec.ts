import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { BAR_MEMBER } from './fixtures/users'
import { loginAs } from './helpers/login'

type ReadMode = 'rows' | 'empty' | 'error'

type MissingReportRow = {
  id: string
  branch_id: string
  activity: string
  item_name: string
  reported_at: string
  needs_attention: boolean
  resolved_at: string | null
}

type SettingsMocks = {
  canManage: boolean
  permissionError: boolean
  readMode: ReadMode
  readDelayMs: number
  saveDelayMs: number
  saveFailure: boolean
  lastSave: Record<string, unknown> | null
  reports: MissingReportRow[]
}

const rows = [
  {
    item_id: '00000000-0000-0000-0000-00000000a101',
    erp_name: 'Herbal tea · ERP reference',
    mos_name: 'Herbal tea',
    category: 'BAR',
    kind: 'RAW',
    item_unit_id: '00000000-0000-0000-0000-00000000a201',
    unit_name: 'bag',
    default_item_unit_id: '00000000-0000-0000-0000-00000000a201',
    unit_is_default: true,
    unit_is_shown: true,
  },
  {
    item_id: '00000000-0000-0000-0000-00000000a101',
    erp_name: 'Herbal tea · ERP reference',
    mos_name: 'Herbal tea',
    category: 'BAR',
    kind: 'RAW',
    item_unit_id: '00000000-0000-0000-0000-00000000a202',
    unit_name: 'kg',
    default_item_unit_id: '00000000-0000-0000-0000-00000000a201',
    unit_is_default: false,
    unit_is_shown: true,
  },
  {
    item_id: '00000000-0000-0000-0000-00000000a101',
    erp_name: 'Herbal tea · ERP reference',
    mos_name: 'Herbal tea',
    category: 'BAR',
    kind: 'RAW',
    item_unit_id: '00000000-0000-0000-0000-00000000a203',
    unit_name: 'kg',
    default_item_unit_id: '00000000-0000-0000-0000-00000000a201',
    unit_is_default: false,
    unit_is_shown: false,
  },
  {
    item_id: '00000000-0000-0000-0000-00000000a102',
    erp_name: 'Curry base · ERP reference',
    mos_name: 'Curry base · ERP reference',
    category: 'KITCHEN',
    kind: 'WIP',
    item_unit_id: '00000000-0000-0000-0000-00000000a204',
    unit_name: 'tray',
    default_item_unit_id: null,
    unit_is_default: false,
    unit_is_shown: false,
  },
  {
    item_id: '00000000-0000-0000-0000-00000000a103',
    erp_name: 'Seasonal item · ERP reference',
    mos_name: 'Seasonal item · ERP reference',
    category: null,
    kind: 'WIP',
    item_unit_id: null,
    unit_name: null,
    default_item_unit_id: null,
    unit_is_default: false,
    unit_is_shown: false,
  },
]

async function mockSettingsApi(page: Page, overrides: Partial<SettingsMocks> = {}) {
  const state: SettingsMocks = {
    canManage: true,
    permissionError: false,
    readMode: 'rows',
    readDelayMs: 0,
    saveDelayMs: 0,
    saveFailure: false,
    lastSave: null,
    reports: [],
    ...overrides,
  }

  await page.route('**/rest/v1/cafe_item_settings_read**', async route => {
    if (state.readDelayMs > 0) await new Promise(resolve => setTimeout(resolve, state.readDelayMs))
    if (state.readMode === 'error') {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'XX000', message: 'synthetic settings read failure' }),
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(state.readMode === 'empty' ? [] : rows),
    })
  })
  // The read model joins ERP details, but listCafeItemSettings also reads these tables to decide
  // whether the fixture is configured or should inherit ERP defaults. Keep those lookups aligned
  // with the item-level settings represented by the mocked read rows.
  await page.route(/\/rest\/v1\/cafe_item_settings\?/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ wip_item_id: '00000000-0000-0000-0000-00000000a101' }]),
    })
  })
  await page.route(/\/rest\/v1\/cafe_item_references\?/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{
        item_id: '00000000-0000-0000-0000-00000000a101',
        item_unit_id: '00000000-0000-0000-0000-00000000a201',
        is_default: true,
      }]),
    })
  })
  await page.route('**/rest/v1/cafe_missing_item_reports*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(state.reports.filter(report => report.needs_attention)),
    })
  })
  await page.route('**/rest/v1/rpc/can_manage_cafe_item_settings*', async route => {
    if (state.permissionError) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'XX000', message: 'synthetic permission read failure' }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.canManage) })
  })
  await page.route('**/rest/v1/rpc/save_cafe_item_settings', async route => {
    state.lastSave = route.request().postDataJSON() as Record<string, unknown>
    if (state.saveDelayMs > 0) await new Promise(resolve => setTimeout(resolve, state.saveDelayMs))
    if (state.saveFailure) {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'XX000', message: 'synthetic save failure' }),
      })
      return
    }
    await route.fulfill({ status: 204, body: '' })
  })
  return state
}

async function openItems(page: Page) {
  await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
  await page.goto('cafe/items')
  await expect(page.getByRole('heading', { name: 'Café items', exact: true })).toBeVisible()
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const reviewDir = process.env.GORDI_ITEM_SETTINGS_REVIEW_DIR
  const output = reviewDir
    ? join(reviewDir, `${name}.png`)
    : testInfo.outputPath(`${name}.png`)
  await mkdir(dirname(output), { recursive: true })
  await page.screenshot({ path: output, fullPage: true, animations: 'disabled' })
}

async function assertNoOverflow(page: Page, width: number) {
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(documentWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width)
}

test.describe('Café item settings', () => {
  test('uses stacked cards on phones and a readable table on wide screens', async ({ page }, testInfo) => {
    await mockSettingsApi(page)
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)

    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: 960 })
      await page.goto('cafe/items')
      await expect(page.getByRole('heading', { name: 'Café items', exact: true })).toBeVisible()
      const itemName = width < 1100
        ? page.locator('.cafe-items__cards').getByText('Herbal tea · ERP reference').first()
        : page.locator('.cafe-items__table-wrap').getByText('Herbal tea · ERP reference').first()
      await expect(itemName).toBeVisible()
      if (width < 1100) {
        await expect(page.locator('.cafe-items__cards')).toBeVisible()
        await expect(page.locator('.cafe-items__table-wrap')).toBeHidden()
      } else {
        await expect(page.locator('.cafe-items__table-wrap')).toBeVisible()
        await expect(page.locator('.cafe-items__cards')).toBeHidden()
      }
      await assertNoOverflow(page, width)
      await capture(page, testInfo, `item-settings-${width}`)
    }
  })

  test('shows stream-scoped missing-item reports at phone and desktop widths', async ({ page }, testInfo) => {
    await mockSettingsApi(page, {
      reports: [{
        id: '00000000-0000-0000-0000-00000000a301',
        branch_id: '00000000-0000-0000-0000-00000000a302',
        activity: 'bar',
        item_name: 'Oat milk',
        reported_at: '2026-10-04T09:00:00Z',
        needs_attention: true,
        resolved_at: null,
      }],
    })
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)

    for (const width of [390, 1440, 1920] as const) {
      await page.setViewportSize({ width, height: 960 })
      await page.goto('cafe/items')
      const reportQueue = page.getByRole('region', { name: 'Missing-item reports for this stream' })
      await expect(reportQueue).toBeVisible()
      await expect(reportQueue.getByText('Oat milk', { exact: true })).toBeVisible()
      await expect(reportQueue.getByText('Needs attention', { exact: true })).toBeVisible()
      const resolve = reportQueue.getByRole('button', { name: 'Resolve', exact: true })
      if (width === 390) await expect(resolve).toHaveCSS('min-height', '44px')
      await assertNoOverflow(page, width)
      await capture(page, testInfo, `missing-item-queue-${width}`)
    }
  })

  test('keeps the missing-item report beside waste controls at phone and wide widths', async ({ page }, testInfo) => {
    await mockSettingsApi(page)
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)

    for (const width of [390, 1440, 1920] as const) {
      await page.setViewportSize({ width, height: 960 })
      await page.goto('cafe/waste')
      await expect(page.getByRole('heading', { name: 'Café · Log waste', exact: true })).toBeVisible()
      const report = page.locator('.kl-missing')
      const reportButton = report.getByRole('button', { name: 'Missing an item? Report it', exact: true })
      const toolbar = page.locator('.ktb')
      await expect(reportButton).toBeVisible()
      if (width === 390) {
        await expect(page.getByRole('spinbutton', { name: 'Waste quantity for Herbal tea' })).toHaveCSS('font-size', '16px')
      }
      const [reportBox, toolbarBox] = await Promise.all([report.boundingBox(), toolbar.boundingBox()])
      expect(reportBox).not.toBeNull()
      expect(toolbarBox).not.toBeNull()
      expect(reportBox!.y).toBeLessThan(toolbarBox!.y)
      if (width === 390) await expect(reportButton).toHaveCSS('min-height', '44px')
      await assertNoOverflow(page, width)
      await capture(page, testInfo, `waste-report-${width}`)
    }
  })

  test('preserves item-level dirty, saving, retry and saved feedback', async ({ page }, testInfo) => {
    const mocks = await mockSettingsApi(page, { saveDelayMs: 800 })
    await page.setViewportSize({ width: 390, height: 960 })
    await openItems(page)

    const itemCard = page.getByRole('article', { name: 'Herbal tea · ERP reference' })
    const nameInput = itemCard.getByRole('textbox', { name: 'MOS name', exact: true })
    const save = itemCard.getByRole('button', { name: 'Save settings for Herbal tea', exact: true })
    await nameInput.fill('   ')
    await expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    await expect(itemCard.getByRole('alert')).toHaveText('Enter a MOS name.')
    await expect(save).toBeDisabled()
    await nameInput.fill('Herbal tea for the bar')
    await expect(save).toBeEnabled()
    await capture(page, testInfo, 'item-settings-dirty')

    mocks.saveFailure = true
    await save.click()
    await expect(save).toHaveText('Saving…')
    await capture(page, testInfo, 'item-settings-saving')
    await expect(itemCard.getByRole('alert')).toContainText("Couldn't save this item. Your changes are still here.")
    await capture(page, testInfo, 'item-settings-save-error')
    mocks.saveFailure = false
    await itemCard.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(itemCard.getByText('Saved', { exact: true })).toBeVisible()
    await expect.poll(() => mocks.lastSave).toMatchObject({
      p_mos_name: 'Herbal tea for the bar',
      p_default_item_unit_id: '00000000-0000-0000-0000-00000000a201',
      p_shown_item_unit_ids: [
        '00000000-0000-0000-0000-00000000a201',
        '00000000-0000-0000-0000-00000000a202',
      ],
    })
    await capture(page, testInfo, 'item-settings-saved')
  })

  test('shows read-only, empty, loading and recoverable error states', async ({ page }, testInfo) => {
    const mocks = await mockSettingsApi(page, { canManage: false })
    await page.setViewportSize({ width: 390, height: 960 })
    await openItems(page)
    await expect(page.getByText('Reference settings are read-only.', { exact: false })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'MOS name', exact: true })).toHaveCount(0)
    await capture(page, testInfo, 'item-settings-read-only')

    mocks.permissionError = true
    await page.goto('cafe/items')
    await expect(page.getByRole('alert')).toContainText('Could not confirm edit access')
    await expect(page.getByRole('textbox', { name: 'MOS name', exact: true })).toHaveCount(0)
    await capture(page, testInfo, 'item-settings-permission-error')
    mocks.permissionError = false

    mocks.readMode = 'empty'
    await page.goto('cafe/items')
    await expect(page.getByRole('heading', { name: 'No ERP items on this stream', exact: true })).toBeVisible()
    await capture(page, testInfo, 'item-settings-empty')

    mocks.readMode = 'error'
    mocks.readDelayMs = 700
    const readRequest = page.waitForRequest(request =>
      new URL(request.url()).pathname.endsWith('/cafe_item_settings_read'),
    )
    await page.goto('cafe/items')
    await readRequest
    await expect(page.getByRole('status', { name: 'Loading Café items' })).toBeVisible()
    await capture(page, testInfo, 'item-settings-loading')
    await expect(page.getByText("Couldn't load Café item settings. Try again.", { exact: true })).toBeVisible()
    await capture(page, testInfo, 'item-settings-error')

    mocks.readMode = 'rows'
    mocks.readDelayMs = 0
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await expect(page.locator('.cafe-items__cards').getByText('Herbal tea · ERP reference').first()).toBeVisible()
  })
})
