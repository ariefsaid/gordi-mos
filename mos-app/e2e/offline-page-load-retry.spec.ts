import { expect, test } from '@playwright/test'

// AC-1501: a failed split-page import must start a new document on Retry, not reuse the browser's
// cached rejected module request. /recovery is a public lazy route outside AppShell's inner boundary.
test.use({ serviceWorkers: 'block' })

test('Retry reloads the current route after a lazy page download fails offline', async ({ page, context }) => {
  const failedModuleRequests: string[] = []
  page.on('requestfailed', (request) => {
    if (request.url().includes('/src/pages/recovery-page.tsx')) {
      failedModuleRequests.push(request.url())
    }
  })

  await page.goto('/login')
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()

  await context.setOffline(true)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/recovery')
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  })

  await expect(page.getByText('Couldn’t reach the server')).toBeVisible()
  await expect.poll(() => failedModuleRequests.length).toBeGreaterThan(0)

  await context.setOffline(false)
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.getByRole('button', { name: 'Retry' }).click(),
  ])

  await expect(page).toHaveURL(/\/recovery$/)
  await expect(page.getByLabel(/email/i)).toBeVisible()
})
