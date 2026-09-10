// AC-090: Create → list → detail → status change
// Natural journey: a member creates a task, it appears in the list, opens its detail,
// changes status to "In Progress", and the change persists in both list and detail.
// Requires the live stack (supabase start) and seeded users from global-setup.ts.

import { test, expect } from './fixtures/task-browser'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

test('AC-090: create a task → it appears in the list → open detail → change status → persists', async ({ page }) => {
  // ── 1. Login as VIEWER ──────────────────────────────────────────────────────
  await loginAs(page, VIEWER.email, VIEWER.password)

  // ── 2. Navigate to the Tasks list ──────────────────────────────────────────
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)

  const allView = page.getByRole('tab', { name: 'All', exact: true })
  await allView.click()

  // ── 3. Create a new task ────────────────────────────────────────────────────
  const taskTitle = `AC-090 Task ${Date.now()}`
  // GAP-6 / OD-REDESIGN-91 #11: the helper waits for the originating collection landing
  // and its highlighted row before returning the canonical detail URL.
  const detailUrl = await createTaskViaUI(page, taskTitle)
  expect(detailUrl).toMatch(/\/work\/tasks\/[0-9a-f-]{36}$/)

  // ── 4. Go back to the list and assert the task appears ──────────────────────
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)

  // Switch to "All" again to see the newly created task
  await allView.click()
  await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 })

  // ── 5. Open the task detail (drawer beside the table, ADR-0007) ─────────────
  await page.getByText(taskTitle).first().click()
  // DO-18 / tasks-workspace.tsx:214-217: in-app opens use the collection ?record= overlay.
  await page.waitForURL(/\/work\/tasks\?.*record=[0-9a-f-]{36}$/)
  // The split-view drawer hosts the task surface; the title is the drawer heading.
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: taskTitle })).toBeVisible()

  // ── 6. Change status to "In Progress" inline ─────────────────────────────────
  // Activate the value-first field, then choose the status from its accessible picker.
  const statusEditBtn = drawer.getByRole('button', { name: /edit status/i })
  await expect(statusEditBtn).toBeVisible()
  await statusEditBtn.click()
  await drawer.getByRole('combobox', { name: 'Status', exact: true }).click()
  await page.getByRole('option', { name: 'In Progress', exact: true }).click()

  // ── 7. Assert: pill shows "In Progress" in place (no navigation) ─────────────
  await expect(drawer.getByRole('button', { name: /edit status/i })).toContainText('In Progress', { timeout: 8_000 })
  // Still on the same detail URL
  expect(page.url()).toMatch(/\/work\/tasks\?.*record=[0-9a-f-]{36}$/)

  // ── 8. Assert: the Activity section shows the status_changed event ─────────
  // The approved record anatomy keeps Activity as a tab; the event is still persisted evidence.
  await drawer.getByRole('tab', { name: /^Activity/ }).click()
  const activityPane = drawer.getByRole('region', { name: 'Activity' })
  await expect(activityPane.getByText(/status changed|→ In Progress|In Progress/i).first()).toBeVisible({ timeout: 8_000 })

  // ── 9. Assert: returning to the list shows "In Progress" on the row ─────────
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)
  await allView.click()
  const taskRow = page.locator('tr', { hasText: taskTitle }).or(
    page.locator('[data-testid="task-card"]', { hasText: taskTitle }),
  )
  await expect(taskRow.getByText('In Progress')).toBeVisible({ timeout: 10_000 })
})
