import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** The accessible name the stream menu and the one-step choice group share (EN / ID). */
export const STREAM_CONTROL_NAME = /production stream|stream produksi/i

/** The page head's stream statement ("Rumah Rames · Kitchen"), present once a stream resolved. */
export function streamStatement(page: Page): Locator {
  return page.getByTestId('cafe-stream')
}

/** The stream-switch button beside the statement; present only when another stream is offered. */
export function streamSwitch(page: Page): Locator {
  return streamStatement(page).getByRole('button', { name: /^(Switch (kitchen|bar|stream)|Ganti (dapur|bar|stream))$/i })
}

/**
 * #440 made choosing a production stream part of the Café journey: a viewer with no default
 * stream is ASKED (never given a silent fallback), and until they answer, the capture surfaces
 * render the one-step stream choices instead of their content. Many e2e personas carry no default
 * stream, so any guard that measures a Café surface's content must first take the step a real
 * person takes: choose a stream.
 *
 * Two shapes: a resolved stream (OD-CAFE-6 ladder: home, only team, last used) is STATED in the
 * page head as a heading (with a switch beside it when another stream is offered) — nothing to do;
 * with no default, the location's streams are direct one-click choices in the body — click the
 * target.
 *
 * Idempotent — a persona (or a prior test in the same context) that already has a stream sails
 * through; sessionStorage carries the choice only within one context.
 */
export async function ensureStream(
  page: Page,
  streamLabel = /rumah rames.*kitchen/i,
): Promise<void> {
  const statement = streamStatement(page)
  const choices = page.getByRole('group', { name: STREAM_CONTROL_NAME })
  await expect(statement.or(choices).first()).toBeVisible()
  if (await statement.isVisible()) return
  // Default to the Rumah Rames kitchen: the stream the seed puts today's plans and logs in
  // (supabase/seed.sql), i.e. where the seeded personas actually work. "First choice" is not
  // equivalent: it can land on an empty stream, whose surfaces honestly render their empty state
  // instead of the content these guards measure.
  const options = choices.getByRole('button')
  const labels = await options.allTextContents()
  const idx = labels.findIndex((l) => streamLabel.test(l))
  await options.nth(idx >= 0 ? idx : 0).click()
  await expect(statement).toBeVisible()
}
