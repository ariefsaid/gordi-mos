// PR-D e2e journeys 4–6 (split-view redesign, ADR-0007), REWRITTEN against a later ratified rule
// that changed what a URL deep-link does — OD-63 / Rule 4 (src/components/tasks/task-page-mode.ts,
// its own dedicated unit-test file, and comments in tasks-layout.tsx/task-surface.tsx): a HARD
// navigation onto /tasks/:id (page.goto, refresh, new tab) now renders the STANDALONE canonical
// record page — table and drawer both unmount — while an IN-APP click (table row / mobile card,
// both of which pass `state:{taskSurface:'panel'}` explicitly — task-row.tsx, mobile-grouped-
// cards.tsx) keeps the split drawer. This is a real, deliberate, owner-reviewed rule (task-page-
// mode.ts cites owner-verbatim feedback), not drift, so J4/J5 below assert the NEW deep-link
// contract instead of the old "table + drawer together" one:
//   J4 (AC-102): deep-link /tasks/:id → the standalone canonical record page (no table, no drawer).
//   J5 (AC-110 mobile): a deep link behaves the SAME on a phone (OD-63 doesn't branch on viewport);
//        the real full-screen MODAL only exists for an in-app open, so it's reached that way here.
//   J6 (AC-109): keyboard nav — j j Enter opens the 2nd row; Esc → /tasks; n → /tasks/new.
// Requires the live stack (supabase up on 44321) + the global-setup seed.

import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'
import { TASKS } from './fixtures/tasks'

// See tasks-split-view.spec.ts for the source citation on this locator (collection-toolbar.tsx
// role="group" "Tasks saved views" chip strip — "All" is a button in it, never a tab).
async function selectAllSavedView(page: Page) {
  await page.getByRole('group', { name: 'Tasks saved views' }).getByRole('button', { name: 'All' }).click()
}

test('AC-102 (J4): deep-link to /tasks/:id renders the standalone canonical record page (OD-63)', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  const taskId = TASKS.VIEWER_ACCOUNTABLE.id
  const title = TASKS.VIEWER_ACCOUNTABLE.title

  // Land directly on the deep link (e.g. from My Week / Daily Log) — a hard navigation.
  await page.goto(`work/tasks/${taskId}`)
  await page.waitForURL(new RegExp(`/tasks/${taskId}$`))

  // OD-63 / Rule 4: this is the standalone page, not the split drawer — the record heading IS the
  // page's own h1 (identityHeadingLevel=1, tasks-layout.tsx TaskRecordPage), there is no
  // complementary/dialog panel, and the table never mounts.
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('link', { name: /back to tasks/i })).toBeVisible()
  await expect(page.getByRole('complementary', { name: /task detail/i })).not.toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).not.toBeVisible()
})

test.describe('mobile', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('AC-110 (J5) part A: a deep link is the SAME standalone page on a phone (OD-63 is viewport-independent)', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    const taskId = TASKS.VIEWER_ACCOUNTABLE.id
    const title = TASKS.VIEWER_ACCOUNTABLE.title

    await page.goto(`work/tasks/${taskId}`)
    await page.waitForURL(new RegExp(`/tasks/${taskId}$`))

    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('dialog', { name: /task detail/i })).not.toBeVisible()
  })

  test('AC-110 (J5) part B: opening a task in-app on a phone renders a full-screen modal; Esc returns to the card list', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    const title = TASKS.VIEWER_ACCOUNTABLE.title

    // Reach the task the way a real phone user does — tap a card from the list — since the modal
    // is only reachable via an in-app open (mobile-grouped-cards.tsx sets state:{taskSurface:
    // 'panel'} explicitly); a raw page.goto onto the id lands on the standalone page (part A).
    await page.goto('work/tasks')
    await page.waitForURL(/\/tasks$/)
    const card = page.locator('[data-testid="task-card"]', { hasText: title }).first()
    await expect(card).toBeVisible({ timeout: 10_000 })
    await card.getByRole('link').click()
    await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/)

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
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)
  await selectAllSavedView(page)

  // The seed has one task; create a second so j j has somewhere to land.
  await createTaskViaUI(page, `J6 Second ${Date.now()}`)
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)
  await selectAllSavedView(page)

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

  // n opens the create drawer. STALE fix: create-mode's aria-label is t('tasks.create.new') =
  // "Create task" (task-drawer.tsx `label = mode === 'create' ? t('tasks.create.new') : …`),
  // not "New task" (that's the toolbar's link TEXT for opening it, a different string).
  await page.getByRole('heading', { name: 'Tasks' }).click()
  await page.keyboard.press('n')
  await page.waitForURL(/\/tasks\/new$/)
  await expect(page.getByRole('complementary', { name: /create task/i })).toBeVisible()
})
