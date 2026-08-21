// AC-002: Sign-out and back-button guard
// Given a signed-in viewer on the app home,
// When they sign out and then press the browser Back button,
// Then they are at /login and no protected content (their name) is rendered (FR-012).

import { test, expect } from '@playwright/test'
import { VIEWER } from './fixtures/users'
import { loginAs } from './helpers/login'

test('AC-002: sign-out and back-button guard', async ({ page }) => {
  // Sign in as VIEWER
  await loginAs(page, VIEWER.email, VIEWER.password)

  // Wait for home — the document title confirms successful auth (FR-013).
  // STALE (v4): Home's h1 is a time-dependent greeting ("Good afternoon/evening, <name>" — see
  // src/i18n/messages.ts home.greeting.*), so no fixed heading name can match it. The stable
  // anchor is the document title, set unconditionally by useDocumentTitle(t('common.docTitle'))
  // in src/pages/home-page.tsx.
  await expect(page).toHaveTitle('Home — Gordi MOS', { timeout: 10_000 })

  // Sign out via the user chip menu (FR-006 — sign-out now in chip menu, T-031)
  await page.getByRole('button', { name: /cahya cafe/i }).click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()

  // Assert we are at /login after sign-out
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })

  // Press browser back — with replace-on-every-redirect (FR-012), back cannot reach protected content.
  // The back button goes to before the login journey started (or stays at /login if there is no history).
  await page.goBack()

  // Goal-oracle (FR-012): no protected content rendered regardless of where we land.
  // The viewer's full name must NOT be visible — the back-button guard works.
  await expect(page.getByText('Cahya Cafe')).not.toBeVisible({ timeout: 5_000 })
})
