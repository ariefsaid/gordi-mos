// AC-720 [e2e — F2 "today's opening", curated standing journey] — the real cross-stack café
// retrofit flow (docs/specs/cafe-retrofit.spec.md §6.3 AC-720): an authorized café shift-lead opens
// the Café Module home (/cafe), activates "Start today's opening", and its single-holder Tasks
// appear in /work/tasks grouped under the "Café Opening · <today>" caption; the ambiguous barista
// step ("Brew station handover") surfaces as "N to assign" and, once resolved to a PIC, appears as
// a Task in the SAME group; the "Log today's production" Task deep-links to /cafe/log (the existing,
// unchanged capture screen) via its description. "Process Run" appears nowhere. F2 may not regress
// (master plan) — mirrors the AC-630-start-occurrence.spec.ts template (Step 6's same runtime).
//
// Uses supabase/seed.dev-cafe-opening.sql's "Café Opening" process (…e3000000…001): a daily cadence
// with three generated Task definitions —
//   d1 "Open the café floor" — pic_role_id = Cafe Ops Lead, held by exactly ONE dev person (Cahya)
//       → resolves to a single-holder checklist Task on spawn.
//   d2 "Log today's production" — same single-holder Role → its own separate Task; description
//       deep-links to /cafe/log.
//   d3 "Brew station handover" — pic_role_id = Café Opener (demo), held by TWO dev people
//       (Cahya + Krishna) → spawns a pending human-choice row instead of a Task (FR-705/OD-41).
// VIEWER (Cahya Cafe) is the café shift-lead fixture: e2e/global-setup.ts grants her the `ops_lead`
// access role (→ process.start) additively, and she is an active member of the radiant_operations
// branch Team (seed.dev-signals.sql) — the process.start + owning-Team authorized fixture RATIFY-7A
// requires (floor `member`s cannot start the opening in v1; Cahya's org Role is "Cafe Ops Lead", so
// granting her the access-role capability is the natural fixture, not a new persona).
//
// Requires the live stack (supabase start) + the global-setup seed. Runs at the default desktop
// viewport (the live push/squash split, ADR-0007).

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const vars: Record<string, string> = {}
    for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq !== -1) vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return vars
  } catch { return {} }
}

const e2eEnv = loadEnvFile(resolve(__dir, '../.env.e2e'))
const SUPABASE_URL = e2eEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
const SERVICE_KEY = e2eEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ORG = '10000000-0000-0000-0000-000000000001'
const WORK_LINE_ID = 'e3000000-0000-0000-0000-000000000001' // "Café Opening" (seed.dev-cafe-opening.sql)

async function sql(query: string): Promise<Array<Record<string, unknown>>> {
  if (!SERVICE_KEY) throw new Error('[AC-720] SUPABASE_SERVICE_ROLE_KEY not set')
  const res = await fetch(SUPABASE_URL + '/pg/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY }, body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error('[AC-720] SQL failed: ' + (await res.text()).slice(0, 500))
  return (await res.json()) as Array<Record<string, unknown>>
}

test('AC-720/F2: Start today\'s opening from /cafe → single-holder Tasks group under the caption → resolve the ambiguous step → same group → Log today\'s production deep-links to /cafe/log', async ({ page }) => {
  test.setTimeout(90_000)

  const teamRows = await sql(
    `select id from shared.teams where org_id='${ORG}' and code='radiant_operations'`,
  )
  const teamId = teamRows[0]?.id as string | undefined
  expect(teamId, 'seed.dev-signals.sql must have created the radiant_operations Team + Cahya\'s membership').toBeTruthy()

  const processRows = await sql(`select id from mos.work_lines where id='${WORK_LINE_ID}'`)
  expect(processRows.length, 'seed.dev-cafe-opening.sql must have seeded the Café Opening process').toBeGreaterThan(0)

  // Deterministic clean slate, scoped to THIS process+Team only (never touches other org data).
  await sql(`
    delete from mos.process_run_pending_tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}';
  `)

  // ── ACT 1: VIEWER (Cahya, ops_lead — process.start + owning-Team authorized) opens /cafe ──────
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('cafe')
  await page.waitForURL(/\/cafe$/)

  const startButton = page.getByRole('button', { name: "Start today's opening" })
  await expect(startButton).toBeVisible({ timeout: 15_000 })
  await startButton.click()

  // ── ASSERT: the panel switches to the started state (caption + roll-up + "1 to assign") ───────
  const captionHeader = page.getByText(/Café Opening/)
  await expect(captionHeader).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/1 to assign/)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Process Run', { exact: true })).toHaveCount(0)

  // ── ACT 2: follow the "View opening tasks" link into /work/tasks, scoped to this occurrence ────
  await page.getByRole('link', { name: /view opening tasks/i }).click()
  await page.waitForURL(/\/work\/tasks\?occurrence=/)

  // The occurrence-grouped view shows the single-holder Tasks under the Café Opening caption.
  await expect(page.getByText(/Café Opening/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Open the café floor')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Log today\'s production')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Process Run', { exact: true })).toHaveCount(0)

  // ── ASSERT: the ambiguous step ("Brew station handover") surfaces as a pending "to assign" item ──
  const assignButton = page.getByRole('button', { name: /to assign/i })
  await expect(assignButton).toBeVisible({ timeout: 10_000 })
  await assignButton.click()

  const resolutionDialog = page.getByRole('dialog', { name: /assign/i })
  await expect(resolutionDialog).toBeVisible()
  // pic_role_id "Café Opener (demo)" is held by both Cahya and Krishna — either is a valid choice.
  await resolutionDialog.getByRole('button', { name: /Cahya|Krishna/ }).first().click()
  await expect(resolutionDialog).not.toBeVisible({ timeout: 10_000 })

  // ── ASSERT: the resolved step now appears as a Task in the SAME occurrence group ────────────────
  await expect(page.getByText('Brew station handover')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/Café Opening/)).toHaveCount(1) // one caption group, not two

  // ── ASSERT: "Log today's production" deep-links to /cafe/log via its description (FR-708) ───────
  // STALE→fixed: the record no longer has a "Notes" tab to switch into — the current record
  // grammar (E7, "value-first") renders Description as a plain field in the drawer body
  // (src/components/records/record-field.tsx renders `[data-field-key="description"]` directly;
  // confirmed against the SAME field key asserted by tasks-browser-back-dirty-veto.spec.ts). Open
  // the task and read the description field directly, no tab needed.
  await page.getByText('Log today\'s production').click()
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer.locator('[data-field-key="description"]')).toContainText('/cafe/log', { timeout: 10_000 })

  // ── CLEANUP: leave no e2e-created state behind for the next run ─────────────────────────────────
  await sql(`
    delete from mos.process_run_pending_tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}';
  `)
})
