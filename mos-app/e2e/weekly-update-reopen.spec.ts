// AC-091: Reopen → edit → resubmit, state persists.
// Natural journey: starting from a submitted weekly update (seeded or written inline),
// VIEWER (Cahya) Reopens it, edits the summary and a line, re-Submits.
// Asserts:
//   (a) Update is editable in between (Save draft + Submit visible after Reopen)
//   (b) Locks again on resubmit (Reopen button shown)
//   (c) MANAGER (Dewi) sees the updated summary excerpt in the review pane.
// Requires live stack (supabase start -x edge-runtime) + global-setup.
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { writeWeeklyUpdate, submitWeeklyUpdate, reopenWeeklyUpdate, signOutFromApp, clearWeeklyUpdates } from './helpers/weeklyUpdates'
import { VIEWER, MANAGER } from './fixtures/users'

const INITIAL_SUMMARY   = 'Draft awal — belum final'
const EDITED_SUMMARY    = 'Revisi final — produksi OK dan SOP selesai diupdate'
const LINE_LABEL        = 'Cek SOP mingguan'

// Ensure a clean weekly-updates state before each run so tests are deterministic
test.beforeEach(async () => {
  await clearWeeklyUpdates()
})

test('AC-091: reopen → edit → resubmit, updated content visible to manager', async ({ page }) => {
  // ── 1. VIEWER writes and submits an initial update ─────────────────────────
  await loginAs(page, VIEWER.email, VIEWER.password)

  await writeWeeklyUpdate(page, INITIAL_SUMMARY, LINE_LABEL)
  await submitWeeklyUpdate(page)

  // Confirm locked state
  const writePaneSection = page.locator('[aria-label="My weekly update"]')
  await expect(writePaneSection.getByRole('button', { name: /reopen/i })).toBeVisible({ timeout: 5_000 })

  // ── 2. Reopen the update ───────────────────────────────────────────────────
  await reopenWeeklyUpdate(page)

  // Now editable: Save draft + Submit visible
  await expect(page.getByRole('button', { name: /save draft/i })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('button', { name: /submit update/i })).toBeVisible({ timeout: 5_000 })

  // ── 3. Edit the summary ────────────────────────────────────────────────────
  const summaryField = page.getByLabel(/this week's summary/i)
  await summaryField.clear()
  await summaryField.fill(EDITED_SUMMARY)

  // ── 4. Re-submit ──────────────────────────────────────────────────────────
  await submitWeeklyUpdate(page)

  // Locked again: Reopen visible, Save draft absent
  await expect(page.getByRole('button', { name: /reopen/i })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('button', { name: /save draft/i })).not.toBeVisible()

  // Summary content is preserved in the locked view
  await expect(writePaneSection.getByText(/Revisi final/)).toBeVisible({ timeout: 5_000 })

  // ── 5. Sign out and sign in as MANAGER ────────────────────────────────────
  // Sign out VIEWER via the UserChip dropdown in the header
  await signOutFromApp(page)

  await loginAs(page, MANAGER.email, MANAGER.password)

  // ── 6. Manager sees updated summary excerpt in review pane ─────────────────
  await page.goto('updates')
  await page.waitForURL(/\/updates$/, { timeout: 10_000 })

  const reviewPane = page.locator('[aria-label="Team updates"]')
  await expect(reviewPane).toBeVisible({ timeout: 10_000 })

  // Wait for Filed pill (exact: true to avoid matching "N filed" counts span)
  await expect(reviewPane.getByText('Filed', { exact: true })).toBeVisible({ timeout: 15_000 })

  // The EDITED summary excerpt should be visible (not the initial one)
  await expect(reviewPane.getByText(/Revisi final/i)).toBeVisible({ timeout: 5_000 })
  // The initial summary should NOT appear (it was replaced)
  await expect(reviewPane.getByText(/Draft awal/i)).not.toBeVisible()
})
