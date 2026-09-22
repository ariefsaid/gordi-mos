// Reusable login helper for e2e tests.
import type { Page } from '@playwright/test'

export async function loginAs(page: Page, email: string, password: string) {
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
