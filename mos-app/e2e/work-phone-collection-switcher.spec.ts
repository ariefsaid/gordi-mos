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
] as const

for (const actor of [
  { name: 'Director', ...MANAGER },
  { name: 'member', ...VIEWER },
]) {
  test(`${actor.name}: phone Work switcher reaches all four collections; desktop keeps the rail`, async ({ page }, info) => {
    await page.setViewportSize(PHONE)
    await loginAs(page, actor.email, actor.password)
    await page.goto('work/tasks')

    const switcher = page.locator('[data-anatomy="work-collection-switcher"]')
    await expect(switcher).toBeVisible()
    await expect(switcher.getByRole('link')).toHaveCount(WORK_COLLECTIONS.length)

    for (const collection of WORK_COLLECTIONS) {
      const current = switcher.getByRole('link', { name: collection.label, exact: true })
      await current.click()
      await expect(page).toHaveURL(new RegExp(`/${collection.path}$`))
      await expect(current).toHaveAttribute('aria-current', 'page')
      const targetHeights = await switcher.getByRole('link').evaluateAll((links) =>
        links.map((link) => link.getBoundingClientRect().height),
      )
      expect(targetHeights.every((height) => height >= 44), `${collection.label}: all phone targets must be at least 44px`).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    }

    await page.goto('work/tasks')
    await expect(switcher.getByRole('link', { name: 'Tasks', exact: true })).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.task-card-link').first()).toBeVisible()
    await page.mouse.move(PHONE.width + 20, PHONE.height + 20)
    await page.screenshot({ path: info.outputPath(`${actor.name.toLowerCase()}-390-work-tasks.png`), animations: 'disabled' })

    await page.setViewportSize(DESKTOP)
    await page.goto('work/tasks')
    await expect(switcher).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: /^Signals(,|$)/ })).toBeVisible()
    await expect(page.locator('tr.task-row').first()).toBeVisible()
    await page.mouse.move(DESKTOP.width + 20, DESKTOP.height + 20)
    await page.screenshot({ path: info.outputPath(`${actor.name.toLowerCase()}-1440-work-tasks.png`), animations: 'disabled' })
  })
}
