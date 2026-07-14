// AC-411: catalog is Work's manage-mode after the Step-2 IA move.
// The goal-oracle is unchanged: Objectives manage-mode remains reachable and its
// down-trace renders real data. Only the navigation journey changed with the
// deliberate IA reroute (Work child + /objectives redirect → /work/objectives).

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'

test.describe('AC-411: catalog is Work\'s manage-mode', () => {
  test('admin: Work → Objectives → /work/objectives with down-trace', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Objectives' }).click()
    await expect(page).toHaveURL(/\/work\/objectives$/)
    await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()

    const trace = page.getByTestId('catalog-trace').first()
    await expect(trace).toBeVisible({ timeout: 10_000 })
    await expect(trace).toHaveText(/\d+\s+task/i)
  })

  test('a direct visit to the retired /objectives redirects to /work/objectives', async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)

    await page.goto('objectives')
    await expect(page).toHaveURL(/\/work\/objectives$/)
    await expect(page.getByRole('heading', { name: 'Objectives' })).toBeVisible()
  })
})
