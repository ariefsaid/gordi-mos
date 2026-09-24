import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

/** The accessible name the stream Switch menu and the one-step choice group share (EN / ID). */
export const STREAM_CONTROL_NAME = /production stream|stream produksi/i

/** The page head's stream statement ("Rumah Rames · Kitchen"), present once a stream resolved. */
export function streamStatement(page: Page): Locator {
  return page.getByTestId('cafe-stream')
}

/** The quiet Switch button beside the statement; present only when another stream is offered. */
export function streamSwitch(page: Page): Locator {
  return streamStatement(page).getByRole('button', { name: /^(switch|ganti)$/i })
}

/**
 * #440 made choosing a production stream part of the Café journey: a viewer with no default
 * stream is ASKED (never given a silent fallback), and until they answer, the capture surfaces
 * render the one-step stream choices instead of their content. Many e2e personas carry no default
 * stream, so any guard that measures a Café surface's content must first take the step a real
 * person takes: choose a stream.
 *
 * Production capture is bound to a location (DD-MVP-11): a person whose profile resolves to no
 * single location is asked for one BEFORE any capture surface mounts (cafe-opening-page.tsx
 * LocationChoices), so the journey is location first, stream second.
 *
 * Two shapes once the location is known: a resolved stream is STATED in the page head (with a
 * Switch beside it when another stream is offered) — nothing to do; with no default, the
 * location's streams are direct one-click choices in the body — click the target.
 *
 * Idempotent — a persona (or a prior test in the same context) that already has a location and a
 * stream sails through; sessionStorage carries the choices only within one context.
 */
export async function ensureStream(
  page: Page,
  streamLabel = /rumah rames.*kitchen/i,
  locationLabel = /rumah rames/i,
): Promise<void> {
  const statement = streamStatement(page)
  const choices = page.getByRole('group', { name: STREAM_CONTROL_NAME })
  const locations = page.getByRole('button', { name: /^(open location|buka lokasi)\b/i })
  // The surface resolves its location first: either the choice list is asked, or the capture
  // surface (stating its stream, or offering the stream choices) mounts straight away.
  await expect(statement.or(choices).or(locations).first()).toBeVisible()
  if (await locations.count() > 0) {
    // The seed's plans and logs live at Rumah Rames (supabase/seed.sql), the same location the
    // default stream below belongs to. Any other location renders an honest empty state instead
    // of the content these guards measure.
    const labels = await locations.allTextContents()
    const idx = labels.findIndex((l) => locationLabel.test(l))
    await locations.nth(idx >= 0 ? idx : 0).click()
  }
  await expect(statement.or(choices).first()).toBeVisible()
  if (await statement.isVisible()) return
  // Default to the Rumah Rames kitchen: the stream the seed puts today's plans and logs in
  // (supabase/seed.sql), i.e. where the seeded personas actually work — the same stream the
  // pre-#440 silent fallback landed on, now chosen out loud. "First choice" is not equivalent: it
  // can land on an empty stream, whose surfaces honestly render their empty state instead of the
  // content these guards measure.
  const options = choices.getByRole('button')
  const labels = await options.allTextContents()
  const idx = labels.findIndex((l) => streamLabel.test(l))
  await options.nth(idx >= 0 ? idx : 0).click()
  await expect(statement).toBeVisible()
}
