// PR-D e2e journeys 1–3 (split-view redesign, ADR-0007):
//   J1 (AC-101): open a task in the drawer + act inline; the table stays live.
//   J2 (AC-104): "Open full page" escalates (same URL) to the standalone record page — expand-
//        in-place was retired by GAP-2 (OD-REDESIGN-91 #7); see the test for the rewrite rationale.
//   J3 (AC-108): inline create → the saved row remains in the collection after reload.
// Requires the live stack (supabase up on 44321) + the global-setup seed.
// Runs at the default desktop viewport (1440px; ≥1362px → live non-modal split).

import { type Page } from '@playwright/test'
import { test, expect } from './fixtures/task-browser'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

// Choose the broad collection scope independently of the viewer's role default.
async function selectAllSavedView(page: Page) {
  await page.getByRole('tab', { name: 'All', exact: true }).click()
}

test.beforeEach(async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)
  await selectAllSavedView(page)
})

test('AC-101 (J1): open a task in the drawer → table stays mounted → change status inline → row reflects it', async ({ page }) => {
  // Create our own task so the journey doesn't depend on shared seed state that
  // earlier specs (e.g. tasks-archive) may have mutated.
  const rowText = `J1 Triage ${Date.now()}`
  await createTaskViaUI(page, rowText)
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)
  await selectAllSavedView(page)

  await expect(page.getByText(rowText).first()).toBeVisible({ timeout: 10_000 })
  await page.getByText(rowText).first().click()
  await page.waitForURL(/\/tasks\?.*record=[0-9a-f-]{36}$/)

  // The drawer renders beside a STILL-mounted table (the load-bearing split-view win).
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: rowText })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible() // table still there
  // The open row is marked current.
  // DO-18 / tasks-workspace row-selection contract: the opened row is selected while its
  // ?record= panel is active; aria-current is reserved for route navigation.
  const openRow = page.locator('tr.task-row[aria-selected="true"]')
  await expect(openRow).toContainText(rowText)

  // Change status through the field's accessible picker without navigating.
  await drawer.getByRole('button', { name: /edit status/i }).click()
  await drawer.getByRole('combobox', { name: 'Status', exact: true }).click()
  await page.getByRole('listbox', { name: 'Status', exact: true })
    .getByRole('option', { name: 'Blocked', exact: true }).click()

  // The drawer pill AND the table row both reflect Blocked, still on /tasks/:id.
  await expect(drawer.getByRole('button', { name: /edit status/i })).toContainText('Blocked', { timeout: 8_000 })
  // EXPECTED RED — AC-101 drawer/row desync is tracked by issue #372; keep this oracle intact.
  await expect(page.locator('tr.task-row', { hasText: rowText }).first().getByText('Blocked')).toBeVisible({ timeout: 8_000 })
  // DO-18: inline status editing does not navigate away from the ?record= panel entry.
  expect(page.url()).toMatch(/\/work\/tasks\?.*record=[0-9a-f-]{36}$/)
})

// STALE — rewritten. GAP-2 (OD-REDESIGN-91 #7), task-drawer.tsx docblock: "expand-in-place is
// RETIRED — 'Open full page' is the one escalation verb, so the drawer holds a fixed width and no
// expand toggle/preference." Confirmed by absence: no "expand to full width" button, no
// .record-2col, no .split.expanded anywhere in src/ — only a TasksWorkspace.css comment recording
// the retirement. The real (and only) escalation today is "Open full page", which navigates the
// SAME pathname+search with `state:{taskSurface:'page'}` (task-page-mode.ts) and swaps the split
// shell for the standalone canonical page (TaskRecordPage, tasks-layout.tsx) — table and drawer both
// unmount; the record heading becomes the page's own h1. The inverse is "Back to split view"
// (RecordPageChrome trailing control, tasks.backToSplit), a PUSH nav back to panel mode.
test('AC-104 (J2): "Open full page" escalates to the standalone record page; "Back to split view" returns', async ({ page }) => {
  const rowText = `J2 Expand ${Date.now()}`
  await createTaskViaUI(page, rowText)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await page.getByText(rowText).first().click()
  await page.waitForURL(/\/work\/tasks\?.*record=[0-9a-f-]{36}$/)

  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await drawer.getByRole('button', { name: /open full page/i }).click()

  // Open-full-page uses the ruled canonical pathname grammar (OD-63), replacing the panel
  // entry; the split shell is gone: no table, no drawer, just the standalone page h1.
  await expect(page).toHaveURL(/\/work\/tasks\/[0-9a-f-]{36}/, { timeout: 10_000 })
  await expect(page.getByRole('heading', { level: 1, name: rowText })).toBeVisible({ timeout: 10_000 })
  // EXPECTED RED — AC-104 split view surviving escalation is tracked by issue #373; keep this oracle intact.
  await expect(page.getByRole('complementary', { name: /task detail/i })).not.toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).not.toBeVisible()

  // A reload is itself a hard/direct load onto /tasks/:id, so OD-63 / Rule 4 keeps it on the
  // standalone page independent of any "preference" (there isn't one — this is boot-navigation
  // detection, not persisted state; see task-page-mode.ts).
  const canonicalUrl = page.url()
  await page.reload()
  await expect(page).toHaveURL(canonicalUrl)
  await expect(page.getByRole('heading', { level: 1, name: rowText })).toBeVisible({ timeout: 10_000 })

  // "Back to split view" is a PUSH nav with state:{taskSurface:'panel'} — returns to the drawer so
  // later specs land in the state they expect.
  await page.getByRole('button', { name: /back to split view/i }).click()
  await expect(page.getByRole('complementary', { name: /task detail/i })).toBeVisible({ timeout: 10_000 })
})

test('AC-108 (J3): inline create keeps the collection mounted and persists the new row', async ({ page }) => {
  const title = `J3 Created ${Date.now()}`
  const detailUrl = await createTaskViaUI(page, title)
  await expect(page.getByRole('region', { name: 'Tasks', exact: true })).toBeVisible()
  expect(new URL(page.url()).pathname).toMatch(/\/work\/tasks$/)
  await expect(page.getByRole('textbox', { name: 'Edit task title' })).toHaveCount(0)
  await expect(page.locator('tr.task-row', { hasText: title }).first()).toBeVisible({ timeout: 10_000 })
  await page.reload()
  await expect(page.locator('a[href*="/work/tasks/"]').filter({ hasText: title })).toHaveAttribute('href', new RegExp(detailUrl))
})
