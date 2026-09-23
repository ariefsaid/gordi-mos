// Drives the REAL sign-out affordance (security audit HIGH-2, 2026-07-17).
//
// Prior versions of the auth e2e journeys faked sign-out with a localStorage/sessionStorage
// wipe, which never calls supabase.auth.signOut() and never revokes the refresh token
// server-side — signOut() could be deleted entirely and those tests would still pass.
//
// This helper clicks the identity chip (rail footer on desktop; the phone drawer's chip below
// 920px), accessible-named by the viewer's full name, then the "Sign out" menuitem — the exact
// path a real user takes, which calls handleSignOut (auth-provider.tsx) → supabase.auth.signOut().
import type { Page } from '@playwright/test'

export async function signOutViaUi(page: Page, viewerFullName: string) {
  await page.getByRole('button', { name: viewerFullName, exact: true }).click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()
}
