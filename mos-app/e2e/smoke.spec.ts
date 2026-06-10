import { test, expect } from '@playwright/test'

test('loads /mos/ and shows the Gordi MOS heading', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Gordi MOS' })).toBeVisible()
  await expect(page).toHaveTitle('Gordi MOS — Management OS')
})
