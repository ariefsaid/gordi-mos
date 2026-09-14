// AC-091: Archive a task → leaves the default list; findable via "Include archived"
// Natural journey: the PIC's manager archives a dedicated fixture from detail,
// confirms it disappears from the default list, then re-finds it via the archived toggle.
// No row is destroyed (the task remains readable under archived filter).
// Requires the live stack (supabase start) and the seed from global-setup.ts.
//
// STALE fix, step 2: `page.goto` straight onto /tasks/:id is a hard/direct navigation. Per OD-63 /
// Rule 4 (src/components/tasks/task-page-mode.ts, its own unit-test file, tasks-layout.tsx) that
// now renders the STANDALONE canonical record page, not the split drawer — the split drawer is an
// in-app-navigation-only surface (table row / card Link both pass state:{taskSurface:'panel'}
// explicitly, task-row.tsx / mobile-grouped-cards.tsx). So step 2/3 act on the page directly (no
// drawer wrapper exists there); step 6 re-opens via an in-app row click, which DOES land in the
// drawer, so that part of the original journey still holds.

import { test, expect } from './fixtures/task-browser'
import { loginAs } from './helpers/login'
import { MANAGER, VIEWER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

test('OD-WAY-94: the PIC may complete but cannot archive, even when also Supervisor', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto(`work/tasks/${TASKS.VIEWER_ACCOUNTABLE.id}`)
  const record = page.getByRole('region', { name: TASKS.VIEWER_ACCOUNTABLE.title, exact: true })
  await expect(record.getByRole('button', { name: 'Mark complete', exact: true })).toBeVisible()
  await expect(record.getByRole('button', { name: 'More actions', exact: true })).toHaveCount(0)
  await expect(record.getByRole('menuitem', { name: /archive task/i })).toHaveCount(0)
})

test('AC-091: archive task from detail → leaves default list → reappears under archived filter', async ({ page }) => {
  // OD-WAY-94: the PIC cannot archive, even when also named Supervisor.
  await loginAs(page, MANAGER.email, MANAGER.password)

  // ── 2. Navigate directly to the seeded task's detail (a hard load → standalone page, OD-63) ──
  const taskId = TASKS.VIEWER_ACCOUNTABLE.id
  const taskTitle = TASKS.VIEWER_ACCOUNTABLE.title
  await page.goto(`work/tasks/${taskId}`)
  await page.waitForURL(new RegExp(`/tasks/${taskId}$`))
  // The record heading IS the page's own h1 (identityHeadingLevel=1); there is no drawer to scope to.
  await expect(page.getByRole('heading', { level: 1, name: taskTitle })).toBeVisible({ timeout: 10_000 })

  // ── 3. Archive the task from the page ────────────────────────────────────────
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  const archiveBtn = page.getByRole('menuitem', { name: /archive task/i })
  await expect(archiveBtn).toBeVisible()
  await archiveBtn.click()

  // Confirm dialog
  const confirmBtn = page.getByRole('button', { name: /^archive$/i })
  await expect(confirmBtn).toBeVisible()
  await confirmBtn.click()

  // After archiving, should navigate back to the tasks list
  await page.waitForURL(/\/tasks$/, { timeout: 10_000 })

  // ── 4. Assert: task is NOT in the default list ──────────────────────────────
  // Broaden scope while retaining the default exclusion of archived tasks.
  await page.getByRole('tab', { name: 'All', exact: true }).click()
  // Wait a moment for the list to load
  await page.waitForTimeout(1_000)
  await expect(page.getByText(taskTitle)).not.toBeVisible()

  // ── 5. Include archived — task reappears ──────────────────────────────
  await page.getByRole('button', { name: /^Filters/ }).click()
  const archivedToggle = page.getByRole('checkbox', { name: 'Include archived', exact: true })
  await archivedToggle.check()

  // The archived task should now be visible
  await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Close filters', exact: true }).click()

  // ── 6. Assert: row still exists (no hard delete) ────────────────────────────
  // Click through to the detail — an IN-APP click stays in the split drawer (unlike step 2's hard
  // load), so the drawer/complementary scoping from the original journey is correct here.
  const taskRow = page.locator('tr', { hasText: taskTitle }).or(
    page.locator('[data-testid="task-card"]', { hasText: taskTitle }),
  )
  await taskRow.click()
  // DO-18 / tasks-workspace.tsx:214-217: the in-app row opener writes ?record=.
  await page.waitForURL(new RegExp('record=' + taskId))
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  // Detail shows archived banner
  await expect(drawer.getByText(/this task is archived/i)).toBeVisible()
  // The same authorized manager can restore the task from overflow.
  await drawer.getByRole('button', { name: 'More actions', exact: true }).click()
  await expect(drawer.getByRole('menuitem', { name: /unarchive/i })).toBeVisible()
  // OD-REDESIGN-84 disclosure + archive journey ruling: restore the fixture for later specs.
  await drawer.getByRole('menuitem', { name: /unarchive/i }).click()
  await expect(drawer.getByText(/this task is archived/i)).toHaveCount(0)
  await page.goto('work/tasks')
  await page.getByRole('tab', { name: 'All', exact: true }).click()
  await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 })
})
