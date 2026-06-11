// P1-1 smoke: app loads at /mos/ and the login page is reachable.
// With P1-3 auth guards: / redirects to /login for unauthenticated users.
// The title and login form confirm the app bundle loaded correctly.

import { test, expect } from '@playwright/test'

test('loads /mos/ and redirects to login, shows Gordi MOS title', async ({ page }) => {
  await page.goto('/')
  // Auth guard redirects to /login for unauthenticated users (FR-010)
  await expect(page).toHaveURL(/\/login/)
  // Title is set by index.html and persists on all routes
  await expect(page).toHaveTitle('Gordi MOS — Management OS')
  // Login form confirms the auth screen loaded
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
})
