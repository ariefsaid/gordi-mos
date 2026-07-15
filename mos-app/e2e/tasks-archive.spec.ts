// AC-091: Archive a task → leaves the default list; findable via "Show archived"
// Natural journey: VIEWER (who is A on the seeded task) archives it from detail,
// confirms it disappears from the default list, then re-finds it via the archived toggle.
// No row is destroyed (the task remains readable under archived filter).
// Requires the live stack (supabase start) and the seed from global-setup.ts.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

test('AC-091: archive task from detail → leaves default list → reappears under archived filter', async ({ page }) => {
  // ── 1. Login as VIEWER ──────────────────────────────────────────────────────
  await loginAs(page, VIEWER.email, VIEWER.password)

  // ── 2. Navigate directly to the seeded task's detail ───────────────────────
  const taskId = TASKS.VIEWER_ACCOUNTABLE.id
  const taskTitle = TASKS.VIEWER_ACCOUNTABLE.title
  await page.goto(`work/tasks/${taskId}`)
  await page.waitForURL(new RegExp(`/work/tasks/${taskId}(\\?.*)?$`))
  // OD-63: a direct open renders the record as a standalone full canonical page
  // (the one TaskSurface renderer); its title is the page <h1>.
  await expect(page.getByRole('heading', { name: taskTitle })).toBeVisible({ timeout: 10_000 })

  // ── 3. Archive the task from the record page ──────────────────────────────
  const archiveBtn = page.getByRole('button', { name: /archive task/i })
  await expect(archiveBtn).toBeVisible()
  await archiveBtn.click()

  // Confirm dialog
  const confirmBtn = page.getByRole('button', { name: /^archive$/i })
  await expect(confirmBtn).toBeVisible()
  await confirmBtn.click()

  // After archiving, should navigate back to the tasks list
  await page.waitForURL(/\/work\/tasks$/, { timeout: 10_000 })

  // ── 4. Assert: task is NOT in the default list ──────────────────────────────
  // Switch to "All" to broaden the scope — but archived tasks should still be hidden
  await page.getByRole('button', { name: 'Team work', exact: true }).click()
  // Assert on the row (the visible oracle): the archived task's title span is CSS-clipped
  // in the dense column, so getByText on the span is unreliable.
  const taskRow = page.locator('tr', { hasText: taskTitle }).or(
    page.locator('[data-testid="task-card"]', { hasText: taskTitle }),
  )
  await expect(taskRow).toHaveCount(0)

  // ── 5. Toggle "Show archived" — task reappears ──────────────────────────────
  const archivedToggle = page.getByLabel(/show archived/i)
  await archivedToggle.check()

  // The archived task's row is now visible in the list.
  await expect(taskRow.first()).toBeVisible({ timeout: 10_000 })

  // ── 6. Assert: row still exists (no hard delete) ────────────────────────────
  // Click through to the detail — still accessible, just archived
  await taskRow.first().click()
  await page.waitForURL(new RegExp(`/work/tasks/${taskId}(\\?.*)?$`))
  // Detail shows archived banner
  await expect(page.getByText(/this task is archived/i)).toBeVisible()
  // Unarchive button is visible (VIEWER is A)
  await expect(page.getByRole('button', { name: /unarchive/i })).toBeVisible()
})
