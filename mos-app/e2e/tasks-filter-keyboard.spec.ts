import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER } from './fixtures/users'
import { openViewFilters, viewFiltersDoor } from './helpers/tasks'

// #743 ruling retired Status as a single-select combobox (arrow-key listbox, one committed
// value) in favour of a checkbox popover (additive: "Include archived" rides the same control).
// That premise is gone, but the GOAL this test protects is not: keyboard-driven filtering must
// keep the task queue mounted (never swap it for a drawer/page) and hand focus back to the
// trigger it came from when the interaction closes. Re-expressed on the current control: open the
// door and the Status popover with the keyboard, toggle "Open" with Space, close with Escape.
test('keyboard filtering keeps the task queue in place and restores focus', async ({ page }) => {
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('/mos/work/tasks')
  const table = page.getByRole('table', { name: 'Tasks' })
  await expect(table).toBeVisible()
  // A marker outside React's own render: a remount lands on a FRESH DOM node and loses it, so its
  // survival is a real (not assumed) proof the queue stayed the same element throughout.
  await table.evaluate((el) => { el.dataset.e2eKept = 'yes' })

  await openViewFilters(page)
  const door = viewFiltersDoor(page)
  // Scoped to the toolbar — the grouped table has its own "Status" column sort button sharing
  // this accessible name.
  const statusTrigger = page.getByTestId('record-collection-toolbar').getByRole('button', { name: 'Status', exact: true })
  await statusTrigger.focus()
  await page.keyboard.press('Enter')
  const openCheckbox = page.getByRole('checkbox', { name: 'Open', exact: true })
  await expect(openCheckbox).toBeVisible()
  await expect(page.getByText('Task detail', { exact: true })).toHaveCount(0)

  await openCheckbox.focus()
  await page.keyboard.press('Space')
  await expect(openCheckbox).toBeChecked()

  // Escape has no dedicated handler on the Status popover itself, so it bubbles to the "View &
  // filters" door's own Escape contract (ViewOptionsDisclosure, #870): closes the whole door and
  // returns focus to ITS trigger — confirmed live (2026-09-22), not assumed.
  await page.keyboard.press('Escape')
  await expect(openCheckbox).toHaveCount(0)
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
