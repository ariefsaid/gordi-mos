// AC-004: Magic-link journey (mailpit :55324)
// Given a provisioned Person with a linked auth user,
// When they request a magic link, the neutral confirmation appears, and they open the link from
// the local mail catcher,
// Then a session is established and the app home shows their full name (FR-003/004).

import { test, expect } from '@playwright/test'
import { VIEWER } from './fixtures/users'
import { waitForEmail, clearMailpit, extractAuthLink } from './helpers/mailpit'

test('AC-004: magic-link journey (mailpit :55324)', async ({ page }) => {
  // Clear inbox to avoid stale mail from prior tests
  await clearMailpit()

  // Use relative URL so Playwright resolves against baseURL (http://localhost:5173/mos/)
  await page.goto('login')

  // Enter email and request magic link
  await page.getByLabel('Email').fill(VIEWER.email)
  await page.getByRole('button', { name: /email me a sign-in link/i }).click()

  // Neutral confirmation must appear (FR-003 / AC-006)
  await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 5_000 })

  // Fetch the email from mailpit and extract the magic link
  const { html, text } = await waitForEmail(VIEWER.email, 15_000)
  const magicUrl = extractAuthLink(html, text)

  // Navigate to the magic link — Supabase processes it and redirects to the app
  await page.goto(magicUrl)

  // Goal-oracle: home shows viewer's full name (Cahya Cafe)
  await expect(page.getByRole('heading', { name: 'Cahya Cafe' })).toBeVisible({ timeout: 15_000 })
})
