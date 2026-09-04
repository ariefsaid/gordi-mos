// OD-63 e2e — canonical record URL: split drawer (in-list click) vs full page (direct open).
//   OD-63-1: a direct/new-tab/refresh of /work/tasks/:id opens the SAME record as a
//            standalone full canonical page — not inside the table+drawer shell.
//   OD-63-2: a normal in-list click opens the split drawer (table stays mounted).
//   OD-62:   Mark complete sets a task to Done; no RACI grammar on any Task surface.
// Requires the live stack (supabase up on 44321) + the global-setup seed.
// Runs at the default desktop viewport (1440px; ≥1370px → live non-modal split).

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

test.beforeEach(async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  // STALE→fixed: "Team work" was removed as a saved-view chip (record-collection plan §Task-11,
  // "until Issue 8 lands the real Task team_id contract" — src/components/tasks/tasks-workspace.tsx
  // VIEW_VALUES / tasks.saved.* in src/i18n/messages.ts). The saved-view chips are now
  // All / My work / Overdue / AR Follow-ups, and the org-visible set (what this beforeEach needs)
  // is reached via "All", which is also the default view.
  await page.getByRole('button', { name: 'All', exact: true }).click()
})

// EXPECTED RED until #373 lands — split view survives direct-open; the oracle is the fix's proof, never weaken it
test('OD-63-1: direct URL / new-tab / refresh opens the full canonical page (not the table shell)', async ({ page }) => {
  const title = `OD63 Direct ${Date.now()}`
  // createTaskViaUI ends on /work/tasks/:id via an in-app navigation (panel/drawer).
  const detailUrl = await createTaskViaUI(page, title)

  // A `page.goto` is a full document navigation — a direct/new-tab/refresh — so the
  // SAME record URL now renders as a standalone full canonical page. Preserve ?view=
  // (Rule 4) by opening it with ?view=overdue.
  const sep = detailUrl.includes('?') ? '&' : '?'
  await page.goto(`${detailUrl}${sep}view=overdue`)
  await page.waitForURL(/\/work\/tasks\/[0-9a-f-]{36}\?.*view=overdue/)

  // The record renders as a standalone full page — TaskRecordPage (tasks-layout.tsx), with NO
  // table shell and NO split drawer.
  // STALE→fixed: `.record-2col` does not exist anywhere in src/ (confirmed by full-repo search).
  // TaskRecordPage renders via PageFamilyFrame family="focused-record" + RecordPageChrome, not
  // that class — the sibling AC-104 spec (tasks-split-view.spec.ts) already found and dropped the
  // same stale geometry-class check in favor of role-based assertions, which is what this proves
  // below: exactly one record heading, no .split shell, no Tasks region, no drawer.
  await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.split')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Tasks' })).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: /task detail/i })).toHaveCount(0)
  // ?view= is preserved on the direct-open URL (Rule 4).
  expect(page.url()).toContain('view=overdue')
})

test('OD-63-2: an in-list click opens the split drawer (table stays mounted)', async ({ page }) => {
  const title = `OD63 Click ${Date.now()}`
  await createTaskViaUI(page, title)

  // Return to the list and open the row by a normal in-list click (in-app SPA nav).
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  // STALE→fixed: see the beforeEach comment above — "Team work" no longer exists.
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByText(title).first().click()
  // DO-18 / tasks-workspace.tsx:214-217: in-app row opens settle on the collection ?record= URL.
  await page.waitForURL(/\/work\/tasks\?.*record=[0-9a-f-]{36}$/)

  // The split drawer mounts beside a STILL-mounted table — the load-bearing split-view
  // win (OD-63 retains the drawer for fast triage) — and offers the page escalation.
  await expect(page.getByRole('complementary', { name: /task detail/i })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible()
  await expect(page.getByRole('button', { name: /open full page/i })).toBeVisible()
})

// EXPECTED RED until #373 lands — split view survives Mark-complete open; the oracle is the fix's proof, never weaken it
test('OD-63/OD-62: Mark complete sets a task to Done on the standalone page', async ({ page }) => {
  const title = `OD63 Complete ${Date.now()}`
  const detailUrl = await createTaskViaUI(page, title)
  // Direct-open → full page.
  await page.goto(detailUrl)
  await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'Mark complete' }).click()

  // STALE→fixed: there is no "change status" control anywhere in src/ — the status field's
  // value-mode trigger is the generic RecordField edit affordance, aria-label
  // t('record.field.edit', {label: 'Status'}) = "Edit Status" (src/components/records/
  // record-field.tsx), same control tasks-split-view.spec.ts already drives as "Edit Status".
  // The status reflects Done (the trigger's pill) and the completion action is gone.
  await expect(page.getByRole('button', { name: /edit status/i })).toContainText('Done', { timeout: 8_000 })
  await expect(page.getByRole('button', { name: 'Mark complete' })).toHaveCount(0)
})

test('OD-62: no RACI grammar is visible on any Task surface', async ({ page }) => {
  const title = `OD62 Surface ${Date.now()}`
  await createTaskViaUI(page, title)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByText(title).first().click()
  // GAP-6 / OD-REDESIGN-91 #11 then DO-18: reopen the landed row through the ?record= overlay.
  await page.waitForURL(/\/work\/tasks\?.*record=[0-9a-f-]{36}$/)

  // Split-drawer surface (panel mode).
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
  const raci = page.getByText(/RACI|Owner \(R\)|Responsible \(R\)|Accountable \(A\)|R·A·C·I/i)
  await expect(raci).toHaveCount(0)

  // Standalone full-page surface (direct open).
  await page.goto(page.url())
  await expect(page.getByRole('heading', { name: new RegExp(title) })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/RACI|Owner \(R\)|Responsible \(R\)|Accountable \(A\)|R·A·C·I/i)).toHaveCount(0)
})
