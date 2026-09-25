// AC-230 (e2e — cascade read path): a manager reads a teammate's daily-vs-project split.
// Spec: docs/specs/cascade-foundation.spec.md § AC-230
//
// JTBD: the Director (Dewi) sets Group="Work-line" + Person=Cahya in /mos/tasks,
//       and can immediately see where Cahya's effort goes — project vs daily work.
//       This proves the read path end-to-end: listTasks + listWorkLines (cascade catalog)
//       + GroupBy=workline + PersonFilter + WorkloadCaption — the integration layer that
//       would have caught the log_date-class bug.
//
// Persona: MANAGER (e2e.manager@example.test → Dewi Director).
// Teammate under inspection: Cahya Cafe (VIEWER.personId = P_CAHYA), R on 2 seeded tasks.
//
// Seed strategy (beforeAll):
//   work_lines (2, fixed UUIDs matching seed.dev-tasks.sql — idempotent ON CONFLICT):
//     c0000000-...-0001 = "Daily IG Content" (process)
//     c0000000-...-0002 = "New Menu Design" (project)
//   tasks (2, fixed e0-prefixed UUIDs — cleaned in afterAll):
//     e0000000-...-0001 = Cahya process task (work_line=process WL)
//     e0000000-...-0002 = Cahya project task (work_line=project WL)
//   global-setup wipes mos.tasks each run → tasks must be seeded here.
//   work_lines survive the wipe and are left intact in afterAll.
//
// Three goal oracles:
//   (a) Cahya's tasks nest under their work-line group headers: each group header is
//       visible, its gcount=1, and its task title is visible (group is not collapsed).
//   (b) Group headers show the type label text — "Project" or "Daily / ongoing"
//       (FR-233 / WCAG 1.4.1: text always present, never color-only).
//   (c) Workload caption (role="status", aria-label="Workload summary") renders
//       "Cahya's work" + the project/daily/unassigned counts of the rendered groups (FR-236).

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { chooseSelectOption } from './helpers/select'
import { MANAGER } from './fixtures/users'
import { openViewFilters } from './helpers/tasks'

// ── Supabase direct-SQL helper (mirrors global-setup.ts / AC-134 pattern) ────
function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return vars
  } catch {
    return {}
  }
}

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

const envFile = loadEnvFile(resolve(__dir, '../.env.e2e'))
const SUPABASE_URL =
  envFile.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
const SERVICE_KEY =
  envFile.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

