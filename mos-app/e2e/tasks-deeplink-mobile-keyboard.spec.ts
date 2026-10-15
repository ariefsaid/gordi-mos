// Task record journeys: a hard link renders the standalone canonical page; desktop keyboard
// navigation opens the second row and creates an inline draft.

import { type Page } from '@playwright/test'
import { test, expect } from './fixtures/task-browser'
import { loginAs } from './helpers/login'
import { createTaskViaUI, selectTaskView } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

// OD-TASK-3: VIEWER is not org-wide, so the primary view chip is named "Relevant", not "All".
async function selectRelevantView(page: Page) {
  await selectTaskView(page, 'Relevant')
}

// The record opens beside the list only on a wide content track.
test.use({ viewport: { width: 1920, height: 1080 } })

// AC-102 / AC-110: a deep link renders the standalone canonical page at every width (OD-63), so one
// width suffices and tasks-canonical-page.spec.ts OD-63-1 owns it. Opening a Task as a phone page
// and returning with Back is owned by work-record-opening.spec.ts.

test('AC-109 (J6): keyboard — j j Enter opens the 2nd row; Esc closes; n opens create', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await selectRelevantView(page)

  await createTaskViaUI(page, `J6 Second ${Date.now()}`)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await selectRelevantView(page)

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
  // The create page keeps ?create=1 in the address while the draft is open.
  await expect(page).toHaveURL(/\/work\/tasks\?create=1$/)
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toBeVisible()
})
