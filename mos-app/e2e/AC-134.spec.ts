// AC-134: DB-view Tasks workspace — group by Status → open row → inline status change →
//         regroup by Owner → "+ Add task" pre-fills Owner as R.
// Also exercises AC-117 (optimistic inline status update without view transition),
// AC-123 (Status group headers: count + overdue subtotal), and
// AC-125 (Owner group "+ Add task" opens create pre-filling that person as R).
//
// Persona: MANAGER (Dewi Director) — Director persona per spec.
// Requires the live stack (supabase up on 44321) + global-setup seed.
// Adds 11 demo tasks in beforeAll (idempotent by UUID); cleaned up in afterAll.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { MANAGER } from './fixtures/users'

// ── Supabase direct-SQL helper (mirrors global-setup.ts pattern) ──────────────
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
    throw new Error(`[AC-134] SQL exec failed: ${res.status} ${body}`)
  }
}

// ── Fixed person + BU UUIDs (from supabase/seed.sql) ────────────────────────
const ORG       = '10000000-0000-0000-0000-000000000001'
const P_DEWI    = '40000000-0000-0000-0000-000000000000' // Dewi Director (MANAGER)
const P_CAHYA   = '40000000-0000-0000-0000-000000000001' // Cahya Cafe (VIEWER)
const P_KRISHNA = '40000000-0000-0000-0000-000000000002' // Krishna Kitchen
const P_RAMA    = '40000000-0000-0000-0000-000000000003' // Rama Roastery
const P_SARI    = '40000000-0000-0000-0000-000000000004' // Sari Sales
const P_FITRI   = '40000000-0000-0000-0000-000000000005' // Fitri Finance
const BU_CAFE   = '20000000-0000-0000-0000-000000000001'
const BU_KIT    = '20000000-0000-0000-0000-000000000002'
const BU_ROAST  = '20000000-0000-0000-0000-000000000003'
const BU_SALES  = '20000000-0000-0000-0000-000000000004'
const BU_FIN    = '20000000-0000-0000-0000-000000000005'

// Fixed-UUID task IDs for this spec (avoid collisions with other e2e fixtures).
const T = {
  IP1: 'b0000000-0000-0000-0000-000000000001', // In Progress, overdue (due -4d)
  IP2: 'b0000000-0000-0000-0000-000000000002', // In Progress, +2d
  IP3: 'b0000000-0000-0000-0000-000000000003', // In Progress, +8d
  IP4: 'b0000000-0000-0000-0000-000000000004', // In Progress, +14d
  BL1: 'b0000000-0000-0000-0000-000000000005', // Blocked, overdue (-7d)
  BL2: 'b0000000-0000-0000-0000-000000000006', // Blocked, overdue (-5d)
  OP1: 'b0000000-0000-0000-0000-000000000007', // Open, +17d
  OP2: 'b0000000-0000-0000-0000-000000000008', // Open, +22d
  OP3: 'b0000000-0000-0000-0000-000000000009', // Open, +25d
  DN1: 'b0000000-0000-0000-0000-000000000010', // Done, due -10d (NOT overdue — Done excluded)
  DN2: 'b0000000-0000-0000-0000-000000000011', // Done, due -14d (NOT overdue — Done excluded)
}

const ALL_T_IDS = Object.values(T).map(id => `'${id}'`).join(',')

