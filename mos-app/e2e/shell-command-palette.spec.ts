import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

test('AC-017: Ctrl+K opens the centered command palette, focuses the input, Esc closes, and focus returns to the trigger', async ({ page }) => {
  await loginAs(page, VIEWER.email, VIEWER.password)

  const trigger = page.getByRole('button', { name: 'Search' }).first()
  await trigger.focus()
  await expect(trigger).toBeFocused()

  await page.keyboard.press('Control+K')

  const dialog = page.getByRole('dialog', { name: 'Command menu' })
  const input = dialog.getByRole('combobox', { name: /search tasks or run a command/i })
  await expect(dialog).toBeVisible()
  const box = await dialog.boundingBox()
  expect(box).not.toBeNull()
  const viewportCenter = page.viewportSize()!.width / 2
  const dialogCenter = box!.x + box!.width / 2
  expect(Math.abs(dialogCenter - viewportCenter)).toBeLessThanOrEqual(4)
  await expect(input).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})
