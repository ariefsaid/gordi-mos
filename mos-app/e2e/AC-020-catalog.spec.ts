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
import { loginAs } from './helpers/login'

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
  const response = await fetch(`${SUPABASE_URL}/pg/query`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY }, body: JSON.stringify({ query }) })
  if (!response.ok) throw new Error(`[AC-020] SQL exec failed: ${response.status}`)
}
const ORG = '10000000-0000-0000-0000-000000000001'

const NAME = 'E2E Catalog Objective'
const RENAMED = 'E2E Renamed Objective'

test('AC-020: admin adds → renames → archives an objective; archived leaves the task picker', async ({ page }) => {
  await loginAs(page, ADMIN.email, ADMIN.password)

  // ── Open the admin-only Objectives catalog (Work manage-mode, relocated under /work/) ───
  await page.goto('work/objectives')
  await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()

  // ── Add ────────────────────────────────────────────────────────────────────
  // STALE: the create CTA's label is `catalog.objectives.add` = "Create objective"
  // (src/i18n/messages.ts:902), not the generic "Add" this spec asserted — confirmed live in
  // the /work/objectives button inventory (role-inventory.json, dewi persona). objectives-page.tsx
  // renders it via `{adding ? t('catalog.objectives.adding') : t('catalog.objectives.add')}`.
  await page.getByRole('textbox', { name: 'Name' }).fill(NAME)
  await page.getByRole('button', { name: 'Create objective' }).click()
  await expect(page.getByRole('button', { name: `Rename ${NAME}` })).toBeVisible()

  // ── Rename ───────────────────────────────────────────────────────────────────
  await page.getByRole('button', { name: `Rename ${NAME}` }).click()
  const editField = page.getByRole('textbox', { name: `Rename ${NAME}` })
  await editField.fill(RENAMED)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('button', { name: `Rename ${RENAMED}` })).toBeVisible()

  // ── Archive → moves to the Archived section with an Unarchive control ────────
  await page.getByRole('button', { name: `Archive ${RENAMED}` }).click()
  // objectives-page.test.tsx:238-249 / catalog.view.archived: Unarchive is exposed in
  // the Archived saved view, not on the active catalog row.
  await page.getByRole('button', { name: 'Archived', exact: true }).click()
  await expect(page.getByRole('button', { name: `Unarchive ${RENAMED}` })).toBeVisible()
  // and it is no longer an active (renamable) row
  await expect(page.getByRole('button', { name: `Rename ${RENAMED}` })).toHaveCount(0)

  // ── Goal: the archived objective is gone from the task-form Objective picker ─
  await page.goto('work/tasks/new')
  // F17 / OD-REDESIGN-91 #29: task-surface keeps Objective behind the context disclosure.
  await page.getByRole('button', { name: '+ Add context' }).click()
  const objectivePicker = page.getByLabel('Objective')
  await expect(objectivePicker).toBeVisible()
  await expect(objectivePicker.getByRole('option', { name: RENAMED })).toHaveCount(0)
})

test.afterAll(async () => {
  await execSql(`DELETE FROM mos.objectives WHERE org_id = '${ORG}' AND name IN ('${NAME}', '${RENAMED}')`)
})
