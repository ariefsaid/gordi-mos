// E2E helpers for the weekly-update journeys (AC-090, AC-091).
// These helpers navigate the /updates page to write, submit, and reopen updates.
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Page } from '@playwright/test'
import { weekStartISO } from '../../src/lib/week'

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
  } catch {
    return {}
  }
}

const envFile = loadEnvFile(resolve(__dir, '../../.env.e2e'))
const SUPABASE_URL = envFile.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'http://127.0.0.1:55321'
const SERVICE_ROLE_KEY = envFile.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const E2E_ORG_ID = '10000000-0000-0000-0000-000000000001'

/** Get the ISO week-start (Monday WIB) for the current week — same helper as app uses. */
export function currentWeekStart(): string {
  return weekStartISO(new Date(), 0)
}

/**
 * Clear mos.weekly_updates (and items) for the e2e org via service_role pg/query.
 * Call in beforeEach for weekly-update spec files to ensure a clean slate per test.
 */
export async function clearWeeklyUpdates(): Promise<void> {
  if (!SERVICE_ROLE_KEY) {
    console.warn('[clearWeeklyUpdates] SUPABASE_SERVICE_ROLE_KEY not set — skipping clear')
    return
  }
  const res = await fetch(`${SUPABASE_URL}/pg/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY },
    body: JSON.stringify({
      query: `
        DELETE FROM mos.weekly_update_items WHERE org_id = '${E2E_ORG_ID}';
        DELETE FROM mos.weekly_updates WHERE org_id = '${E2E_ORG_ID}';
      `,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`[clearWeeklyUpdates] failed: ${res.status} ${body}`)
  }
}

/**
 * Navigate to /updates and write a weekly update with a summary and one line.
 * Assumes the user is already logged in.
 */
export async function writeWeeklyUpdate(
  page: Page,
  summary: string,
  lineLabelText: string,
): Promise<void> {
  await page.goto('updates')
  await page.waitForURL(/\/updates$/, { timeout: 15_000 })

  // Wait for the write pane section to be visible first (can be in loading skeleton state)
  const writePaneSection = page.locator('section[aria-label="My weekly update"]')
  await writePaneSection.waitFor({ state: 'visible', timeout: 15_000 })

  // If the write pane is in locked (submitted) state, reopen it first.
  // This handles edge cases where clearWeeklyUpdates didn't run or there's leftover state.
  const reopenBtn = page.getByRole('button', { name: /reopen/i })
  const isLocked = await reopenBtn.isVisible().catch(() => false)
  if (isLocked) {
    await reopenBtn.click()
    // Wait for draft state to restore (Save draft button appears)
    await page.getByRole('button', { name: /save draft/i }).waitFor({ state: 'visible', timeout: 10_000 })
    // Also clear existing content so we start fresh
    const existingSummary = page.getByLabel(/this week's summary/i)
    await existingSummary.waitFor({ state: 'visible', timeout: 5_000 })
    await existingSummary.clear()
  }

  // Wait for the write pane to finish loading (summary textarea becomes visible —
  // it is only rendered when loadState === 'ready'; skeleton has no textarea)
  const summaryField = page.getByLabel(/this week's summary/i)
  await summaryField.waitFor({ state: 'visible', timeout: 20_000 })

  // Fill summary
  await summaryField.fill(summary)

  // Add a line
  await page.getByRole('button', { name: /add line/i }).click()
  // Fill the new line text (first textbox matching the label — only one line was added)
  const lineInput = page.getByRole('textbox', { name: /update line text/i }).first()
  await lineInput.fill(lineLabelText)
}

/**
 * Submit the current weekly update (assuming the write pane is already populated).
 * Waits for the pane to transition to the locked/submitted state.
 */
export async function submitWeeklyUpdate(page: Page): Promise<void> {
  await page.getByRole('button', { name: /submit update/i }).click()
  // Wait for locked state — Reopen button appears (button text "Reopen to edit")
  await page.getByRole('button', { name: /reopen/i }).waitFor({ state: 'visible', timeout: 15_000 })
}

/**
 * Reopen a submitted update from the locked state.
 * Waits for the editable state to restore.
 */
export async function reopenWeeklyUpdate(page: Page): Promise<void> {
  await page.getByRole('button', { name: /reopen/i }).click()
  // Wait for editable state — Save draft button appears
  await page.getByRole('button', { name: /save draft/i }).waitFor({ state: 'visible', timeout: 15_000 })
}

/**
 * Sign out the current user via the UserChip dropdown in the app header.
 * The sign-out button is inside a dropdown — this helper opens the chip first.
 * Waits for navigation to /login after sign-out.
 */
export async function signOutFromApp(page: Page): Promise<void> {
  // The UserChip button has aria-haspopup="menu" — target it specifically
  const chipBtn = page.locator('button[aria-haspopup="menu"]')
  await chipBtn.waitFor({ state: 'visible', timeout: 10_000 })
  await chipBtn.click()

  // The dropdown renders a Sign out menu item
  const signOutBtn = page.getByRole('menuitem', { name: /sign out/i })
  await signOutBtn.waitFor({ state: 'visible', timeout: 5_000 })
  await signOutBtn.click()

  // Wait for redirect to /login (full path is /mos/login)
  await page.waitForURL(/\/login/, { timeout: 15_000 })
}
