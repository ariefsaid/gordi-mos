import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER } from './fixtures/users'

test('keyboard filtering keeps the task queue in place and restores focus', async ({ page }) => {
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('/mos/work/tasks')
  await expect(page.getByRole('table', { name: 'Tasks' })).toBeVisible()
  await page.getByRole('button', { name: 'Filters', exact: true }).click()
  const status = page.getByRole('combobox', { name: 'Status', exact: true })
  await status.focus()
  await page.keyboard.press('Enter')
  const list = page.getByRole('listbox', { name: 'Status', exact: true })
  await expect(list).toBeFocused()
  await expect(page.getByText('Task detail', { exact: true })).toHaveCount(0)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(list).toHaveCount(0)
  await expect(status).toBeFocused()
  await expect(status).toHaveText('Open')
  await expect(page.getByRole('button', { name: 'Clear filters', exact: true })).toBeVisible()
  await expect(page.getByText('Task detail', { exact: true })).toHaveCount(0)
})
