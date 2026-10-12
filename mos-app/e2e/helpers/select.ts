import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Choose an option from the shared Select/Picker popup.
 *
 * Resolve the portaled popup through aria-controls. Select's popup is itself a listbox;
 * Picker nests its listbox inside the popup.
 */
export async function chooseSelectOption(
  page: Page,
  trigger: Locator,
  optionName: string | RegExp,
): Promise<void> {
  await expect(trigger).toBeEnabled()
  const triggerId = await trigger.getAttribute('id')
  if (!triggerId) throw new Error('Select trigger has no id')
  await trigger.click()
  // Modal Select hides the background from the accessibility tree while its popup is open.
  const openTrigger = page.locator(`[id=${JSON.stringify(triggerId)}]`)
  await expect(openTrigger).toHaveAttribute('aria-expanded', 'true')
  const popupId = await openTrigger.getAttribute('aria-controls')
  if (!popupId) throw new Error('Select trigger opened without an aria-controls popup id')
  const popup = page.locator(`[id=${JSON.stringify(popupId)}]`)
  await expect(popup).toBeVisible()
  const listbox = await popup.getAttribute('role') === 'listbox' ? popup : popup.getByRole('listbox')
  await expect(listbox).toBeVisible()
  await listbox
    .getByRole('option', { name: optionName, exact: typeof optionName === 'string' })
    .click()
}
