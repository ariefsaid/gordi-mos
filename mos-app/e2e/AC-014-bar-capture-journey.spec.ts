// AC-014 [e2e] — the bar-capture cross-stack journey (#238, spec docs/specs/bar-capture.spec.md).
//
// THE ONLY e2e IN THE WHOLE FEATURE. Eight tickets of stream substrate, item-units, capture,
// review scoping and movements sit below it in pgTAP and RTL; this is the one place all of it is
// asked to work together on a real stack — real PostgREST, real RLS, the real approval RPC.
//
// AC-014: Given the seeded fixture (six stream Teams, a bar member whose primary Team is a bar
// stream, a supervisor on that stream, confirmed item-units), When the member on a phone-width
// viewport opens capture, logs a production qty against plan, and the stream's supervisor approves
// it, Then the row reaches Approved and appears in the stream's stock net.
//
// WHAT IT IS FOR, precisely: it catches the joins nothing below e2e can. The default stream
// resolving from a Team membership through PostgREST; the DD-WAY-29 gate deciding what the form
// offers; the supervisor's review scoping admitting their own stream's row; the approval RPC
// minting a batch and recomputing THIS stream's stock. A column rename or an RPC signature drift
// anywhere on that path shows up here and only here.
//
// PHONE WIDTH is the member's act, deliberately, and only the member's: capture is phone-first
// (NFR-003) and the review/stock surfaces are desktop-first (OD-WAY-17's two-audience baseline).
//
// Personas (global-setup): BAR_MEMBER + BAR_SUPERVISOR, both live-primary on the (Rumah Rames,
// bar) stream Team. NFR-005: role-shaped names only, never a staff name.
//
// Fixture (beforeAll, self-cleaning): a dedicated WIP item with ONE CONFIRMED item-unit, and a
// plan for the stream/day. The confirmed unit is not optional set-dressing — under DD-WAY-29 an
// item with no confirmed coordinates is ABSENT from the form, and the dev seed confirms none, so
// without this the capture surface is legitimately empty.

import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { loginAs } from './helpers/login'
import { BAR_MEMBER, BAR_SUPERVISOR, BAR_STREAM } from './fixtures/users'

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
// e2e-namespaced ids, so the fixture can never be confused with dev master data.
const ITEM_ID = 'a11e2e00-0000-0000-0000-000000000014'
const ITEM_NAME = 'E2E Bar Drink'
const UNIT_NAME = 'botol'
const PLAN_QTY = 12

// The stream's day, in WIB — the same fixed +7 the pages use (NFR-007).
function wibToday(): string {
  const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
  const shifted = new Date(Date.now() + WIB_OFFSET_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** /pg/query runs as postgres and returns a JSON array of row objects. Local-only. */
async function sql(query: string): Promise<Array<Record<string, unknown>>> {
  if (!SERVICE_KEY) throw new Error('[AC-014] SUPABASE_SERVICE_ROLE_KEY not set — is .env.e2e present?')
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_KEY },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) throw new Error(`[AC-014] SQL failed (${res.status}): ${(await res.text()).slice(0, 500)}`)
  return (await res.json()) as Array<Record<string, unknown>>
}

const BRANCH_SQL =
  `(select b.id from shared.branches b where b.org_id = '${ORG}' and b.code = '${BAR_STREAM.branchCode}')`

