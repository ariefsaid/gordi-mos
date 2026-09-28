// AC-090 [e2e] — Kitchen log -> review -> approve: cross-stack proof
//
// Proves: docs/specs/kitchen-module.spec.md AC-090
// Member logs a Production entry (on-plan, no note), it appears Submitted in the
// ops_lead queue; ops_lead approves it; batch_id is minted; entry leaves the queue.
//
// WHY: catches column-name / RPC-signature bugs unit tests miss (e.g. log_date 400 bug).
// Real PostgREST + RLS + ops.approve_kitchen_log RPC; no mocking.
//
// Personas: VIEWER=cahya.dev@example.test (member), MANAGER=dewi.dev@example.test (admin)
// Fixture: dedicated e2e-owned item, unit, plan, and captured log IDs for today's stream.
// Self-cleaning: hooks delete only rows belonging to this fixture's fixed IDs.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { VIEWER, MANAGER } from './fixtures/users'
import { assertLocalFixtureDatabase } from './fixtures/cleanup'
import { ensureStream, streamStatement } from './helpers/cafe-stream'

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
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
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
// e2e-namespaced IDs: this item is never shared with seed or another business journey.
const ITEM_ID = 'a11e2e00-0000-0000-0000-000000000090'
const UNIT_ID = 'a11e2e00-0000-0000-0000-000000000091'
const PLAN_ID = 'a11e2e00-0000-0000-0000-000000000092'
const ITEM_NAME = 'E2E Kitchen Dish'
const UNIT_NAME = 'porsi'
const PLAN_BY = '40000000-0000-0000-0000-000000000002'
const PLAN_QTY = 50

// OD-WAY-28: `action_type` is retired as a stored column. A plan belongs to an explicit
// (branch, activity) production stream + movement; this journey exercises Rumah Rames · Kitchen.
const STREAM_BRANCH_ID = '25000000-0000-0000-0000-000000000002'
const STREAM_ACTIVITY = 'kitchen'
const STREAM_LABEL = 'Rumah Rames · Kitchen'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return shifted.getUTCFullYear() + '-' + pad(shifted.getUTCMonth() + 1) + '-' + pad(shifted.getUTCDate())
}

function uuidLiteral(value: string): string {
  if (!UUID.test(value)) throw new Error('[AC-090] fixture SQL received a non-UUID')
  return "'" + value + "'"
}

function batchLiteral(value: string): string {
  if (!/^PR-[0-9]{8}-[0-9]{3}$/.test(value)) throw new Error('[AC-090] fixture SQL received an unexpected batch ID')
  return "'" + value + "'"
}

interface FixtureLog {
  id: string
  batch_id: string | null
}

interface FixtureStock {
  id: string
}

async function execSqlRead<T = Record<string, unknown>>(query: string): Promise<T[]> {
  if (!SERVICE_KEY) throw new Error('[AC-090] SUPABASE_SERVICE_ROLE_KEY not set')
  assertLocalFixtureDatabase(SUPABASE_URL)
  const res = await fetch(SUPABASE_URL + '/pg/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error('[AC-090] SQL failed (' + res.status + '): ' + body.slice(0, 400))
  }
  return (await res.json()) as T[]
}

async function execSql(query: string): Promise<void> {
  await execSqlRead(query)
}