test.beforeAll(async () => {
  if (!SERVICE_KEY) {
    throw new Error('[AC-134] SUPABASE_SERVICE_ROLE_KEY not set — ensure .env.e2e is present')
  }

  // Idempotent cleanup before insert.
  await execSql(`
    DELETE FROM mos.task_events          WHERE task_id IN (${ALL_T_IDS});
    DELETE FROM mos.task_checklist_items WHERE task_id IN (${ALL_T_IDS});
    DELETE FROM mos.tasks                WHERE id      IN (${ALL_T_IDS});
  `)

  // Insert 11 demo tasks:
  //   In Progress×4 (1 overdue), Blocked×2 (2 overdue), Open×3, Done×2
  //   ─→ 3 overdue among non-Done tasks (IP1 + BL1 + BL2).
  //   Done tasks have past due-dates but must NOT appear in any overdue count (C1 fix).
  await execSql(`
    INSERT INTO mos.tasks
      (id, org_id, title, business_unit_id, status,
       responsible_person_id, accountable_person_id,
       consulted_person_ids, informed_person_ids,
       description, due_date, created_by)
    VALUES
      -- In Progress (4; IP1 is overdue)
      ('${T.IP1}','${ORG}','Dial in new Brazil single-origin','${BU_ROAST}','In Progress',
        '${P_RAMA}','${P_DEWI}','{"${P_CAHYA}","${P_SARI}"}','{}',
        'Seeded for AC-134.', (current_date - 4), '${P_DEWI}'),
      ('${T.IP2}','${ORG}','Update espresso recipe cards','${BU_CAFE}','In Progress',
        '${P_CAHYA}','${P_DEWI}','{}','{}',
        'Seeded for AC-134.', (current_date + 2), '${P_DEWI}'),
      ('${T.IP3}','${ORG}','Photograph new pastry line','${BU_KIT}','In Progress',
        '${P_KRISHNA}','${P_DEWI}','{"${P_CAHYA}"}','{}',
        'Seeded for AC-134.', (current_date + 8), '${P_DEWI}'),
      ('${T.IP4}','${ORG}','Q3 wholesale price list','${BU_SALES}','In Progress',
        '${P_SARI}','${P_DEWI}','{}','{}',
        'Seeded for AC-134.', (current_date + 14), '${P_DEWI}'),
      -- Blocked (2; both overdue — C1: only non-Done tasks count as overdue)
      ('${T.BL1}','${ORG}','Replace grinder burrs (Cafe 2)','${BU_CAFE}','Blocked',
        '${P_CAHYA}','${P_DEWI}','{}','{}',
        'Seeded for AC-134.', (current_date - 7), '${P_DEWI}'),
      ('${T.BL2}','${ORG}','Source compostable cups vendor','${BU_FIN}','Blocked',
        '${P_FITRI}','${P_DEWI}','{"${P_CAHYA}"}','{}',
        'Seeded for AC-134.', (current_date - 5), '${P_DEWI}'),
      -- Open (3; all future due-dates — no overdue)
      ('${T.OP1}','${ORG}','Plan barista latte-art workshop','${BU_CAFE}','Open',
        '${P_CAHYA}','${P_DEWI}','{}','{}',
        'Seeded for AC-134.', (current_date + 17), '${P_DEWI}'),
      ('${T.OP2}','${ORG}','Roastery extractor PM schedule','${BU_ROAST}','Open',
        '${P_RAMA}','${P_DEWI}','{}','{}',
        'Seeded for AC-134.', (current_date + 22), '${P_DEWI}'),
      ('${T.OP3}','${ORG}','Draft Q3 OKRs for cafe team','${BU_CAFE}','Open',
        '${P_DEWI}','${P_DEWI}','{"${P_CAHYA}","${P_SARI}","${P_KRISHNA}"}','{}',
        'Seeded for AC-134.', (current_date + 25), '${P_DEWI}'),
      -- Done (2; past due-dates — must NOT contribute to any overdue subtotal)
      ('${T.DN1}','${ORG}','Refit cold brew taps','${BU_KIT}','Done',
        '${P_KRISHNA}','${P_DEWI}','{}','{}',
        'Seeded for AC-134.', (current_date - 10), '${P_DEWI}'),
      ('${T.DN2}','${ORG}','Migrate POS to v4','${BU_SALES}','Done',
        '${P_SARI}','${P_DEWI}','{}','{}',
        'Seeded for AC-134.', (current_date - 14), '${P_DEWI}')
    ON CONFLICT (id) DO NOTHING;
  `)
})

test.afterAll(async () => {
  await execSql(`
    DELETE FROM mos.task_events          WHERE task_id IN (${ALL_T_IDS});
    DELETE FROM mos.task_checklist_items WHERE task_id IN (${ALL_T_IDS});
    DELETE FROM mos.tasks                WHERE id      IN (${ALL_T_IDS});
  `)
})

test.beforeEach(async ({ page }) => {
  // Log in as Director (MANAGER = Dewi Director) — Director persona per the AC.
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('tasks')
  await page.waitForURL(/\/tasks$/)
  // Switch to "All" so Dewi sees the full seeded dataset (not just her R/A tasks).
  await page.getByRole('tab', { name: 'All' }).click()
  // Wait for at least one group header to appear (TanStack row model, one render cycle).
  await page.waitForSelector('tr.grp', { timeout: 10_000 })
})

// ════════════════════════════════════════════════════════════════════════════════
// AC-134: full cross-stack journey
// ════════════════════════════════════════════════════════════════════════════════

