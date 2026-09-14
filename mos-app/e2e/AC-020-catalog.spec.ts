// AC-020 (spec cascade-catalog) — the curated cross-stack catalog journey.
// JTBD: an admin keeps the Objective catalog correct — adds a new objective, renames it,
// then retires (archives) it — and the retired objective disappears from the task-form
// Objective picker while staying resolvable on tasks already linked to it.
//
// Encodes the user's real journey end-to-end and asserts the goal (the catalog is editable
// and archiving removes it from new-task attribution). The app conforms to this test.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { ADMIN } from './fixtures/users'
import { assertFixtureSqlSafe, objectiveCleanupSql, taskCleanupSql } from './fixtures/cleanup'
import { loginAs } from './helpers/login'
import { isShipGated } from './helpers/ship-gate'

// issue 444 — this journey's surface is ship-gated (outside the MVP payload), so every entry point
// forwards home and there is no door to walk through. Skipped on the gate itself, not deleted: the
// journey is still true of the built surface and comes back the moment /work/objectives leaves
// SHIP_GATED_PATHS.
test.skip(isShipGated('/work/objectives'), 'ship-gated surface (issue 444) — no route, no nav')

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const entries: Array<[string, string]> = []
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const separator = trimmed.indexOf('=')
      if (separator <= 0) throw new Error(`invalid entry in ${filePath}`)
      entries.push([trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim()])
    }
    return Object.fromEntries(entries)
  } catch (error) {
    throw new Error(`[AC-020] could not read ${filePath}`, { cause: error })
  }
}
const env = loadEnvFile(resolve(process.cwd(), '.env.e2e'))
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const SUPABASE_URL = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
async function execSql(query: string) {
  if (!SERVICE_KEY) throw new Error('[AC-020] SUPABASE_SERVICE_ROLE_KEY not set')
  assertFixtureSqlSafe(query)
  const response = await fetch(`${SUPABASE_URL}/pg/query`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY }, body: JSON.stringify({ query }) })
  if (!response.ok) throw new Error(`[AC-020] SQL exec failed: ${response.status}`)
}
const ORG = '10000000-0000-0000-0000-000000000001'

const NAME = 'E2E Catalog Objective'
const RENAMED = 'E2E Renamed Objective'
const PICKER_TASK_ID = '4e020000-0000-0000-0000-000000000001'
let createdObjectiveId: string | undefined
let pickerTaskCreated = false

test('AC-020: admin adds → renames → archives an objective; archived leaves the task picker', async ({ page }, testInfo) => {
  await loginAs(page, ADMIN.email, ADMIN.password)

  // All members can read; this administrator can manage the catalog.
  await page.goto('work/objectives')
  await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()

  // WORK-04: creation starts a focused inline draft inside the collection.
  await page.getByRole('button', { name: 'Create objective' }).click()
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused()
  await page.getByRole('textbox', { name: 'Name' }).fill(NAME)
  await page.getByRole('textbox', { name: 'Name' }).press('Enter')
  const objective = page.getByRole('link', { name: NAME, exact: true })
  await expect(objective).toBeVisible()
  const objectiveHref = await objective.getAttribute('href')
  expect(objectiveHref).toMatch(/\/work\/objectives\/[0-9a-f-]{36}$/)
  const objectiveId = objectiveHref!.match(/[0-9a-f-]{36}$/)![0]
  createdObjectiveId = objectiveId
  await execSql(`INSERT INTO mos.tasks
    (id, org_id, title, business_unit_id, status, responsible_person_id, accountable_person_id, created_by, objective_id)
    VALUES ('${PICKER_TASK_ID}', '${ORG}', 'E2E Catalog linked task',
      (SELECT id FROM shared.business_units WHERE org_id='${ORG}' AND code='retail_ops'),
      'Open', '${ADMIN.personId}', '${ADMIN.personId}', '${ADMIN.personId}', '${objectiveId}')`)
  pickerTaskCreated = true
  await objective.click()

  // ── Rename ───────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: 'Edit Name', exact: true }).click()
  const editField = page.getByRole('textbox', { name: 'Name', exact: true })
  await editField.fill(RENAMED)
  await editField.press('Enter')
  await expect(page.getByRole('button', { name: 'Edit Name', exact: true })).toContainText(RENAMED)

  // ── Archive → moves to the Archived section with an Unarchive control ────────
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Archive', exact: true }).click()
  await page.goto('work/objectives')
  await expect(page.getByRole('link', { name: RENAMED, exact: true })).toHaveCount(0)
  await page.goto('work/objectives?view=archived')
  await page.getByRole('link', { name: RENAMED, exact: true }).click()
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: 'Unarchive', exact: true })).toBeVisible()

  // ── Goal: the archived objective is gone from the task-form Objective picker ─
  await page.goto(`work/tasks/${PICKER_TASK_ID}`)
  await expect(page.getByRole('link', { name: RENAMED, exact: true }).first()).toHaveAttribute('href', new RegExp(`/work/objectives/${objectiveId}$`))
  await page.screenshot({ path: testInfo.outputPath('admin-en-1440-archived-objective-link.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('link', { name: RENAMED, exact: true }).first().scrollIntoViewIfNeeded()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('admin-en-390-archived-objective-link.png') })
  await page.getByRole('button', { name: 'Edit Objective', exact: true }).click()
  const objectivePicker = page.getByRole('combobox', { name: 'Objective', exact: true })
  await expect(objectivePicker).toBeVisible()
  await objectivePicker.click()
  const objectiveListbox = page.getByRole('listbox', { name: 'Objective', exact: true })
  await expect(objectiveListbox.getByRole('option', { name: 'Q3 Growth', exact: true })).toBeVisible()
  await expect(objectiveListbox.getByRole('option', { name: RENAMED, exact: true })).toHaveCount(0)
})

test.afterAll(async () => {
  if (pickerTaskCreated) await execSql(taskCleanupSql([PICKER_TASK_ID], ORG))
  if (createdObjectiveId) await execSql(objectiveCleanupSql([createdObjectiveId], ORG))
})
