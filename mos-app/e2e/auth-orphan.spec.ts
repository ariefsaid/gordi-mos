// AC-003: Orphan blocked screen
// Given an auth user with valid credentials but no linked shared.people row,
// When they sign in,
// Then they see the blocked screen ("contact Arief"), no app navigation, and sign-out returns
// them to /login (FR-016, OD-P1-10).

import { test, expect } from '@playwright/test'
import { ORPHAN } from './fixtures/users'
import { loginAs } from './helpers/login'

test('AC-003: orphan blocked screen', async ({ page }) => {
  // Sign in as ORPHAN (no people link → no person_id claim)
  await loginAs(page, ORPHAN.email, ORPHAN.password)

  // Goal-oracle: orphan screen — match the specific body text (not the footer "Contact Arief")
  await expect(page.getByText(/your account isn't set up yet/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/contact Arief to get set up/i)).toBeVisible()

  // Protected content (a named viewer heading) must NOT be rendered
  await expect(page.getByRole('heading', { name: 'Cahya Cafe' })).not.toBeVisible()

  // Sign-out from orphan screen returns to /login
  await page.getByRole('button', { name: /sign out/i }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })
})
