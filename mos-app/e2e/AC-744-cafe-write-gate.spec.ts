// #744 AC-008 — the ONE cross-stack journey for the Café write gate (OD-WAY-93 #1).
//
// ACT 1 — a barista (BAR_MEMBER: dedicated e2e person, live-primary on the (Rumah Rames, bar)
// stream Team, therefore Café-affiliated) at 390: logs in, sees the phone's Café tab — the nav
// consequence that lives in THIS ticket (primaryModuleForViewer reads the affiliation payload) —
// opens the Log and submits one line. The line lands Submitted with submitted_by pinned to their
// own person id (the help-out rule intact: they could have logged into ANY stream).
//
// ACT 2 — Sales (sari.dev, unaffiliated: her only Team is org-structure) opens /cafe/log: the
// capture form's rows stay visible (read-only, never hidden — OD-WAY-51), no submit control is
// enabled, and one line states why. The hard refusal behind this screen is owned by the pgTAP
// suite (ops_09); this journey proves the presentation of the same rule on the real stack.
//
// Fixture: dedicated WIP item + confirmed unit + plan (DD-WAY-29: no confirmed unit → the item is
// legitimately absent from the form), self-cleaning, e2e-namespaced ids.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { BAR_MEMBER, BAR_STREAM } from './fixtures/users'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

function loadEnvFile(filePath: string): Record<string, string> {
  try {
    const content = readFileSync(filePath, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      vars[key] = trimmed.slice(eq + 1).trim()
    }
    return vars
  } catch {
    return {}
  }
}
const e2eEnv = loadEnvFile(resolve(__dir, '../.env.e2e'))
const SUPABASE_URL = e2eEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
const SERVICE_KEY = e2eEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const ORG = '10000000-0000-0000-0000-000000000001'
const ITEM_ID = 'a17e4400-0000-0000-0000-000000000744'
const ITEM_NAME = 'E2E Gate Drink'
const UNIT_NAME = 'gelas'
const PLAN_QTY = 9

// The Sales demo persona — unaffiliated by seed (b2b_sales_team is org-structure, not a stream).
const SALES = { email: 'sari.dev@example.test', password: 'Passw0rd!dev' }

function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** /pg/query runs as postgres and returns a JSON array of row objects. Local-only. */
async function sql(query: string): Promise<Array<Record<string, unknown>>> {
  if (!SERVICE_KEY) throw new Error('[AC-744] SUPABASE_SERVICE_ROLE_KEY not set — is .env.e2e present?')
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`[AC-744] SQL failed (${res.status}): ${(await res.text()).slice(0, 500)}`)
  return (await res.json()) as Array<Record<string, unknown>>
}

const BRANCH_SQL =
  `(select b.id from shared.branches b where b.org_id = '${ORG}' and b.code = '${BAR_STREAM.branchCode}')`

