import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Choose an option from the shared Select/Picker popup.
 *
 * The listbox is portaled to document.body, so it is intentionally resolved from the page rather
 * than from the trigger's DOM subtree. This keeps E2E journeys on the visible control contract.
 */
export async function chooseSelectOption(
  page: Page,
  trigger: Locator,
  optionName: string | RegExp,
): Promise<void> {
  await expect(trigger).toBeEnabled()
  await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  const popupId = await trigger.getAttribute('aria-controls')
  if (!popupId) throw new Error('Select trigger opened without an aria-controls listbox id')
  const listbox = page.locator(`[id="${popupId}"]`)
  await expect(listbox).toHaveAttribute('role', 'listbox')
  await expect(listbox).toBeVisible()
  await listbox
    .getByRole('option', { name: optionName, exact: typeof optionName === 'string' })
    .click()
}
