// Task record journeys at desktop width:
// direct canonical links render the standalone record page, while in-list opens keep the
// collection and its record panel mounted. Completion and record terminology remain visible
// outcomes on both surfaces.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

test.beforeEach(async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await page.getByRole('tab', { name: 'All', exact: true }).click()
})

test('OD-63-1: direct URL / new-tab / refresh opens the full canonical page (not the table shell)', async ({ page }) => {
  const title = `OD63 Direct ${Date.now()}`
  const detailUrl = await createTaskViaUI(page, title)

  await page.goto(`${detailUrl.slice(1)}?view=overdue`)
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?view=overdue$/)

  await expect(page.getByRole('heading', { level: 1, name: new RegExp(title) })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.split')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Tasks' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: /task detail/i })).toHaveCount(0)
  expect(page.url()).toContain('view=overdue')
})

test('OD-63-2: an in-list click opens the split drawer (table stays mounted)', async ({ page }) => {
  const title = `OD63 Click ${Date.now()}`
  await createTaskViaUI(page, title)

  // Return to the list and open the row by a normal in-list click (in-app SPA nav).
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await page.getByRole('tab', { name: 'All', exact: true }).click()
  const taskLink = page.locator('a[href*="/work/tasks/"]').filter({ hasText: title }).first()
  await expect(taskLink).toBeVisible({ timeout: 10_000 })
  await taskLink.click()
  await page.waitForURL(/\/work\/tasks\?(?=[^#]*record=[0-9a-f-]{36})[^#]*$/)

  await expect(page.getByRole('complementary', { name: /task detail/i })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible()
  await expect(page.getByRole('button', { name: /open full page/i })).toBeVisible()
})

test('OD-63/OD-62: Mark complete sets a task to Done on the standalone page', async ({ page }) => {
  const title = `OD63 Complete ${Date.now()}`
  const detailUrl = await createTaskViaUI(page, title)
  await page.goto(detailUrl.slice(1))
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(title) })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Mark complete' }).click()

  await expect(page.getByRole('button', { name: /edit status/i })).toContainText('Done', { timeout: 8_000 })
  await expect(page.getByRole('button', { name: 'Mark complete' })).toHaveCount(0)
})

test('OD-62: no RACI grammar is visible on any Task surface', async ({ page }) => {
  const title = `OD62 Surface ${Date.now()}`
  const detailUrl = await createTaskViaUI(page, title)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await page.getByRole('tab', { name: 'All', exact: true }).click()
  const taskLink = page.locator('a[href*="/work/tasks/"]').filter({ hasText: title }).first()
  await expect(taskLink).toBeVisible({ timeout: 10_000 })
  await taskLink.click()
  await page.waitForURL(/\/work\/tasks\?(?=[^#]*record=[0-9a-f-]{36})[^#]*$/)

  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
  const raci = page.getByText(/RACI|Owner \(R\)|Responsible \(R\)|Accountable \(A\)|R·A·C·I/i)
  await expect(raci).toHaveCount(0)

  await page.goto(detailUrl.slice(1))
  await expect(page.getByRole('heading', { level: 1, name: new RegExp(title) })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/RACI|Owner \(R\)|Responsible \(R\)|Accountable \(A\)|R·A·C·I/i)).toHaveCount(0)
})
