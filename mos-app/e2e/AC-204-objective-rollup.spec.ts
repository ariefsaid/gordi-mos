import { test, expect } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { AC204 } from './fixtures/tasks'
import { loginAs } from './helpers/login'

/** The app is served under a basename, so every rendered href carries it. */
const href = (path: string) => `/mos${path}`

/**
 * AC-204 — progress rolls up from an Objective to its Projects/Processes and their Tasks, and the
 * viewer can drill from any of the three levels, on the records themselves.
 *
 * The cascade SCREEN is not coming back (OD-WAY-32), so the last case asserts its ABSENCE: a drill
 * that quietly grew a cascade door again would pass every other check here.
 *
 * Every number below is pinned to the fixtures global-setup seeds (`AC204` in fixtures/tasks.ts) —
 * deterministic, not whatever the database happens to hold.
 */
test.describe('AC-204: Objective roll-up and drill', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginAs(page, ADMIN.email, ADMIN.password)
  })

  test('an Objective record carries its count roll-up and drills to both branches', async ({ page }) => {
    await page.goto(`work/objectives?q=${encodeURIComponent(AC204.objective.name)}`)
    await expect(page.getByRole('heading', { name: 'Objectives', level: 1 })).toBeVisible()

    const row = page.locator('.catalog-collection__row', { hasText: AC204.objective.name })
    await expect(row).toHaveCount(1)

    // Count roll-up only — no target, no percentage, no measure (OD-WAY-32).
    const { done, total } = AC204.counts.all
    await expect(row.getByTestId('catalog-progress')).toHaveText(`${done} / ${total} done`)
    await expect(row).not.toContainText('%')

    await row.getByRole('button', { name: `Show relations for ${AC204.objective.name}` }).click()
    const panel = page.getByTestId('catalog-relations')

    // Level 2, the real child, its own count, and a real door to the Projects & Processes record.
    const child = panel.getByRole('link', { name: AC204.launch.name })
    await expect(child).toHaveAttribute('href', href(`/work/projects?q=${encodeURIComponent(AC204.launch.name)}`))
    await expect(panel.locator('li').filter({ hasText: AC204.launch.name }).first()).toContainText('1 / 3 done')

    // The synthetic branch renders rather than hiding the Objective's own Task.
    await expect(panel).toContainText('No Project/Process')

    // Level 3: each Task is a real record door. Follow one — the drill has to actually arrive.
    await panel.getByRole('link', { name: AC204.tasks.launchOpen.title }).click()
    await expect(page).toHaveURL(new RegExp(`/work/tasks/${AC204.tasks.launchOpen.id}`))
  })

  test('a Project/Process record drills UP to its parent Objective', async ({ page }) => {
    await page.goto(`work/projects?q=${encodeURIComponent(AC204.launch.name)}`)
    const row = page.locator('.catalog-collection__row', { hasText: AC204.launch.name })
    await row.getByRole('button', { name: `Show relations for ${AC204.launch.name}` }).click()

    const panel = page.getByTestId('catalog-relations')
    await expect(panel.getByRole('link', { name: AC204.objective.name }))
      .toHaveAttribute('href', href(`/work/objectives?q=${encodeURIComponent(AC204.objective.name)}`))
    await expect(panel).toContainText('1 / 3 done')
  })

  test('a parentless Project/Process shows the (Unlinked) branch, not an empty row', async ({ page }) => {
    await page.goto(`work/projects?q=${encodeURIComponent(AC204.loose.name)}`)
    const row = page.locator('.catalog-collection__row', { hasText: AC204.loose.name })
    await row.getByRole('button', { name: `Show relations for ${AC204.loose.name}` }).click()

    const panel = page.getByTestId('catalog-relations')
    await expect(panel).toContainText('(Unlinked)')
    await expect(panel.getByRole('link', { name: AC204.tasks.orphanLine.title })).toBeVisible()
  })

  test('Mine, grouped by Objective, shows both synthetic branches and no one else\'s work', async ({ page }) => {
    await page.goto('work/tasks?view=my-work&group=objective')
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible()
    await expect(page.getByText(AC204.tasks.launchOpen.title)).toBeVisible()

    // Both synthetic branches render — they hold the work nobody is tracking.
    await expect(page.getByText('No Project/Process').first()).toBeVisible()
    await expect(page.getByText('(Unlinked)').first()).toBeVisible()

    // The Objective hint above a branch title is a real door back up to level 1.
    await expect(page.getByRole('link', { name: AC204.objective.name }).first())
      .toHaveAttribute('href', href(`/work/objectives?q=${encodeURIComponent(AC204.objective.name)}`))

    // Every one of ADMIN's three seeded tasks is here…
    for (const owned of [AC204.tasks.launchDone, AC204.tasks.launchOpen, AC204.tasks.directOnObj]) {
      await expect(page.getByText(owned.title)).toBeVisible()
    }
    // …and the one they neither own nor supervise is not.
    await expect(page.getByText(AC204.tasks.someoneElse.title)).toHaveCount(0)
  })

  test('offers no cascade navigation, and does not overflow a 390px phone', async ({ page }) => {
    for (const path of ['work/objectives', 'work/tasks?view=my-work&group=objective']) {
      await page.goto(path)
      await expect(page.locator('main')).toBeVisible()
      expect(await page.locator('a[href*="cascade"]').count()).toBe(0)
      await expect(page.locator('body')).not.toContainText('Cascade progress')
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    }
  })
})
