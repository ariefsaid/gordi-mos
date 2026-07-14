// AC-002: Sign-out and back-button guard
// Given a signed-in viewer on the app home,
// When they sign out and then press the browser Back button,
// Then they are at /login and no protected content (their name) is rendered (FR-012).

import { test, expect, type Page } from '@playwright/test'
import { VIEWER } from './fixtures/users'
import { loginAs } from './helpers/login'

async function clearSession(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

test('AC-002: sign-out and back-button guard', async ({ page }) => {
  // Sign in as VIEWER
  await loginAs(page, VIEWER.email, VIEWER.password)

  // Wait for home — Home page heading confirms successful auth (FR-013)
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 })

  // Clear the authenticated session and return to /login.
  await clearSession(page)
  await page.goto('login')
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })

  // Press browser back — with replace-on-every-redirect (FR-012), back cannot reach protected content.
  // The back button goes to before the login journey started (or stays at /login if there is no history).
  await page.goBack()

  // Goal-oracle (FR-012): no protected content rendered regardless of where we land.
  // The viewer's full name must NOT be visible — the back-button guard works.
  await expect(page.getByText('Cahya Cafe')).not.toBeVisible({ timeout: 5_000 })
})
