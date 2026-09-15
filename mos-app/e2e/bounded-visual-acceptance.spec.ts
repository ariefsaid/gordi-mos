import { test, expect, type Page, type Route } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER } from './fixtures/users'
import { AC204, TASKS } from './fixtures/tasks'

const LONG_SIGNAL = 'A long Signal leaf title that stays readable without breaking a word across the record header boundary'
const WIDTHS = [390, 768, 1024, 1280, 1370, 1440] as const

function capture(name: string, page: Page) {
  return page.screenshot({ path: `/tmp/gordi-final-${name}.png`, animations: 'disabled', fullPage: true })
}

async function assertNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

async function mutateSignalBody(route: Route, signalId: string) {
  const response = await route.fetch()
  const body = await response.json()
  if (Array.isArray(body)) {
    const firstLive = body.findIndex((row) => row?.retracted_at == null)
    const rows = body.map((row, index) => index === firstLive ? { ...row, body: LONG_SIGNAL } : row)
    return route.fulfill({ response, json: rows })
  }
  if (body?.id === signalId) return route.fulfill({ response, json: { ...body, body: LONG_SIGNAL } })
  return route.fulfill({ response })
}

test.describe('bounded visual and interaction acceptance', () => {
  test('Home → Signal preserves the Home-named Back and long leaf title at phone and desktop', async ({ page }) => {
    let activeSignalId = ''
    await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
    await page.route('**/rest/v1/signals*', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/signals')) return mutateSignalBody(route, activeSignalId)
      return route.continue()
    })
    await loginAs(page, MANAGER.email, MANAGER.password)

    for (const width of [390, 1370, 1440] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('./')
      const opener = page.getByRole('button', { name: /^Open signal:/ }).first()
      await expect(opener).toBeVisible({ timeout: 15_000 })
      activeSignalId = (await opener.getAttribute('data-signal-id')) ?? ''
      expect(activeSignalId).not.toBe('')
      await opener.click()
      const panel = page.getByRole(width === 390 ? 'dialog' : 'complementary', { name: 'Signal', exact: true })
      await expect(panel).toBeVisible()
      const title = panel.locator('.record-viewer__title')
      await expect(title).toContainText(LONG_SIGNAL)
      await expect(title).toHaveCSS('word-break', 'normal')
      const titleBox = await title.boundingBox()
      expect(titleBox?.width).toBeGreaterThan(0)
      expect((titleBox?.x ?? 0) + (titleBox?.width ?? Infinity)).toBeLessThanOrEqual(width + 1)
      await assertNoPageOverflow(page)
      await capture(`home-signal-panel-${width}`, page)

      await panel.getByRole('button', { name: 'Open full page', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/work/signals/${activeSignalId}$`))
      await expect(page.getByRole('link', { name: 'Back to Home', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: LONG_SIGNAL, exact: true })).toBeVisible()
      await capture(`home-signal-page-${width}`, page)
      await page.getByRole('link', { name: 'Back to Home', exact: true }).click()
      await expect(page).toHaveURL(/\/mos\/?$/)
    }
  })

  for (const locale of ['en', 'id'] as const) {
    for (const width of [390, 768] as const) {
      test(`Home localized action census has tappable controls at ${locale}/${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.addInitScript((value) => localStorage.setItem('mos.locale', value), locale)
        await loginAs(page, MANAGER.email, MANAGER.password)
        await page.goto('./')
        await expect(page.getByRole('tablist', { name: locale === 'id' ? 'Bagian Beranda' : 'Home regions', exact: true })).toBeVisible()
        const opener = page.getByRole('button', { name: locale === 'id' ? /^Buka sinyal:/ : /^Open signal:/ }).first()
        await expect(opener).toBeVisible({ timeout: 15_000 })
        const tappable = await page.locator('.home-tabs button, .home-signal-row[role="button"]').evaluateAll((nodes) => nodes
          .map((node) => {
            const rect = node.getBoundingClientRect()
            const style = getComputedStyle(node)
            return { visible: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden', width: rect.width, height: rect.height }
          })
          .filter((entry) => entry.visible))
        expect(tappable.length).toBeGreaterThan(0)
        for (const control of tappable) {
          expect(control.width).toBeGreaterThanOrEqual(44)
          expect(control.height).toBeGreaterThanOrEqual(44)
        }
        await assertNoPageOverflow(page)
        await capture(`home-${locale}-${width}`, page)
      })
    }
  }

  for (const width of WIDTHS) {
    test(`Tasks toolbar, group grammar, title fit and lifecycle at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(() => {
        localStorage.setItem('mos.locale', 'en')
        localStorage.removeItem('mos.tasks.groupBy')
      })
      await loginAs(page, MANAGER.email, MANAGER.password)
      await page.goto('work/tasks')
      await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
      await expect(page.getByText(TASKS.VIEWER_ACCOUNTABLE.title, { exact: true }).first()).toBeVisible()
      const mobileDoor = page.getByRole('button', { name: 'View & filters', exact: true })
      if (width < 768) {
        await expect(mobileDoor).toBeVisible()
        await expect(page.getByTestId('record-collection-toolbar')).toHaveCount(0)
        await mobileDoor.click()
      } else {
        await expect(mobileDoor).toHaveCount(0)
      }
      const toolbar = page.getByTestId('record-collection-toolbar')
      await expect(toolbar).toBeVisible()
      await expect(toolbar.getByRole('group', { name: 'View & filters', exact: true })).toBeVisible()
      await expect(toolbar.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await assertNoPageOverflow(page)
      await capture(`tasks-toolbar-${width}`, page)

      const filters = toolbar.getByRole('group', { name: 'View & filters', exact: true })
      await expect(filters.getByRole('combobox', { name: 'Group', exact: true })).toBeVisible()
      await expect(filters.getByRole('combobox', { name: 'Business unit', exact: true })).toBeVisible()
      await expect(filters.getByRole('button', { name: 'Status', exact: true })).toBeVisible()
      await expect(filters.getByRole('combobox', { name: 'Person', exact: true })).toBeVisible()
      await expect(filters.getByRole('combobox', { name: 'Sort', exact: true })).toBeVisible()
      if (width >= 1024) {
        for (const expected of [
          { id: 'group', value: 'Group: None' },
          { id: 'business-unit', value: 'All units' },
          { id: 'status', value: 'Any status' },
          { id: 'person', value: 'Anyone' },
          { id: 'sort', value: 'Due soonest' },
        ]) {
          const trigger = filters.locator(`[data-filter-id="${expected.id}"] button[data-full-value]`)
          await expect(trigger).toHaveAttribute('data-full-value', expected.value)
          const valueGeometry = await trigger.locator('span[data-full-value]').evaluate((element) => {
            const rect = element.getBoundingClientRect()
            return {
              text: element.textContent?.trim() ?? '',
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              right: rect.right,
            }
          })
          expect(valueGeometry.text).toBe(expected.value)
          expect(valueGeometry.scrollWidth, `${expected.id} value must remain fully visible`).toBeLessThanOrEqual(valueGeometry.clientWidth)
          expect(valueGeometry.right).toBeLessThanOrEqual(width)
        }
        const optionsGeometry = await filters.evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          height: element.getBoundingClientRect().height,
        }))
        expect(optionsGeometry.scrollWidth).toBeLessThanOrEqual(optionsGeometry.clientWidth + 1)
        expect(optionsGeometry.height, 'desktop toolbar row 2 must remain one visual line').toBeLessThanOrEqual(60)
        const searchFit = await filters.getByRole('searchbox', { name: 'Search tasks', exact: true }).evaluate((element) => {
          const input = element as HTMLInputElement
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')
          if (!context) return false
          context.font = getComputedStyle(input).font
          return context.measureText(input.placeholder).width + 4 <= input.clientWidth
        })
        expect(searchFit, 'Search tasks placeholder must remain fully visible').toBe(true)
        await expect(filters.getByRole('button', { name: 'Fields', exact: true })).toContainText('Fields')
        await expect(filters.getByRole('button', { name: 'Save view', exact: true })).toContainText('Save view')
        const groupTrigger = filters.getByRole('combobox', { name: 'Group', exact: true })
        await groupTrigger.click()
        await page.getByRole('option', { name: 'Status', exact: true }).click()
        await expect(groupTrigger).toHaveAttribute('data-full-value', 'Group: Status')
        const activeGroupFit = await groupTrigger.locator('span[data-full-value]').evaluate((element) => element.scrollWidth <= element.clientWidth)
        expect(activeGroupFit, 'active Group: Status value must remain fully visible').toBe(true)
        const controlRects = await filters.locator(':scope > *').evaluateAll((elements) => elements
          .map((element) => {
            const container = element.getBoundingClientRect()
            const interactive = element.querySelector('button, input, [role="combobox"]')?.getBoundingClientRect() ?? container
            return {
              name: element.getAttribute('data-filter-id') || element.className,
              left: interactive.left,
              right: interactive.right,
              centerY: interactive.top + interactive.height / 2,
              containerLeft: container.left,
              containerRight: container.right,
              width: interactive.width,
              height: interactive.height,
            }
          })
          .filter((rect) => rect.width > 0 && rect.height > 0))
        for (const rect of controlRects) {
          expect(rect.left, `${rect.name} control must stay inside its toolbar slot`).toBeGreaterThanOrEqual(rect.containerLeft - 1)
          expect(rect.right, `${rect.name} control must stay inside its toolbar slot: ${JSON.stringify(rect)}`).toBeLessThanOrEqual(rect.containerRight + 1)
        }
        for (let index = 1; index < controlRects.length; index += 1) {
          expect(controlRects[index - 1].right).toBeLessThanOrEqual(controlRects[index].left + 1)
        }
        const centers = controlRects.map((rect) => rect.centerY)
        expect(Math.max(...centers) - Math.min(...centers), 'desktop toolbar row 2 must share one center').toBeLessThanOrEqual(2)
      }
      await capture(`tasks-filters-${width}`, page)

      const groupPicker = filters.getByRole('combobox', { name: 'Group', exact: true })
      await groupPicker.click()
      await page.getByRole('listbox', { name: 'Group', exact: true })
        .getByRole('option', { name: 'Status', exact: true }).click()
      const group = page.locator('.collection-grammar-mobile-group, tr.grp').first()
      await expect(group).toBeVisible()
      await expect(group.locator('.collection-grammar-group-label, .mgc-label')).toBeVisible()
      await expect(group.locator('.collection-grammar-group-count, .mgc-count')).toBeVisible()
      await expect(group.getByRole('button', { name: /Collapse|Expand/ })).toBeVisible()
      await capture(`tasks-group-${width}`, page)

      const taskLink = page.locator(`a[href*="/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}"]`).first()
      await expect(taskLink).toBeVisible()
      await taskLink.click()
      if (width >= 1370) {
        await expect(page.getByRole('complementary', { name: /task detail/i })).toBeVisible()
      } else {
        await expect(page.getByRole('heading', { name: TASKS.VIEWER_ACCOUNTABLE.title, exact: true })).toBeVisible()
      }
      await assertNoPageOverflow(page)
      await capture(`tasks-record-${width}`, page)
      await page.goto('work/tasks')
    })
  }

  for (const width of [1024, 1440] as const) {
    test(`Tasks toolbar keeps Indonesian labels and active Group visible at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(() => {
        localStorage.setItem('mos.locale', 'id')
        localStorage.removeItem('mos.tasks.groupBy')
      })
      await loginAs(page, MANAGER.email, MANAGER.password)
      await page.goto('work/tasks')
      await expect(page.getByText(TASKS.VIEWER_ACCOUNTABLE.title, { exact: true }).first()).toBeVisible()
      const filters = page.getByRole('group', { name: 'Tampilan & filter', exact: true })
      const expectedValues = [
        { name: 'Grup', value: 'Grup: Tidak' },
        { name: 'Unit bisnis', value: 'Semua unit' },
        { name: 'Status', value: 'Semua status', role: 'button' as const },
        { name: 'Orang', value: 'Semua' },
        { name: 'Urutkan', value: 'Tenggat dekat' },
      ]
      for (const expected of expectedValues) {
        const trigger = filters.getByRole(expected.role ?? 'combobox', { name: expected.name, exact: true })
        await expect(trigger).toHaveAttribute('data-full-value', expected.value)
        const fit = await trigger.locator('span[data-full-value]').evaluate((element) => ({
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
        }))
        expect(fit.scrollWidth, `${expected.value} must remain fully visible`).toBeLessThanOrEqual(fit.clientWidth)
      }
      const searchFit = await filters.getByRole('searchbox', { name: 'Cari tugas', exact: true }).evaluate((element) => {
        const input = element as HTMLInputElement
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')
        if (!context) return false
        context.font = getComputedStyle(input).font
        return context.measureText(input.placeholder).width + 4 <= input.clientWidth
      })
      expect(searchFit, 'Cari tugas placeholder must remain fully visible').toBe(true)
      await expect(filters.getByRole('button', { name: 'Kolom', exact: true })).toContainText('Kolom')
      await expect(filters.getByRole('button', { name: 'Simpan tampilan', exact: true })).toContainText('Simpan')
      await expect(filters.getByRole('combobox', { name: /memerlukan perhatian/i })).toContainText('3 perlu perhatian')

      const group = filters.getByRole('combobox', { name: 'Grup', exact: true })
      await group.click()
      await page.getByRole('option', { name: 'Status', exact: true }).click()
      await expect(group).toHaveAttribute('data-full-value', 'Grup: Status')
      const activeFit = await group.locator('span[data-full-value]').evaluate((element) => element.scrollWidth <= element.clientWidth)
      expect(activeFit, 'Grup: Status must remain fully visible').toBe(true)
      await assertNoPageOverflow(page)
      await capture(`tasks-toolbar-id-${width}`, page)
    })
  }

  for (const locale of ['en', 'id'] as const) {
    for (const width of [390, 768, 1280] as const) {
      test(`Tasks grouped copy and focus are stable in ${locale} at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.addInitScript((value) => {
          localStorage.setItem('mos.locale', value)
          localStorage.setItem('mos.tasks.groupBy', 'owner')
        }, locale)
        await loginAs(page, MANAGER.email, MANAGER.password)
        await page.goto('work/tasks')
        await expect(page.getByRole('heading', { name: locale === 'id' ? 'Tugas' : 'Tasks', exact: true })).toBeVisible()
        const doorName = locale === 'id' ? 'Tampilan & filter' : 'View & filters'
        const mobileDoor = page.getByRole('button', { name: doorName, exact: true })
        if (width < 768) await mobileDoor.click()
        else await expect(mobileDoor).toHaveCount(0)
        const toolbar = page.getByTestId('record-collection-toolbar')
        await expect(toolbar).toBeVisible()
        const filters = toolbar.getByRole('group', { name: doorName, exact: true })
        const group = filters.getByRole('combobox', { name: locale === 'id' ? 'Grup' : 'Group', exact: true })
        await group.click()
        await page.getByRole('listbox', { name: locale === 'id' ? 'Grup' : 'Group', exact: true })
          .getByRole('option', { name: 'PIC', exact: true }).click()
        await expect(group).toContainText('PIC')
        await group.focus()
        await expect(group).toBeFocused()
        await page.keyboard.press('Escape')
        // Picker Escape is local: it closes its listbox and returns focus without collapsing the
        // phone's outer View & filters door. A second Escape owns the outer disclosure lifecycle.
        await expect(filters).toBeVisible()
        await expect(group).toBeFocused()
        await assertNoPageOverflow(page)
        await capture(`tasks-${locale}-group-${width}`, page)
      })
    }
  }

  for (const width of [390, 768, 1280, 1440] as const) {
    test(`Signals Feed/Table and record chrome at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
      await loginAs(page, MANAGER.email, MANAGER.password)
      await page.goto('work/signals')
      await expect(page.getByRole('heading', { name: 'Signals', exact: true })).toBeVisible()
      const feed = page.getByRole('tab', { name: 'Feed', exact: true })
      const table = page.getByRole('tab', { name: 'Table', exact: true })
      if (width >= 768) {
        await expect(feed).toHaveAttribute('aria-selected', 'true')
        await expect(table).toHaveAttribute('aria-selected', 'false')
        await table.click()
        await expect(table).toHaveAttribute('aria-selected', 'true')
        await expect(page.locator('table').first()).toBeVisible()
        await capture(`signals-table-${width}`, page)
        await feed.click()
      } else {
        await expect(page.getByRole('button', { name: /View & filters/i })).toBeVisible()
      }
      const row = page.getByRole('button', { name: /^Open signal:/ }).first()
      await expect(row).toBeVisible()
      await row.click()
      const panel = page.getByRole(width >= 1100 ? 'complementary' : 'dialog', { name: 'Signal', exact: true })
      await expect(panel).toBeVisible()
      await expect(panel.getByRole('button', { name: 'More Signal actions', exact: true })).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Seen', exact: true })).toBeVisible()
      await expect(panel.getByRole('heading', { name: 'Reach & response', exact: true })).toBeVisible()
      await expect(panel.getByRole('heading', { name: 'Facts', exact: true })).toBeVisible()
      await assertNoPageOverflow(page)
      await capture(`signals-record-${width}`, page)
      await page.keyboard.press('Escape')
      await expect(row).toBeFocused()
    })
  }

  test('missing relations keep exact No Objective and No tasks yet copy', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('mos.locale', 'en'))
    await loginAs(page, MANAGER.email, MANAGER.password)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`work/tasks/${AC204.tasks.orphanLine.id}`)
    await expect(page.getByRole('heading', { name: AC204.tasks.orphanLine.title, exact: true })).toBeVisible()
    await expect(page.getByText('No Objective', { exact: true })).toBeVisible()
    await page.route('**/rest/v1/tasks*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.goto('work/tasks')
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
    await expect(page.getByText('No tasks yet', { exact: true })).toBeVisible()
    await capture('missing-relations-1440', page)
  })
})
