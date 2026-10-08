// #1468 / AC-1141 — Finance settles two copied bills with one payment at desktop and phone widths.
// Seams: Finance-authenticated browser controls, reporting/PostgREST reads, the payment RPC/private Storage,
// and the local fixture SQL helper. The out-of-scope Finance-label overlay read is isolated from this journey.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { VIEWER } from './fixtures/users'
import { assertLocalFixtureDatabase, pendingBillsFixtureCleanupSql } from './fixtures/cleanup'
import { localSql } from './helpers/local-sql'
import { localSqlRead } from './helpers/local-sql-read'
import { loginAs } from './helpers/login'
import { isShipGated } from './helpers/ship-gate'

const ORG = '10000000-0000-0000-0000-000000000001'
const FINANCE = { email: 'fitri.dev@example.test', password: VIEWER.password }
const ESB_CODE = 'E2E-1468'
const BRANCH_CODE = 'e2e-1468'
const SOURCE_VERSION = 'e2e-ac-1141-v1'
const SNAPSHOT_AS_OF = '2026-10-08T02:00:00.000Z'
const BATCH_KEY = 'a1468000-0000-4000-8000-000000000001'
const BILL_ONE = 'E2E-PB-1468-001'
const BILL_TWO = 'E2E-PB-1468-002'
const BILL_NUMBERS = [BILL_ONE, BILL_TWO] as const
const AMOUNT_ONE = 135_791.25
const AMOUNT_TWO = 246_802.75
const COUNTERPARTY_NOTE = 'E2E Synthetic Counterparty for the Extended Supply Coordination and Regional Services Department - North District Distribution'
const PROOF_FILE_NAME = 'synthetic-payment-proof.pdf'
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n')
const PROOF_PATH = new RegExp(`^${ORG}/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.pdf$`, 'i')

function wibToday(): string {
  const shifted = new Date(Date.now() + 7 * 60 * 60 * 1000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

function dayFirstToday(): string {
  const today = wibToday()
  return `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)}`
}

function sqlText(value: string): string {
  if (!/^[A-Za-z0-9 .,-]+$/.test(value)) throw new Error('[AC-1141] fixture SQL received unexpected text')
  return `'${value}'`
}

function readEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(readFileSync(fileURLToPath(new URL('../.env.e2e', import.meta.url)), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]))
  } catch {
    return {}
  }
}

const e2eEnv = readEnvFile()
const SUPABASE_URL = e2eEnv.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:44321'
const SERVICE_KEY = e2eEnv.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const PROOF_BUCKET = 'pending-bill-proofs'
let uploadedProofPaths = new Set<string>()

function storageAdmin() {
  assertLocalFixtureDatabase(SUPABASE_URL)
  if (!SERVICE_KEY) throw new Error('[AC-1141] Local fixture service credential is unavailable')
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
}

function rememberProofUploads(page: Page): void {
  page.on('request', (request) => {
    if (request.method() !== 'POST') return
    const url = new URL(request.url())
    const prefix = `/storage/v1/object/${PROOF_BUCKET}/`
    if (!url.pathname.startsWith(prefix)) return
    const path = decodeURIComponent(url.pathname.slice(prefix.length))
    if (PROOF_PATH.test(path)) uploadedProofPaths.add(path)
  })
}

function fixtureCleanupSql(): string {
  return pendingBillsFixtureCleanupSql({
    orgId: ORG,
    esbCode: ESB_CODE,
    branchCode: BRANCH_CODE,
    billNumbers: BILL_NUMBERS,
    snapshotAsOf: SNAPSHOT_AS_OF,
    idempotencyKey: BATCH_KEY,
  })
}

async function fixtureCounts() {
  const [row] = await localSqlRead<{
    bills: number | string
    payments: number | string
    batches: number | string
    snapshots: number | string
  }>(`
    SELECT
      (SELECT count(*) FROM reporting.pending_bills
        WHERE org_id = '${ORG}' AND esb_code = '${ESB_CODE}' AND branch_code = '${BRANCH_CODE}'
          AND source_contract_version = '${SOURCE_VERSION}' AND bill_no IN ('${BILL_ONE}', '${BILL_TWO}')) AS bills,
      (SELECT count(*) FROM mos.pending_bill_payments p
        JOIN reporting.pending_bills b ON b.org_id = p.org_id AND b.esb_code = p.esb_code
          AND b.branch_code = p.branch_code AND b.bill_no = p.bill_no
        WHERE p.org_id = '${ORG}' AND b.esb_code = '${ESB_CODE}' AND b.branch_code = '${BRANCH_CODE}'
          AND b.source_contract_version = '${SOURCE_VERSION}' AND b.bill_no IN ('${BILL_ONE}', '${BILL_TWO}')) AS payments,
      (SELECT count(*) FROM mos.pending_bill_payment_batches
        WHERE org_id = '${ORG}' AND idempotency_key = '${BATCH_KEY}') AS batches,
      (SELECT count(*) FROM reporting.pending_bill_snapshots
        WHERE org_id = '${ORG}' AND snapshot_as_of = '${SNAPSHOT_AS_OF}'
          AND source_contract_version = '${SOURCE_VERSION}' AND bill_count = 2) AS snapshots
  `)
  if (!row) throw new Error('[AC-1141] fixture row counts were unavailable')
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) as {
    bills: number
    payments: number
    batches: number
    snapshots: number
  }
}

