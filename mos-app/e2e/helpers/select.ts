import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Choose an option from the shared Select/Picker popup.
 *
 * The popup (a dialog the trigger's aria-controls names) is portaled to document.body, so it is
 * resolved from the page rather than from the trigger's DOM subtree. The options live in the
 * listbox inside that popup, which is what the journey operates.
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
  if (!popupId) throw new Error('Select trigger opened without an aria-controls popup id')
  const popup = page.locator(`[id="${popupId}"]`)
  await expect(popup).toBeVisible()
  const listbox = popup.getByRole('listbox')
  await expect(listbox).toBeVisible()
  await listbox
    .getByRole('option', { name: optionName, exact: typeof optionName === 'string' })
    .click()
}
