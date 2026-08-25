import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * #440 made choosing a production stream part of the Café journey: a viewer with no
 * default stream is ASKED (never given a silent fallback), and until they answer, the
 * capture surfaces render the choose-a-stream state instead of their content. The e2e
 * personas carry no default stream, so any guard that measures a Café surface's content
 * must first take the step a real person takes: pick a stream in the page head.
 *
 * Idempotent — a persona (or a prior test in the same context) that already has a
 * stream sails through; sessionStorage carries the choice only within one context.
 */
export async function ensureStream(page: Page): Promise<void> {
  const picker = page.getByRole('combobox', { name: /production stream/i })
  await expect(picker).toBeVisible()
  if ((await picker.inputValue()) === '') {
    const first = await picker.locator('option:not([value=""])').first().getAttribute('value')
    if (first) await picker.selectOption(first)
  }
}