test.describe('AC-090: Kitchen log -> review -> approve (cross-stack proof)', () => {
  const today = wibToday()
  let submittedLogId: string | null = null

  /** Delete only rows discovered under this fixture's dedicated item, plan, and unit IDs. */
  async function cleanupFixtureRows(): Promise<void> {
    const logs = await execSqlRead<FixtureLog>(`
      SELECT id::text AS id, batch_id
        FROM ops.kitchen_logs
       WHERE org_id=${uuidLiteral(ORG)} AND wip_item_id=${uuidLiteral(ITEM_ID)}
    `)
    const stocks = await execSqlRead<FixtureStock>(`
      SELECT id::text AS id
        FROM ops.kitchen_stock
       WHERE org_id=${uuidLiteral(ORG)} AND wip_item_id=${uuidLiteral(ITEM_ID)}
    `)
    const logIds = logs.map(row => row.id)
    const batchIds = logs.flatMap(row => row.batch_id ? [row.batch_id] : [])
    const stockIds = stocks.map(row => row.id)
    logIds.forEach(id => { if (!UUID.test(id)) throw new Error('[AC-090] unexpected fixture log ID') })
    stockIds.forEach(id => { if (!UUID.test(id)) throw new Error('[AC-090] unexpected fixture stock ID') })
    batchIds.forEach(id => { if (!/^PR-[0-9]{8}-[0-9]{3}$/.test(id)) throw new Error('[AC-090] unexpected fixture batch ID') })

    const statements: string[] = []
    if (batchIds.length > 0) {
      statements.push(
        `DELETE FROM integrations.esb_push
          WHERE org_id=${uuidLiteral(ORG)} AND source_module='kitchen'
            AND source_ref IN (${batchIds.map(batchLiteral).join(', ')})`,
      )
    }
    if (stockIds.length > 0) {
      statements.push(
        `DELETE FROM ops.kitchen_stock
          WHERE org_id=${uuidLiteral(ORG)} AND id IN (${stockIds.map(uuidLiteral).join(', ')})`,
      )
    }
    if (logIds.length > 0) {
      statements.push(
        `DELETE FROM ops.kitchen_logs
          WHERE org_id=${uuidLiteral(ORG)} AND id IN (${logIds.map(uuidLiteral).join(', ')})`,
      )
    }
    statements.push(
      `DELETE FROM ops.kitchen_plans WHERE org_id=${uuidLiteral(ORG)} AND id=${uuidLiteral(PLAN_ID)}`,
      `DELETE FROM ops.stream_items WHERE org_id=${uuidLiteral(ORG)} AND wip_item_id=${uuidLiteral(ITEM_ID)}`,
      `DELETE FROM ops.item_units WHERE org_id=${uuidLiteral(ORG)} AND id=${uuidLiteral(UNIT_ID)}`,
      `DELETE FROM ops.wip_items WHERE org_id=${uuidLiteral(ORG)} AND id=${uuidLiteral(ITEM_ID)}`,
    )
    await execSql(statements.join('; '))
  }

  test.beforeAll(async () => {
    // A killed run can leave these fixed IDs behind; clean them before creating this run's rows.
    await cleanupFixtureRows()
    await execSql(`
      INSERT INTO ops.wip_items
        (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi)
      VALUES (${uuidLiteral(ITEM_ID)}, ${uuidLiteral(ORG)}, '${ITEM_NAME}', 'Rice/Staple', true,
              'BOM-E2E-090', 'PD-E2E-090');
      INSERT INTO ops.item_units
        (id, org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id,
         is_default, is_transferable, confirmed_at)
      VALUES (${uuidLiteral(UNIT_ID)}, ${uuidLiteral(ORG)}, ${uuidLiteral(ITEM_ID)}, '${UNIT_NAME}',
              'PD-E2E-090', 'P-E2E-090', true, true, now());
      INSERT INTO ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
      VALUES (${uuidLiteral(ORG)}, ${uuidLiteral(STREAM_BRANCH_ID)}, '${STREAM_ACTIVITY}', ${uuidLiteral(ITEM_ID)}, 'manual');
      INSERT INTO ops.kitchen_plans
        (id, org_id, log_date, wip_item_id, branch_id, activity, action,
         destination_branch_id, qty_porsi, plan_by)
      VALUES (${uuidLiteral(PLAN_ID)}, ${uuidLiteral(ORG)}, '${today}', ${uuidLiteral(ITEM_ID)},
              ${uuidLiteral(STREAM_BRANCH_ID)}, '${STREAM_ACTIVITY}', 'produce', NULL, ${PLAN_QTY},
              ${uuidLiteral(PLAN_BY)});
    `)
    console.log('[AC-090] dedicated fixture ready for ' + today + ' — ' + ITEM_NAME)
  })

  test.afterAll(async () => {
    await cleanupFixtureRows()
    console.log('[AC-090] dedicated fixture teardown done for ' + today)
  })

  test('AC-090: member submits a dedicated Production item -> admin approves -> batch_id minted, entry leaves queue', async ({ page }) => {
    test.setTimeout(90_000)

    // ── ACT 1: member (Cahya) logs the dedicated Production item = 50 ───────
    // plan=50 => qty=50 is exactly on-plan => no variance note required (FR-022)
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('cafe/log')
    // DD-MVP-17: /cafe/log aliases the Café root — the Today capture surface itself.
    await page.waitForURL(/\/cafe$/, { timeout: 15_000 })

    // VIEWER (Cahya, Cafe Ops Lead) has no single resolvable team — DD-MVP-11 asks her for a
    // location first (cafe-opening-page.tsx LocationChoices), then FR-001/002's real explicit
    // stream choice. ensureStream takes both steps, defaulting to Rumah Rames · Kitchen.
    await ensureStream(page)
    await expect(streamStatement(page)).toContainText(STREAM_LABEL)

    await expect(
      page.getByRole('table', { name: /café production log/i }),
    ).toBeVisible({ timeout: 15_000 })

    // Selecting the stream re-fetches its plan/stock before the row becomes visible.
    const fixtureRow = page.getByRole('row', { name: new RegExp(ITEM_NAME, 'i') })
    await expect(fixtureRow).toBeVisible({ timeout: 10_000 })

    const qtyInput = fixtureRow.getByRole('spinbutton', {
      name: new RegExp(`Quantity produced for ${ITEM_NAME}`, 'i'),
    })
    await qtyInput.click()
    await qtyInput.fill(String(PLAN_QTY))
    await page.keyboard.press('Tab')

    const submitBtn = page.getByRole('button', { name: /Submit 1 entry/i })
    await expect(submitBtn).toBeEnabled({ timeout: 8_000 })
    await submitBtn.click()

    await expect(
      page.getByRole('status').filter({ hasText: /1 line submitted.*pending review/i }),
    ).toBeVisible({ timeout: 10_000 })

    // Capture the exact UUID created by the real UI insert. Cleanup never deletes by date/item.
    const landedRows = await execSqlRead<FixtureLog & {
      status: string
      activity: string
      qty: number
      branch: string
      submitted_by: string
    }>(`
      SELECT l.id::text AS id, l.batch_id, l.status, l.activity, l.qty_porsi::int AS qty,
             b.code AS branch, l.submitted_by::text AS submitted_by
        FROM ops.kitchen_logs l
        JOIN shared.branches b ON b.id = l.branch_id
       WHERE l.org_id=${uuidLiteral(ORG)} AND l.wip_item_id=${uuidLiteral(ITEM_ID)}
         AND l.log_date='${today}'
    `)
    expect(landedRows).toHaveLength(1)
    const landed = landedRows[0]
    if (!landed) throw new Error('[AC-090] dedicated log was not returned after submit')
    submittedLogId = landed.id
    expect(submittedLogId).toMatch(UUID)
    expect(landed).toMatchObject({
      status: 'Submitted', activity: STREAM_ACTIVITY, qty: PLAN_QTY,
      branch: 'rumah_rames', submitted_by: VIEWER.personId,
    })

    // ── SIGNOUT: clear Cahya's Supabase session so Dewi can log in ───────────
    await page.evaluate(() => localStorage.clear())
    await page.waitForTimeout(500)

    // ── ACT 2: admin (Dewi) opens the Review queue ─────────────────────────
    await loginAs(page, MANAGER.email, MANAGER.password)
    await page.goto('cafe/review')
    await page.waitForURL(/\/cafe\/review$/, { timeout: 10_000 })

    await expect(
      page.getByRole('table', { name: /Submitted logs awaiting review/i }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      page.getByRole('cell', { name: new RegExp(ITEM_NAME, 'i') }).first(),
    ).toBeVisible({ timeout: 5_000 })

    // ── ACT 3: admin approves ───────────────────────────────────────────────
    const approveBtn = page.getByRole('button', { name: new RegExp(`Approve ${ITEM_NAME}`, 'i') })
    await expect(approveBtn).toBeEnabled({ timeout: 5_000 })
    await approveBtn.click()

    // ── ASSERT GOAL ─────────────────────────────────────────────────────────
    const dp = today.replace(/-/g, '')
    const notice = page.getByRole('status').filter({ hasText: /Approved/i })
    await expect(notice).toBeVisible({ timeout: 10_000 })
    await expect(notice).toHaveText(new RegExp('Approved.*batch PR-' + dp + '-\\d{3}', 'i'))

    await expect(
      page.getByRole('cell', { name: new RegExp(ITEM_NAME, 'i') }),
    ).toHaveCount(0, { timeout: 5_000 })

    // ── ASSERT RPC SIDE-EFFECT: outbox enqueue (FR-070) ──────────────────────
    // The Daily Log mirror remains deferred; this checks the real ESB input contract.
    if (!submittedLogId) throw new Error('[AC-090] submitted log ID was lost before approval assertion')
    const [decided] = await execSqlRead<{
      status: string
      reviewed_by: string
      batch_id: string
    }>(`
      SELECT status, reviewed_by::text AS reviewed_by, batch_id
        FROM ops.kitchen_logs
       WHERE org_id=${uuidLiteral(ORG)} AND id=${uuidLiteral(submittedLogId)}
    `)
    expect(decided).toMatchObject({ status: 'Approved', reviewed_by: MANAGER.personId })
    const batchId = String(decided?.batch_id)
    expect(batchId).toMatch(new RegExp('^PR-' + dp + '-\\d{3}$'))

    const pushRows = await execSqlRead(
      `SELECT target_env FROM integrations.esb_push
        WHERE org_id=${uuidLiteral(ORG)} AND source_module='kitchen' AND source_ref=${batchLiteral(batchId)}`,
    )
    expect(pushRows.length).toBeGreaterThanOrEqual(1)
    // pre-flip safe target (never gkid before the owner-gated flip — FR-081/FR-084)
    expect(String(pushRows[0]?.target_env)).not.toBe('gkid')
  })
})
