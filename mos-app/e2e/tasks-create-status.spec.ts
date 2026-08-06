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
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)

  // Switch to "All" to see all tasks (not just mine — in case BU filter differs). STALE fix:
  // "All" is a saved-view chip in a role="group" "Tasks saved views" strip (collection-toolbar.tsx),
  // never a tab — see tasks-split-view.spec.ts for the full source citation.
  const allViewGroup = page.getByRole('group', { name: 'Tasks saved views' })
  await allViewGroup.getByRole('button', { name: 'All' }).click()

  // ── 3. Create a new task ────────────────────────────────────────────────────
  const taskTitle = `AC-090 Task ${Date.now()}`
  const detailUrl = await createTaskViaUI(page, taskTitle)
  expect(detailUrl).toMatch(/\/tasks\/[0-9a-f-]{36}$/)

  // ── 4. Go back to the list and assert the task appears ──────────────────────
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)

  // Switch to "All" again to see the newly created task
  await allViewGroup.getByRole('button', { name: 'All' }).click()
  await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 })

  // ── 5. Open the task detail (drawer beside the table, ADR-0007) ─────────────
  await page.getByText(taskTitle).first().click()
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/)
  // The split-view drawer hosts the task surface; the title is the drawer heading.
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: taskTitle })).toBeVisible()

  // ── 6. Change status to "In Progress" inline ─────────────────────────────────
  // STALE fix: there is no "change status" trigger button + custom listbox/option popover any
  // more. Status is a value-first RecordField (record-field.tsx): the pill activates a native
  // <select> on click (aria-label "Edit ${label}" → "Edit Status", record.field.edit in
  // messages.ts), and OPTION_CONTROLS (select/status/person/team/relation) commit eagerly on
  // change — picking an option IS the commit, no separate confirm step.
  const statusEditBtn = drawer.getByRole('button', { name: /edit status/i })
  await expect(statusEditBtn).toBeVisible()
  await statusEditBtn.click()
  await drawer.getByLabel('Status').selectOption({ label: 'In Progress' })

  // ── 7. Assert: pill shows "In Progress" in place (no navigation) ─────────────
  await expect(drawer.getByText('In Progress')).toBeVisible({ timeout: 8_000 })
  // Still on the same detail URL
  expect(page.url()).toMatch(/\/tasks\/[0-9a-f-]{36}$/)

  // ── 8. Assert: the Activity section shows the status_changed event ─────────
  // STALE fix: RecordViewer moved to content-first anatomy (OD-REDESIGN-90 §2.2) — the record
  // reads as ONE stacked document (content → ownership → relations → checklist → activity); there
  // is no role="tab"/"tabpanel" anywhere in src/components/records or src/components/tasks any
  // more. Activity is a plain content-slot <section aria-label="Activity"> (record-viewer.tsx),
  // always mounted — no click needed to reveal it.
  const activityPane = drawer.getByRole('region', { name: 'Activity' })
  await expect(activityPane.getByText(/status changed|→ In Progress|In Progress/i).first()).toBeVisible({ timeout: 8_000 })

  // ── 9. Assert: returning to the list shows "In Progress" on the row ─────────
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)
  await allViewGroup.getByRole('button', { name: 'All' }).click()
  const taskRow = page.locator('tr', { hasText: taskTitle }).or(
    page.locator('[data-testid="task-card"]', { hasText: taskTitle }),
  )
  await expect(taskRow.getByText('In Progress')).toBeVisible({ timeout: 10_000 })
})
