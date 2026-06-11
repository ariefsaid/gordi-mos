// AC-001: Password login journey
// Given a provisioned Person with a linked auth user and password,
// When they visit a protected route, are redirected to /mos/login (FR-010), and submit valid credentials,
// Then they land on the My Week home showing the page title and their name in the chip (FR-002/013/017).

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

  // Goal-oracle: My Week home renders (FR-013 page head) + chip shows viewer's name (FR-006)
  await expect(page.getByRole('heading', { name: 'My Week' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Cahya Cafe')).toBeVisible({ timeout: 10_000 })
})
