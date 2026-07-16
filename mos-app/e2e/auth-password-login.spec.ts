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

  // Goal-oracle: Home renders, and the RESOLVED identity is the actual viewer (MEDIUM-1 —
  // a static "/profile" nav link would pass for any authenticated viewer; the identity chip's
  // accessible name proves FR-006 — resolveViewer returned THIS person — at the e2e layer).
  // Scoped to the chip (not getByText) — the Home dashboard also lists Cahya as a task owner
  // in table cells, which would make an unscoped text match ambiguous.
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('button', { name: VIEWER.fullName, exact: true })).toBeVisible({ timeout: 10_000 })
})
