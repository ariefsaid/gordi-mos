// AC-630 [e2e — curated journey, may fold into F2 "today's-opening" at Step 7] — the real
// cross-stack occurrence-as-tasks flow (docs/specs/occurrence-as-tasks.spec.md §9 AC-630):
// an authorized lead Starts a due recurring-work occurrence; its single-holder generated Task
// appears in /work/tasks grouped under the occurrence caption; an ambiguous step surfaces as a
// pending "N to assign" item that, once resolved to a PIC, appears as a Task in the SAME group.
//
// Uses the seeded "Café HQ daily opening" Process (supabase/seed.dev-processes.sql): a daily
// cadence with two generated Task definitions —
//   d1 "Unlock and prep the floor" — pic_role_id = Cafe Ops Lead, held by exactly ONE dev
//       person (Cahya) → resolves to a Task on spawn (FR-604).
//   d2 "Bakery handover" — pic_role_id = Café Opener (demo), held by TWO dev people
//       (Cahya + Krishna) → spawns a pending human-choice row instead of a Task (FR-605/OD-41).
// MANAGER (Dewi Director) holds the `admin` access role (→ process.start, spec §3) and is an
// active member of the `hq_operations` Team (shared.team_memberships, seed.dev-signals.sql) — the
// fixture user with process.start + owning-Team authorization the plan calls for (no new fixture
// needed).
//
// Requires the live stack (supabase start) + the global-setup seed. Runs at the default desktop
// viewport (the live push/squash split, ADR-0007).

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { MANAGER } from './fixtures/users'

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
const WORK_LINE_ID = 'e2000000-0000-0000-0000-000000000001' // "Café HQ daily opening" (seed.dev-processes.sql)

async function sql(query: string): Promise<Array<Record<string, unknown>>> {
  if (!SERVICE_KEY) throw new Error('[AC-630] SUPABASE_SERVICE_ROLE_KEY not set')
  const res = await fetch(SUPABASE_URL + '/pg/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY }, body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error('[AC-630] SQL failed: ' + (await res.text()).slice(0, 500))
  return (await res.json()) as Array<Record<string, unknown>>
}

test('AC-630: Start a due occurrence → single-holder Task groups under the caption → resolve the ambiguous step → same group', async ({ page }) => {
  test.setTimeout(90_000)

  const teamRows = await sql(
    `select id, name from shared.teams where org_id='${ORG}' and code='hq_operations'`,
  )
  const teamId = teamRows[0]?.id as string | undefined
  const teamName = teamRows[0]?.name as string | undefined
  expect(teamId, 'seed.dev-signals.sql must have created the hq_operations Team + Dewi\'s membership').toBeTruthy()

  // Deterministic clean slate, scoped to THIS process+Team only (never touches other org data):
  // remove any prior occurrence so due_process_runs() lists it as due again (the idempotency key
  // is org+process+team+period — a stale prior run for today would make it look already-started).
  await sql(`
    delete from mos.process_run_pending_tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}';
  `)

  // ── ACT 1: MANAGER (Dewi, admin — process.start + owning-Team authorized) Starts the occurrence ──
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('work/tasks')
  await page.waitForURL(/\/work\/tasks$/)

  // The toolbar pill names its source and opens only the due-runs disclosure.
  // Desktop: it is in the inline View & filters options row.
  await page.getByRole('button', { name: /runs? due to start/i }).click()

  const dueRow = page.locator('li.due-runs-row')
    .filter({ hasText: 'Café HQ daily opening' })
    .filter({ hasText: teamName ?? 'HQ Operations' })
  await expect(dueRow).toBeVisible({ timeout: 15_000 })
  // Design fix wave item 5 (Rule 7/12, OD-58) — the button's visible/accessible name composes
  // "Start · <process name>" (verb+object, the REAL job — never a bare "Start"/"Create").
  await dueRow.getByRole('button', { name: 'Start · Café HQ daily opening' }).click()
  await expect(dueRow).not.toBeVisible({ timeout: 10_000 })

  // ── ASSERT: switch to Occurrence grouping — the single-holder Task groups under the caption ────
  // STALE→fixed: "Team work" was removed as a saved-view chip (record-collection plan §Task-11);
  // the org-visible set this assertion needs is now reached via "All" (also the default view).
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByLabel('Group').selectOption('occurrence')

  // Scope to the grouped table's header row (.grp .glabel) — the due-list rows for the OTHER
  // startable teams also carry the process name, so a bare getByText is ambiguous by design.
  const captionHeader = page.locator('tr.grp .glabel').filter({ hasText: 'Café HQ daily opening' })
  await expect(captionHeader).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Unlock and prep the floor')).toBeVisible({ timeout: 10_000 })
  // FR-611 — "Process Run" is internal-only vocabulary; it must never render as UI text.
  await expect(page.getByText('Process Run', { exact: true })).toHaveCount(0)

  // ── ASSERT: the ambiguous step ("Bakery handover") surfaces as a pending "to assign" item ──────
  const assignButton = page.getByRole('button', { name: /to assign/i })
  await expect(assignButton).toBeVisible({ timeout: 10_000 })
  await assignButton.click()

  const resolutionDialog = page.getByRole('dialog', { name: /assign/i })
  await expect(resolutionDialog).toBeVisible()
  // pic_role_id "Café Opener (demo)" is held by both Cahya and Krishna — either is a valid choice.
  await resolutionDialog.getByRole('button', { name: /Cahya|Krishna/ }).first().click()
  await expect(resolutionDialog).not.toBeVisible({ timeout: 10_000 })

  // ── ASSERT: the resolved step now appears as a Task in the SAME occurrence group ────────────────
  await expect(page.getByText('Bakery handover')).toBeVisible({ timeout: 10_000 })
  // Scoped to the group-header labels — the due-list rows for other startable teams also carry
  // the process name (same ambiguity as the caption assertion above).
  await expect(page.locator('tr.grp .glabel').filter({ hasText: 'Café HQ daily opening' })).toHaveCount(1) // one caption group, not two

  // ── CLEANUP: leave no e2e-created state behind for the next run ─────────────────────────────────
  await sql(`
    delete from mos.process_run_pending_tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}';
  `)
})
