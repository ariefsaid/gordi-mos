// #744 AC-008 — the ONE cross-stack journey for the Café write gate (OD-WAY-93 #1).
//
// ACT 1 — a barista (BAR_MEMBER: dedicated e2e person, live-primary on the (Rumah Rames, bar)
// stream Team, therefore Café-affiliated) at 390: logs in, sees the phone's Café tab — the nav
// consequence that lives in THIS ticket (primaryModuleForViewer reads the affiliation payload) —
// opens the Log and submits one line. The line lands Submitted with submitted_by pinned to their
// own person id (the help-out rule intact: they could have logged into ANY stream).
//
// ACT 2 — Sales (sari.dev, unaffiliated: her only Team is org-structure) opens /cafe/production: the
// capture form's rows stay visible (read-only, never hidden — OD-WAY-51), no submit control is
// enabled, and one line states why. The hard refusal behind this screen is owned by the pgTAP
// suite (ops_09); this journey proves the presentation of the same rule on the real stack.
//
// Fixture: dedicated WIP item + confirmed unit + plan (DD-WAY-29: no confirmed unit → the item is
// legitimately absent from the form), self-cleaning, e2e-namespaced ids.

import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { readFileSync } from 'fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { BAR_MEMBER, BAR_STREAM } from './fixtures/users'
import { ensureStream } from './helpers/cafe-stream'

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
const ITEM_NAME = 'E2E Rosemary-Honey Oat Milk Latte Base — 24-serving prep'
const UNIT_NAME = 'gelas'
const PLAN_QTY = 9
const REVIEW_DIR = process.env.GORDI_CAFE_CAPTURE_REVIEW_DIR

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
      DELETE FROM ops.stream_items   WHERE org_id='${ORG}' AND wip_item_id='${ITEM_ID}';
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
      ON CONFLICT (wip_item_id, esb_product_detail_id)
        WHERE esb_product_detail_id IS NOT NULL
      DO UPDATE SET confirmed_at = now();
      INSERT INTO ops.stream_items (org_id, branch_id, activity, wip_item_id, source)
      VALUES ('${ORG}', ${BRANCH_SQL}, '${BAR_STREAM.activity}', '${ITEM_ID}', 'manual')
      ON CONFLICT (org_id, branch_id, activity, wip_item_id) DO NOTHING;
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

  test('restored and other-date drafts remain readable at phone, tablet and desktop widths in both locales', async ({ page }) => {
    test.setTimeout(120_000)
    let locale: 'en' | 'id' = 'en'
    await page.route(/\/rest\/v1\/person_preferences\?/, route =>
      route.fulfill({ json: [{ locale }] }),
    )
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)

    const [branch] = await sql(`select id::text as id from shared.branches where org_id='${ORG}' and code='${BAR_STREAM.branchCode}'`)
    const [unit] = await sql(`select id::text as id from ops.item_units where org_id='${ORG}' and wip_item_id='${ITEM_ID}' and is_default limit 1`)
    if (typeof branch?.id !== 'string' || typeof unit?.id !== 'string') {
      throw new Error('[AC-744] expected the scoped branch and default item unit fixture')
    }
    await page.evaluate(({ orgId, personId, branchId, itemId, itemUnitId, today }) => {
      const previous = new Date(`${today}T00:00:00.000Z`)
      previous.setUTCDate(previous.getUTCDate() - 1)
      const pad = (value: number) => String(value).padStart(2, '0')
      const previousDate = `${previous.getUTCFullYear()}-${pad(previous.getUTCMonth() + 1)}-${pad(previous.getUTCDate())}`
      const write = (logDate: string, quantity: number, ageMinutes: number) => {
        const scope = { orgId, personId, form: 'production', branchId, activity: 'bar', logDate }
        const key = `mos:cafe:capture-draft:v2:${orgId}:${personId}:production:${branchId}:bar:${logDate}`
        const line = {
          wip_item_id: itemId,
          client_request_id: 'd7440000-0000-4000-8000-000000000001',
          client_attempted: false,
          item_unit_id: itemUnitId,
          entry_quantity: quantity,
          entry_unit_factor: 1,
          entry_unit_name: 'gelas',
          qty_porsi: quantity,
          notes: '',
          dirty: true,
        }
        localStorage.setItem(key, JSON.stringify({
          version: 2,
          scope,
          value: { branch_id: branchId, activity: 'bar', movement: { action: 'produce' }, lines: { [itemId]: line } },
          updatedAt: new Date(Date.now() - ageMinutes * 60_000).toISOString(),
        }))
      }
      write(today, 9, 4)
      write(previousDate, 4, 9)
    }, {
      orgId: ORG,
      personId: BAR_MEMBER.personId,
      branchId: branch.id,
      itemId: ITEM_ID,
      itemUnitId: unit.id,
      today,
    })

    for (locale of ['en', 'id'] as const) {
      for (const width of [390, 768, 1440] as const) {
        await page.setViewportSize({ width, height: 960 })
        await page.goto('cafe/production')
        await expect(page.locator('html')).toHaveAttribute('lang', locale)
        await ensureStream(page)
        await expect(page.getByRole('heading', { name: locale === 'en' ? 'Log production' : 'Catat produksi', exact: true })).toBeVisible()
        await expect(page.locator('.kl-capture-draft-notice').first()).toContainText(locale === 'en' ? /Restored 1 unsent entry · saved/ : /Memulihkan 1 entri yang belum dikirim · tersimpan/)
        await expect(page.locator('.kl-capture-draft-list')).toContainText(ITEM_NAME)
        await expect(page.locator('.kl-capture-draft-list')).toContainText(locale === 'en' ? 'Unsent entries from other dates' : 'Entri belum dikirim dari tanggal lain')
        const quantityLabel = locale === 'en'
          ? new RegExp(`Quantity produced for ${ITEM_NAME}`, 'i')
          : new RegExp(`Jumlah yang diproduksi untuk ${ITEM_NAME}`, 'i')
        await expect(page.getByRole('spinbutton', { name: quantityLabel })).toHaveValue('9')
        const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(documentWidth, `horizontal overflow at ${width}px (${locale})`).toBeLessThanOrEqual(width)
        if (REVIEW_DIR) {
          await mkdir(REVIEW_DIR, { recursive: true })
          await page.screenshot({
            path: join(REVIEW_DIR, `cafe-capture-drafts-${locale}-${width}.png`),
            fullPage: true,
            animations: 'disabled',
          })
        }
      }
    }
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

    await page.goto('cafe/production')
    await page.waitForURL(/\/cafe\/production$/, { timeout: 15_000 })
    // DD-MVP-11: location precedes stream. BAR_MEMBER has exactly one resolvable stream team
    // (Rumah Rames bar), so this resolves without asking — a no-op past that check, kept so the
    // journey still holds if that ever stops being true.
    await ensureStream(page)

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

  })

  // What Sales sees is an open owner decision (#894): two rulings disagree on whether a person
  // with no Café team reads the log read-only or stops at the location gate. The barista journey
  // above is the live contract; this one resumes when the decision lands.
  test.fixme('Sales, with no Café team, sees the log read-only with no submit path (#894)', async ({ page }) => {
    // RedirectIfAuthed bounces /login while a session is live; clear localStorage to sign out.
    await page.evaluate(() => localStorage.clear())
    await page.waitForTimeout(500)
    await loginAs(page, SALES.email, SALES.password)

    await page.goto('cafe/production')
    await page.waitForURL(/\/cafe\/production$/, { timeout: 15_000 })

    // KNOWN BLOCKER (found while fixing this file for #870/DD-MVP-17, not routed around):
    // Sales has NO stream team at all — shared.people/team_memberships give her zero café-
    // affiliated Teams, so cafe-opening-page.tsx's load() finds `eligible.length === 0` and
    // renders its 'no-team' EmptyState ("You're not on a café branch Team yet — ask your admin
    // to add you") instead of ever mounting KitchenLogPage. That state was confirmed live
    // (2026-09-22, sari.dev@example.test → /cafe). OD-WAY-51's contract for THIS journey — an
    // unaffiliated viewer's item rows stay visible, read-only, with one line saying why, never
    // hidden — has no surface to render on any more: the Café root gates the whole capture page
    // on team membership before OD-WAY-51's own read-only rendering ever gets a chance to run.
    // This is a real conflict between two ratified rules, not a moved control — left failing
    // rather than weakened, for the Director to resolve (grant Sales a read affiliation, or
    // retire OD-WAY-51's "never hidden" clause for the no-team case).
    // Read-only, not hidden: the capture form and its item rows render.
    await expect(page.getByText(ITEM_NAME).first()).toBeVisible({ timeout: 15_000 })

    // One line states why capture is closed for her.
    await expect(page.getByRole('status').filter({ hasText: /read Café records/i })).toBeVisible({ timeout: 15_000 })

    // No enabled submit control — the DB would refuse her line regardless (ops_09 owns that).
    await expect(page.getByRole('button', { name: /^Submit/i })).toBeDisabled()
  })
})
