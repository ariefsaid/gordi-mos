import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { BAR_MEMBER } from './fixtures/users'
import { loginAs } from './helpers/login'
import { STREAM_CONTROL_NAME } from './helpers/cafe-stream'

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

type SettingsReadRow = {
  item_id: string
  erp_name: string
  mos_name: string
  category: string | null
  kind: 'RAW' | 'WIP' | null
  is_active: boolean
  item_unit_id: string | null
  unit_name: string | null
  default_item_unit_id: string | null
  unit_is_default: boolean
  unit_is_shown: boolean
}

type ItemReferenceRow = { item_id: string; item_unit_id: string; is_default: boolean }

type SettingsMocks = {
  canManage: boolean
  locale: 'en' | 'id'
  permissionError: boolean
  readMode: ReadMode
  readDelayMs: number
  saveDelayMs: number
  saveFailure: boolean
  lastSave: Record<string, unknown> | null
  reports: MissingReportRow[]
  readRows?: SettingsReadRow[]
  configuredItemIds?: string[]
  references?: ItemReferenceRow[]
  captureKind?: 'RAW' | 'WIP'
  captureActive?: boolean
}

const rows: SettingsReadRow[] = [
  {
    item_id: '00000000-0000-0000-0000-00000000a101',
    erp_name: 'Herbal tea · ERP reference',
    mos_name: 'Herbal tea',
    category: 'BAR',
    kind: null,
    is_active: false,
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
    kind: null,
    is_active: false,
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
    kind: null,
    is_active: false,
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
    kind: null,
    is_active: false,
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
    kind: null,
    is_active: false,
    item_unit_id: null,
    unit_name: null,
    default_item_unit_id: null,
    unit_is_default: false,
    unit_is_shown: false,
  },
]

const LONG_GUARD_ITEM_NAME = 'Ayam Goreng Serundeng dengan Sambal Terasi'
const longNameGuardRows: SettingsReadRow[] = rows.map(row => row.item_id === '00000000-0000-0000-0000-00000000a101'
  ? {
      ...row,
      erp_name: LONG_GUARD_ITEM_NAME,
      mos_name: LONG_GUARD_ITEM_NAME,
      category: 'KITCHEN',
      unit_name: row.item_unit_id === '00000000-0000-0000-0000-00000000a201'
        ? 'Batch @50porsi · Default'
        : row.unit_name,
    }
  : row)

function largeItemSettingsFixture(): Pick<SettingsMocks, 'readRows' | 'configuredItemIds' | 'references'> {
  const itemIds = Array.from({ length: 501 }, (_, index) => index === 0
    ? '00000000-0000-0000-0000-00000000a101'
    : `00000000-0000-0000-0000-${(0xb000 + index).toString(16).padStart(12, '0')}`)
  const firstUnitIds = [
    '00000000-0000-0000-0000-00000000a201',
    '00000000-0000-0000-0000-00000000a202',
    '00000000-0000-0000-0000-00000000a203',
  ]
  const readRows = itemIds.flatMap((itemId, index) => {
    const name = index === 0 ? 'A three-unit ESB product' : `Fixture item ${String(index).padStart(3, '0')}`
    const mosName = index === 0 ? 'MOS tea lookup' : `${name} MOS name`
    const unitNames = index === 0 ? ['Bag', 'Kilogram', 'Serving'] : ['Each']
    const kind: SettingsReadRow['kind'] = index === 0 || index % 3 === 0 ? null : index % 3 === 1 ? 'RAW' : 'WIP'
    return unitNames.map((unitName, unitIndex) => ({
      item_id: itemId,
      erp_name: name,
      mos_name: mosName,
      category: index % 2 === 0 ? 'BAR' : 'KITCHEN',
      kind,
      is_active: index === 0 ? false : index % 2 === 1,
      item_unit_id: index === 0
        ? firstUnitIds[unitIndex]
        : `00000000-0000-0000-0000-${(0xc000 + index).toString(16).padStart(12, '0')}`,
      unit_name: unitName,
      default_item_unit_id: index === 0 ? firstUnitIds[0] : null,
      unit_is_default: index === 0 && unitIndex === 0,
      unit_is_shown: index === 0 && unitIndex !== 2,
    }))
  })
  return {
    readRows,
    configuredItemIds: [itemIds[0]],
    references: [{ item_id: itemIds[0], item_unit_id: firstUnitIds[0], is_default: true }],
  }
}

