// AC-091: needs-attention entry → My Week ops strip amber; archive → leaves feed + strip clears
// Natural journey: viewer adds an entry with "Needs attention" on → goes to My Week and sees the
// ops strip turn amber → archives the entry from /ops → it leaves the default feed → strip clears.
// Asserts the GOAL: needs-attention signal propagates to the ops strip and archive removes it.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'
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
  // Clean up any leftover ops.log_entries from previous e2e runs (idempotent)
  if (!SERVICE_ROLE_KEY) return
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'ops' },
  })
  await admin.schema('ops').from('log_entries').delete().eq('org_id', ORG_ID)
})

test('AC-091: needs-attention entry → strip amber → archive → leaves feed and strip clears', async ({ page }) => {
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

  // ── 4. Navigate to My Week → ops strip should be amber ──────────────────────
  await page.goto('')  // root = My Week
  await page.waitForURL(/\/$|\/mos\/?$/)

  // Strip shows amber pill with "today" count and "needs attention" sentence
  const opsStrip = page.getByRole('region', { name: 'Today on the Daily Log' })
  await expect(opsStrip).toBeVisible({ timeout: 8_000 })

  // The amber pill has data-ops-attn="true"
  const amberPill = opsStrip.locator('[data-ops-attn="true"]')
  await expect(amberPill).toBeVisible({ timeout: 8_000 })

  // Sentence says "something needs attention"
  await expect(opsStrip.getByText(/something needs attention/i)).toBeVisible({ timeout: 5_000 })

  // Link says "See what needs attention →"
  await expect(opsStrip.getByRole('link', { name: /See what needs attention/i })).toBeVisible()

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

  // ── 8. Navigate to My Week → strip amber should have cleared ──────────────
  await page.goto('')
  await page.waitForURL(/\/$|\/mos\/?$/)

  const opsStripAfter = page.getByRole('region', { name: 'Today on the Daily Log' })
  await expect(opsStripAfter).toBeVisible({ timeout: 8_000 })

  // No amber pill (data-ops-attn should be absent/undefined)
  const amberPillAfter = opsStripAfter.locator('[data-ops-attn="true"]')
  await expect(amberPillAfter).not.toBeVisible({ timeout: 5_000 })
})
