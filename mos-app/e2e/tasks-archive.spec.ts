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
  await page.goto(`tasks/${taskId}`)
  await page.waitForURL(new RegExp(`/tasks/${taskId}$`))
  // The split-view drawer hosts the task surface (ADR-0007); title is its heading.
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: taskTitle })).toBeVisible({ timeout: 10_000 })

  // ── 3. Archive the task from the drawer ─────────────────────────────────────
  const archiveBtn = drawer.getByRole('button', { name: /archive task/i })
  await expect(archiveBtn).toBeVisible()
  await archiveBtn.click()

  // Confirm dialog
  const confirmBtn = page.getByRole('button', { name: /^archive$/i })
  await expect(confirmBtn).toBeVisible()
  await confirmBtn.click()

  // After archiving, should navigate back to the tasks list
  await page.waitForURL(/\/tasks$/, { timeout: 10_000 })

  // ── 4. Assert: task is NOT in the default list ──────────────────────────────
  // Switch to "All" to broaden the scope — but archived tasks should still be hidden
  await page.getByRole('tab', { name: 'All' }).click()
  // Wait a moment for the list to load
  await page.waitForTimeout(1_000)
  await expect(page.getByText(taskTitle)).not.toBeVisible()

  // ── 5. Toggle "Show archived" — task reappears ──────────────────────────────
  const archivedToggle = page.getByLabel(/show archived/i)
  await archivedToggle.check()

  // The archived task should now be visible
  await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 })

  // ── 6. Assert: row still exists (no hard delete) ────────────────────────────
  // Click through to the detail — still accessible, just archived
  const taskRow = page.locator('tr', { hasText: taskTitle }).or(
    page.locator('[data-testid="task-card"]', { hasText: taskTitle }),
  )
  await taskRow.click()
  await page.waitForURL(new RegExp(`/tasks/${taskId}$`))
  // Detail shows archived banner
  await expect(page.getByText(/this task is archived/i)).toBeVisible()
  // Unarchive button is visible (VIEWER is A)
  await expect(page.getByRole('button', { name: /unarchive/i })).toBeVisible()
})
