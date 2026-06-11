// AC-090: Create → list → detail → status change
// Natural journey: a member creates a task, it appears in the list, opens its detail,
// changes status to "In Progress", and the change persists in both list and detail.
// Requires the live stack (supabase start) and seeded users from global-setup.ts.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

test('AC-090: create a task → it appears in the list → open detail → change status → persists', async ({ page }) => {
  // ── 1. Login as VIEWER ──────────────────────────────────────────────────────
  await loginAs(page, VIEWER.email, VIEWER.password)

  // ── 2. Navigate to the Tasks list ──────────────────────────────────────────
  await page.goto('tasks')
  await page.waitForURL(/\/tasks$/)

  // Switch to "All" to see all tasks (not just mine — in case BU filter differs)
  const allTab = page.getByRole('tab', { name: 'All' })
  await allTab.click()

  // ── 3. Create a new task ────────────────────────────────────────────────────
  const taskTitle = `AC-090 Task ${Date.now()}`
  const detailUrl = await createTaskViaUI(page, taskTitle)
  expect(detailUrl).toMatch(/\/tasks\/[0-9a-f-]{36}$/)

  // ── 4. Go back to the list and assert the task appears ──────────────────────
  await page.goto('tasks')
  await page.waitForURL(/\/tasks$/)

  // Switch to "All" again to see the newly created task
  await page.getByRole('tab', { name: 'All' }).click()
  await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 })

  // ── 5. Open the task detail ─────────────────────────────────────────────────
  await page.getByText(taskTitle).click()
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: taskTitle })).toBeVisible()

  // ── 6. Change status to "In Progress" inline ─────────────────────────────────
  const statusTrigger = page.getByRole('button', { name: /change status/i })
  await expect(statusTrigger).toBeVisible()
  await statusTrigger.click()

  const inProgressOption = page.getByRole('option', { name: 'In Progress' })
  await expect(inProgressOption).toBeVisible()
  await inProgressOption.click()

  // ── 7. Assert: pill shows "In Progress" in place (no navigation) ─────────────
  await expect(page.getByText('In Progress')).toBeVisible({ timeout: 8_000 })
  // Still on the same detail URL
  expect(page.url()).toMatch(/\/tasks\/[0-9a-f-]{36}$/)

  // ── 8. Assert: activity log shows the status_changed event ─────────────────
  const activityRegion = page.getByRole('region', { name: /activity/i })
  await expect(activityRegion.getByText(/status changed/i)).toBeVisible({ timeout: 8_000 })

  // ── 9. Assert: returning to the list shows "In Progress" on the row ─────────
  await page.goto('tasks')
  await page.waitForURL(/\/tasks$/)
  await page.getByRole('tab', { name: 'All' }).click()
  const taskRow = page.locator('tr', { hasText: taskTitle }).or(
    page.locator('[data-testid="task-card"]', { hasText: taskTitle }),
  )
  await expect(taskRow.getByText('In Progress')).toBeVisible({ timeout: 10_000 })
})