test.describe('AC-014: bar capture → approve → stock, one journey on the real stack', () => {
  const today = wibToday()

  test.beforeAll(async () => {
    // Clear this fixture's rows BEFORE building them, not only in afterAll (#278). The ids here are
    // fixed, so an interrupted or killed run leaves logs, stock, plans and batch rows behind — and
    // the retry then reads its own debris as if it were the run's own output. That is the one
    // failure this journey must never have: it is the single cross-stack proof that a capture
    // reaches the database and comes back, so a pass contaminated by a previous attempt proves
    // nothing. Same statements as the teardown, deliberately duplicated rather than shared, so
    // neither hook can be silently weakened without the other being read.
    await resetFixtureRows()

    // The six stream Teams are the seed's (FR-005) — assert the fixture rather than create it, so
    // a seed that shipped a thin catalog fails HERE with a readable message instead of surfacing
    // as a mystery empty dropdown three acts later.
    const streams = await sql(
      `select b.code || '/' || t.activity as pair
         from shared.teams t join shared.branches b on b.id = t.branch_id
        where t.org_id = '${ORG}' and t.archived_at is null order by 1`,
    )
    expect(streams.map(r => r.pair)).toEqual([
      'gordi_hq/bar', 'gordi_hq/kitchen', 'radiant/bar', 'radiant/kitchen',
      'rumah_rames/bar', 'rumah_rames/kitchen',
    ])

    // The item + its CONFIRMED unit. ops._stamp_item_unit_confirmation stamps confirmed_at on the
    // unconfirmed→confirmed transition, so sending it as a non-null marker is enough; confirmed_by
    // lands NULL under this claimless postgres session, which is exactly the system-recorded shape.
    await sql(`
      INSERT INTO ops.wip_items (id, org_id, name, category, flag_active, esb_bom_id, esb_product_detail_id_porsi)
      VALUES ('${ITEM_ID}', '${ORG}', '${ITEM_NAME}', 'Drinks', true, 'BOM-E2E-014', 'PD-E2E-014')
      ON CONFLICT (id) DO UPDATE SET flag_active = true;
      INSERT INTO ops.item_units (org_id, wip_item_id, unit_name, esb_product_detail_id, esb_product_id, is_default, is_transferable, confirmed_at)
      VALUES ('${ORG}', '${ITEM_ID}', '${UNIT_NAME}', 'PD-E2E-014', 'P-E2E-014', true, true, now())
      ON CONFLICT (wip_item_id, unit_name) DO UPDATE SET confirmed_at = now();
    `)

    // The plan the member logs AGAINST (FR-015): the stream's own plan for today.
    await sql(`
      INSERT INTO ops.kitchen_plans
        (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id, qty_porsi, plan_by)
      VALUES ('${ORG}', '${today}', '${ITEM_ID}', ${BRANCH_SQL}, '${BAR_STREAM.activity}', 'produce', NULL,
              ${PLAN_QTY}, '${BAR_SUPERVISOR.personId}')
      ON CONFLICT (org_id, log_date, wip_item_id, branch_id, activity, action, destination_branch_id)
      DO UPDATE SET qty_porsi = ${PLAN_QTY};
    `)
    console.log(`[AC-014] fixture ready for ${today} — ${ITEM_NAME} (${UNIT_NAME}), plan ${PLAN_QTY}`)
  })

  // Delete order matters: children before parents, so a partially-applied previous run cannot
  // leave a row whose parent is already gone.
  async function resetFixtureRows() {
    const dp = today.replace(/-/g, '')
    await sql(`
      DELETE FROM integrations.esb_push WHERE org_id='${ORG}' AND source_module='kitchen' AND source_ref LIKE 'PR-${dp}-%';
      DELETE FROM ops.kitchen_batch_seq WHERE org_id='${ORG}' AND prefix='PR' AND log_date='${today}';
      DELETE FROM ops.kitchen_stock     WHERE org_id='${ORG}' AND wip_item_id='${ITEM_ID}';
      DELETE FROM ops.kitchen_logs      WHERE org_id='${ORG}' AND wip_item_id='${ITEM_ID}';
      DELETE FROM ops.kitchen_plans     WHERE org_id='${ORG}' AND wip_item_id='${ITEM_ID}';
      DELETE FROM ops.item_units        WHERE org_id='${ORG}' AND wip_item_id='${ITEM_ID}';
      DELETE FROM ops.wip_items         WHERE org_id='${ORG}' AND id='${ITEM_ID}';
    `)
  }

  test.afterAll(async () => {
    await resetFixtureRows()
    console.log(`[AC-014] teardown done for ${today}`)
  })

  test('AC-014: a bar member logs production against plan on their own stream; the stream supervisor approves; the row reaches Approved and the stream stock nets it', async ({ page }) => {
    test.setTimeout(120_000)

    // ── ACT 1 — the member, on a phone (NFR-003: capture is phone-first, usable at ≤380px) ────
    await page.setViewportSize({ width: 380, height: 780 })
    await loginAs(page, BAR_MEMBER.email, BAR_MEMBER.password)
    await page.goto('cafe/log')
    await page.waitForURL(/\/cafe\/log$/, { timeout: 15_000 })

    // FR-001 — the surface OPENS on their own stream. Resolved from the live primary Team
    // membership, through the real RPC: nothing in the URL or the click path said "Rumah Rames".
    // FR-005 — and the picker enumerates SIX streams, the whole catalog, switchable (FR-003):
    // the default is a default, not a wall (OD-WAY-49/31).
    const streamPicker = page.getByRole('combobox', { name: /Production stream/i })
    await expect(streamPicker).toBeVisible({ timeout: 15_000 })
    await expect(streamPicker.locator('option')).toHaveCount(6)
    await expect(streamPicker.locator('option:checked')).toHaveText(/Rumah Rames · Bar/i)

    // FR-011 / DD-WAY-29 — the item is on the form because its unit is CONFIRMED, and it carries
    // that unit as fixed master data beside the qty input (FR-020).
    const qty = page.getByRole('spinbutton', { name: new RegExp(`Quantity produced for ${ITEM_NAME}`, 'i') })
    await expect(qty).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(UNIT_NAME, { exact: false }).first()).toBeVisible()

    // ON PLAN, deliberately: qty === plan means no variance note is demanded (FR-014's note gate),
    // so this journey stays about the cross-stack path and not about the note affordance, which
    // the RTL suite owns.
    await qty.click()
    await qty.fill(String(PLAN_QTY))
    await page.keyboard.press('Tab')

    const submit = page.getByRole('button', { name: /Submit 1 entry/i })
    await expect(submit).toBeEnabled({ timeout: 10_000 })
    await submit.click()
    await expect(
      page.getByRole('status').filter({ hasText: /1 line submitted.*pending review/i }),
    ).toBeVisible({ timeout: 15_000 })

    // The row landed on the member's OWN stream, with themselves as submitter (AC-012's contract,
    // here observed end-to-end rather than in a fixture).
    const [landed] = await sql(
      `select l.status, l.activity, l.qty_porsi::int as qty, b.code as branch, l.submitted_by::text as sub
         from ops.kitchen_logs l join shared.branches b on b.id = l.branch_id
        where l.org_id='${ORG}' and l.wip_item_id='${ITEM_ID}' and l.log_date='${today}'`,
    )
    expect(landed).toMatchObject({
      status: 'Submitted', activity: 'bar', qty: PLAN_QTY,
      branch: BAR_STREAM.branchCode, sub: BAR_MEMBER.personId,
    })

    // ── SIGNOUT — clear the member's session so the supervisor can log in ─────────────────────
    // RedirectIfAuthed bounces /login back to / while a session is live; clearing localStorage
    // drops the token and the auth listener releases the route (same manoeuvre as AC-090).
    await page.evaluate(() => localStorage.clear())
    await page.waitForTimeout(500)

    // ── ACT 2 — the stream's supervisor reviews. Desktop width: review is a manager surface ───
    await page.setViewportSize({ width: 1280, height: 900 })
    await loginAs(page, BAR_SUPERVISOR.email, BAR_SUPERVISOR.password)
    await page.goto('cafe/review')
    await page.waitForURL(/\/cafe\/review$/, { timeout: 15_000 })

    // FR-041 — a stream supervisor's queue OPENS on their own stream (a display default), and
    // FR-040 — the row carries decision controls because it is their stream's. A supervisor is on
    // this surface at all only because #236 opened it past ops_lead.
    await expect(
      page.getByRole('table', { name: /Submitted kitchen logs awaiting review/i }),
    ).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('cell', { name: new RegExp(ITEM_NAME, 'i') }).first()).toBeVisible()

    // FR-031 (#238) — the completeness confirmation is on this surface, and the stream's own lead
    // is offered it. It gates nothing: the approval below happens whether or not it is confirmed.
    await expect(
      page.getByRole('group', { name: /item list completeness for this stream/i }),
    ).toContainText(/not confirmed complete yet/i)
    await expect(page.getByRole('button', { name: /confirm the item list is complete/i })).toBeEnabled()

    const approve = page.getByRole('button', { name: new RegExp(`Approve ${ITEM_NAME}`, 'i') })
    await expect(approve).toBeEnabled({ timeout: 10_000 })
    await approve.click()

    // ── ASSERT THE GOAL (1): the row reaches Approved, with a minted batch ────────────────────
    const dp = today.replace(/-/g, '')
    const notice = page.getByRole('status').filter({ hasText: /Approved/i })
    await expect(notice).toBeVisible({ timeout: 15_000 })
    await expect(notice).toHaveText(new RegExp(`Approved.*batch PR-${dp}-\\d{3}`, 'i'))
    await expect(page.getByRole('cell', { name: new RegExp(ITEM_NAME, 'i') })).toHaveCount(0, { timeout: 10_000 })

    const [decided] = await sql(
      `select status, reviewed_by::text as rev, batch_id from ops.kitchen_logs
        where org_id='${ORG}' and wip_item_id='${ITEM_ID}' and log_date='${today}'`,
    )
    // The SUPERVISOR is the recorded reviewer — server-stamped, never sent by the client. This is
    // the cross-stack half of FR-040 that no RTL test can reach.
    expect(decided).toMatchObject({ status: 'Approved', rev: BAR_SUPERVISOR.personId })
    expect(String(decided.batch_id)).toMatch(new RegExp(`^PR-${dp}-\\d{3}$`))

    // ── ASSERT THE GOAL (2): the STREAM's stock net moved (FR-060) ────────────────────────────
    // Scoped to (branch, activity): approval recomputes the balance for this stream and no other.
    const [stock] = await sql(
      `select s.usable_qty::int as qty, s.activity, b.code as branch
         from ops.kitchen_stock s join shared.branches b on b.id = s.branch_id
        where s.org_id='${ORG}' and s.wip_item_id='${ITEM_ID}' and s.log_date='${today}'`,
    )
    expect(stock).toMatchObject({ qty: PLAN_QTY, activity: 'bar', branch: BAR_STREAM.branchCode })

    // ...and it is VISIBLE on the stream's stock surface — the number a person actually reads.
    await page.goto('cafe/stock')
    await page.waitForURL(/\/cafe\/stock$/, { timeout: 15_000 })
    await expect(page.getByRole('combobox', { name: /^Branch$/i })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('combobox', { name: /^Activity$/i })).toHaveValue('bar')
    const stockRow = page.getByRole('row', { name: new RegExp(ITEM_NAME, 'i') })
    await expect(stockRow).toBeVisible({ timeout: 15_000 })
    await expect(stockRow).toContainText(String(PLAN_QTY))

    // FR-061 (CONTEXT.md trap): the central kitchen is never labelled "HQ" on this surface.
    await expect(page.getByText(/\bStok HQ\b/i)).toHaveCount(0)
  })
})