test(
  'AC-134 (also exercises AC-117/123/125): grouped-Status workspace → open row → ' +
  'inline status change → regroup by Owner → add task pre-filled',
  async ({ page }) => {

  // ─── Step 1: grouped by Status (default) — group headers with counts + overdue subtotals ───
  // AC-123: each Status group header shows label + count; groups with overdue leaf rows show
  // an overdue subtotal button (.gsub); the Done group must NOT show one even with past due-dates.

  // All four status groups must be visible.
  for (const label of ['In Progress', 'Blocked', 'Open', 'Done']) {
    await expect(
      page.locator('tr.grp').filter({ hasText: label }),
    ).toBeVisible({ timeout: 10_000 })
  }

  // In Progress group: count badge present, overdue subtotal present (IP1 is overdue).
  const ipHeader = page.locator('tr.grp').filter({ hasText: 'In Progress' })
  const ipCount  = ipHeader.locator('.gcount')
  await expect(ipCount).toBeVisible()
  expect(parseInt((await ipCount.textContent()) ?? '0')).toBeGreaterThanOrEqual(1)
  await expect(ipHeader.locator('.gsub')).toBeVisible()

  // Blocked group: 2 overdue rows → overdue subtotal must say "N overdue" (N ≥ 1).
  const blHeader  = page.locator('tr.grp').filter({ hasText: 'Blocked' })
  const blSub     = blHeader.locator('.gsub')
  await expect(blSub).toBeVisible()
  const blSubText = (await blSub.textContent()) ?? ''
  expect(blSubText).toMatch(/\d+ overdue/)
  expect(parseInt(blSubText.match(/(\d+) overdue/)?.[1] ?? '0')).toBeGreaterThanOrEqual(1)

  // C1 fix oracle: Done group has tasks with past due-dates, but MUST NOT show .gsub.
  await expect(page.locator('tr.grp').filter({ hasText: 'Done' }).locator('.gsub')).not.toBeVisible()

  // Open group: all future due-dates → no overdue subtotal.
  await expect(page.locator('tr.grp').filter({ hasText: 'Open' }).locator('.gsub')).not.toBeVisible()

  // ─── Step 2: open a row → drawer opens in place, URL is canonical /tasks/:id ────────────
  const firstRow = page.locator('tr.task-row').first()
  await expect(firstRow).toBeVisible({ timeout: 8_000 })
  await firstRow.click()

  await page.waitForURL(/\/tasks\/[0-9a-f-]{36}$/, { timeout: 10_000 })
  const taskUrl = page.url()
  expect(taskUrl).toMatch(/\/tasks\/[0-9a-f-]{36}$/)

  // Drawer opens beside the still-mounted table (split-view, ADR-0007).
  const drawer = page.getByRole('complementary', { name: /task detail/i })
  await expect(drawer).toBeVisible({ timeout: 8_000 })

  // Table (section[aria-label="Tasks"]) stays mounted — the split-view oracle.
  await expect(page.getByRole('region', { name: 'Tasks' })).toBeVisible()

  // The opened row is marked current (aria-current="true").
  const currentRow = page.locator('tr.task-row[aria-current="true"]')
  await expect(currentRow).toBeVisible()

  // ─── Step 3: change status inline → row reflects it optimistically, no nav ─────────────
  // AC-117 oracle: same URL, same row updated in the table, no page reload.
  const statusBtn = drawer.getByRole('button', { name: /change status/i })
  await expect(statusBtn).toBeVisible({ timeout: 8_000 })
  await statusBtn.click()

  const listbox = page.getByRole('listbox', { name: /select status/i })
  await expect(listbox).toBeVisible({ timeout: 5_000 })
  await listbox.getByRole('option', { name: 'Open' }).click()

  // Drawer pill reflects the new status immediately.
  await expect(drawer.getByText('Open')).toBeVisible({ timeout: 8_000 })

  // URL stays canonical (no navigation happened).
  expect(page.url()).toBe(taskUrl)

  // Same table row now shows "Open" — AC-117 optimistic sync without view transition.
  await expect(currentRow.getByText('Open')).toBeVisible({ timeout: 8_000 })

  // ─── Step 4: regroup by Owner → Owner group headers appear for all persons ─────────────
  await page.locator('#group-by-filter').selectOption('owner')

  // All 6 seeded persons must have group headers (OD-P3-6: empty groups always shown).
  for (const name of ['Dewi Director', 'Cahya Cafe', 'Krishna Kitchen',
                       'Rama Roastery', 'Sari Sales', 'Fitri Finance']) {
    await expect(
      page.locator('tr.grp').filter({ hasText: name }),
    ).toBeVisible({ timeout: 8_000 })
  }

  // ─── Step 5: "+ Add task" in Rama Roastery's Owner group → /tasks/new?r=<P_RAMA> ────────
  // AC-125 oracle: query param ?r=<personId> is present; create form pre-fills R.
  const ramaHeader = page.locator('tr.grp').filter({ hasText: 'Rama Roastery' })
  await expect(ramaHeader).toBeVisible()

  const addTaskBtn = ramaHeader.getByRole('button', { name: /add task to Rama Roastery/i })
  await expect(addTaskBtn).toBeVisible()
  await addTaskBtn.click()

  await page.waitForURL(/\/tasks\/new(\?|$)/, { timeout: 10_000 })
  expect(page.url()).toContain(`r=${P_RAMA}`)

  // Create form mounts and the Responsible (R) select is pre-filled with Rama's person ID.
  const createForm = page.getByRole('form', { name: /create task form/i })
  await expect(createForm).toBeVisible({ timeout: 8_000 })

  const responsibleSelect = createForm.getByRole('combobox', { name: /Responsible \(R\)/i })
  await expect(responsibleSelect).toBeVisible({ timeout: 10_000 })
  await expect(responsibleSelect).toHaveValue(P_RAMA)
})
