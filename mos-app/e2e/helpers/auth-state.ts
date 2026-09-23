// Per-persona Playwright storage state (#903).
//
// The full e2e battery used to sign every persona in through the real form, once per test that
// needed them — two hundred-odd `/auth/v1/token` calls in one run, well past local Supabase's
// `[auth.rate_limit] sign_in_sign_ups = 30` per 5 minutes. Late in a run the form's sign-in
// starts 429ing and `loginAs` times out waiting to leave /login.
//
// global-setup signs each persona in ONCE (via captureStorageState, driving the real form) and
// saves the resulting localStorage/cookies here; loginAs (helpers/login.ts) then injects that
// state instead of posting the form again. Sessions expire, so global-setup regenerates every
// file on every run rather than trusting a stale one from a previous run.
import { mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { Browser, Page } from '@playwright/test'
import { expect } from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)

// Gitignored (mos-app/.gitignore) — these are live sessions, not fixtures.
export const AUTH_STATE_DIR = resolve(__dir, '../.auth')

export function storageStatePath(email: string): string {
  return resolve(AUTH_STATE_DIR, `${email}.json`)
}

/** The landmark that proves a page loaded already authenticated — present in both the desktop
 *  rail and the phone bottom-tab-bar (both render `<nav aria-label="Primary">`), so it works
 *  regardless of which regime the capturing viewport happens to be in. */
async function waitForAuthenticatedShell(page: Page): Promise<void> {
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 15_000 })
}

/**
 * Signs one persona in through the real form (in a throwaway context, closed before returning)
 * and writes the resulting storage state to `.auth/<email>.json`. Called from global-setup only
 * — every other consumer reads the file via loginAs.
 */
export async function captureStorageState(
  browser: Browser,
  baseURL: string,
  email: string,
  password: string,
): Promise<void> {
  mkdirSync(AUTH_STATE_DIR, { recursive: true })
  const context = await browser.newContext({ baseURL })
  try {
    const page = await context.newPage()
    await page.goto('login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await waitForAuthenticatedShell(page)
    await context.storageState({ path: storageStatePath(email) })
  } finally {
    await context.close()
  }
}
