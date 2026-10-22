import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER, VIEWER } from './fixtures/users'

const PHONE = { width: 390, height: 844 }
const DESKTOP = { width: 1440, height: 960 }
const WORK_COLLECTIONS = [
  { path: 'work/signals', label: 'Signals' },
  { path: 'work/tasks', label: 'Tasks' },
  { path: 'work/projects', label: 'Projects & Processes' },
  { path: 'work/objectives', label: 'Objectives' },
  { path: 'work/shifts', label: 'My shifts' },
] as const

for (const actor of [
  { name: 'Director', ...MANAGER },
  { name: 'member', ...VIEWER },
]) {
  test(`${actor.name}: phone Work directory reaches every Work destination and comes back; desktop reaches them from the navigation`, async ({ page }) => {
    await page.setViewportSize(PHONE)
    await loginAs(page, actor.email, actor.password)
    await page.goto('work')

    const doors = page.getByRole('navigation', { name: 'Work destinations' })
    await expect(doors).toBeVisible()
    await expect(doors.getByRole('link')).toHaveCount(WORK_COLLECTIONS.length)

    for (const collection of WORK_COLLECTIONS) {
      const door = doors.getByRole('link', { name: new RegExp(`^${collection.label}`) })
      const height = (await door.boundingBox())?.height ?? 0
      expect(height, `${collection.label}: phone target must be at least 44px`).toBeGreaterThanOrEqual(44)
      await door.click()
      await expect(page).toHaveURL(new RegExp(`/${collection.path}(\\?.*)?$`))
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await page.getByRole('link', { name: 'Back to Work', exact: true }).click()
      await expect(page).toHaveURL(/\/work$/)
      await expect(doors).toBeVisible()
    }

    await page.setViewportSize(DESKTOP)
    await page.goto('work/tasks')
    await expect(page.locator('nav').getByRole('link', { name: /^Signals(,|$)/ })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to Work', exact: true })).toHaveCount(0)
  })
}