async function cleanupFixture(): Promise<void> {
  assertLocalFixtureDatabase(SUPABASE_URL)
  const stored = await localSqlRead<{ proof_path: string | null }>(`
    SELECT DISTINCT p.proof_path
      FROM mos.pending_bill_payments p
      JOIN reporting.pending_bills b ON b.org_id = p.org_id AND b.esb_code = p.esb_code
        AND b.branch_code = p.branch_code AND b.bill_no = p.bill_no
     WHERE p.org_id = '${ORG}' AND b.esb_code = '${ESB_CODE}' AND b.branch_code = '${BRANCH_CODE}'
       AND b.source_contract_version = '${SOURCE_VERSION}' AND b.bill_no IN ('${BILL_ONE}', '${BILL_TWO}')
       AND p.proof_path IS NOT NULL
  `)
  const proofPaths = new Set([...uploadedProofPaths, ...stored.flatMap(({ proof_path }) => proof_path ? [proof_path] : [])])
  for (const path of proofPaths) {
    if (!PROOF_PATH.test(path)) throw new Error('[AC-1141] cleanup found a proof outside its fixture org and key shape')
  }
  if (proofPaths.size > 0) {
    const { error } = await storageAdmin().storage.from(PROOF_BUCKET).remove([...proofPaths])
    if (error) throw new Error(`[AC-1141] proof cleanup failed: ${error.message}`)
  }
  await localSql(fixtureCleanupSql())
  uploadedProofPaths.clear()
}

async function seedFixture(): Promise<void> {
  await localSql(`
    BEGIN;
    INSERT INTO reporting.pending_bill_snapshots
      (org_id, snapshot_as_of, bill_count, window_start, source_contract_version)
    VALUES ('${ORG}', '${SNAPSHOT_AS_OF}', 2, '2026-10-01', '${SOURCE_VERSION}');

    INSERT INTO reporting.pending_bills
      (org_id, esb_code, branch_code, bill_no, sales_no, bill_date, branch_name, branch_id,
       counterparty_note, amount, source_state, source_state_at, first_seen_at, snapshot_as_of,
       source_contract_version)
    VALUES
      ('${ORG}', '${ESB_CODE}', '${BRANCH_CODE}', '${BILL_ONE}', NULL, '2026-10-01', 'E2E Branch 1468', NULL,
       ${sqlText(COUNTERPARTY_NOTE)}, ${AMOUNT_ONE}, 'present', NULL, '${SNAPSHOT_AS_OF}', '${SNAPSHOT_AS_OF}', '${SOURCE_VERSION}'),
      ('${ORG}', '${ESB_CODE}', '${BRANCH_CODE}', '${BILL_TWO}', NULL, '2026-10-02', 'E2E Branch 1468', NULL,
       'E2E Synthetic Counterparty', ${AMOUNT_TWO}, 'present', NULL, '${SNAPSHOT_AS_OF}', '${SNAPSHOT_AS_OF}', '${SOURCE_VERSION}');
    COMMIT;
  `)
}

async function openPendingBills(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height })
  await page.route(/\/rest\/v1\/pending_bill_finance_labels(?:\?|$)/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }))
  await loginAs(page, FINANCE.email, FINANCE.password)
  await page.goto('money/pending-bills')
  await expect(page).toHaveURL(/\/money\/pending-bills$/)
  await expect(page.getByRole('heading', { name: 'Pending bills', exact: true })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Pending bills, oldest first' })).toBeVisible()
}

async function filterToFixtureBranch(page: Page): Promise<void> {
  const branchFilter = page.getByLabel('Branch', { exact: true })
  const openedForSelection = !(await branchFilter.isVisible())
  const filters = page.getByRole('button', { name: /Filters/ })
  if (openedForSelection) {
    await filters.click()
    await expect(filters).toHaveAttribute('aria-expanded', 'true')
  }
  await branchFilter.click()
  await page.getByRole('option', { name: 'E2E Branch 1468', exact: true }).click()
  await expect(branchFilter).toContainText('E2E Branch 1468')
  if (openedForSelection) {
    await filters.click()
    await expect(filters).toHaveAttribute('aria-expanded', 'false')
  }
}

