import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { ADMIN, MANAGER, VIEWER } from './fixtures/users'

test.use({ viewport: { width: 390, height: 844 } })

test('Inbox, Events, Café capture, Money and Admin people fit the phone viewport', async ({ page }) => {
  const surfaces = [
    { path: 'inbox', label: 'Inbox', actor: VIEWER },
    { path: 'work/events', label: 'Events', actor: MANAGER },
    { path: 'cafe/production', label: 'Café capture', actor: VIEWER },
    { path: 'money', label: 'Money', actor: MANAGER },
    { path: 'admin/people', label: 'Admin people', actor: ADMIN },
  ]

  for (const { path, label, actor } of surfaces) {
    await loginAs(page, actor.email, actor.password)
    await page.goto(path)
    await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('banner')).toBeVisible()
    const dimensions = await page.evaluate(() => {
      const scrollingElement = document.scrollingElement
      if (!scrollingElement) throw new Error('Document has no scrolling element')
      return { scrollWidth: scrollingElement.scrollWidth, clientWidth: scrollingElement.clientWidth }
    })
    expect(dimensions.scrollWidth, `${label} document width`).toBeLessThanOrEqual(dimensions.clientWidth)
  }
})
