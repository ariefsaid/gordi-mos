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
    // The W1-4 cascade fold renders the parent objective as a group HINT on EACH of its
    // work-line groups (single-level fold onto the shared DataTable), so "Operational Excellence"
    // legitimately appears once per child work-line. .first() scopes the journey step; the
    // goal — the objective is visible — stays intact.
    await expect(page.getByText('Operational Excellence').first()).toBeVisible()
    await expect(page.getByText('Daily IG Content').first()).toBeVisible()
    await expect(page.getByText('AC-305 linked task')).toBeVisible()

    // The Mine/All ownership filter is the shared CutToggle segmented control, which renders
    // role="tab" inside a tablist (proper ARIA for a mutually-exclusive switch + roving
    // tabindex). The journey step targets the tab, not a plain button; goal (narrow to Mine) intact.
    await page.getByRole('tab', { name: 'Mine' }).click()

    await expect(page.getByRole('status', { name: 'Workload summary' })).toBeVisible()
    await expect(page.getByText('AC-305 linked task')).toBeVisible()
    // "(Unlinked)" is the synthetic objective hint for objective-less tasks; like
    // "Operational Excellence" above, the fold renders it once per child work-line
    // group (here two: the AC-305 unlinked-task group + the no-objective Archiveable
    // task group) — .first() scopes the step, goal (the Unlinked branch renders) intact.
    await expect(page.getByText('(Unlinked)').first()).toBeVisible()
    await expect(page.getByText('AC-305 unlinked task')).toBeVisible()
    await expect(page.getByText('No Project/Process').first()).toBeVisible()
    await expect(page.getByText('AC-305 no work line task')).toBeVisible()
  })
})