async function selectBothBills(page: Page): Promise<void> {
  for (const billNo of BILL_NUMBERS) {
    await page.getByRole('checkbox', { name: `Select bill ${billNo}` }).check()
  }
  await expect(page.getByRole('region', { name: /2 selected/ })).toBeVisible()
}

async function attachProofAndDate(page: Page): Promise<void> {
  const form = page.getByRole('form', { name: 'Record payment' })
  await form.getByLabel('Cash-in date').fill(dayFirstToday())
  await form.getByLabel('Proof').setInputFiles({
    name: PROOF_FILE_NAME,
    mimeType: 'application/pdf',
    buffer: PDF_BYTES,
  })
  await expect(form.getByText(PROOF_FILE_NAME, { exact: true })).toBeVisible()
  await expect(form.getByRole('button', { name: 'Record payment', exact: true })).toBeEnabled()
}

async function assertPhoneNoOverflow(page: Page): Promise<void> {
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width, 'phone journey must not overflow horizontally').toBeLessThanOrEqual(390)
}

async function assertSettledBills(page: Page): Promise<void> {
  await filterToFixtureBranch(page)
  const paidTab = page.getByRole('tab', { name: 'Paid', exact: true })
  await paidTab.click()
  await expect(paidTab).toHaveAttribute('aria-selected', 'true')
  for (const billNo of BILL_NUMBERS) {
    await expect(page.getByRole('button', { name: `Open bill ${billNo}`, exact: true })).toBeVisible()
  }
  await expect(page.getByRole('button', { name: /^Open bill E2E-PB-1468-/ })).toHaveCount(2)
  await expect(page.getByText('Settled', { exact: true })).toHaveCount(2)
}

async function assertRecordedPayments(cashInDate: string): Promise<void> {
  const [row] = await localSqlRead<{
    count: number | string
    total: string
    dated: number | string
    proofs: number | string
  }>(`
    SELECT count(*) AS count, sum(amount)::numeric(14,2)::text AS total,
           count(DISTINCT cash_in_date) AS dated,
           count(*) FILTER (WHERE proof_path IS NOT NULL) AS proofs
      FROM mos.pending_bill_payments
     WHERE org_id = '${ORG}' AND esb_code = '${ESB_CODE}' AND branch_code = '${BRANCH_CODE}'
       AND bill_no IN ('${BILL_ONE}', '${BILL_TWO}') AND entry_kind = 'payment'
  `)
  expect(row).toMatchObject({ total: '382594.00' })
  expect(Number(row?.count)).toBe(2)
  expect(Number(row?.dated)).toBe(1)
  expect(Number(row?.proofs)).toBe(2)
  const [dateRow] = await localSqlRead<{ cash_in_date: string }>(`
    SELECT min(cash_in_date)::text AS cash_in_date FROM mos.pending_bill_payments
     WHERE org_id = '${ORG}' AND esb_code = '${ESB_CODE}' AND branch_code = '${BRANCH_CODE}'
       AND bill_no IN ('${BILL_ONE}', '${BILL_TWO}') AND entry_kind = 'payment'
  `)
  expect(dateRow?.cash_in_date).toBe(cashInDate)
}

