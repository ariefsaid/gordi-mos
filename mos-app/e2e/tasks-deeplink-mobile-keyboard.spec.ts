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

test('AC-102 (J4): deep-link to /tasks/:id opens the standalone full canonical page (OD-63)', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  const taskId = TASKS.VIEWER_ACCOUNTABLE.id
  const title = TASKS.VIEWER_ACCOUNTABLE.title

  // Land directly on the deep link (e.g. from My Week / Daily Log / a new tab).
  await page.goto(`work/tasks/${taskId}`)
  await page.waitForURL(new RegExp(`/work/tasks/${taskId}$`))

  // OD-63: a direct/new-tab/refresh renders the SAME record as a standalone full
  // canonical page — not inside the table+drawer shell. The one TaskSurface renderer
  // shows the record identity (<h1>); no table region, no split drawer.
  await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.record-2col')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: /task detail/i })).toHaveCount(0)
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('AC-W1-A: a member phone shows work before the collapsed task options', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)

    const options = page.getByRole('button', { name: /view options/i })
    await expect(options).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('.toolbar')).toHaveCount(0)

    const card = page.locator('[data-testid="task-card"]').first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    const box = await card.boundingBox()
    expect(box?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(844)

    // The existing page action remains reachable while filters stay disclosed.
    await expect(page.getByRole('link', { name: /create task/i }).first()).toBeVisible()

    await options.click()
    await expect(options).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('combobox', { name: 'Group' })).toBeVisible()
  })

  test('AC-110 (J5): on a phone, a direct /tasks/:id opens the full record page (OD-63)', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    const taskId = TASKS.VIEWER_ACCOUNTABLE.id
    const title = TASKS.VIEWER_ACCOUNTABLE.title

    await page.goto(`work/tasks/${taskId}`)
    await page.waitForURL(new RegExp(`/work/tasks/${taskId}$`))

    // OD-63: a direct open renders the record as a standalone full page on mobile too
    // (not the in-list modal — that is reserved for an in-list card tap).
    await expect(page.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('dialog', { name: /task detail/i })).toHaveCount(0)

    // Navigate to the list → the mobile card list is the phone form.
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)
    await expect(page.locator('[data-testid="task-card"]').first()).toBeVisible({ timeout: 10_000 })
  })
})

test('AC-109 (J6): keyboard — j j Enter opens the 2nd row; Esc closes; n opens create', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await page.getByRole('button', { name: 'Team work', exact: true }).click()

  // The seed has one task; create a second so j j has somewhere to land.
  await createTaskViaUI(page, `J6 Second ${Date.now()}`)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await page.getByRole('button', { name: 'Team work', exact: true }).click()

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
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}(\?.*)?$/)
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: cursorTitle })).toBeVisible({ timeout: 10_000 })

  // Esc closes the drawer → back to /tasks.
  await page.keyboard.press('Escape')
  await page.waitForURL(/\/work\/tasks(\?.*)?$/)

  // n opens the create drawer.
  await page.getByRole('heading', { name: 'Tasks' }).click()
  await page.keyboard.press('n')
  await page.waitForURL(/\/work\/tasks\/new(\?.*)?$/)
  await expect(page.getByRole('complementary', { name: /create task/i })).toBeVisible()
})
