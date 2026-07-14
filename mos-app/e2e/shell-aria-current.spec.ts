import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN } from './fixtures/users'

const desktopRoutes = [
  '',
  'work/tasks',
  'work/signals',
  'work/projects',
  'work/objectives',
  'events',
  'money',
  'inbox',
  'cafe/log',
  'admin/people',
  'profile',
] as const

async function pageCurrentCount(page: import('@playwright/test').Page) {
  return page.evaluate(() => document.querySelectorAll('[aria-current="page"]').length)
}

test.describe('shell aria-current', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password)
  })

  test('AC-007: desktop routes render exactly one aria-current="page"', async ({ page }) => {
    for (const path of desktopRoutes) {
      await page.goto(path)
      await expect.poll(() => pageCurrentCount(page)).toBe(1)
    }
  })

  test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('AC-008: on phone, primary destinations mark their tab and non-primary destinations mark More', async ({ page }) => {
      const primaryCases = [
        { path: '', label: 'Home' },
        { path: 'work/tasks', label: 'Work' },
        { path: 'cafe/log', label: 'Café' },
        { path: 'inbox', label: 'Inbox' },
      ]
      for (const routeCase of primaryCases) {
        await page.goto(routeCase.path)
        await expect.poll(() => pageCurrentCount(page)).toBe(1)
        await expect(page.getByRole('link', { name: routeCase.label })).toHaveAttribute('aria-current', 'page')
      }

      const nonPrimaryCases = ['events', 'money', 'profile']
      for (const path of nonPrimaryCases) {
        await page.goto(path)
        await expect.poll(() => pageCurrentCount(page)).toBe(1)
        await expect(page.getByRole('button', { name: 'More' })).toHaveAttribute('aria-current', 'page')
      }
    })
  })
})
