// Reusable login helper for e2e tests.
import { readFileSync } from 'fs'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { storageStatePath } from './auth-state'

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
  // page.goto('/login') would go to http://localhost:<port>/login (404); 'login' → /mos/login
  await page.goto('login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  // Wait for navigation away from /login — authentication + redirect happens asynchronously.
  // This handles both authenticated (→ /) and orphan (→ / then orphan screen) flows.
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 })
}

/** Loads the persona's saved session (helpers/auth-state.ts) and waits for the authenticated
 *  shell's nav landmark, not merely the URL: a rejected session still lands on `/`. Falls back to
 *  the form when no state was captured (ORPHAN, RECOVERY_VIEWER) or the session is rejected. */
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
