// Task record journeys:
// hard links render the standalone canonical page at any width; desktop in-list opens retain the
// collection panel; phone card opens use the full-screen record page and return to the card list;
// desktop keyboard navigation opens the second row and creates an inline draft.

import { type Page } from '@playwright/test'
import { test, expect } from './fixtures/task-browser'
import { loginAs } from './helpers/login'
import { createTaskViaUI, selectTaskView } from './helpers/tasks'
import { VIEWER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

// selectTaskView is self-managing (#870): it opens the phone "View & filters" door only when the
// chips are nested inside it, and closes it again — a door left open was seen to intercept the
// page-level 'n'/'j' keyboard shortcuts this file's AC-109 exercises.
async function selectAllView(page: Page) {
  await selectTaskView(page, 'All')
}

test('AC-102 (J4): deep-link to /work/tasks/:id renders the standalone canonical record page (OD-63)', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  const taskId = TASKS.VIEWER_ACCOUNTABLE.id
  const title = TASKS.VIEWER_ACCOUNTABLE.title

  await page.goto(`work/tasks/${taskId}`)
  await page.waitForURL(new RegExp(`/work/tasks/${taskId}$`))

  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('link', { name: /back to tasks/i })).toBeVisible()
  await expect(page.getByRole('complementary', { name: /task detail/i })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Tasks' })).toHaveCount(0)
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('AC-110 (J5) part A: a deep link is the SAME standalone page on a phone (OD-63 is viewport-independent)', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    const taskId = TASKS.VIEWER_ACCOUNTABLE.id
    const title = TASKS.VIEWER_ACCOUNTABLE.title

    await page.goto(`work/tasks/${taskId}`)
    await page.waitForURL(new RegExp(`/work/tasks/${taskId}$`))

    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: /back to tasks/i })).toBeVisible()
    await expect(page.getByRole('dialog', { name: /task detail/i })).toHaveCount(0)
  })

  test('AC-110 (J5) part B: opening a task in-app on a phone renders the full-screen record; Back returns to the card list', async ({ page }, testInfo) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    const title = `Phone record ${Date.now()}`

    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)
    await selectAllView(page)
    await createTaskViaUI(page, title)
    const card = page.locator('[data-testid="task-card"]', { hasText: title }).first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.getByRole('link').click()
    await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}(?:\?.*)?$/)

    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('link', { name: /back to tasks/i })).toBeVisible()
    await expect(page.getByRole('dialog', { name: /task detail/i })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('canonical-phone.png') })

    await page.getByRole('link', { name: /back to tasks/i }).click()
    await page.waitForURL(/\/work\/tasks(?:\?.*)?$/)
    await expect(page.locator('[data-testid="task-card"]').first()).toBeVisible({ timeout: 10_000 })
  })
})

test('AC-109 (J6): keyboard — j j Enter opens the 2nd row; Esc closes; n opens create', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await selectAllView(page)

  await createTaskViaUI(page, `J6 Second ${Date.now()}`)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await selectAllView(page)

  await expect(page.locator('tbody tr.task-row').nth(1)).toBeVisible({ timeout: 10_000 })
  const secondTitle = await page.locator('tbody tr.task-row').nth(1).locator('.task-name').first().innerText()

  await page.getByRole('heading', { name: 'Tasks', exact: true }).click()

  await page.keyboard.press('j')
  await page.keyboard.press('j')
  await expect(page.locator('tr.task-row.kfocus')).toBeVisible()
  const cursorTitle = await page.locator('tr.task-row.kfocus .task-name').first().innerText()
  expect(cursorTitle).toBe(secondTitle)
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/work\/tasks\?(?=[^#]*record=[0-9a-f-]{36})[^#]*$/)
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: cursorTitle })).toBeVisible({ timeout: 10_000 })

  await page.keyboard.press('Escape')
  await page.waitForURL(/\/work\/tasks$/)

  await page.getByRole('heading', { name: 'Tasks', exact: true }).click()
  await page.keyboard.press('n')
  await expect(page).toHaveURL(/\/work\/tasks$/)
  await expect(page.getByRole('textbox', { name: 'Edit task title', exact: true })).toBeVisible()
})
