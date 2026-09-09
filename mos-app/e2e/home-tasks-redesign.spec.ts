import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`Home and Tasks at ${viewport.width}px`, () => {
    test.use({ viewport })

    test('find work, narrow and reset the queue, complete a task, and return', async ({ page }, testInfo) => {
      await loginAs(page, VIEWER.email, VIEWER.password)
      await page.goto('work/tasks')
      const title = `Redesign journey ${viewport.width} ${Date.now()}`
      await createTaskViaUI(page, title)

      const search = page.getByRole('searchbox', { name: 'Search tasks' })
      await search.fill(title)
      const task = page.locator('a[href*="/work/tasks/"]').filter({ hasText: title }).first()
      await expect(task).toBeVisible()
      const filters = page.getByRole('button', { name: /^Filters/ })
      await expect(filters).toHaveAttribute('aria-expanded', 'false')
      await filters.click()
      await page.getByRole('combobox', { name: 'Status', exact: true }).click()
      await page.getByRole('option', { name: 'Done', exact: true }).click()
      await expect(task).toHaveCount(0)
      await page.getByRole('button', { name: /clear filters|reset filters/i }).first().click()
      await search.fill(title)
      await expect(task).toBeVisible()
      if (await filters.getAttribute('aria-expanded') === 'true') {
        await page.keyboard.press('Escape')
        await expect(filters).toBeFocused()
      }
      await task.click()
      const record = page.getByRole('region', { name: title, exact: true })
      await expect(record).toBeVisible()
      await expect(record.getByRole('heading', { name: title, exact: true })).toBeVisible()
      let rejectedWrite = false
      await page.route('**/rest/v1/tasks?*', async (route) => {
        if (route.request().method() === 'PATCH' && !rejectedWrite) {
          rejectedWrite = true
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Temporary save failure' }) })
        } else {
          await route.continue()
        }
      })
      await record.getByRole('button', { name: 'Mark complete', exact: true }).click()
      const failure = page.getByTestId('task-lifecycle-error')
      await expect(failure).toBeVisible()
      expect(rejectedWrite).toBe(true)
      await expect(record.getByRole('button', { name: 'Edit Status', exact: true })).not.toContainText('Done')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath('completion-retry.png') })
      await failure.getByRole('button', { name: 'Retry', exact: true }).click()
      await expect(failure).toBeHidden()
      await expect(record.getByRole('button', { name: 'Edit Status', exact: true })).toContainText('Done')
      await page.goBack()
      await expect(record).toBeHidden()
      await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()

      // Reload the collection to verify persistence beyond optimistic record state.
      await page.goto('work/tasks')
      await page.getByRole('tab', { name: 'Completed', exact: true }).click()
      await search.fill(title)
      await expect(task).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Completed', exact: true })).toHaveAttribute('aria-selected', 'true')
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })

    test('Home exposes attention and personal work together, with working collection doors', async ({ page }) => {
      await loginAs(page, VIEWER.email, VIEWER.password)
      await page.goto('./')
      const attention = page.getByRole('region', { name: /Needs you now|Needs attention/i })
      const personal = page.getByRole('region', { name: /^My work today/ })
      await expect(attention).toBeVisible()
      await expect(personal).toBeVisible()
      await expect(page.getByRole('tab', { name: /Needs you now|My work today/i })).toHaveCount(0)
      await personal.getByRole('link', { name: /My open tasks/i }).click()
      await expect(page.getByRole('heading', { name: 'Tasks', exact: true })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'My work', exact: true })).toHaveAttribute('aria-selected', 'true')
      await page.goBack()
      await expect(attention).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  })
}
