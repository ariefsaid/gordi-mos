import { test, expect, type Page, type Route } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER, ADMIN } from './fixtures/users'
import { AC204, TASKS } from './fixtures/tasks'
import { stubAccountLocale } from './helpers/account-locale'
import { TASKS_SPLIT_MIN_WIDTH } from '../src/shell/use-is-split-width'
import { stripE2eBasePath } from './helpers/app-path'

const LONG_SIGNAL = 'A long Signal leaf title that stays readable without breaking a word across the record header boundary'
// A Signal heading is its first line cut at 72 characters (SIGNAL_TITLE_MAX); the full text
// stays in the message body.
const LONG_TITLE = `${LONG_SIGNAL.slice(0, 72).trimEnd()}…`

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
    await page.route('**/rest/v1/signals*', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/signals') && route.request().method() === 'GET') {
        return mutateSignalBody(route, activeSignalId)
      }
      return route.continue()
    })
    await loginAs(page, MANAGER.email, MANAGER.password)

    for (const width of [390, 1440] as const) {
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
      await expect(title).toHaveText(LONG_TITLE)
      await expect(panel.locator('.signal-message-body')).toHaveText(LONG_SIGNAL)
      await expect(title).toHaveCSS('word-break', 'normal')
      const titleBox = await title.boundingBox()
      expect(titleBox?.width).toBeGreaterThan(0)
      expect((titleBox?.x ?? 0) + (titleBox?.width ?? Infinity)).toBeLessThanOrEqual(width + 1)
      await assertNoPageOverflow(page)

      // signal-record.tsx: "Open full page" rides the overflow menu now, not a direct button.
      await panel.getByRole('button', { name: 'More Signal actions', exact: true }).click()
      await panel.getByRole('menuitem', { name: 'Open full page', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/work/signals/${activeSignalId}$`))
      await expect(page.getByRole('link', { name: 'Back to Home', exact: true })).toBeVisible()
      await expect(page.getByRole('heading', { name: LONG_TITLE, exact: true })).toBeVisible()
      await expect(page.locator('.signal-message-body')).toHaveText(LONG_SIGNAL)
      await page.getByRole('link', { name: 'Back to Home', exact: true }).click()
      await expect.poll(() => stripE2eBasePath(new URL(page.url()).pathname)).toBe('/')
    }
  })

  // One cell: Indonesian is the longest copy, 390 the narrowest width. The 44px tap floor
  // itself is owned by guards.geometry.spec.ts; this keeps only Home's localized controls.
  test('Home localized action census has tappable controls in Indonesian at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 })
    await stubAccountLocale(page, 'id')
    await loginAs(page, MANAGER.email, MANAGER.password)
    await page.goto('./')
    await expect(page.getByRole('tablist', { name: 'Bagian Beranda', exact: true })).toBeVisible()
    const opener = page.getByRole('button', { name: /^Buka sinyal:/ }).first()
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
  })

  // 390 = phone (toolbar nested in its own door, record opens as a page); 1440 = desktop (split
  // panel, full toolbar fit). Widths between them re-run the same branches.
  for (const width of [390, 1440] as const) {
    test(`Tasks toolbar, group grammar, title fit and lifecycle at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(() => {
        localStorage.removeItem('mos.tasks.groupBy')
      })
      await loginAs(page, MANAGER.email, MANAGER.password)
      await page.goto('work/tasks')
      await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
      await expect(page.getByText(TASKS.VIEWER_ACCOUNTABLE.title, { exact: true }).first()).toBeVisible()
      // #870: collapseOptionsOnDesktop is unconditional for Tasks, so the "View & filters" door
      // now exists at every width — phone nests the WHOLE toolbar inside its own outer copy of
      // the same disclosure (so the toolbar testid is absent until it opens), while desktop's row
      // 1 (view chips + search + the door trigger) is always mounted and only row 2's options
      // (Group, Business unit, Status, Person, Sort, Fields, Save view) sit behind the door.
      const door = page.getByRole('button', { name: /^view & filters/i })
      if (width < 768) {
        await expect(door).toBeVisible()
        await expect(page.getByTestId('record-collection-toolbar')).toHaveCount(0)
      } else {
        await expect(page.getByTestId('record-collection-toolbar')).toBeVisible()
      }
      await expect(door).toHaveAttribute('aria-expanded', 'false')
      await door.click()
      await expect(door).toHaveAttribute('aria-expanded', 'true')
      const toolbar = page.getByTestId('record-collection-toolbar')
      await expect(toolbar).toBeVisible()
      await expect(toolbar.getByRole('group', { name: 'View & filters', exact: true })).toBeVisible()
      await expect(toolbar.getByRole('button', { name: 'All', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await assertNoPageOverflow(page)

      const filters = toolbar.getByRole('group', { name: 'View & filters', exact: true })
      await expect(filters.getByRole('combobox', { name: 'Group', exact: true })).toBeVisible()
      await expect(filters.getByRole('combobox', { name: 'Business unit', exact: true })).toBeVisible()
      await expect(filters.getByRole('button', { name: 'Status', exact: true })).toBeVisible()
      await expect(filters.getByRole('combobox', { name: 'Person', exact: true })).toBeVisible()
      await expect(filters.getByRole('combobox', { name: 'Sort', exact: true })).toBeVisible()
      if (width >= 1024) {
        for (const expected of [
          { id: 'group', value: 'Group: None' },
          { id: 'business-unit', value: 'Business unit: All units' },
          { id: 'status', value: 'Any status' },
          { id: 'person', value: 'Person: Anyone' },
          { id: 'sort', value: 'Sort: Due soonest' },
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
        // #870 (guards.geometry.spec.ts, commit 40c2f3ef): the retired two-row toolbar's "row 2
        // stays one visual line" guard is deleted — the door panel wraps now, by ruling, not bug.
        // The search field rides the view-axis row beside the door on desktop (searchInViewRow,
        // collection-toolbar.tsx), not inside the options group — scoped to the whole toolbar,
        // same as this file's own Indonesian-locale case below (line ~286).
        const searchFit = await toolbar.getByRole('searchbox', { name: 'Search tasks', exact: true }).evaluate((element) => {
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
        // #870 (guards.geometry.spec.ts GUARD-PRIMARY, commit 40c2f3ef): the retired two-row
        // toolbar's strict left-to-right order and shared-centre-line guards are deleted — the
        // door panel wraps now, by ruling. Layout-independence is what survives: every control
        // stays inside the toolbar slot and shows its own text (asserted above/below).
      }

      const groupPicker = filters.getByRole('combobox', { name: 'Group', exact: true })
      await groupPicker.click()
      await page.getByRole('listbox', { name: 'Group', exact: true })
        .getByRole('option', { name: 'Status', exact: true }).click()
      const group = page.locator('.collection-grammar-mobile-group, tr.grp').first()
      await expect(group).toBeVisible()
      await expect(group.locator('.collection-grammar-group-label, .mgc-label')).toBeVisible()
      await expect(group.locator('.collection-grammar-group-count, .mgc-count')).toBeVisible()
      await expect(group.getByRole('button', { name: /Collapse|Expand/ })).toBeVisible()

      const taskLink = page.locator(`a[href*="/work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}"]`).first()
      await expect(taskLink).toBeVisible()
      await taskLink.click()
      // #930 raised the derived split threshold (TASKS_SPLIT_MIN_WIDTH) above the WIDTHS
      // sample point once used for this comparison — compare against the real constant so a
      // future threshold change can't silently flip which branch a fixed sample width takes.
      if (width >= TASKS_SPLIT_MIN_WIDTH) {
        await expect(page.getByRole('complementary', { name: /task detail/i })).toBeVisible()
      } else {
        await expect(page.getByRole('heading', { name: TASKS.VIEWER_ACCOUNTABLE.title, exact: true })).toBeVisible()
      }
      await assertNoPageOverflow(page)
      await page.goto('work/tasks')
    })
  }

  // 1024 is the tightest desktop width the full toolbar row must still fit.
  for (const width of [1024] as const) {
    test(`Tasks toolbar keeps Indonesian labels and active Group visible at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await stubAccountLocale(page, 'id')
      await page.addInitScript(() => localStorage.removeItem('mos.tasks.groupBy'))
      await loginAs(page, MANAGER.email, MANAGER.password)
      await page.goto('work/tasks')
      await expect(page.getByText(TASKS.VIEWER_ACCOUNTABLE.title, { exact: true }).first()).toBeVisible()
      // #870: the options group is behind the "View & filters"/"Tampilan & filter" door at every
      // width now — open it before reaching Group/Status/etc.
      await page.getByRole('button', { name: /^tampilan & filter/i }).click()
      const toolbar = page.getByTestId('record-collection-toolbar')
      const filters = page.getByRole('group', { name: 'Tampilan & filter', exact: true })
      const expectedValues = [
        { name: 'Kelompok', value: 'Kelompok: Tidak' },
        { name: 'Unit bisnis', value: 'Unit bisnis: Semua unit' },
        { name: 'Status', value: 'Semua status', role: 'button' as const },
        { name: 'Orang', value: 'Orang: Semua' },
        { name: 'Urutkan', value: 'Urutkan: Jatuh tempo terdekat' },
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
      const toolbarFit = await filters.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }))
      expect(toolbarFit.scrollWidth, 'the complete toolbar row must fit its own visible container').toBeLessThanOrEqual(toolbarFit.clientWidth)
      // The search field rides the view-axis row beside the door on desktop (searchInViewRow,
      // collection-toolbar.tsx), not inside the options group, so this census is scoped to the
      // whole toolbar rather than to `filters`.
      const controlHeights = await toolbar.locator([
        '.collection-toolbar__search',
        '.picker__trigger',
        '.collection-toolbar__choice-trigger',
        '.collection-toolbar__fields > .btn',
        '.collection-toolbar__save-zone > .btn',
      ].join(', ')).evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height))
      expect(controlHeights.length).toBeGreaterThan(0)
      for (const height of controlHeights) {
        expect(height, 'desktop toolbar controls must share the 32px height token').toBeCloseTo(32, 1)
      }
      const searchFit = await toolbar.getByRole('searchbox', { name: 'Cari tugas', exact: true }).evaluate((element) => {
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
      // The count is the live org-wide overdue+blocked total (tasks-workspace.tsx stats,
      // recomputed off real records), not a fixture this file owns — a fixed literal here pins
      // whatever the shared dev DB held on some past run. The goal this test owns is the
      // localized grammar and fit, so it asserts the live shape instead of a frozen number.
      await expect(filters.getByRole('combobox', { name: /memerlukan perhatian/i })).toHaveText(/^\d+ perlu perhatian$/)

      const group = filters.getByRole('combobox', { name: 'Kelompok', exact: true })
      await group.click()
      await page.getByRole('option', { name: 'Status', exact: true }).click()
      await expect(group).toHaveAttribute('data-full-value', 'Kelompok: Status')
      const activeFit = await group.locator('span[data-full-value]').evaluate((element) => element.scrollWidth <= element.clientWidth)
      expect(activeFit, 'Kelompok: Status must remain fully visible').toBe(true)
      await assertNoPageOverflow(page)
    })
  }

  // Phone door in English, desktop in Indonesian: each locale and each door branch once.
  for (const [locale, width] of [['en', 390], ['id', 1280]] as const) {
    test(`Tasks grouped copy and focus are stable in ${locale} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await stubAccountLocale(page, locale)
      await page.addInitScript(() => localStorage.setItem('mos.tasks.groupBy', 'owner'))
      await loginAs(page, MANAGER.email, MANAGER.password)
      await page.goto('work/tasks')
      await expect(page.getByRole('heading', { name: locale === 'id' ? 'Tugas' : 'Tasks', exact: true })).toBeVisible()
      const doorName = locale === 'id' ? 'Tampilan & filter' : 'View & filters'
      // #870: the door exists at every width now — open it before reaching Group.
      await page.getByRole('button', { name: doorName, exact: true }).click()
      const toolbar = page.getByTestId('record-collection-toolbar')
      await expect(toolbar).toBeVisible()
      const filters = toolbar.getByRole('group', { name: doorName, exact: true })
      const group = filters.getByRole('combobox', { name: locale === 'id' ? 'Kelompok' : 'Group', exact: true })
      await group.click()
      await page.getByRole('listbox', { name: locale === 'id' ? 'Kelompok' : 'Group', exact: true })
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
    })
  }

  // 390 = record as a page, 768 = record as a dialog, 1440 = record as a side panel.
  for (const width of [390, 768, 1440] as const) {
    test(`Signals Feed/Table and record chrome at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
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
        await feed.click()
      } else {
        await expect(page.getByRole('button', { name: /View & filters/i })).toBeVisible()
      }
      const row = page.getByRole('button', { name: /^Open signal:/ }).first()
      await expect(row).toBeVisible()
      await row.click()
      const phone = width < 768
      const record = phone
        ? page.locator('[data-record-kind="signal"][data-record-mode="page"]')
        : page.getByRole(width >= 1100 ? 'complementary' : 'dialog', { name: 'Signal', exact: true })
      await expect(record).toBeVisible()
      await expect(record.getByRole('button', { name: 'More Signal actions', exact: true })).toBeVisible()
      await expect(record.getByRole('button', { name: 'Seen', exact: true })).toBeVisible()
      await expect(record.getByRole('heading', { name: 'Reach & response', exact: true })).toBeVisible()
      await expect(record.getByRole('heading', { name: 'Facts', exact: true })).toBeVisible()
      await assertNoPageOverflow(page)
      if (phone) {
        const back = page.locator('.record-page-back')
        await expect(back).toHaveCount(1)
        await expect(back).toHaveAttribute('href', '/work/signals?layout=feed')
        await back.click()
        await expect(page).toHaveURL(url => url.pathname === '/work/signals' && url.searchParams.get('layout') === 'feed')
        await expect(page.getByRole('heading', { name: 'Signals', exact: true })).toBeVisible()
        await expect(row).toBeVisible()
      } else {
        await page.keyboard.press('Escape')
        await expect(record).not.toBeVisible()
        await expect(row).toBeFocused()
      }
    })
  }

  test('a missing Objective reads as the named state for readers and editors, and the empty list keeps its copy', async ({ page }) => {
    await loginAs(page, MANAGER.email, MANAGER.password)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`work/tasks/${AC204.tasks.orphanLine.id}`)
    await expect(page.getByRole('heading', { name: AC204.tasks.orphanLine.title, exact: true })).toBeVisible()
    // Read-only for this viewer: the named empty state is visible without an edit affordance,
    // and the note names who can change the task.
    await expect(page.getByText('No Objective', { exact: true })).toBeVisible()
    await expect(page.getByText('+ Set objective', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit Objective', exact: true })).toHaveCount(0)
    await expect(page.getByRole('note')).toContainText(/View only · .+ can change this task/)

    // The task's owner sees the same named value inside the retained edit affordance.
    await page.evaluate(() => localStorage.clear())
    await loginAs(page, ADMIN.email, ADMIN.password)
    await page.goto(`work/tasks/${AC204.tasks.orphanLine.id}`)
    await expect(page.getByRole('heading', { name: AC204.tasks.orphanLine.title, exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit Objective', exact: true })).toHaveText('No Objective')
    await expect(page.getByText('+ Set objective', { exact: true })).toHaveCount(0)

    await page.route('**/rest/v1/tasks*', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })
    await page.goto('work/tasks')
    await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
    await expect(page.getByText('No tasks yet', { exact: true })).toBeVisible()
  })
})
