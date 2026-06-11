// AC-001: Cross-section navigation journey (shell-level, P1-4)
// Given a provisioned signed-in viewer on My Week,
// When they navigate via the rail to Tasks, then Updates, then Ops, and finally reload on /updates,
// Then at each section: URL, document.title, breadcrumb, aria-current nav item, and surface-rendered signal
// all match, and the reload lands back on Updates with all three signals intact (FR-002/003/005/008/010/011).
//
// Extended: AC-013 e2e — MANAGER sees "Your team" module; VIEWER does not (FR-017, OD-P0-8).

import { test, expect } from '@playwright/test'
import { VIEWER, MANAGER } from './fixtures/users'
import { loginAs } from './helpers/login'

test('AC-001: shell cross-section navigation and reload', async ({ page }) => {
  // --- Pre-login: static HTML title is present on the login page ---
  await page.goto('login')
  await expect(page).toHaveURL(/\/login/)
  await expect(page).toHaveTitle('Gordi MOS — Management OS')

  // --- Setup: sign in and land on My Week ---
  await loginAs(page, VIEWER.email, VIEWER.password)

  // My Week: URL, title, breadcrumb, aria-current, empty state
  await expect(page.getByRole('heading', { name: 'My Week' })).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/$|\/mos\/?$/)
  // Use toHaveTitle for auto-retry (document.title is set by a React effect, not sync with URL)
  await expect(page).toHaveTitle('My Week — Gordi MOS')
  // Breadcrumb "Gordi MOS" prefix — scoped to banner to avoid collision with rail logo
  await expect(page.getByRole('banner').getByText('Gordi MOS')).toBeVisible()
  // Breadcrumb section part
  await expect(page.locator('header b:text("My Week")')).toBeVisible()
  // Rail active item
  const myWeekNavLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'My Week' })
  await expect(myWeekNavLink).toHaveAttribute('aria-current', 'page')

  // --- Navigate to Tasks ---
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Tasks' }).click()
  await expect(page).toHaveURL(/\/tasks$/, { timeout: 5_000 })
  await expect(page).toHaveTitle('Tasks — Gordi MOS')
  await expect(page.locator('header b:text("Tasks")')).toBeVisible()
  const tasksLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Tasks' })
  await expect(tasksLink).toHaveAttribute('aria-current', 'page')
  // The ownership-filter tablist is always present in the TasksPage toolbar,
  // regardless of data (populated, empty, loading) — proves the real Tasks surface rendered.
  await expect(page.getByRole('tablist', { name: 'Ownership filter' })).toBeVisible()

  // --- Navigate to Updates ---
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Updates' }).click()
  await expect(page).toHaveURL(/\/updates$/, { timeout: 5_000 })
  await expect(page).toHaveTitle('Updates — Gordi MOS')
  await expect(page.locator('header b:text("Updates")')).toBeVisible()
  const updatesLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Updates' })
  await expect(updatesLink).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('No weekly updates yet.')).toBeVisible()

  // --- Navigate to Ops ---
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Ops' }).click()
  await expect(page).toHaveURL(/\/ops$/, { timeout: 5_000 })
  await expect(page).toHaveTitle('Ops — Gordi MOS')
  await expect(page.locator('header b:text("Ops")')).toBeVisible()
  const opsLink = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Ops' })
  await expect(opsLink).toHaveAttribute('aria-current', 'page')
  await expect(page.getByText('No ops events yet.')).toBeVisible()

  // --- Deep-link reload on /updates (FR-008) ---
  // Navigate to updates first, then reload
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Updates' }).click()
  await expect(page).toHaveURL(/\/updates$/, { timeout: 5_000 })
  await page.reload()

  // After reload: all three signals should still resolve to Updates
  await expect(page).toHaveURL(/\/updates$/, { timeout: 5_000 })
  await expect(page).toHaveTitle('Updates — Gordi MOS')
  await expect(page.locator('header b:text("Updates")')).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Updates' }),
  ).toHaveAttribute('aria-current', 'page')
})

// AC-013 e2e: MANAGER sees "Your team" module; VIEWER does not (FR-017, OD-P0-8)
test('AC-013: team module visible for MANAGER, hidden for VIEWER', async ({ page }) => {
  // ── MANAGER: signs in → My Week should show "Your team" overline ──
  await loginAs(page, MANAGER.email, MANAGER.password)
  await expect(page.getByRole('heading', { name: 'My Week' })).toBeVisible({ timeout: 10_000 })
  // The team-module overline is a <p> element starting with "Your team —"
  await expect(page.locator('p').filter({ hasText: /^Your team —/ })).toBeVisible({ timeout: 5_000 })

  // Sign out: open the user chip menu first, then click "Sign out" menu item
  await page.getByRole('button', { name: 'Dewi Director' }).click()
  await page.getByRole('menuitem', { name: /sign out/i }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

  // ── VIEWER: signs in → My Week should NOT show "Your team" overline ──
  await loginAs(page, VIEWER.email, VIEWER.password)
  await expect(page.getByRole('heading', { name: 'My Week' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('p').filter({ hasText: /^Your team —/ })).not.toBeVisible()
})
