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
// Fixture: beforeAll upserts today plan for Nasi Putih (seed plan dated at seed-time).
// Self-cleaning: afterAll removes all kitchen rows for Nasi Putih today.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { VIEWER, MANAGER } from './fixtures/users'

const __filename = fileURLToPath(import.meta.url)
const __dir      = dirname(__filename)

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
const e2eEnv      = loadEnvFile(resolve(__dir, '../.env.e2e'))
const SUPABASE_URL = e2eEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
const SERVICE_KEY  = e2eEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

const ORG           = '10000000-0000-0000-0000-000000000001'
const NASI_PUTIH_ID = 'a1100000-0000-0000-0000-000000000001'
const PLAN_BY       = '40000000-0000-0000-0000-000000000002'
const PLAN_QTY      = 50

function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return shifted.getUTCFullYear() + '-' + pad(shifted.getUTCMonth() + 1) + '-' + pad(shifted.getUTCDate())
}

async function execSql(query: string): Promise<void> {
  if (!SERVICE_KEY) throw new Error('[AC-090] SUPABASE_SERVICE_ROLE_KEY not set')
  const res = await fetch(SUPABASE_URL + '/pg/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error('[AC-090] SQL failed (' + res.status + '): ' + body.slice(0, 400))
  }
}

test.describe('AC-090: Kitchen log -> review -> approve (cross-stack proof)', () => {
  const today = wibToday()

  test.beforeAll(async () => {
    const sql = 'INSERT INTO ops.kitchen_plans'
      + ' (org_id, log_date, wip_item_id, action_type, qty_porsi, plan_by)'
      + ' VALUES (' + "'" + ORG + "'" + ', ' + "'" + today + "'" + ', ' + "'" + NASI_PUTIH_ID + "'" + ', ' + "'Production'" + ', ' + PLAN_QTY + ', ' + "'" + PLAN_BY + "'" + ')'
      + ' ON CONFLICT (org_id, log_date, wip_item_id, action_type)'
      + ' DO UPDATE SET qty_porsi = ' + PLAN_QTY + ', plan_by = ' + "'" + PLAN_BY + "'"
    await execSql(sql)
    console.log('[AC-090] plan upserted for ' + today)
  })

  test.afterAll(async () => {
    const dp = today.replace(/-/g, '')
    const sqls = [
      "DELETE FROM ops.kitchen_logs WHERE org_id='" + ORG + "' AND log_date='" + today + "' AND wip_item_id='" + NASI_PUTIH_ID + "'",
      "DELETE FROM ops.kitchen_batch_seq WHERE org_id='" + ORG + "' AND prefix='PR' AND log_date='" + today + "'",
      "DELETE FROM integrations.esb_push WHERE org_id='" + ORG + "' AND source_module='kitchen' AND source_ref LIKE 'PR-" + dp + "-%'",
      "DELETE FROM ops.kitchen_stock WHERE org_id='" + ORG + "' AND log_date='" + today + "' AND wip_item_id='" + NASI_PUTIH_ID + "'",
      "DELETE FROM ops.log_entries WHERE org_id='" + ORG + "' AND origin='kitchen' AND (detail::jsonb)->>'wip_item_id'='" + NASI_PUTIH_ID + "'",
      "DELETE FROM ops.kitchen_plans WHERE org_id='" + ORG + "' AND log_date='" + today + "' AND wip_item_id='" + NASI_PUTIH_ID + "'",
    ]
    await execSql(sqls.join('; '))
    console.log('[AC-090] teardown done for ' + today)
  })

  test('AC-090: member submits Nasi Putih Production -> admin approves -> batch_id minted, entry leaves queue', async ({ page }) => {
    test.setTimeout(90_000)

    // ── ACT 1: member (Cahya) logs Nasi Putih Production = 50 ────────────────
    // plan=50 => qty=50 is exactly on-plan => no variance note required (FR-022)
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('kitchen/log')
    await page.waitForURL(/\/kitchen\/log$/, { timeout: 15_000 })

    await expect(
      page.getByRole('table', { name: /kitchen production log/i }),
    ).toBeVisible({ timeout: 15_000 })

    const nasiRow = page.getByRole('row', { name: /Nasi Putih/i })
    await expect(nasiRow).toBeVisible({ timeout: 5_000 })

    const qtyInput = nasiRow.getByRole('spinbutton', { name: /Quantity for Nasi Putih/i })
    await qtyInput.click()
    await qtyInput.fill('50')
    await page.keyboard.press('Tab')

    const submitBtn = page.getByRole('button', { name: /Submit 1 entry/i })
    await expect(submitBtn).toBeEnabled({ timeout: 8_000 })
    await submitBtn.click()

    await expect(
      page.getByRole('status').filter({ hasText: /1 line submitted.*pending review/i }),
    ).toBeVisible({ timeout: 10_000 })

    // ── SIGNOUT: clear Cahya's Supabase session so Dewi can log in ───────────
    // RedirectIfAuthed bounces /login back to / when a session is active.
    // Clearing localStorage removes the session token; the auth listener fires,
    // sets status=unauthenticated, and RedirectIfAuthed lets /login through.
    await page.evaluate(() => localStorage.clear())
    await page.waitForTimeout(500)  // brief pause for auth listener to process

    // ── ACT 2: admin (Dewi) opens the Review queue ─────────────────────────
    await loginAs(page, MANAGER.email, MANAGER.password)
    await page.goto('kitchen/review')
    await page.waitForURL(/\/kitchen\/review$/, { timeout: 10_000 })

    await expect(
      page.getByRole('table', { name: /Production submitted logs/i }),
    ).toBeVisible({ timeout: 15_000 })

    await expect(
      page.getByRole('cell', { name: /Nasi Putih/i }).first(),
    ).toBeVisible({ timeout: 5_000 })

    // ── ACT 3: admin approves ─────────────────────────────────────────────────
    // planQty=50, log.qty_porsi=50 => on-plan => startApprove fires immediately
    const approveBtn = page.getByRole('button', { name: /Approve Nasi Putih/i })
    await expect(approveBtn).toBeEnabled({ timeout: 5_000 })
    await approveBtn.click()

    // ── ASSERT GOAL ────────────────────────────────────────────────────────────
    // approve_kitchen_log RPC minted batch_id; notice shows "Approved · batch PR-<YYYYMMDD>-NNN"
    const dp     = today.replace(/-/g, '')
    const notice = page.getByRole('status').filter({ hasText: /Approved/i })
    await expect(notice).toBeVisible({ timeout: 10_000 })
    await expect(notice).toHaveText(new RegExp('Approved.*batch PR-' + dp + '-\\d{3}', 'i'))

    // Nasi Putih row must have left the Submitted queue on approval success
    await expect(
      page.getByRole('cell', { name: /Nasi Putih/i }),
    ).toHaveCount(0, { timeout: 5_000 })
  })
})
