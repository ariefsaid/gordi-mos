// AC-091: needs-attention entry gets amber treatment in the Daily Log feed; archive removes it.
//
// STALE (v4 Home retirement): the original journey continued past /ops into "My Week" to check a
// `<section aria-label="Today on the Daily Log">` amber strip. That surface was MyWeekPanel/OpsStrip
// (src/components/weekly/my-week-panel.tsx), part of the Home v1 KPI-row composition. Home v1 was
// retired by #191 (src/config/features.ts, the SHOW_FOLLOWUPS comment): "the `/` index route now
// always renders the ported (v4) HomePage" — the region/attention design, not MyWeekPanel. Confirmed
// by source: MyWeekPanel is reachable only from the DEV-only `/__home-stacked` preview
// (src/pages/stacked-union-home.tsx, unrouted for real viewers) — `/` renders src/pages/home-page.tsx,
// which has no "Daily Log" text and no ops-strip anywhere. There is no v4 equivalent this signal
// propagates to; the strip concept did not move, it was cut with Home v1. DESIGN.md ¶"Ops Log
// tokens" still documents the amber-strip token, but nothing live renders it — a doc that wants its
// own follow-up, not a reason to assert against dead markup.
//
// What remains real and provable: the /ops feed's own amber row treatment (data-attn) and archive
// removing/restoring the entry from the default feed — both still live on the current Daily Log
// page (ops-page.tsx) and asserted below. The My Week propagation half of the original AC is
// retired along with its surface; if Home ever grows a needs-attention signal again, it needs a new
// assertion pointed at wherever that lands, not a resurrection of this locator.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'
import { SHOW_DAILY_LOG } from '../src/config/features'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

function loadEnvFile(path: string): Record<string, string> {
  try {
    const content = readFileSync(path, 'utf-8')
    const vars: Record<string, string> = {}
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      vars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
    return vars
  } catch { return {} }
}

const envFile = loadEnvFile(resolve(__dir, '../.env.e2e'))
const SUPABASE_URL = envFile.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321'
const SERVICE_ROLE_KEY = envFile.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ORG_ID = '10000000-0000-0000-0000-000000000001'

test.beforeEach(async () => {
  // Daily Log is flag-hidden for the first rollout (config/features.ts); skip while hidden.
  test.skip(!SHOW_DAILY_LOG, 'Daily Log section is flag-hidden (config/features.ts)')
  // Clean up any leftover ops.log_entries from previous e2e runs (idempotent)
  if (!SERVICE_ROLE_KEY) return
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'ops' },
  })
  await admin.schema('ops').from('log_entries').delete().eq('org_id', ORG_ID)
})

test('AC-091: needs-attention entry gets amber row treatment → archive removes it from the default feed', async ({ page }) => {
  // ── 1. Login and create a needs-attention entry ────────────────────────────
  await loginAs(page, VIEWER.email, VIEWER.password)

  await page.goto('ops')
  await page.waitForURL(/\/ops$/)

  const addLink = page.getByRole('link', { name: /add log entry/i }).first()
  await expect(addLink).toBeVisible({ timeout: 8_000 })
  await addLink.click()

  await page.waitForURL(/\/ops\/new$/)

  const entryTitle = `AC-091 Needs Attention ${Date.now()}`

  // Ensure BU is selected
  const buSelect = page.getByLabel(/business unit/i)
  await expect(buSelect).toBeVisible()
  const buValue = await buSelect.inputValue()
  if (!buValue) {
    const firstOption = buSelect.locator('option').nth(1)
    const optVal = await firstOption.getAttribute('value')
    if (optVal) await buSelect.selectOption(optVal)
  }

  await page.getByLabel(/title/i).fill(entryTitle)

  // ── 2. Toggle "Needs attention" ────────────────────────────────────────────
  const naCheckbox = page.getByLabel(/needs attention/i)
  await expect(naCheckbox).toBeVisible()
  await naCheckbox.check()
  // Amber hint appears
  await expect(page.getByText(/amber warning signal/i)).toBeVisible()

  const submitBtn = page.getByRole('button', { name: /add log entry/i })
  await expect(submitBtn).toBeEnabled()
  await submitBtn.click()

  // ── 3. Back in the feed — assert entry shows amber tint (left rule) ────────
  await page.waitForURL(/\/ops$/, { timeout: 10_000 })
  await expect(page.getByText(entryTitle)).toBeVisible({ timeout: 10_000 })

  // The row has data-attn="true" (amber treatment)
  const attnRow = page.locator('[data-attn="true"]', { hasText: entryTitle })
  await expect(attnRow).toBeVisible()

  // ── 4. [REMOVED] My Week ops-strip check — see file header. The strip's home,
  // MyWeekPanel/OpsStrip, is retired along with Home v1 (#191); `/` renders v4 HomePage, which has
  // no "Today on the Daily Log" region to assert against.

  // ── 5. Go back to /ops and archive the entry ──────────────────────────────
  await page.goto('ops')
  await page.waitForURL(/\/ops$/)
  await expect(page.getByText(entryTitle)).toBeVisible({ timeout: 8_000 })

  // Archive button (⋯ ghost button on the row)
  const entryRow = page.locator('li', { hasText: entryTitle })
  const archiveBtn = entryRow.getByRole('button', { name: /archive/i })
  await expect(archiveBtn).toBeVisible()
  await archiveBtn.click()

  // ── 6. Assert GOAL: entry leaves the default feed (archived = hidden by default) ──
  await expect(page.getByText(entryTitle)).not.toBeVisible({ timeout: 8_000 })

  // ── 7. Optional: assert it reappears with "Show archived" toggle ──────────
  const toggle = page.getByLabel(/show archived/i)
  await toggle.check()
  await expect(page.getByText(entryTitle)).toBeVisible({ timeout: 5_000 })
  // "Archived" tag visible on the row
  await expect(page.locator('li', { hasText: entryTitle }).getByText('Archived')).toBeVisible()

  // Turn archived back off so the entry is hidden again
  await toggle.uncheck()
  await expect(page.getByText(entryTitle)).not.toBeVisible({ timeout: 5_000 })

  // ── 8. [REMOVED] My Week ops-strip clear check — same retirement as step 4 above.
})
