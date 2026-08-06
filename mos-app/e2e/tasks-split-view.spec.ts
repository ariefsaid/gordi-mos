// PR-D e2e journeys 1–3 (split-view redesign, ADR-0007):
//   J1 (AC-101): open a task in the drawer + act inline; the table stays live.
//   J2 (AC-104): "Open full page" escalates (same URL) to the standalone record page — expand-
//        in-place was retired by GAP-2 (OD-REDESIGN-91 #7); see the test for the rewrite rationale.
//   J3 (AC-108): create-in-drawer → /tasks/:newId → the new row appears in the table.
// Requires the live stack (supabase up on 44321) + the global-setup seed.
// Runs at the default desktop viewport (≥1100px → live non-modal split).

import { test, expect, type Page } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

// STALE fix: the Tasks toolbar has TWO controls — a role="group" "Tasks saved views" chip strip
// (All / My work / Overdue / AR Follow-ups, plain <button>s) and a SEPARATE role="tablist" "View"
// holding the Table/Card presentation switch (collection-toolbar.tsx, tasks-toolbar.tsx,
// view-tabs.tsx). "All" is a saved-view chip, never a tab. Source-confirmed: collection-toolbar.tsx
// renders `<div role="group" aria-label={views.label}><button aria-pressed=…>{option.label}</button>`
// and `views.label` = t('tasks.savedViews') = "Tasks saved views" (tasks-toolbar.tsx / messages.ts).
async function selectAllSavedView(page: Page) {
  await page.getByRole('group', { name: 'Tasks saved views' }).getByRole('button', { name: 'All' }).click()
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
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/)

  // The drawer renders beside a STILL-mounted table (the load-bearing split-view win).
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: rowText })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible() // table still there
  // The open row is marked current.
  const openRow = page.locator('tr.task-row[aria-current="true"]')
  await expect(openRow).toContainText(rowText)

  // STALE fix: there is no "change status" button + listbox/option popover any more. The record
  // moved to the value-first RecordField grammar (record-field.tsx): a Status field is a pill
  // that activates a native <select> on click — aria-label "Edit ${label}" (record.field.edit,
  // messages.ts) → "Edit Status" — and picking an option auto-commits (OPTION_CONTROLS commit
  // eagerly on change, no separate confirm). Change status inline — no navigation.
  await drawer.getByRole('button', { name: /edit status/i }).click()
  await drawer.getByLabel('Status').selectOption({ label: 'Blocked' })

  // The drawer pill AND the table row both reflect Blocked, still on /tasks/:id.
  await expect(drawer.getByText('Blocked')).toBeVisible({ timeout: 8_000 })
  await expect(openRow.getByText('Blocked')).toBeVisible({ timeout: 8_000 })
  expect(page.url()).toMatch(/\/tasks\/[0-9a-f-]{36}$/)
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
  const url = page.url()

  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await drawer.getByRole('button', { name: /open full page/i }).click()

  // Same URL string (pathname+search unchanged; only router state differs) — but the split shell
  // is gone: no table, no drawer, just the standalone page with the record title as its h1.
  expect(page.url()).toBe(url)
  await expect(page.getByRole('heading', { level: 1, name: rowText })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('complementary', { name: /task detail/i })).not.toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).not.toBeVisible()

  // A reload is itself a hard/direct load onto /tasks/:id, so OD-63 / Rule 4 keeps it on the
  // standalone page independent of any "preference" (there isn't one — this is boot-navigation
  // detection, not persisted state; see task-page-mode.ts).
  await page.reload()
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1, name: rowText })).toBeVisible({ timeout: 10_000 })

  // "Back to split view" is a PUSH nav with state:{taskSurface:'panel'} — returns to the drawer so
  // later specs land in the state they expect.
  await page.getByRole('button', { name: /back to split view/i }).click()
  await expect(page.getByRole('complementary', { name: /task detail/i })).toBeVisible({ timeout: 10_000 })
})

test('AC-108 (J3): create-in-drawer → /tasks/:newId → the new row appears in the table', async ({ page }) => {
  const title = `J3 Created ${Date.now()}`
  await page.getByRole('link', { name: /new task/i }).first().click()
  await page.waitForURL(/\/tasks\/new$/)

  // The create drawer renders beside the table (no second editor).
  const form = page.getByRole('form', { name: /create task form/i })
  await form.getByLabel('Title').fill(title)
  await form.getByLabel('Business unit').waitFor({ state: 'visible' })
  await form.getByRole('button', { name: /create task/i }).click()

  // Transitions in place to the new task's view-mode drawer on /tasks/:newId.
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/, { timeout: 15_000 })
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })

  // The new row is in the table beside it + marked current — no reload.
  const openRow = page.locator('tr.task-row[aria-current="true"]')
  await expect(openRow).toContainText(title)
})
