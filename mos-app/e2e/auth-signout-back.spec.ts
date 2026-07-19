// AC-002: Sign-out and back-button guard
// Given a signed-in viewer on the app home,
// When they sign out through the REAL affordance (identity chip → "Sign out" menuitem — not a
// localStorage wipe, security audit HIGH-2) and then press the browser Back button, or navigate
// directly to a protected route,
// Then supabase.auth.signOut() has genuinely revoked the session: they land on /login, Back cannot
// reach protected content, and a direct nav to a protected route also bounces to /login (FR-012).

import { test, expect } from '@playwright/test'
import { VIEWER } from './fixtures/users'
import { loginAs } from './helpers/login'
import { signOutViaUi } from './helpers/sign-out'

test('AC-002: sign-out and back-button guard', async ({ page }) => {
  // Sign in as VIEWER
  await loginAs(page, VIEWER.email, VIEWER.password)

  // Wait for home — Home page heading confirms successful auth (FR-013)
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening),/ })).toBeVisible({ timeout: 10_000 })

  // Drive the real sign-out affordance — the rail-footer identity chip → "Sign out" menuitem.
  await signOutViaUi(page, VIEWER.fullName)

  // Goal-oracle 1: the app itself redirects to /login once supabase.auth.signOut() resolves
  // (SIGNED_OUT event → auth-provider sets `unauthenticated` → ProtectedRoute redirects).
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })

  // Press browser back — with replace-on-every-redirect (FR-012), back cannot reach protected content.
  await page.goBack()

  // Goal-oracle 2 (FR-012): no protected content rendered regardless of where we land.
  // The viewer's full name must NOT be visible — the back-button guard works.
  await expect(page.getByText(VIEWER.fullName)).not.toBeVisible({ timeout: 5_000 })

  // Goal-oracle 3: the session was genuinely revoked (not just client-redirected) — a direct
  // navigation to a protected route also bounces to /login, proving there is no live session left
  // to resolve, which a mere localStorage wipe would not distinguish from a real signOut() call.
  await page.goto('work/tasks')
  await expect(page).toHaveURL(/\/login/, { timeout: 5_000 })
})
