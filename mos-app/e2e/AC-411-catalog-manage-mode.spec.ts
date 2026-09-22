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
import { localSqlRead } from './helpers/local-sql-read'
import { DEMO_PASSWORD } from '../src/pages/demo-personas'

const ORG = '10000000-0000-0000-0000-000000000001'
const TRACE_OBJ = 'c1000000-0000-0000-0000-000000000010'
const TRACE_WL = 'c1000000-0000-0000-0000-000000000001'
const TRACE_PROCESS = 'c1000000-0000-0000-0000-000000000002'
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

let ownsTrace = false
test.beforeAll(async () => {
  const existing = await localSqlRead(`select id from mos.objectives where id='${TRACE_OBJ}' union all select id from mos.work_lines where id in ('${TRACE_WL}','${TRACE_PROCESS}') union all select id from mos.tasks where id in ('${TRACE_T1}','${TRACE_T2}')`)
  if (existing.length) throw new Error('Reserved catalog fixtures already exist; preserve them')
  ownsTrace = true
  // Trace is derived from linkage in this exact fixed-ID graph.
  // Post-ADR-0019 D1: the task BU lookup uses canonical business-unit code retail_ops, not retired UUIDs.
  await execSql(`
    INSERT INTO mos.objectives (id, org_id, name) VALUES ('${TRACE_OBJ}', '${ORG}', 'E2E Trace Objective') ON CONFLICT (id) DO NOTHING;
    INSERT INTO mos.work_lines (id, org_id, name, type, objective_id) VALUES ('${TRACE_WL}', '${ORG}', 'E2E Trace Work Line', 'project', '${TRACE_OBJ}') ON CONFLICT (id) DO NOTHING;
    INSERT INTO mos.work_lines (id, org_id, name, type) VALUES ('${TRACE_PROCESS}', '${ORG}', 'E2E Trace Process', 'process') ON CONFLICT (id) DO NOTHING;
    INSERT INTO mos.tasks (id, org_id, title, business_unit_id, status, responsible_person_id, accountable_person_id, created_by, work_line_id, objective_id)
    VALUES ('${TRACE_T1}', '${ORG}', 'E2E Trace task one', (select id from shared.business_units where org_id='${ORG}' and code='retail_ops' limit 1), 'Open', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001', '${TRACE_WL}', '${TRACE_OBJ}'),
      ('${TRACE_T2}', '${ORG}', 'E2E Trace task two', (select id from shared.business_units where org_id='${ORG}' and code='retail_ops' limit 1), 'Open', '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001', '${TRACE_WL}', '${TRACE_OBJ}') ON CONFLICT (id) DO NOTHING;
  `)
})
test.afterAll(async () => { if (ownsTrace) await execSql(`DELETE FROM mos.tasks WHERE id IN ('${TRACE_T1}', '${TRACE_T2}'); DELETE FROM mos.work_lines WHERE id IN ('${TRACE_WL}', '${TRACE_PROCESS}'); DELETE FROM mos.objectives WHERE id='${TRACE_OBJ}';`) })

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

    // WORK-13: the collection shows real linked work and task progress, not a placeholder.
    const trace = page.getByRole('row', { name: 'E2E Trace Objective', exact: true })
    await expect(trace).toBeVisible({ timeout: 10_000 })
    await expect(trace).toContainText('E2E Trace Work Line')
    // catalog.childCount (i18n/messages.ts): "N linked" is retired for the naked-numbers-guard
    // shape "Projects & Processes: N".
    await expect(trace).toContainText('Projects & Processes: 1')
    await expect(trace).toContainText('0 / 2 done')
    await trace.getByRole('link', { name: 'E2E Trace Objective', exact: true }).click()
    const objective = page.getByRole('region', { name: 'E2E Trace Objective', exact: true })
    await expect(objective).toBeVisible()
    const sourceUrl = page.url()
    await objective.getByRole('link', { name: 'E2E Trace Work Line', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'E2E Trace Work Line', exact: true })).toBeVisible()
    await expect(page).toHaveURL(sourceUrl)
    await page.getByRole('button', { name: /^Back/i }).click()
    await expect(objective).toBeVisible()
  })

  test('a direct visit to the retired /objectives redirects to the relocated catalog', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    await page.goto('objectives')
    await expect(page).toHaveURL(/\/work\/objectives$/)
    await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()
  })
})

for (const width of [390, 1440]) {
  test(`AC-411: ordinary member reads Project, Process and Objective direct records at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await loginAs(page, 'bulan.dev@example.test', DEMO_PASSWORD)
    await page.goto('work/projects')
    await expect(page.getByRole('link', { name: 'E2E Trace Process', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create project or process', exact: true })).toHaveCount(0)
    for (const [path, title] of [
      [`work/projects/${TRACE_WL}`, 'E2E Trace Work Line'],
      [`work/projects/${TRACE_PROCESS}`, 'E2E Trace Process'],
      [`work/objectives/${TRACE_OBJ}`, 'E2E Trace Objective'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Edit Name', exact: true })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.reload()
      await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
      await page.screenshot({ path: testInfo.outputPath(`member-en-${width}-${title.replaceAll(' ', '-')}.png`) })
    }
  })
}

for (const width of [390,1440]) {
  test(`Process tabs and panel/page return at ${width}px`,async ({page},testInfo)=>{
    await page.setViewportSize({width,height:900})
    await page.addInitScript(()=>localStorage.setItem('mos.locale','en'))
    await loginAs(page,'bulan.dev@example.test',DEMO_PASSWORD)
    await page.goto('work/projects')
    await page.getByRole('link',{name:'E2E Trace Process',exact:true}).click()
    const panel=page.getByRole('region',{name:'E2E Trace Process',exact:true})
    await expect(panel).toBeVisible()
    for(const tab of ['Details','Steps','Occurrences','Activity']) {
      await panel.getByRole('tab',{name:tab,exact:true}).click()
      await expect(panel.getByRole('tab',{name:tab,exact:true})).toHaveAttribute('aria-selected','true')
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
      await page.screenshot({animations:'disabled',path:testInfo.outputPath(`process-${width}-${tab}.png`)})
    }
    await panel.getByRole('button',{name:'More actions',exact:true}).click()
    await panel.getByRole('menuitem',{name:'Open full page',exact:true}).click()
    await expect(page).toHaveURL(url => url.pathname.endsWith(`/work/projects/${TRACE_PROCESS}`))
    await page.reload()
    await expect(page.getByRole('heading',{name:'E2E Trace Process',exact:true})).toBeVisible()
    await page.goBack()
    await expect(page.getByRole('heading',{name:'Projects & Processes',exact:true})).toBeVisible()
  })
}
