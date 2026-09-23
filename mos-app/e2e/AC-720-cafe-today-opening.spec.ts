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
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { processRunCleanupSql } from './fixtures/cleanup'

const ORG = '10000000-0000-0000-0000-000000000001'
const WORK_LINE_ID = 'e3000000-0000-0000-0000-000000000001' // "Café Opening" (seed.dev-cafe-opening.sql)
const ALLOW_SHARED_CAFE_OPENING_FIXTURE = process.env.MOS_E2E_ALLOW_SHARED_CAFE_OPENING_FIXTURE === '1'

if (!ALLOW_SHARED_CAFE_OPENING_FIXTURE) {
  test('AC-720 is disabled until its process fixture is isolated', () => { test.skip() })
} else {
  let createdRunId: string | null = null

const currentOpeningSql = (teamId: string) => `
  select id::text as id
  from mos.process_runs
  where org_id = '${ORG}'
    and work_line_id = '${WORK_LINE_ID}'
    and owning_team_id = '${teamId}'
    and period_key = to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD')
  order by id
`

test.afterEach(async () => {
  if (!createdRunId) return
  await localSql(processRunCleanupSql([createdRunId], ORG))
  createdRunId = null
})

test('AC-720/F2: Start today\'s opening from /cafe → single-holder Tasks group under the caption → resolve the ambiguous step → same group → Log today\'s production deep-links to /cafe/log', async ({ page }) => {
  test.setTimeout(90_000)

  const teamRows = await localSqlRead<{ id: string }>(
    `select id from shared.teams where org_id='${ORG}' and code='radiant_operations'`,
  )
  const teamId = teamRows[0]?.id
  expect(teamId, 'seed.dev-signals.sql must have created the radiant_operations Team + Cahya\'s membership').toBeTruthy()

  const processRows = await localSqlRead(`select id from mos.work_lines where id='${WORK_LINE_ID}'`)
  expect(processRows.length, 'seed.dev-cafe-opening.sql must have seeded the Café Opening process').toBeGreaterThan(0)

  // A current-day run may be user/demo state. Refuse to mutate it; the journey owns only the run
  // created by its own Start action and cleans that run by captured ID in afterEach.
  const existingRuns = await localSqlRead<{ id: string }>(currentOpeningSql(teamId!))
  if (existingRuns.length > 0) {
    throw new Error('[AC-720] Refusing to mutate an existing current-day Café Opening run; preserve it and retry on a clean fixture')
  }

  // ── ACT 1: VIEWER (Cahya, ops_lead — process.start + owning-Team authorized) opens /cafe ──────
  await loginAs(page, VIEWER.email, VIEWER.password)
  await page.goto('cafe')
  await page.waitForURL(/\/cafe$/)

  const startButton = page.getByRole('button', { name: "Start today's opening" })
  await expect(startButton).toBeVisible({ timeout: 15_000 })
  const spawnResponse = page.waitForResponse((response) => /\/rpc\/spawn_process_run/.test(response.url()) && response.ok())
  await startButton.click()
  const spawned = await (await spawnResponse).json() as { run_id: string; idempotent: boolean }
  expect(spawned.idempotent, 'AC-720 must own a newly-created run, not an idempotent existing run').toBe(false)
  expect(spawned.run_id).toMatch(/^[0-9a-f-]{36}$/i)
  createdRunId = spawned.run_id

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

  // afterEach removes only the captured run and its dependent rows.
})
}
