// PR-D e2e journeys 4–6 (split-view redesign, ADR-0007):
//   J4 (AC-102): deep-link /tasks/:id → table + that task's drawer render together.
//   J5 (AC-110 mobile): 390×844 viewport → /tasks/:id renders the full-screen modal;
//        Esc/back returns to the card list.
//   J6 (AC-109): keyboard nav — j j Enter opens the 2nd row; Esc → /tasks; n → /tasks/new.
// Requires the live stack (supabase up on 44321) + the global-setup seed.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

test('AC-102 (J4): deep-link to /tasks/:id renders the table AND that task drawer together', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  const taskId = TASKS.VIEWER_ACCOUNTABLE.id
  const title = TASKS.VIEWER_ACCOUNTABLE.title

  // Land directly on the deep link (e.g. from My Week / Daily Log).
  await page.goto(`tasks/${taskId}`)
  await page.waitForURL(new RegExp(`/tasks/${taskId}$`))

  // Both panes render: the persistent table AND the task's drawer.
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible()
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('AC-110 (J5): on a phone, /tasks/:id is a full-screen modal; back returns to the card list', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    const taskId = TASKS.VIEWER_ACCOUNTABLE.id
    const title = TASKS.VIEWER_ACCOUNTABLE.title

    await page.goto(`tasks/${taskId}`)
    await page.waitForURL(new RegExp(`/tasks/${taskId}$`))

    // Full-screen modal dialog (no 1/3 drawer on a phone).
    const dialog = page.getByRole('dialog', { name: /task detail/i })
    await expect(dialog.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.drawer-modal.drawer-fullscreen')).toBeVisible()

    // Esc closes back to the list (the modal's document-level Esc handler).
    await page.keyboard.press('Escape')
    await page.waitForURL(/\/tasks$/)
    // The list form on mobile is the card list.
    await expect(page.locator('[data-testid="task-card"]').first()).toBeVisible({ timeout: 10_000 })
  })
})

test('AC-109 (J6): keyboard — j j Enter opens the 2nd row; Esc closes; n opens create', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('tasks')
  await page.waitForURL(/\/tasks$/)
  await page.getByRole('tab', { name: 'All' }).click()

  // The seed has one task; create a second so j j has somewhere to land.
  await createTaskViaUI(page, `J6 Second ${Date.now()}`)
  await page.goto('tasks')
  await page.waitForURL(/\/tasks$/)
  await page.getByRole('tab', { name: 'All' }).click()

  // Wait for at least two rows so j j has somewhere to land.
  await expect(page.locator('tbody tr.task-row').nth(1)).toBeVisible({ timeout: 10_000 })

  // Click the page-head (not a field) so single-letter hotkeys are live.
  await page.getByRole('heading', { name: 'Tasks' }).click();

  // j j moves the cursor to the 2nd row; Enter opens it.
  await page.keyboard.press('j')
  await page.keyboard.press('j')
  await expect(page.locator('tr.task-row.kfocus')).toBeVisible()
  const cursorTitle = await page.locator('tr.task-row.kfocus .task-name').first().innerText()
  await page.keyboard.press('Enter')
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/)
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: cursorTitle })).toBeVisible({ timeout: 10_000 })

  // Esc closes the drawer → back to /tasks.
  await page.keyboard.press('Escape')
  await page.waitForURL(/\/tasks$/)

  // n opens the create drawer.
  await page.getByRole('heading', { name: 'Tasks' }).click()
  await page.keyboard.press('n')
  await page.waitForURL(/\/tasks\/new$/)
  await expect(page.getByRole('complementary', { name: /new task/i })).toBeVisible()
})