async function mockSettingsApi(page: Page, overrides: Partial<SettingsMocks> = {}) {
  const state: SettingsMocks = {
    canManage: true,
    locale: 'en',
    permissionError: false,
    readMode: 'rows',
    readDelayMs: 0,
    saveDelayMs: 0,
    saveFailure: false,
    lastSave: null,
    reports: [],
    ...overrides,
  }

  await page.route(/\/rest\/v1\/person_preferences\?/, async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: [{ locale: state.locale }] })
      return
    }
    await route.fulfill({ status: 204, body: '' })
  })
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
    const responseRows = state.readMode === 'empty' ? [] : (state.readRows ?? rows).map(row => row.item_id === '00000000-0000-0000-0000-00000000a101'
      ? { ...row, kind: state.captureKind ?? row.kind, is_active: state.captureActive ?? row.is_active }
      : row)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(responseRows),
    })
  })
  // The read model joins ERP details, but listCafeItemSettings also reads these tables to decide
  // whether the fixture is configured or should inherit ERP defaults. Keep those lookups aligned
  // with the item-level settings represented by the mocked read rows.
  await page.route(/\/rest\/v1\/cafe_item_settings\?/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify((state.configuredItemIds ?? ['00000000-0000-0000-0000-00000000a101'])
        .map(wip_item_id => ({ wip_item_id }))),
    })
  })
  await page.route(/\/rest\/v1\/cafe_item_references\?/, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(state.references ?? [{
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

async function captureViewport(page: Page, name: string) {
  const reviewDir = process.env.GORDI_ITEM_SETTINGS_REVIEW_DIR
  if (!reviewDir) return
  await mkdir(reviewDir, { recursive: true })
  await page.screenshot({ path: join(reviewDir, name), animations: 'disabled' })
}

async function assertNoOverflow(page: Page, width: number) {
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(documentWidth, `horizontal overflow at ${width}px`).toBeLessThanOrEqual(width)
}

test.describe('Café item settings', () => {
  for (const width of [390, 1280] as const) {
    test(`keeps settings operable after choosing the first stream at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await mockSettingsApi(page)
      await page.route('**/rest/v1/rpc/default_stream', route => route.fulfill({ json: null }))
      await page.route('**/rest/v1/team_memberships*', route => route.fulfill({ json: [] }))
      await openItems(page)
      await page.getByRole('group', { name: STREAM_CONTROL_NAME }).getByRole('button').first().click()
      const settings = page.getByRole('region', { name: 'Café item settings', exact: true })
      const item = settings.getByText('Herbal tea · ERP reference', { exact: true })
      await expect(item).toBeVisible()
      const search = settings.getByRole('searchbox', { name: 'Find an ESB or MOS name' })
      await search.fill('no-matching-item')
      await expect(item).toHaveCount(0)
      await search.clear()
      await expect(item).toBeVisible()
      await expect(settings.getByRole('textbox', { name: 'MOS name' }).first()).toBeEnabled()
    })
  }

  for (const width of [390, 1440] as const) {
    test(`exposes three ERP unit choices and gated multiples across 501 items at ${width}px`, async ({ page }) => {
      test.setTimeout(60_000)
      await page.setViewportSize({ width, height: 960 })
      await mockSettingsApi(page, largeItemSettingsFixture())
      await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
      await page.goto('cafe/items')
      await expect(page.getByRole('heading', { name: 'Café items', exact: true })).toBeVisible({ timeout: 15_000 })
      const visibleItems = width === 390
        ? page.locator('.dt-cards .dt-card')
        : page.locator('.cafe-items__table tbody tr:not(.dt-group-row)')

      await expect(visibleItems).toHaveCount(501, { timeout: 30_000 })
      await expect(page.getByRole('searchbox', { name: 'Find an ESB or MOS name' })).toBeVisible()
      const extraUnitControls = page.getByRole('button', { name: /^Extra units for / })
      await expect(extraUnitControls).toHaveCount(501)
      await expect(page.getByText('500 items need a default unit before they can be logged.', { exact: true })).toHaveCount(1)
      await expect(page.locator('.cafe-items__needs-unit-status')).toHaveCount(500)
      await assertNoOverflow(page, width)

      const threeUnitItem = visibleItems.filter({ hasText: 'A three-unit ESB product' }).first()
      await expect(threeUnitItem).toBeVisible()
      const defaultUnit = threeUnitItem.getByRole('combobox', { name: 'Default unit' })
      await expect(defaultUnit).toHaveText('Bag')
      await expect(threeUnitItem.getByRole('button', { name: 'Extra units for MOS tea lookup' })).toBeEnabled()
      await expect(page.getByRole('button', { name: 'Extra units for Fixture item 001 MOS name' })).toBeDisabled()
      await defaultUnit.click()
      await expect(page.getByRole('listbox', { name: 'Default unit' }).getByRole('option')).toHaveText([
        'No default', 'Bag', 'Kilogram', 'Serving',
      ])
      await page.keyboard.press('Escape')
      if (width === 390) {
        const save = threeUnitItem.getByRole('button', { name: 'Save settings for MOS tea lookup' })
        const saveBox = await save.boundingBox()
        expect(saveBox).not.toBeNull()
        expect(saveBox!.y + saveBox!.height).toBeLessThan(900)
      }

      await captureViewport(page, `lane-1332-after-${width}.png`)
    })
  }
  for (const width of [390, 1440, 1920] as const) {
    test(`uses the right layout without overflow at ${width}px`, async ({ page }, testInfo) => {
      test.setTimeout(60_000)
      await page.setViewportSize({ width, height: 960 })
      await mockSettingsApi(page)
      await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
      await page.goto('cafe/items')
      await expect(page.getByRole('heading', { name: 'Café items', exact: true })).toBeVisible()

      if (width < 768) {
        await expect(page.locator('.dt-cards')).toBeVisible()
        await expect(page.locator('.dt-cards .cafe-items__item-name').first()).toBeVisible()
        await expect(page.locator('.cafe-items__table')).toHaveCount(0)
      } else {
        await expect(page.locator('.cafe-items__table')).toBeVisible()
        await expect(page.locator('.cafe-items__table .cafe-items__item-name').first()).toBeVisible()
        await expect(page.locator('.dt-cards')).toHaveCount(0)
      }
      await assertNoOverflow(page, width)
      await capture(page, testInfo, `item-settings-${width}`)
    })
  }

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
    await mockSettingsApi(page, { captureKind: 'RAW', captureActive: true })
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)

    for (const width of [390, 1440, 1920] as const) {
      await page.setViewportSize({ width, height: 960 })
      await page.goto('cafe/waste')
      await expect(page.getByRole('heading', { name: 'Log waste', exact: true })).toBeVisible()
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
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)

    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: 960 })
      await page.goto('cafe/items')
      await expect(page.getByRole('heading', { name: 'Café items', exact: true })).toBeVisible()
      const itemCard = width === 390
        ? page.getByRole('article', { name: 'Herbal tea · ERP reference' })
        : page.getByRole('row').filter({ hasText: 'Herbal tea · ERP reference' })
      const nameInput = itemCard.getByRole('textbox', { name: 'MOS name', exact: true })
      const save = itemCard.getByRole('button', { name: 'Save settings for Herbal tea', exact: true })
      await expect(itemCard.getByRole('combobox', { name: 'Kind for Herbal tea' })).toHaveText('Unclassified')
      await expect(itemCard.getByRole('checkbox', { name: 'Active for Herbal tea' })).not.toBeChecked()
      await nameInput.fill('   ')
      await expect(nameInput).toHaveAttribute('aria-invalid', 'true')
      await expect(itemCard.getByRole('alert')).toHaveText('Enter a MOS name.')
      await expect(save).toBeDisabled()
      await nameInput.fill('Herbal tea for the bar')
      await itemCard.getByRole('combobox', { name: 'Kind for Herbal tea' }).click()
      await page.getByRole('option', { name: 'Raw material', exact: true }).click()
      await itemCard.getByRole('checkbox', { name: 'Active for Herbal tea' }).click()
      const defaultUnit = itemCard.getByRole('combobox', { name: 'Default unit' })
      await defaultUnit.click()
      await page.getByRole('listbox', { name: 'Default unit' }).getByRole('option', { name: 'kg · option 1', exact: true }).click()
      const extraUnits = itemCard.getByRole('button', { name: 'Extra units for Herbal tea' })
      await extraUnits.click()
      await page.getByRole('spinbutton', { name: 'Multiple of kg · option 1' }).fill('2')
      await page.getByRole('button', { name: 'Add a multiple for Herbal tea for the bar', exact: true }).click()
      await expect(extraUnits).toContainText('2 kg · option 1')
      await expect(save).toBeEnabled()
      await capture(page, testInfo, `item-settings-dirty-${width}`)

      mocks.saveFailure = true
      await save.click()
      await expect(save).toHaveText('Saving…')
      await capture(page, testInfo, `item-settings-saving-${width}`)
      await expect(itemCard.getByRole('alert')).toContainText("Couldn't save this item. Your changes are still here.")
      await capture(page, testInfo, `item-settings-save-error-${width}`)
      mocks.saveFailure = false
      await itemCard.getByRole('button', { name: 'Try again', exact: true }).click()
      await expect(itemCard.getByText('Saved', { exact: true })).toBeVisible()
      await expect.poll(() => mocks.lastSave).toMatchObject({
        p_mos_name: 'Herbal tea for the bar',
        p_kind: 'RAW',
        p_is_active: true,
        p_default_item_unit_id: '00000000-0000-0000-0000-00000000a202',
        p_shown_item_unit_ids: ['00000000-0000-0000-0000-00000000a202'],
        p_unit_multiples: [2],
      })
      await capture(page, testInfo, `item-settings-saved-${width}`)
    }
  })

  test('shows read-only, empty, loading and recoverable error states', async ({ page }, testInfo) => {
    const mocks = await mockSettingsApi(page, { canManage: false })
    await page.setViewportSize({ width: 390, height: 960 })
    await openItems(page)
    await expect(page.getByText('These item settings are read-only for you.', { exact: false })).toBeVisible()
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
    // OD-TERM-ESB: the empty state uses the approved ESB name, never ERP.
    await expect(page.getByRole('heading', { name: 'No ESB items on Rumah Rames · Bar', exact: true })).toBeVisible()
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
    await expect(page.locator('.dt-cards').getByText('Herbal tea · ERP reference').first()).toBeVisible()
  })

  test('shows distinct bilingual stream-switch and route-leave dialogs with long item content at phone, tablet and desktop widths', async ({ page }) => {
    const mocks = await mockSettingsApi(page, { readRows: longNameGuardRows })
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)

    for (const locale of ['en', 'id'] as const) {
      mocks.locale = locale
      await page.setViewportSize({ width: 390, height: 900 })
      await page.goto('cafe/items')
      await expect(page.locator('html')).toHaveAttribute('lang', locale)
      await expect(page.getByRole('heading', { name: locale === 'en' ? 'Café items' : 'Item Kafe', exact: true })).toBeVisible()

      for (const width of [390, 768, 1440] as const) {
        await page.setViewportSize({ width, height: 900 })
        const longItem = width === 390
          ? page.getByRole('article', { name: LONG_GUARD_ITEM_NAME })
          : page.getByRole('row').filter({ hasText: LONG_GUARD_ITEM_NAME })
        const name = longItem.getByRole('textbox', { name: locale === 'en' ? 'MOS name' : 'Nama MOS', exact: true })
        await expect(name).toBeVisible()
        await name.fill('Drafted item name')
        await page.getByRole('button', { name: /Change stream|Ganti stream/i }).click()
        const option = page.getByRole('option').first()
        await expect(option).toBeVisible()
        await option.click()
        const switchDialog = page.getByRole('dialog', {
          name: locale === 'en' ? 'Discard item changes and switch stream?' : 'Buang perubahan item dan pindah stream?',
        })
        await expect(switchDialog).toBeVisible()
        await expect(switchDialog).toContainText(locale === 'en' ? /will be discarded before switching to/ : /akan dibuang sebelum pindah ke/)
        await assertNoOverflow(page, width)
        await captureViewport(page, `cafe-items-unsaved-switch-${locale}-${width}.png`)
        await switchDialog.getByRole('button', { name: locale === 'en' ? 'Keep editing' : 'Lanjut mengedit', exact: true }).click()
        await expect(name).toHaveValue('Drafted item name')

        const leaveLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', {
          name: locale === 'en' ? 'Café' : 'Kafe',
          exact: true,
        }).first()
        await leaveLink.click()
        const leaveDialog = page.getByRole('dialog', { name: locale === 'en' ? 'Leave without saving?' : 'Keluar tanpa menyimpan?' })
        await expect(leaveDialog).toBeVisible()
        await expect(leaveDialog).toContainText(locale === 'en'
          ? 'Your unsaved item changes will be discarded.'
          : 'Perubahan item yang belum disimpan akan dibuang.')
        await assertNoOverflow(page, width)
        await captureViewport(page, `cafe-items-route-leave-${locale}-${width}.png`)
        await leaveDialog.getByRole('button', { name: locale === 'en' ? 'Stay on this page' : 'Tetap di halaman ini', exact: true }).click()
        await expect(name).toHaveValue('Drafted item name')
      }
    }
  })
})
