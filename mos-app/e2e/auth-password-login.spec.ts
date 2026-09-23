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
  // anchor is the document title, set unconditionally by useDocumentTitle(t('common.docTitle'))
  // in src/pages/home-page.tsx.
  await expect(page).toHaveTitle('Home — Gordi MOS', { timeout: 10_000 })
  // user-chip.tsx:71: the viewer identity is the accessible name of the chip button.
  await expect(page.getByRole('button', { name: 'Cahya Cafe' })).toBeVisible({ timeout: 10_000 })
})

// AC-011 (#799): sign-in returns the person to the route they asked for.
// Given a signed-out person on a phone who opens a deep link into Tasks,
// When they are bounced to /login and sign in,
// Then they land on the route they asked for — not Home.
test('AC-011: sign-in returns to the route that was asked for, at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  // The deep link. Relative so Playwright resolves it under the /mos base (#419).
  await page.goto('work/tasks')
  await expect(page).toHaveURL(/\/login/)

  // The dev-only one-click persona is the fastest real sign-in on this surface.
  await page.getByRole('button', { name: 'Finance' }).click()

  // Goal-oracle: the route asked for, not Home.
  await expect(page).toHaveURL(/\/work\/tasks$/, { timeout: 10_000 })
  await expect(page).toHaveTitle('Tasks — Gordi MOS', { timeout: 10_000 })
})

// The other half of the same rule: arriving at /login directly remembers nothing, so Home is
// where sign-in lands.
test('AC-011: a direct sign-in with nothing remembered lands on Home', async ({ page }) => {
  await page.goto('login')
  await page.getByRole('button', { name: 'Finance' }).click()

  await expect(page).toHaveTitle('Home — Gordi MOS', { timeout: 10_000 })
})
