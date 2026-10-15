import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER } from './fixtures/users'
import { openViewFilters, viewFiltersDoor } from './helpers/tasks'

// The GOAL: keyboard-driven filtering must keep the task queue mounted (never swap it for a
// drawer/page) and hand focus back to the control it came from when the interaction closes.
// Open "Filters & options" and the Status picker with the keyboard, choose "Open" with the arrow
// keys and Enter, then Escape from the panel closes the panel and returns focus to its door.
test('keyboard filtering keeps the task queue in place and restores focus', async ({ page }) => {
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('work/tasks')
  const table = page.getByRole('table', { name: 'Tasks' })
  await expect(table).toBeVisible()
  // A marker outside React's own render: a remount lands on a FRESH DOM node and loses it, so its
  // survival is a real (not assumed) proof the queue stayed the same element throughout.
  await table.evaluate((el) => { el.dataset.e2eKept = 'yes' })

  await openViewFilters(page)
  const door = viewFiltersDoor(page)
  const statusTrigger = page.getByTestId('record-collection-toolbar').getByRole('combobox', { name: 'Status', exact: true })
  await statusTrigger.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox', { name: 'Status', exact: true })).toBeVisible()
  await expect(page.getByText('Task detail', { exact: true })).toHaveCount(0)

  // Any status -> Open
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('listbox', { name: 'Status', exact: true })).toHaveCount(0)
  // Choosing closes the picker and returns focus to ITS trigger, with the panel still open.
  await expect(statusTrigger).toBeFocused()
  await expect(door).toHaveAttribute('aria-expanded', 'true')
  // Escape from a plain panel control closes the panel and returns focus to its door.
  await page.getByRole('checkbox', { name: 'Include archived', exact: true }).focus()
  await page.keyboard.press('Escape')
  await expect(door).toBeFocused()
  await expect(door).toHaveAttribute('aria-expanded', 'false')

  // The filter COMMITTED: the URL carries it, and every row left in the queue is Open.
  await expect(page).toHaveURL(/[?&]status=open(&|$)/)
  const statusCells = table.locator('tr.task-row .status-pill')
  await expect(statusCells.first()).toBeVisible()
  for (const text of await statusCells.allInnerTexts()) expect(text.trim()).toMatch(/^Open$/i)

  // The goal: the queue is the SAME element, filtered in place, never remounted or replaced by a
  // drawer/page.
  await expect(table).toHaveAttribute('data-e2e-kept', 'yes')
  await expect(page.getByText('Task detail', { exact: true })).toHaveCount(0)
})
