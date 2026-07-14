// AC-001: shell-level navigation journey after the Step-2 IA move.
// Given a provisioned signed-in viewer on Home,
// When they navigate via the rail to Tasks and then reload on /work/tasks,
// Then URL, document.title, breadcrumb, aria-current nav item, and surface-rendered signal
// all match, and the reload lands back on Tasks with those signals intact.
//
// Extended: AC-013 e2e — MANAGER sees "Your team" module; VIEWER does not (FR-017, OD-P0-8).

import { test, expect, type Page } from '@playwright/test'
import { VIEWER, MANAGER } from './fixtures/users'
import { loginAs } from './helpers/login'

async function clearSession(page: Page) {
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

test('AC-001: shell cross-section navigation and reload', async ({ page }) => {
  await page.goto('login')
  await expect(page).toHaveURL(/\/login/)
  await expect(page).toHaveTitle('Gordi MOS — Management OS')

  await loginAs(page, VIEWER.email, VIEWER.password)

  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 })
  await expect(page).toHaveURL(/\/$|\/mos\/?$/)
  await expect(page).toHaveTitle('Home — Gordi MOS')
  await expect(page.getByRole('banner').getByText('Gordi MOS')).toBeVisible()
  await expect(page.locator('header b:text("Home")')).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Home' }),
  ).toHaveAttribute('aria-current', 'page')

  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Tasks' }).click()
  await expect(page).toHaveURL(/\/work\/tasks$/, { timeout: 5_000 })
  await expect(page).toHaveTitle('Tasks — Gordi MOS')
  await expect(page.locator('header b:text("Tasks")')).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Tasks' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('tablist', { name: 'Ownership filter' })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/work\/tasks$/, { timeout: 5_000 })
  await expect(page).toHaveTitle('Tasks — Gordi MOS')
  await expect(page.locator('header b:text("Tasks")')).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Tasks' }),
  ).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('tablist', { name: 'Ownership filter' })).toBeVisible()
})

test('AC-013: team module visible for MANAGER, hidden for VIEWER', async ({ page }) => {
  await loginAs(page, MANAGER.email, MANAGER.password)
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('p').filter({ hasText: /^Your team —/ })).toBeVisible({ timeout: 5_000 })

  await clearSession(page)
  await page.goto('login')
  await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })

  await loginAs(page, VIEWER.email, VIEWER.password)
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('p').filter({ hasText: /^Your team —/ })).not.toBeVisible()
})
