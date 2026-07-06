import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

// AC-305 (Work-spine v1): the everyone-cascade journey. Fixtures are seeded deterministically by
// global-setup.ts (e2e/fixtures/tasks.ts → CASCADE) — no runtime /pg/query seeding here. The
// journey + goal assertions are unchanged from the plan: VIEWER opens Work → Cascade on phone,
// sees the org ladder, narrows to Mine, and the (Unlinked) / No Project/Process branches render
// rather than hiding tasks.

test.describe('AC-305: everyone cascade journey', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('member can open Work → Cascade and narrow to Mine on phone', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)

    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
    await page.getByRole('button', { name: /open navigation/i }).click()
    await page.getByRole('dialog').getByRole('link', { name: 'Cascade' }).click()

    await expect(page).toHaveURL(/\/work\/cascade$/)
    await expect(page.getByRole('heading', { name: 'Work cascade' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Operational Excellence')).toBeVisible()
    await expect(page.getByText('Daily IG Content').first()).toBeVisible()
    await expect(page.getByText('AC-305 linked task')).toBeVisible()

    await page.getByRole('button', { name: 'Mine' }).click()

    await expect(page.getByRole('status', { name: 'Workload summary' })).toBeVisible()
    await expect(page.getByText('AC-305 linked task')).toBeVisible()
    await expect(page.getByText('(Unlinked)')).toBeVisible()
    await expect(page.getByText('AC-305 unlinked task')).toBeVisible()
    await expect(page.getByText('No Project/Process').first()).toBeVisible()
    await expect(page.getByText('AC-305 no work line task')).toBeVisible()
  })
})
