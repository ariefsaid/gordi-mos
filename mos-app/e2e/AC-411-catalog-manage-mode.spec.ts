// AC-411 (nav-five-destinations, e2e): the catalog is Work's manage-mode. An admin navigates
// Work → Objectives and lands on /work/objectives with the down-trace (child work_lines + task
// counts) visible; a direct visit to the retired /objectives redirects to the relocated route.
// FR-420/421/422/423.
//
// The cascade hop this journey used to make is gone — the cascade is vocabulary, never a route
// (CONTEXT.md; OD-WAY-32, #179), so manage-mode is reached from its own capability-gated rail item.
//
// Encodes the user's real journey + asserts the goal (manage is reachable in-place, with trace).
// The app conforms to this test. Fixtures seeded by global-setup.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'
import { isShipGated } from './helpers/ship-gate'

const ORG = '10000000-0000-0000-0000-000000000001'
const TRACE_OBJ = 'c1000000-0000-0000-0000-000000000010'
const TRACE_WL = 'c1000000-0000-0000-0000-000000000001'
const TRACE_T1 = 'e1000000-0000-0000-0000-000000000001'
const TRACE_T2 = 'e1000000-0000-0000-0000-000000000002'
function loadEnv(filePath: string): Record<string, string> {
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
    throw new Error(`[AC-411] could not read ${filePath}`, { cause: error })
  }
}
const env = loadEnv(resolve(process.cwd(), '.env.e2e'))
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const supabaseUrl = env.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
async function execSql(query: string) {
  if (!serviceRoleKey) throw new Error('[AC-411] SUPABASE_SERVICE_ROLE_KEY not set')
  const response = await fetch(`${supabaseUrl}/pg/query`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: serviceRoleKey }, body: JSON.stringify({ query }) })
  if (!response.ok) throw new Error(`[AC-411] SQL exec failed: ${response.status}`)
}

test.beforeAll(async () => {
  // FR-422 / catalog-trace ruling: trace is derived from task linkage; global-setup wipes mos.tasks each run,
  // so this spec owns the objective/work-line/task fixture (AC-411 ruling).
  // Post-ADR-0019 D1: the task BU lookup uses canonical business-unit code retail_ops, not retired UUIDs.
  await execSql(`
    INSERT INTO mos.objectives (id, org_id, name) VALUES ('${TRACE_OBJ}', '${ORG}', 'E2E Trace Objective') ON CONFLICT (id) DO NOTHING;
    INSERT INTO mos.work_lines (id, org_id, name, type) VALUES ('${TRACE_WL}', '${ORG}', 'E2E Trace Work Line', 'project') ON CONFLICT (id) DO NOTHING;
    INSERT INTO mos.tasks (id, org_id, title, business_unit_id, status, responsible_person_id, accountable_person_id, created_by, work_line_id, objective_id)
    VALUES ('${TRACE_T1}', '${ORG}', 'E2E Trace task one', (select id from shared.business_units where org_id='${ORG}' and code='retail_ops' limit 1), 'Open', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001', '${TRACE_WL}', '${TRACE_OBJ}'),
      ('${TRACE_T2}', '${ORG}', 'E2E Trace task two', (select id from shared.business_units where org_id='${ORG}' and code='retail_ops' limit 1), 'Open', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001', '${TRACE_WL}', '${TRACE_OBJ}') ON CONFLICT (id) DO NOTHING;
  `)
})
test.afterAll(async () => { await execSql(`DELETE FROM mos.tasks WHERE id IN ('${TRACE_T1}', '${TRACE_T2}'); DELETE FROM mos.work_lines WHERE id='${TRACE_WL}'; DELETE FROM mos.objectives WHERE id='${TRACE_OBJ}';`) })

test.describe('AC-411: catalog is Work\'s manage-mode', () => {
  // issue 444 — this journey's surface is ship-gated (outside the MVP payload), so every entry
  // point forwards home and there is no door to walk through. Skipped on the gate itself, not
  // deleted: the journey is still true of the built surface and comes back the moment /work/objectives
  // leaves SHIP_GATED_PATHS.
  test.skip(isShipGated('/work/objectives'), 'ship-gated surface (issue 444) — no route, no nav')
  test.use({ viewport: { width: 390, height: 844 } })

  test('admin: Work → Objectives → /work/objectives with down-trace', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    // Work → Objectives (phone opens the drawer for secondary nav). The link is no longer
    // capability-gated: OD-V4-1 opened the READ to every authenticated viewer (#188 rail, #189
    // route). ADMIN is used here for the down-trace fixtures, not for admission.
    //
    // STALE: the v4 shell has no header hamburger. Task 1 (top-bar.test.tsx, "v4 shell Task 1: no
    // header hamburger") made the bottom-tab bar's "More" button (aria-label t('nav.more'),
    // bottom-tab-bar.tsx) the drawer's SOLE opener — "Open navigation" does not exist on any
    // viewport. The drawer it opens is still `role="dialog"` (mobile-drawer.tsx), so only the
    // opener locator changes.
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: /more/i }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(/\/work\/objectives$/)
    await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()

    // Down-trace (FR-422): assert the trace CONTENT, not just presence — the seeded objective's
    // trace must show a real task count (e.g. "3 tasks · <work_line>"), proving the derived up/down
    // link actually resolved, not an empty element.
    const trace = page.getByTestId('catalog-trace').first()
    await expect(trace).toBeVisible({ timeout: 10_000 })
    await expect(trace).toHaveText(/\d+\s+task/i)
  })

  test('a direct visit to the retired /objectives redirects to the relocated catalog', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    await page.goto('objectives')
    await expect(page).toHaveURL(/\/work\/objectives$/)
    await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()
  })
})