test.describe('AC-744  AC-008: the Café write gate — barista submits, Sales cannot', () => {
  const today = wibToday()

  async function resetFixtureRows() {
    await sql(`
      DELETE FROM ops.kitchen_stock WHERE org_id='${ORG}' AND wip_item_id='${ITEM_ID}';
      DELETE FROM ops.kitchen_logs   WHERE org_id='${ORG}' AND wip_item_id='${ITEM_ID}';
      DELETE FROM ops.kitchen_plans  WHERE org_id='${ORG}' AND wip_item_id='${ITEM_ID}';
      DELETE FROM ops.item_units     WHERE org_id='${ORG}' AND wip_item_id='${ITEM_ID}';
      DELETE FROM ops.wip_items      WHERE org_id='${ORG}' AND id='${ITEM_ID}';
    `)
  }

  test.beforeAll(async () => {
    await resetFixtureRows()
    await sql(`
      INSERT INTO ops.wip_items (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi)
      VALUES ('${ITEM_ID}', '${ORG}', '${ITEM_NAME}', 'Drinks', true, 'BOM-E2E-744', 'PD-E2E-744')
      ON CONFLICT (id) DO UPDATE SET flag_active = true;
      INSERT INTO ops.item_units (org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id, is_default, is_transferable, confirmed_at)
      VALUES ('${ORG}', '${ITEM_ID}', '${UNIT_NAME}', 'PD-E2E-744', 'P-E2E-744', true, true, now())
      ON CONFLICT (wip_item_id, unit_name) DO UPDATE SET confirmed_at = now();
      INSERT INTO ops.kitchen_plans
        (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by)
      VALUES ('${ORG}', '${today}', '${ITEM_ID}', ${BRANCH_SQL}, '${BAR_STREAM.activity}', 'produce', NULL,
              ${PLAN_QTY}, '${BAR_MEMBER.personId}')
      ON CONFLICT (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id)
      DO UPDATE SET qty_porsi = ${PLAN_QTY};
    `)
  })

  test.afterAll(async () => {
    await resetFixtureRows()
  })

  test('a barista logs one line at 390; Sales sees the log read-only with no submit path', async ({ page }) => {
    test.setTimeout(120_000)

    // ── ACT 1 — the barista, on a phone at 390 ────────────────────────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)

    // The affiliation consequence owned by THIS ticket: the phone's promoted module slot IS Café,
    // read from the affiliation payload (primaryModuleForViewer) — not from a role-name regex.
    await expect(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /Café/ }),
    ).toBeVisible({ timeout: 15_000 })

    // #781 (OD-WAY-95): /cafe IS the capture list now (the Log). AC-021 repoints this journey.
    await page.goto('cafe')
    await page.waitForURL(/\/cafe$/, { timeout: 15_000 })

    // One line, on-plan (qty = plan): the capture path and nothing else.
    const qty = page.getByRole('spinbutton', { name: new RegExp(`Quantity produced for ${ITEM_NAME}`, 'i') })
    await expect(qty).toBeVisible({ timeout: 15_000 })
    await qty.click()
    await qty.fill(String(PLAN_QTY))
    await page.keyboard.press('Tab')

    const submit = page.getByRole('button', { name: /Submit 1 entry/i })
    await expect(submit).toBeEnabled({ timeout: 10_000 })
    await submit.click()
    await expect(
      page.getByRole('status').filter({ hasText: /1 line submitted/i }),
    ).toBeVisible({ timeout: 15_000 })

    // The line appears in the log, attributed to THEM: submitted_by is pinned server-side
    // (policy + default), and the row is back on the page for the barista to see.
    const [landed] = await sql(
      `select l.status, l.qty_porsi::int as qty, l.submitted_by::text as sub
         from ops.kitchen_logs l
        where l.org_id='${ORG}' and l.wip_item_id='${ITEM_ID}' and l.log_date='${today}'`,
    )
    expect(landed).toMatchObject({ status: 'Submitted', qty: PLAN_QTY, sub: BAR_MEMBER.personId })
    // The line is back on the barista's log surface (the form row carries plan · item · activity).
    await expect(page.getByText(ITEM_NAME).first()).toBeVisible({ timeout: 15_000 })

    // ── ACT 2 — Sales (unaffiliated) opens the same surface ──────────────────────────────────
    // RedirectIfAuthed bounces /login while a session is live; clear localStorage to sign out.
    await page.evaluate(() => localStorage.clear())
    await page.waitForTimeout(500)
    await loginAs(page, SALES.email, SALES.password)

    // #781 (OD-WAY-95): /cafe IS the capture list now (the Log). AC-021 repoints this journey.
    await page.goto('cafe')
    await page.waitForURL(/\/cafe$/, { timeout: 15_000 })

    // Read-only, not hidden: the capture form and its item rows render.
    await expect(page.getByText(ITEM_NAME).first()).toBeVisible({ timeout: 15_000 })

    // One line states why capture is closed for her.
    await expect(page.getByRole('status').filter({ hasText: /read Café records/i })).toBeVisible({ timeout: 15_000 })

    // No enabled submit control — the DB would refuse her line regardless (ops_09 owns that).
    await expect(page.getByRole('button', { name: /^Submit/i })).toBeDisabled()
  })
})
