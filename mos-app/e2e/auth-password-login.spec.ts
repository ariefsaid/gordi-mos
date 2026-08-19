// AC-001: Password login journey
// Given a provisioned Person with a linked auth user and password,
// When they visit a protected route, are redirected to /mos/login (FR-010), and submit valid credentials,
// Then they land on Home showing the page title and their name in the chip (FR-002/013/017).

import { test, expect } from '@playwright/test'
import { VIEWER } from './fixtures/users'

test('AC-001: password login journey', async ({ page }) => {
  // Visit a protected route — expect redirect to /login (FR-010)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)

  // Fill in VIEWER credentials
  await page.getByLabel('Email').fill(VIEWER.email)
  await page.getByLabel('Password').fill(VIEWER.password)
  await page.getByRole('button', { name: /sign in/i }).click()

  // Goal-oracle: Home renders (FR-013 page head) + chip shows viewer's name (FR-006).
  // STALE (v4): Home's h1 is a time-dependent greeting ("Good afternoon, Cahya" — see
  // src/i18n/messages.ts home.greeting.*), so no fixed heading name can match it. The stable
  // anchor is the document title, set unconditionally by useDocumentTitle('Home — Gordi MOS')
  // in src/pages/stacked-union-home.tsx.
  await expect(page).toHaveTitle('Home — Gordi MOS', { timeout: 10_000 })
  // user-chip.tsx:71: the viewer identity is the accessible name of the chip button.
  await expect(page.getByRole('button', { name: 'Cahya Cafe' })).toBeVisible({ timeout: 10_000 })
})
