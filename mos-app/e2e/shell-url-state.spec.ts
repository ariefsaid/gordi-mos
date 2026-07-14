import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

test('AC-002: /work/tasks?view=mine survives refresh and opening the same URL in a new tab', async ({ page, context }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)

  await page.goto('work/tasks?view=mine')
  await expect(page).toHaveURL(/\/work\/tasks\?view=mine$/)
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Ownership filter' })).toBeVisible()

  await page.reload()
  await expect(page).toHaveURL(/\/work\/tasks\?view=mine$/)
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Ownership filter' })).toBeVisible()

  const copiedUrl = page.url()
  const secondPage = await context.newPage()
  await secondPage.goto(copiedUrl)
  await expect(secondPage).toHaveURL(/\/work\/tasks\?view=mine$/)
  await expect(secondPage.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  await expect(secondPage.getByRole('tablist', { name: 'Ownership filter' })).toBeVisible()
})
