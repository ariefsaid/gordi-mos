// AC-720 / AC-032 [e2e — F2 "today's opening", curated standing journey] — the real cross-stack
// journey for #789 (OD-WAY-95 (4)): the Café Opening is one door row on the Café root, one
// opening per branch (kitchen + bar together), started by the branch's floor. A kitchen hand
// starts the run from the row; a same-branch bar member then sees the row already reading as
// started. F2 may not regress (master plan).
//
// The row's activation opens the run's Task record in the record grammar (drawer ≥1370, page
// below, phone full-screen). "Process Run" appears nowhere. No pending-PIC chips render on
// /cafe — they belong to the Task record, not the door row.
//
// PERSONAS:
//   KITCHEN_HAND (Kartika Kitchen) — primary member of rumah_rames_kitchen (seed.sql).
//       `member` access role, so process.start is granted and shared.cafe_opening_can_start
//       ('rumah_rames') returns true for her → she can start the row's spawn.
//   BAR_MEMBER (dedicated e2e Rumah Rames bar member — global-setup.ts installs her as primary
//       on rumah_rames_bar). One opening covers a branch's kitchen and bar (shared.cafe_opening_team
//       resolves to the kitchen team), so a bar member on the same branch sees the SAME row.
//
// Requires the live stack (supabase start) + the global-setup seed. Runs at the default desktop
// viewport (the live push/squash split, ADR-0007). Uses supabase/seed.dev-cafe-opening.sql's
// "Café Opening" process (…e3000000…001): three generated definitions (single-holder Tasks
// spawn, one PIC-ambiguous step spawns a pending resolution row — the row is on the Task record).

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { signOutViaUi } from './helpers/sign-out'
import { KITCHEN_HAND, BAR_MEMBER } from './fixtures/users'

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

test('AC-720/AC-032/F2: a kitchen hand starts today\'s opening from the /cafe door row → opens the run\'s Task record; a same-branch bar member sees the row already started', async ({ page }) => {
  test.setTimeout(90_000)

  // The canonical opening Team for Rumah Rames — kitchen-first, per shared.cafe_opening_team.
  const teamRows = await sql(
    `select id from shared.teams where org_id='${ORG}' and code='rumah_rames_kitchen'`,
  )
  const teamId = teamRows[0]?.id as string | undefined
  expect(teamId, 'seed.sql must have created the rumah_rames_kitchen Team').toBeTruthy()

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

  // ── ACT 1: KITCHEN_HAND (Kartika) opens /cafe and starts the opening from the door row ─────
  await loginAs(page, KITCHEN_HAND.email, KITCHEN_HAND.password)
  await page.goto('cafe')
  await page.waitForURL(/\/cafe$/)

  // Head names the stream she is about to write in ("Rumah Rames · Kitchen") — the door row
  // reads the branch off the stream, so head and door speak in one set of books (DESIGN.md A9).
  await expect(page.getByText(/Rumah Rames/).first()).toBeVisible({ timeout: 15_000 })

  // The row itself is the click surface — its accessible name is the full verb+object phrase
  // (Rule 7), never a bare "Start". A same-page Team select would violate the ticket.
  const startRow = page.getByRole('button', { name: "Start today's opening" })
  await expect(startRow).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('select')).toHaveCount(0) // no Team select anywhere on /cafe

  await startRow.click()

  // ── ASSERT 1: the row activates into the run's Task record (occurrence-scoped tasks view) ────
  await page.waitForURL(/\/work\/tasks\?occurrence=/, { timeout: 15_000 })
  await expect(page.getByText(/Café Opening/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Open the café floor')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Log today\'s production')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Process Run', { exact: true })).toHaveCount(0)

  // The spawn's run id — read from the URL now, used to confirm sameness below.
  const runId = new URL(await page.url()).searchParams.get('occurrence')
  expect(runId).toBeTruthy()

  // ── ACT 2: sign out, log in as BAR_MEMBER (same branch, bar) ───────────────────────────────
  await signOutViaUi(page, 'Kartika Kitchen')
  await page.waitForURL((url) => url.pathname.endsWith('/login'), { timeout: 10_000 })
  await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
  await page.goto('cafe')
  await page.waitForURL(/\/cafe$/)

  // The head names Rumah Rames · Bar — her own primary stream (FR-001).
  await expect(page.getByText(/Rumah Rames/).first()).toBeVisible({ timeout: 15_000 })

  // ── ASSERT 2: the door row now reads as STARTED for the next person — one opening per branch ─
  // The full visible line is `☕ Opening · Rumah Rames · x/y done` (the ticket's exact reading);
  // no `Start today's opening` control renders anywhere.
  const startedRow = page.getByRole('link').filter({ hasText: /☕ Opening · Rumah Rames · \d+\/\d+ done/ })
  await expect(startedRow).toBeVisible({ timeout: 15_000 })
  await expect(startedRow).toHaveAttribute('href', `/work/tasks?occurrence=${runId}`)
  await expect(page.getByRole('button', { name: /start today.?s opening/i })).toHaveCount(0)

  // #789 (ticket contract): no pending-PIC chips on /cafe — they live on the Task record.
  await expect(page.getByRole('button', { name: /to assign/i })).toHaveCount(0)
  await expect(page.getByText(/unassigned/i)).toHaveCount(0)

  // Activating the row opens the run's Task record — same URL the kitchen hand navigated to.
  await startedRow.click()
  await page.waitForURL(/\/work\/tasks\?occurrence=/, { timeout: 10_000 })
  expect(new URL(await page.url()).searchParams.get('occurrence')).toBe(runId)

  // ── CLEANUP: leave no e2e-created state behind for the next run ─────────────────────────────────
  await sql(`
    delete from mos.process_run_pending_tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.tasks
      where process_run_id in (select id from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}');
    delete from mos.process_runs where work_line_id='${WORK_LINE_ID}' and owning_team_id='${teamId}';
  `)
})
