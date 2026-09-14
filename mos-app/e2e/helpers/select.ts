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
  await trigger.click()
  const listbox = page.getByRole('listbox').last()
  await expect(listbox).toBeVisible()
  await listbox
    .getByRole('option', { name: optionName, exact: typeof optionName === 'string' })
    .click()
}
