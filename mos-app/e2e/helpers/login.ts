// Reusable login helper for e2e tests.
import type { Page } from '@playwright/test'

export async function loginAs(page: Page, email: string, password: string) {
  // Use relative URL so Playwright resolves against baseURL (http://localhost:5173/mos/)
  // page.goto('/login') would go to http://localhost:5173/login (404); 'login' → /mos/login
  await page.goto('login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  // Wait for navigation away from /login — authentication + redirect happens asynchronously.
  // This handles both authenticated (→ /) and orphan (→ / then orphan screen) flows.
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 })
}
