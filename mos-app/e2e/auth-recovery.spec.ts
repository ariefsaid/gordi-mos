// AC-005: Password-recovery journey (audit L1 regression)
// Given a provisioned Person with a linked auth user,
// When they use "Forgot password?" to request a recovery email, open the link from the local
// mail catcher, and set a new password,
// Then the set-password form is shown (not bounced to home), the new password is saved,
// the user lands on the authenticated home, can sign out, and their OLD password no longer works
// while the NEW password authenticates them successfully (goal-oracle: rotation actually happened).
//
// Uses RECOVERY_VIEWER (e2e.recovery@example.test) — a dedicated fixture so password rotation
// in this test does NOT affect VIEWER's credentials used by other e2e specs.

import { test, expect } from '@playwright/test'
import { RECOVERY_VIEWER } from './fixtures/users'
import { watchInbox, extractAuthLink } from './helpers/mailpit'
import { assertTapFloor, AUTH_CONTROLS, TAP_GAP } from './helpers/tap-floor'

// Rotate to a fresh password each run to avoid previous-run state collisions.
const NEW_PASSWORD = `E2eRecovery${Date.now()}`

test('AC-005: password-recovery journey — link opens set-password form, rotation verified', async ({ page }) => {
  // This test performs a full email round-trip; allow extra time.
  test.setTimeout(120_000)

  // The mail catcher is shared with every other spec, rerun and checkout on this stack, so take a
  // snapshot of it BEFORE asking for the email — the waiter then accepts only a message that was
  // not already there. No inbox clearing: wiping a shared box is what raced other suites (#137).
  const recoveryMail = await watchInbox(RECOVERY_VIEWER.email)

  // ── Step 1: go to login, click "Forgot password?" ────────────────────────
  await page.goto('login')
  // Fill email first — the forgot-password handler validates the email field
  await page.getByLabel('Email').fill(RECOVERY_VIEWER.email)
  const recoveryRequested = page.waitForResponse((r) => r.url().includes('/auth/v1/recover'))
  await page.getByRole('button', { name: /forgot password/i }).click()

  // ── Step 2: confirmation message must appear ──────────────────────────────
  // The confirmation is deliberately NEUTRAL about whether an account exists (AC-006). It is no
  // longer neutral about whether the request succeeded — the page used to show it even when the
  // send was refused, which is how a failed send spent 20s masquerading as a mail-catcher timeout
  // (#137). The status check below names that number outright instead of leaving it to a screenshot.
  await expect(page.getByText(/a reset link is on its way/i)).toBeVisible({ timeout: 5_000 })
  const requestStatus = (await recoveryRequested).status()
  expect(requestStatus, 'the recovery email must actually have been accepted for sending').toBeLessThan(300)

  // ── Step 3: fetch the recovery link from mailpit ──────────────────────────
  const { html, text } = await recoveryMail(20_000)
  const recoveryUrl = extractAuthLink(html, text)

  // ── Step 4: open the recovery link — must land on the set-password form ──
  await page.goto(recoveryUrl)

  // Goal-oracle (audit L1): the set-password form must be visible; the app must NOT
  // redirect the user to / (home) before they set a new password.
  await expect(
    page.getByRole('heading', { name: /set a new password/i }),
  ).toBeVisible({ timeout: 15_000 })
  await expect(page).toHaveURL(/\/recovery/, { timeout: 5_000 })

  // ── GUARD-TAP (#403): the set-password card's phone tap floor ────────────
  // This form is reachable ONLY through the mailpit round-trip above, so its 44×44 + 8px-gap
  // census is measured here rather than in a second copy of this journey (CLAUDE.md § Test
  // pyramid). Sibling auth surfaces are guarded in e2e/guards.geometry.spec.ts.
  await page.setViewportSize({ width: 390, height: 844 })
  await assertTapFloor(page, AUTH_CONTROLS, 'Set-password (recovery link) @390', {
    axes: 'both',
    minGap: TAP_GAP,
    noOverflow: true,
  })
  await page.setViewportSize({ width: 1280, height: 720 })

  // ── Step 5: set the new password ─────────────────────────────────────────
  await page.getByLabel('New password').fill(NEW_PASSWORD)
  await page.getByLabel('Confirm password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: /save password/i }).click()

  // ── Step 6: lands home authenticated ─────────────────────────────────────
  // RECOVERY_VIEWER maps to a dedicated e2e person row (Recovery Tester) — name shown in user chip
  await expect(
    page.getByRole('button', { name: RECOVERY_VIEWER.displayName }),
  ).toBeVisible({ timeout: 15_000 })

  // ── Step 7: sign out via chip menu (chip → menuitem, per FR-006/T-031) ──────
  await page.getByRole('button', { name: RECOVERY_VIEWER.displayName }).click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })

  // ── Step 8 (goal-oracle): old password FAILS ──────────────────────────────
  // Wait for login form to be fully interactive after sign-out
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible({ timeout: 5_000 })
  await page.getByLabel('Email').fill(RECOVERY_VIEWER.email)
  await page.getByLabel('Password').fill(RECOVERY_VIEWER.password) // original e2e-password-123
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 })
  // Must remain on /login — no redirect to home
  await expect(page).toHaveURL(/\/login/)

  // ── Step 9 (goal-oracle): new password WORKS ─────────────────────────────
  await page.getByLabel('Password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(
    page.getByRole('button', { name: RECOVERY_VIEWER.displayName }),
  ).toBeVisible({ timeout: 10_000 })

  // global-setup deletes and re-creates RECOVERY_VIEWER with RECOVERY_VIEWER.password
  // before each run, so password drift across runs is not an issue.
})
