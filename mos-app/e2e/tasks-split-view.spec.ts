// PR-D e2e journeys 1–3 (split-view redesign, ADR-0007):
//   J1 (AC-101): open a task in the drawer + act inline; the table stays live.
//   J2 (AC-104): expand toggle = same URL, full width, persists per-user-global.
//   J3 (AC-108): create-in-drawer → /tasks/:newId → the new row appears in the table.
// Requires the live stack (supabase up on 44321) + the global-setup seed.
// Runs at the default desktop viewport (≥1100px → live non-modal split).

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

test.beforeEach(async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('tasks')
  await page.waitForURL(/\/tasks$/)
  await page.getByRole('tab', { name: 'All' }).click()
})

test('AC-101 (J1): open a task in the drawer → table stays mounted → change status inline → row reflects it', async ({ page }) => {
  // Create our own task so the journey doesn't depend on shared seed state that
  // earlier specs (e.g. tasks-archive) may have mutated.
  const rowText = `J1 Triage ${Date.now()}`
  await createTaskViaUI(page, rowText)
  await page.goto('tasks')
  await page.waitForURL(/\/tasks$/)
  await page.getByRole('tab', { name: 'All' }).click()

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

  // Change status inline in the pinned header — no navigation.
  await drawer.getByRole('button', { name: /change status/i }).click()
  const listbox = page.getByRole('listbox', { name: /select status/i })
  await listbox.getByRole('option', { name: 'Blocked' }).click()

  // The drawer pill AND the table row both reflect Blocked, still on /tasks/:id.
  await expect(drawer.getByText('Blocked')).toBeVisible({ timeout: 8_000 })
  await expect(openRow.getByText('Blocked')).toBeVisible({ timeout: 8_000 })
  expect(page.url()).toMatch(/\/tasks\/[0-9a-f-]{36}$/)
})

test('AC-104 (J2): expand toggle keeps the URL, goes full width, and persists', async ({ page }) => {
  const rowText = `J2 Expand ${Date.now()}`
  await createTaskViaUI(page, rowText)
  const url = page.url()

  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await drawer.getByRole('button', { name: /expand to full width/i }).click()

  // Same URL (no history push) + the surface is now expanded full width.
  expect(page.url()).toBe(url)
  await expect(page.locator('.dw-surface-expanded')).toBeVisible()
  await expect(page.locator('.split.expanded')).toBeVisible()

  // Persisted per-user-global: reload → still expanded.
  await page.reload()
  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/)
  await expect(page.locator('.dw-surface-expanded')).toBeVisible({ timeout: 10_000 })

  // Collapse again so the preference doesn't leak into later specs.
  await page.getByRole('button', { name: /collapse to split/i }).click()
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
