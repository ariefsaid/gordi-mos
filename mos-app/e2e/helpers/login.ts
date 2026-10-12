// Reusable login helper for e2e tests.
import { readFileSync } from 'fs'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { storageStatePath } from './auth-state'
import { assertLocalFixtureDatabase } from '../fixtures/cleanup'

const authEnv = loadEnv('e2e', fileURLToPath(new URL('../..', import.meta.url)), 'VITE_')

interface SavedCookie {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

interface SavedStorageState {
  cookies: SavedCookie[]
  origins: Array<{ origin: string; localStorage: Array<{ name: string; value: string }> }>
}

function loadSavedState(email: string): SavedStorageState | null {
  try {
    return JSON.parse(readFileSync(storageStatePath(email), 'utf-8')) as SavedStorageState
  } catch {
    return null
  }
}

async function savedSessionIsLive(page: Page, entries: Array<{ name: string; value: string }>, email: string) {
  let token: unknown
  try {
    token = JSON.parse(entries[0]?.value ?? '{}').access_token
  } catch {
    return false
  }
  if (typeof token !== 'string' || !token) return false
  const url = authEnv.VITE_SUPABASE_URL
  assertLocalFixtureDatabase(url)
  const response = await page.request.get(`${url}/auth/v1/user`, {
    headers: { apikey: authEnv.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  })
  if ([401, 403].includes(response.status())) return false
  if (!response.ok()) throw new Error(`Saved sign-in validation failed (${response.status()})`)
  return (await response.json()).email === email
}

/** Drives the real sign-in form. The fallback path when no saved session exists (or the app
 *  rejected one), and the one journey (auth-password-login.spec.ts) that must always use it. */
export async function loginViaForm(page: Page, email: string, password: string) {
  // A goto() to a URL the page is ALREADY on (e.g. a test that signed out mid-test — its
  // ProtectedRoute bounce SPA-navigates here with `state: {from: '<the route it was on>'}` —
  // then calls loginAs again on the same page) reloads the SAME history entry rather than
  // pushing a fresh one, so react-router's `location.state` survives the reload — proven by a
  // real run, not assumed. RedirectIfAuthed reads that state to decide where the NEXT sign-in
  // lands, so an uncleared `from` would silently carry the PREVIOUS session's route into a
  // different user's login. A page.evaluate() after goto is too late (react-router has already
  // captured history.state into its own React state by then), so this detaches through a
  // neutral URL first whenever the page is already sitting on /login — an ordinary fresh-page
  // call never touches this branch.
  if (/\/login(?:[?#]|$)/.test(page.url())) await page.goto('about:blank')
  // Use relative URL so Playwright resolves against baseURL (worktree-derived port, #419)
  // page.goto('/login') would leave a configured sub-path; 'login' stays under the app base.
  await page.goto('login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  // Wait for navigation away from /login — authentication + redirect happens asynchronously.
  // This handles both authenticated (→ /) and orphan (→ / then orphan screen) flows.
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 })
}

/** Validates the persona's saved session with the auth server before reusing it, then waits for
 *  the shell landmark. Falls back to the form for missing or revoked sessions. */
export async function loginAs(page: Page, email: string, password: string) {
  const saved = loadSavedState(email)
  if (!saved) {
    console.warn(`[loginAs] no saved session for ${email} — signing in via the form`)
    await loginViaForm(page, email, password)
    return
  }

  // Only the session: the capture also recorded app preferences (locale, theme), and a spec's own
  // init script setting those must win.
  const entries = saved.origins.flatMap((origin) => origin.localStorage).filter(({ name }) => /^sb-.*-auth-token$/.test(name))
  if (!await savedSessionIsLive(page, entries, email)) {
    console.warn('[loginAs] saved session is no longer live — signing in again')
    await loginViaForm(page, email, password)
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 8_000 })
    await page.context().storageState({ path: storageStatePath(email) })
    return
  }
  // Written on a same-origin document, not through an init script: an init script outlives this
  // sign-in and would re-inject this persona over a later one on the same page.
  await page.goto('login')
  await page.evaluate((items) => {
    for (const { name, value } of items) window.localStorage.setItem(name, value)
  }, entries)
  if (saved.cookies.length > 0) await page.context().addCookies(saved.cookies)
  await page.goto('')

  try {
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 8_000 })
  } catch {
    console.warn(`[loginAs] saved session for ${email} was rejected — falling back to the sign-in form`)
    await loginViaForm(page, email, password)
    // A sign-out elsewhere revoked the shared session; the fresh one serves the specs that follow.
    await page.context().storageState({ path: storageStatePath(email) })
  }
}
