import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { BAR_MEMBER } from './fixtures/users'
import { assertTapFloor } from './helpers/tap-floor'
import { loginAs } from './helpers/login'

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
    reports: [],
    ...overrides,
  }

  await page.route('**/rest/v1/cafe_item_settings_read**', async route => {
    const responseRows = (state.readRows ?? rows).map(row => row.item_id === '00000000-0000-0000-0000-00000000a101'
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
  await page.route('**/rest/v1/rpc/can_manage_cafe_item_settings*', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'true' }),
  )
  await page.route('**/rest/v1/rpc/save_cafe_item_settings', route => route.fulfill({ status: 204, body: '' }))
}

// Screenshots are written only for the review lane (GORDI_ITEM_SETTINGS_REVIEW_DIR); an ordinary
// run takes none.
async function capture(page: Page, _testInfo: TestInfo, name: string) {
  const reviewDir = process.env.GORDI_ITEM_SETTINGS_REVIEW_DIR
  if (!reviewDir) return
  const output = join(reviewDir, `${name}.png`)
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
  for (const width of [390, 1440] as const) {
    test(`exposes three ERP unit choices and gated multiples across 501 items at ${width}px`, async ({ page }) => {
      test.setTimeout(60_000)
      await page.setViewportSize({ width, height: 960 })
      await mockSettingsApi(page, largeItemSettingsFixture())
      await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
      await page.goto('cafe/items')
      await expect(page.getByTestId('page-head').getByRole('heading', { level: 1, name: 'Items', exact: true })).toBeVisible({ timeout: 15_000 })
      let visibleItems = width === 390
        ? page.locator('.dt-cards .dt-card')
        : page.locator('.cafe-items__table tbody tr:not(.dt-group-row)')

      await expect(visibleItems).toHaveCount(501, { timeout: 30_000 })
      await expect(page.getByRole('searchbox', { name: 'Find an ESB or MOS name' })).toBeVisible()
      const extraUnitControls = page.getByRole('button', { name: /^Extra units for / })
      await expect(extraUnitControls).toHaveCount(width === 390 ? 501 : 0)
      await expect(page.getByText('500 items need a default unit before they can be logged.', { exact: true })).toHaveCount(1)
      await expect(page.locator('.cafe-items__needs-unit-status')).toHaveCount(500)
      await assertNoOverflow(page, width)

      if (width === 1440) {
        // The approved wide table omits Extra units; the item cards retain its editor.
        await expect(page.getByRole('columnheader', { name: 'Extra units', exact: true })).toHaveCount(0)
        await captureViewport(page, `lane-1332-after-${width}.png`)
        await page.setViewportSize({ width: 768, height: 960 })
        visibleItems = page.locator('.dt-cards .dt-card')
        await expect(visibleItems).toHaveCount(501)
        await expect(extraUnitControls).toHaveCount(501)
        await assertNoOverflow(page, 768)
      }

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

      if (width === 390) await captureViewport(page, `lane-1332-after-${width}.png`)
    })
  }
  // The phone cards vs wide table switch and the no-overflow check are asserted by the 501-item
  // test above at 390 and 1440.

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

    for (const width of [390, 1440] as const) {
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

    for (const width of [390, 1440] as const) {
      await page.setViewportSize({ width, height: 960 })
      await page.goto('cafe/waste')
      await expect(page.getByTestId('page-head').getByRole('heading', { level: 1, name: 'Waste', exact: true })).toBeVisible()
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

  test('gives every active toggle a 44px hit area on the phone Items cards', async ({ page }) => {
    const readRows: SettingsReadRow[] = Array.from({ length: 26 }, (_, index) => {
      const itemId = `00000000-0000-0000-0000-${(0xd000 + index).toString(16).padStart(12, '0')}`
      return {
        item_id: itemId,
        erp_name: `Sample item ${index + 1}`,
        mos_name: `Sample item ${index + 1}`,
        category: 'KITCHEN',
        kind: 'RAW',
        is_active: true,
        item_unit_id: null,
        unit_name: null,
        default_item_unit_id: null,
        unit_is_default: false,
        unit_is_shown: false,
      }
    })
    await mockSettingsApi(page, { reports: [], readRows, configuredItemIds: [], references: [] })
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('cafe/items')
    await expect(page.getByText('26 items', { exact: true })).toBeVisible()
    await expect(page.locator('.dt-cards .dt-card')).toHaveCount(26)
    const activeToggles = page.locator('.cafe-items__active-control .mk-checkbox__input')
    await assertTapFloor(page, '.cafe-items__active-control .mk-checkbox__input', 'Café Items active toggles', {
      axes: 'both',
      noOverflow: true,
    })
    for (const width of [768, 1440] as const) {
      await page.setViewportSize({ width, height: 900 })
      const sizes = await activeToggles.evaluateAll(inputs => inputs.map(input => {
        const { width: boxWidth, height } = input.getBoundingClientRect()
        return [boxWidth, height]
      }))
      expect(sizes).toHaveLength(26)
      expect(sizes.every(([boxWidth, height]) => boxWidth === 16 && height === 16)).toBe(true)
    }
  })
})
