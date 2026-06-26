// AC-020 (spec cascade-catalog) — the curated cross-stack catalog journey.
// JTBD: an admin keeps the Objective catalog correct — adds a new objective, renames it,
// then retires (archives) it — and the retired objective disappears from the task-form
// Objective picker while staying resolvable on tasks already linked to it.
//
// Encodes the user's real journey end-to-end and asserts the goal (the catalog is editable
// and archiving removes it from new-task attribution). The app conforms to this test.

import { test, expect } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { loginAs } from './helpers/login'

const NAME = 'E2E Catalog Objective'
const RENAMED = 'E2E Renamed Objective'

test('AC-020: admin adds → renames → archives an objective; archived leaves the task picker', async ({ page }) => {
  await loginAs(page, ADMIN.email, ADMIN.password)

  // ── Open the admin-only Objectives catalog ─────────────────────────────────
  await page.goto('objectives')
  await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()

  // ── Add ────────────────────────────────────────────────────────────────────
  await page.getByRole('textbox', { name: 'Name' }).fill(NAME)
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('button', { name: `Rename ${NAME}` })).toBeVisible()

  // ── Rename ───────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: `Rename ${NAME}` }).click()
  const editField = page.getByRole('textbox', { name: `Rename ${NAME}` })
  await editField.fill(RENAMED)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: `Rename ${RENAMED}` })).toBeVisible()

  // ── Archive → moves to the Archived section with an Unarchive control ────────
  await page.getByRole('button', { name: `Archive ${RENAMED}` }).click()
  await expect(page.getByRole('button', { name: `Unarchive ${RENAMED}` })).toBeVisible()
  // and it is no longer an active (renamable) row
  await expect(page.getByRole('button', { name: `Rename ${RENAMED}` })).toHaveCount(0)

  // ── Goal: the archived objective is gone from the task-form Objective picker ─
  await page.goto('tasks/new')
  const objectivePicker = page.getByRole('combobox', { name: 'Objective' })
  await expect(objectivePicker).toBeVisible()
  await expect(objectivePicker.getByRole('option', { name: RENAMED })).toHaveCount(0)
})
