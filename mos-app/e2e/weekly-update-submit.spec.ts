// AC-090: Write → submit → appears Filed in manager review.
// Natural journey: VIEWER (Cahya) writes their weekly update, adds a line with a
// progress marker, submits. Asserts:
//   (a) My Week strip shows "Submitted"
//   (b) MANAGER (Dewi) opens /updates review pane, sees Cahya's row as "Filed"
//       with the summary excerpt.
// Requires live stack (supabase start -x edge-runtime) + global-setup.
// VIEWER (Cahya) holds roles that report to MANAGER (Dewi) via shared.is_manager_of.
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { writeWeeklyUpdate, submitWeeklyUpdate, signOutFromApp, clearWeeklyUpdates } from './helpers/weeklyUpdates'
import { VIEWER, MANAGER } from './fixtures/users'

const SUMMARY = 'Produksi stabil minggu ini — 2 SKU cold brew lolos uji rasa'
const LINE_LABEL = 'Finalisasi menu seasonal Q3'

// Ensure a clean weekly-updates state before each run so tests are deterministic
test.beforeEach(async () => {
  await clearWeeklyUpdates()
})

test('AC-090: author writes, submits → strip shows Submitted, manager sees Filed', async ({ page }) => {
  // ── 1. VIEWER writes and submits their weekly update ───────────────────────
  await loginAs(page, VIEWER.email, VIEWER.password)

  await writeWeeklyUpdate(page, SUMMARY, LINE_LABEL)

  // Change line progress marker to "Done"
  // The ProgressMarkerPicker trigger shows "In progress" initially
  const markerTrigger = page.getByRole('button', { name: /in progress — change progress marker/i })
  await markerTrigger.click()
  // Select "Done" from the listbox
  const doneOption = page.getByRole('option', { name: /^Done$/i })
  await doneOption.click()

  await submitWeeklyUpdate(page)

  // ── 2. Assert: write pane shows locked state with "Submitted" in head ──────
  const writePaneSection = page.getByRole('region', { name: /my weekly update/i })
  // Use exact: true to target only the lifecycle pill ("Submitted"), not "Submitted Thu HH:MM" timestamp
  await expect(writePaneSection.getByText('Submitted', { exact: true })).toBeVisible({ timeout: 5_000 })

  // ── 3. Navigate to My Week and assert the strip shows "Submitted" ──────────
  // MyWeek is the index route at /mos/ (baseURL). Use '.' to navigate there.
  await page.goto('.')
  await page.waitForURL(/\/mos\/?$/, { timeout: 10_000 })

  // The strip section — wait for the submitted state to load.
  // The strip pill says exactly "Submitted"; the sentence says "Submitted on time." / "Submitted late."
  // Use exact: true to target only the pill, not the sentence text.
  const updateStrip = page.locator('[aria-label="My weekly update"]')
  await expect(updateStrip.getByText('Submitted', { exact: true })).toBeVisible({ timeout: 10_000 })

  // ── 4. MANAGER logs in and opens /updates review ───────────────────────────
  // Sign out VIEWER via the UserChip dropdown in the header
  await signOutFromApp(page)

  await loginAs(page, MANAGER.email, MANAGER.password)

  // Navigate to /updates
  await page.goto('updates')
  await page.waitForURL(/\/updates$/, { timeout: 10_000 })

  // ── 5. Assert: manager review pane shows Cahya's row as "Filed" ───────────
  // Wait for the review pane to render (manager sees "Team updates" section)
  const reviewPane = page.locator('[aria-label="Team updates"]')
  await expect(reviewPane).toBeVisible({ timeout: 10_000 })

  // Wait for "Filed" pill to appear (the update is visible to the manager)
  await expect(reviewPane.getByText('Filed')).toBeVisible({ timeout: 15_000 })

  // The summary excerpt should be visible in the roster
  // (excerpt is the first part of the summary)
  await expect(reviewPane.getByText(/Produksi stabil/i)).toBeVisible({ timeout: 5_000 })

  // ── 6. Assert: counts show 1 filed ────────────────────────────────────────
  const counts = reviewPane.getByTestId('review-counts')
  await expect(counts.getByText('1')).toBeVisible({ timeout: 5_000 })
})