test.describe('AC-1141: Finance records one payment for two pending bills', () => {
  test.skip(isShipGated('/money/pending-bills'), 'ship-gated surface — no route')

  test.beforeEach(async ({ page }) => {
    assertLocalFixtureDatabase(SUPABASE_URL)
    uploadedProofPaths = new Set()
    await cleanupFixture()
    await expect(await fixtureCounts()).toEqual({ bills: 0, payments: 0, batches: 0, snapshots: 0 })
    await seedFixture()
    rememberProofUploads(page)
  })

  test.afterEach(async () => {
    await cleanupFixture()
    const counts = await fixtureCounts()
    expect(counts).toEqual({ bills: 0, payments: 0, batches: 0, snapshots: 0 })
    console.log(`[AC-1141] fixture rows after cleanup: bills=${counts.bills}, payments=${counts.payments}, batches=${counts.batches}, snapshots=${counts.snapshots}`)
  })

  test.afterAll(async () => {
    await cleanupFixture()
    expect(await fixtureCounts()).toEqual({ bills: 0, payments: 0, batches: 0, snapshots: 0 })
  })

  test('desktop: open total and count settle together and stay settled after reload', async ({ page }) => {
    test.setTimeout(120_000)
    await openPendingBills(page, 1440, 960)
    await filterToFixtureBranch(page)
    const summary = page.locator('.pending-bills-summary')
    await expect(summary).toContainText('2 open bills')
    await expect(summary).toContainText('382.594')
    await expect(page.getByText(COUNTERPARTY_NOTE, { exact: true })).toBeVisible()

    await selectBothBills(page)
    await page.getByRole('button', { name: 'Record payment', exact: true }).click()
    const panel = page.getByRole('complementary', { name: `Pending bill ${BILL_ONE}` })
    await expect(panel).toBeVisible()
    const form = page.getByRole('form', { name: 'Record payment' })
    await expect(form).toBeVisible()
    await attachProofAndDate(page)

    const today = wibToday()
    await form.getByRole('button', { name: 'Record payment', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'bills settled' })).toContainText('2 bills settled')

    await expect(summary).toContainText('0 open bills')
    await expect(summary).toContainText(/Rp\s*0/)
    await assertRecordedPayments(today)
    await assertSettledBills(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Pending bills', exact: true })).toBeVisible()
    await filterToFixtureBranch(page)
    await expect(page.locator('.pending-bills-summary')).toContainText('0 open bills')
    await assertSettledBills(page)
  })

  test('phone: the sheet settles the same bills without hiding the list or overflowing', async ({ page }) => {
    test.setTimeout(120_000)
    await openPendingBills(page, 390, 844)
    await assertPhoneNoOverflow(page)
    const summary = page.locator('.pending-bills-summary')
    const filters = page.getByRole('button', { name: /Filters/ })
    await filters.click()
    await expect(filters).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByRole('table', { name: 'Pending bills, oldest first' })).toBeVisible()
    await filterToFixtureBranch(page)
    await expect(summary).toContainText('2 bills')
    await expect(summary).toContainText('382.594')
    await assertPhoneNoOverflow(page)
    await filters.click()
    await expect(filters).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('table', { name: 'Pending bills, oldest first' })).toBeVisible()
    await assertPhoneNoOverflow(page)

    await selectBothBills(page)
    await assertPhoneNoOverflow(page)
    await page.getByRole('button', { name: 'Record payment', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: `Pay 2 bills` })
    await expect(sheet).toBeVisible()
    const form = sheet.getByRole('form', { name: 'Record payment' })
    await expect(form).toBeVisible()
    await assertPhoneNoOverflow(page)

    const today = wibToday()
    await attachProofAndDate(page)
    await assertPhoneNoOverflow(page)
    await form.getByRole('button', { name: 'Record payment', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'bills settled' })).toContainText('2 bills settled')
    await assertPhoneNoOverflow(page)

    await expect(summary).toContainText('0 bills')
    await expect(summary).toContainText(/Rp\s*0/)
    await assertPhoneNoOverflow(page)
    await assertRecordedPayments(today)
    await assertSettledBills(page)
    await assertPhoneNoOverflow(page)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Pending bills', exact: true })).toBeVisible()
    await assertPhoneNoOverflow(page)
    await assertSettledBills(page)
    await assertPhoneNoOverflow(page)
  })

  test('refuses a changed balance while keeping both selected bills', async ({ page }) => {
    test.setTimeout(120_000)
    await openPendingBills(page, 1440, 960)
    await selectBothBills(page)
    await page.getByRole('button', { name: 'Record payment', exact: true }).click()
    const form = page.getByRole('form', { name: 'Record payment' })
    await attachProofAndDate(page)

    await localSql(`
      UPDATE reporting.pending_bills SET amount = ${AMOUNT_TWO + 1}
       WHERE org_id = '${ORG}' AND esb_code = '${ESB_CODE}' AND branch_code = '${BRANCH_CODE}'
         AND bill_no = '${BILL_TWO}' AND source_contract_version = '${SOURCE_VERSION}';
    `)
    await form.getByRole('button', { name: 'Record payment', exact: true }).click()
    await expect(form.getByRole('alert')).toHaveText('Balances changed. Review the selected bills and try again.')
    for (const billNo of BILL_NUMBERS) {
      await expect(page.getByRole('checkbox', { name: `Select bill ${billNo}` })).toBeChecked()
    }
    await expect(page.getByRole('region', { name: /2 selected/ })).toBeVisible()
    const [row] = await localSqlRead<{ count: number | string }>(`
      SELECT count(*) AS count FROM mos.pending_bill_payments
       WHERE org_id = '${ORG}' AND esb_code = '${ESB_CODE}' AND branch_code = '${BRANCH_CODE}'
         AND bill_no IN ('${BILL_ONE}', '${BILL_TWO}')
    `)
    expect(Number(row?.count)).toBe(0)
  })
})
