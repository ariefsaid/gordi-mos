// AC-001: Password login journey
// Given a provisioned Person with a linked auth user and password,
// When they visit a protected route, are redirected to /mos/login (FR-010), and submit valid credentials,
// Then they land on the app home showing their full name (FR-002/014/017).

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

  // Goal-oracle: home shows viewer's full name (Cahya Cafe linked to VIEWER.personId)
  await expect(page.getByRole('heading', { name: 'Cahya Cafe' })).toBeVisible({ timeout: 10_000 })
})