async function execSql(query: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[AC-230] SQL exec failed: ${res.status} ${body}`)
  }
}

// ── Fixed UUIDs ───────────────────────────────────────────────────────────────
const ORG     = '10000000-0000-0000-0000-000000000001'
const P_CAHYA = '40000000-0000-0000-0000-000000000001' // Cahya Cafe (VIEWER persona)

// Work-line IDs match seed.dev-tasks.sql canon — idempotent with ON CONFLICT.
const WL_PROCESS = 'c0000000-0000-0000-0000-000000000001' // "Daily IG Content" (process)
const WL_PROJECT = 'c0000000-0000-0000-0000-000000000002' // "New Menu Design" (project)
const WL_PROCESS_NAME = 'Daily IG Content'
const WL_PROJECT_NAME = 'New Menu Design'

// Task IDs: e0-prefix avoids collision with a0 (global-setup) and b0 (AC-134).
const T_PROCESS = 'e0000000-0000-0000-0000-000000000001'
const T_PROJECT = 'e0000000-0000-0000-0000-000000000002'
const T_PROCESS_TITLE = 'E2E Cascade: Cahya daily IG post'
const T_PROJECT_TITLE = 'E2E Cascade: Cahya menu design draft'

// ── Seed ──────────────────────────────────────────────────────────────────────
test.beforeAll(async () => {
  if (!SERVICE_KEY) {
    throw new Error('[AC-230] SUPABASE_SERVICE_ROLE_KEY not set — ensure .env.e2e is present')
  }

  // Upsert work_lines. ON CONFLICT DO NOTHING: idempotent whether dev-seed ran or not.
  // org_id explicit: postgres role has no JWT → shared.current_org_id() returns null.
  await execSql(`
    INSERT INTO mos.work_lines (id, org_id, name, type)
    VALUES
      ('${WL_PROCESS}', '${ORG}', '${WL_PROCESS_NAME}', 'process'),
      ('${WL_PROJECT}', '${ORG}', '${WL_PROJECT_NAME}', 'project')
    ON CONFLICT (id) DO NOTHING;
  `)
  console.log('[AC-230] upserted work_lines (idempotent)')

  // Insert Cahya cascade tasks. global-setup wipes mos.tasks → always a fresh insert.
  // ON CONFLICT DO NOTHING guards against manual re-runs without a db reset.
  // Post-ADR-0019 D1: resolve the canonical Team by code, following AC-524.spec.ts:46;
  // never carry forward the retired pre-D1 business-unit UUID.
  await execSql(`
    INSERT INTO mos.tasks
      (id, org_id, title, business_unit_id, status,
       responsible_person_id, accountable_person_id,
       consulted_person_ids, informed_person_ids,
       description, created_by, work_line_id)
    VALUES
      ('${T_PROCESS}', '${ORG}', '${T_PROCESS_TITLE}', (select id from shared.business_units where org_id='${ORG}' and code='retail_ops' limit 1), 'Open',
       '${P_CAHYA}', '${P_CAHYA}', '{}', '{}',
       'Seeded for AC-230 cascade read-path e2e.', '${P_CAHYA}', '${WL_PROCESS}'),
      ('${T_PROJECT}', '${ORG}', '${T_PROJECT_TITLE}', (select id from shared.business_units where org_id='${ORG}' and code='retail_ops' limit 1), 'Open',
       '${P_CAHYA}', '${P_CAHYA}', '{}', '{}',
       'Seeded for AC-230 cascade read-path e2e.', '${P_CAHYA}', '${WL_PROJECT}')
    ON CONFLICT (id) DO NOTHING;
  `)
  console.log('[AC-230] seeded Cahya cascade tasks')
})

// ── Cleanup ────────────────────────────────────────────────────────────────────
// Delete only the tasks seeded by this spec. Work-lines are left intact.
test.afterAll(async () => {
  await execSql(`
    DELETE FROM mos.tasks WHERE id IN ('${T_PROCESS}', '${T_PROJECT}');
  `)
  console.log('[AC-230] cleaned up this spec\'s tasks')
})

// ── AC-230: the single curated cascade read-path journey ──────────────────────
test(
  'AC-230: Director sets Group="Work-line" + Person=Cahya → tasks nest under work-line ' +
  'group headers with type labels → workload caption shows daily-vs-project split',
  async ({ page }) => {

  // ── 1. Login as Director (MANAGER = Dewi Director) ──────────────────────────
  await loginAs(page, MANAGER.email, MANAGER.password)

  // ── 2. Navigate to /mos/tasks ────────────────────────────────────────────────
  await page.goto('work/tasks')
  await page.waitForURL(/\/tasks$/)

  // ── 3. Scope = "All" ─────────────────────────────────────────────────────────
  // MANAGER's "Mine" segment shows only her R/A tasks. "All" broadens scope so
  // the Person filter alone drives ownership (FR-124 / AC-126).
  // STALE→fixed (#284's repair, mirrored): the saved-view chips are BUTTONS inside the
  // role="group" "Tasks saved views" (tasks-toolbar.tsx) — a 'tab' role never existed here.
  await page.getByRole('button', { name: 'All', exact: true }).click()

  // ── 4. Set Group = "Work-line" ───────────────────────────────────────────────
  // #870: Group/Person now live behind the desktop "View & filters" door.
  await openViewFilters(page)
  await chooseSelectOption(page, page.getByRole('combobox', { name: 'Group', exact: true }), 'Project/Process')

  // ── 5. Set Person = Cahya ────────────────────────────────────────────────────
  // The Person filter overrides the segment (FR-124). Only Cahya's tasks pass
  // raciMember. filterZeroWhenPerson=true suppresses empty work-line groups (RI-2).
  await chooseSelectOption(page, page.getByRole('combobox', { name: 'Person', exact: true }), 'Cahya Cafe')

  // ── 6. Wait for work-line group headers ──────────────────────────────────────
  // Groups depend on useCascadeCatalogs (async non-blocking load of mos.work_lines).
  // While catalog loads: groups=[] → empty-state shows ("No tasks match").
  // Once catalog arrives: named work-line groups build → tr.grp elements appear.
  await page.waitForSelector('tr.grp', { timeout: 15_000 })

  // ── Oracle (a): Cahya's tasks nest under their work-line group headers ────────
  //
  // With filterZeroWhenPerson=true, only work-line groups containing Cahya's tasks
  // render (RI-2). Each seeded task belongs to a distinct work-line group.
  //
  // (i) Both work-line group headers are visible.
  const processGrp = page.locator('tr.grp').filter({ hasText: WL_PROCESS_NAME })
  const projectGrp = page.locator('tr.grp').filter({ hasText: WL_PROJECT_NAME })
  await expect(processGrp).toBeVisible({ timeout: 10_000 })
  await expect(projectGrp).toBeVisible({ timeout: 10_000 })

  // (ii) The seeded task sits under its OWN work-line header, and only there — proves it landed
  //      in the correct group, not misplaced or dropped. Other fixtures may add tasks to either
  //      group, so the group's total is not part of this contract — never hard-code it.
  const processRow = page.locator('tr.task-row').filter({ hasText: T_PROCESS_TITLE })
  await expect(processRow).toHaveCount(1)
  await expect(processRow).toBeVisible()
  await expect(processRow.locator('xpath=preceding-sibling::tr[contains(@class, "grp")][1]'))
    .toContainText(WL_PROCESS_NAME)
  const projectRow = page.locator('tr.task-row').filter({ hasText: T_PROJECT_TITLE })
  await expect(projectRow).toHaveCount(1)
  await expect(projectRow).toBeVisible()
  await expect(projectRow.locator('xpath=preceding-sibling::tr[contains(@class, "grp")][1]'))
    .toContainText(WL_PROJECT_NAME)

  // The displayed .gcount is cross-checked against the group's OWN rendered member rows (DOM
  // siblings between this header and the next), never a hard-coded seed total — proves the count
  // and the visible rows agree, whatever the incidental real total is.
  const memberRowCount = async (header: import('@playwright/test').Locator) => header.evaluate((headerEl) => {
    let n = 0
    let el = headerEl.nextElementSibling
    while (el && !el.classList.contains('grp')) {
      if (el.classList.contains('task-row')) n += 1
      el = el.nextElementSibling
    }
    return n
  })
  await expect(processGrp.locator('.gcount')).toHaveText(String(await memberRowCount(processGrp)))
  await expect(projectGrp.locator('.gcount')).toHaveText(String(await memberRowCount(projectGrp)))

  // ── Oracle (b): group headers show the work-line type label text ──────────────
  // FR-233 / WCAG 1.4.1: WorkLineTypeTag always renders text (not color-only).
  // process → "Daily / ongoing"; project → "Project".
  await expect(processGrp.getByText('Daily / ongoing')).toBeVisible()
  await expect(projectGrp.getByText('Project')).toBeVisible()

  // ── Oracle (c): workload caption renders Cahya's name + daily/project shape ───
  // FR-236: WorkloadCaption (role="status", aria-label="Workload summary") renders
  // when groupBy==="workline" AND a single person is filtered.
  // Shape: "{Name}'s work: {N} project(s) and {M} daily job(s)[ and {K} unassigned]."
  //   N / M = work-line groups of each type holding at least one of Cahya's open (not Done) tasks;
  //   K = Cahya's open tasks with no work-line (RI-4). The dev seed gives Cahya work on other
  //   work-lines too, so the expected shape is read from the rendered groups, never hard-coded —
  //   the caption must reconcile with what the table shows.
  //   isSelf=false (Dewi is viewing Cahya) → subject "Cahya's work".
  const shape = await page.evaluate(() => {
    const result = { project: 0, daily: 0, unassigned: 0 }
    for (const header of Array.from(document.querySelectorAll('tr.grp'))) {
      let open = 0
      let el = header.nextElementSibling
      while (el && !el.classList.contains('grp')) {
        if (el.classList.contains('task-row') && el.querySelector('.td-status')?.textContent?.trim() !== 'Done') open += 1
        el = el.nextElementSibling
      }
      const label = header.textContent?.trim() ?? ''
      if (label.startsWith('No work-line')) result.unassigned += open
      else if (open > 0 && label.includes('Daily / ongoing')) result.daily += 1
      else if (open > 0 && label.includes('Project')) result.project += 1
    }
    return result
  })
  // Both seeded work-lines count: at least one of each type.
  expect(shape.project).toBeGreaterThanOrEqual(1)
  expect(shape.daily).toBeGreaterThanOrEqual(1)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const parts = [plural(shape.project, 'project', 'projects'), plural(shape.daily, 'daily job', 'daily jobs')]
  if (shape.unassigned > 0) parts.push(`${shape.unassigned} unassigned`)
  const caption = page.locator('[aria-label="Workload summary"]')
  await expect(caption).toBeVisible({ timeout: 15_000 })
  await expect(caption).toHaveText(`Cahya's work: ${parts.join(' and ')}.`, { timeout: 10_000 })
})
