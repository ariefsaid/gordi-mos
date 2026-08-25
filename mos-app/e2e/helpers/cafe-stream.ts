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
export async function ensureStream(page: Page, streamLabel = /rumah rames.*kitchen/i): Promise<void> {
  const picker = page.getByRole('combobox', { name: /production stream/i })
  await expect(picker).toBeVisible()
  if ((await picker.inputValue()) !== '') return
  // Default to the Rumah Rames kitchen: the stream the seed puts today's plans and logs
  // in (supabase/seed.sql), i.e. where the seeded personas actually work — the same
  // stream the pre-#440 silent fallback landed on, now chosen out loud. "First option"
  // is not equivalent: it can land on an empty stream, whose surfaces honestly render
  // their empty state instead of the content these guards measure.
  const options = picker.locator('option:not([value=""])')
  const labels = await options.allTextContents()
  const idx = labels.findIndex((l) => streamLabel.test(l))
  const target = options.nth(idx >= 0 ? idx : 0)
  const value = await target.getAttribute('value')
  if (value) await picker.selectOption(value)
}
