import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * #440 made choosing a production stream part of the Café journey: a viewer with no
 * default stream is ASKED (never given a silent fallback), and until they answer, the
 * capture surfaces render the choose-a-stream state instead of their content. The e2e
 * personas carry no default stream, so any guard that measures a Café surface's content
 * must first take the step a real person takes: pick a stream in the page head.
 *
 * Production capture is bound to a location (DD-MVP-11): a person whose profile resolves
 * to no single location is asked for one BEFORE any capture surface mounts
 * (cafe-opening-page.tsx LocationChoices), so the journey is location first, stream second.
 *
 * Idempotent — a persona (or a prior test in the same context) that already has a
 * location and a stream sails through; sessionStorage carries the choices only within
 * one context.
 */
export async function ensureStream(
  page: Page,
  streamLabel = /rumah rames.*kitchen/i,
  locationLabel = /rumah rames/i,
): Promise<void> {
  const picker = page.getByRole('combobox', { name: /production stream|tim produksi/i })
  const locations = page.getByRole('button', { name: /^(open location|buka lokasi)\b/i })
  // The surface resolves its location first: either the choice list is asked, or the
  // capture surface (with its stream picker) mounts straight away.
  await expect(picker.or(locations).first()).toBeVisible()
  if (await locations.count() > 0) {
    // The seed's plans and logs live at Rumah Rames (supabase/seed.sql), the same location
    // the default stream below belongs to. Any other location renders an honest empty
    // state instead of the content these guards measure.
    const labels = await locations.allTextContents()
    const idx = labels.findIndex((l) => locationLabel.test(l))
    await locations.nth(idx >= 0 ? idx : 0).click()
  }
  await expect(picker).toBeVisible()
  await expect(picker).toBeEnabled()
  // The stream picker is a designed trigger; its value is exposed by the visible label rather
  // than by the hidden native form bridge. An empty selection renders the explicit placeholder.
  const emptyStream = /choose stream|pilih tim/i
  if (!emptyStream.test(await picker.innerText())) return
  // Default to the Rumah Rames kitchen: the stream the seed puts today's plans and logs
  // in (supabase/seed.sql), i.e. where the seeded personas actually work — the same
  // stream the pre-#440 silent fallback landed on, now chosen out loud. "First option"
  // is not equivalent: it can land on an empty stream, whose surfaces honestly render
  // their empty state instead of the content these guards measure.
  await picker.click()
  const listbox = page.getByRole('listbox', { name: /production stream|tim produksi/i })
  const options = listbox.getByRole('option').filter({ hasNotText: emptyStream })
  const labels = await options.allTextContents()
  const idx = labels.findIndex((l) => streamLabel.test(l))
  const target = options.nth(idx >= 0 ? idx : 0)
  await target.click()
}
