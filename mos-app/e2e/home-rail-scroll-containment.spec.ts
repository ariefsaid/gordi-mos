// AC-1011 — rail scroll containment proof (locks the owner's original "sidebar follows the
// scroll" complaint shut for good).
//
// app-shell.tsx lays the shell out as a CSS grid — `<Rail>` (grid-area: rail) and the page's own
// `<main>` (grid-area: main, `overflow-auto`, owned by PageFrame) are SIBLING grid children, each
// scrolling independently. Scrolling the page content must never move the rail: this spec drives a
// real scroll on Home's `<main>` at the desktop split viewport (1280x800, where the rail renders —
// it's hidden below the ~920px narrow breakpoint) and asserts the rail's bounding top stays fixed
// while main.scrollTop changes.
//
// Requires the live stack (local Supabase up) + the global-setup seed. Logs in as MANAGER (Dewi
// Director): her Home ("Attention first" order, cross-team attention items + My tasks + My week)
// has enough content to overflow 800px tall at 1280 wide — VIEWER's Home does not reliably overflow,
// and an oracle that can't actually scroll can't prove containment.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { MANAGER } from './fixtures/users'

test('AC-1011: scrolling Home main content leaves the rail bounding top fixed', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await loginAs(page, MANAGER.email, MANAGER.password)
  await page.goto('')
  await page.waitForURL(/\/mos\/?$/)

  const main = page.locator('main')
  const rail = page.locator('aside').first()
  await expect(rail).toBeVisible()

  // The oracle needs main to actually overflow its box — assert that first so a future content
  // trim doesn't silently turn this into a no-op scroll (goal-oracle, not a bent assertion).
  const { scrollHeight, clientHeight } = await main.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }))
  expect(scrollHeight).toBeGreaterThan(clientHeight)

  const railTopBefore = await rail.evaluate((el) => el.getBoundingClientRect().top)

  // A real scroll gesture (mouse wheel over the content), not a programmatic scrollTop write —
  // this is what "the owner scrolls the main content" actually means.
  const mainBox = await main.boundingBox()
  if (!mainBox) throw new Error('main content box not found')
  await page.mouse.move(mainBox.x + mainBox.width / 2, mainBox.y + mainBox.height / 2)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => main.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)

  const railTopAfter = await rail.evaluate((el) => el.getBoundingClientRect().top)
  const mainScrollTopAfter = await main.evaluate((el) => el.scrollTop)

  expect(mainScrollTopAfter).toBeGreaterThan(0)
  expect(railTopAfter).toBe(railTopBefore)
})
