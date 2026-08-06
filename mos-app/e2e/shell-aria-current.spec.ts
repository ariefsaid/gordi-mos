import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN, VIEWER } from './fixtures/users'

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
      // OD-68: café is a MODULE tab, promoted only for a café-affiliated viewer. The admin's
      // fixed primaries are Home/Work/Inbox; café/log is checked below under Cahya (café role).
      const primaryCases = [
        { path: '', label: 'Home' },
        { path: 'work/tasks', label: 'Work' },
        { path: 'inbox', label: 'Inbox' },
      ]
      for (const routeCase of primaryCases) {
        await page.goto(routeCase.path)
        await expect.poll(() => pageCurrentCount(page)).toBe(1)
        await expect(page.getByRole('link', { name: routeCase.label, exact: true })).toHaveAttribute('aria-current', 'page')
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

// OD-68's positive half needs a café-AFFILIATED viewer, so it gets its own describe with its own
// login — the block above authenticates as ADMIN in beforeEach, and a second loginAs on an
// already-authenticated app detaches the sign-in form mid-click.
test.describe('shell aria-current — café viewer (OD-68 promoted module tab)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('AC-008b: a café viewer on cafe/log marks the promoted Café tab', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password) // Cahya — Cafe Ops Lead
    await page.goto('cafe/log')
    await expect.poll(() => pageCurrentCount(page)).toBe(1)
    await expect(page.getByRole('link', { name: 'Café', exact: true })).toHaveAttribute('aria-current', 'page')
  })
})
