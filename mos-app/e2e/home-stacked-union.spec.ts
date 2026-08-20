// AC-HS20..HS22 (e2e) — the stacked-union Home (Issue E, docs/specs/home-stacked-union.spec.md).
// Encodes the user's real journey: open Home and read the stack your roles compose. Verifies the
// binding model — a multi-role persona sees their function cockpit(s) + My Week STACKED (not a
// toggle); a pure member sees capture-first only (no finance); the stack lays out with no horizontal
// scroll on a ≤380px phone.
//
// Determinism: the stacked home is exercised via the DEV-only preview route `/__home-stacked`
// (reachable in the e2e Vite dev server regardless of the SHOW_HOME_STACKED flag). Production `/`
// still branches on the flag (covered by router-home-stacked.test.tsx AC-HS15). global-setup seeds
// the personas.
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER, MEMBER } from './fixtures/users'

test.describe('Home stacked-union cockpit (Issue E)', () => {
  test('AC-HS20: a multi-role (dual BU-head) persona sees function cockpit(s) + My Week stacked', async ({
    page,
  }) => {
    // VIEWER (Cahya) holds Cafe Ops Lead (Retail Ops apex) + Sales Lead (B2B Sales apex) — a
    // dual-hat BU-head → two function cockpits + My Week, stacked.
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('__home-stacked')

    // Two function cockpits (B2B Sales + Retail Ops) + the My Week section, all visible.
    await expect(page.getByRole('heading', { name: /B2B Sales — function cockpit/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Retail Ops — function cockpit/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^My Week$/i })).toBeVisible()

    // No capture-first (Cahya is a BU-head, not a pure contributor).
    await expect(page.getByRole('heading', { name: /what needs you/i })).toHaveCount(0)
  })

  test('AC-HS21: a pure member sees capture-first only — no cockpit, no finance', async ({ page }) => {
    // MEMBER holds the member access role and NO org role → capture-first only.
    await loginAs(page, MEMBER.email, MEMBER.password)
    await page.goto('__home-stacked')

    await expect(page.getByRole('heading', { name: /what needs you/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Add a log entry/i })).toHaveAttribute('href', '/cafe/log')

    // No cockpit, no money-position, no finance tiles.
    await expect(page.getByRole('heading', { name: /cockpit/i })).toHaveCount(0)
    await expect(page.getByText(/Money position/i)).toHaveCount(0)
    await expect(page.getByRole('group', { name: /revenue/i })).toHaveCount(0)
  })
})

test.describe('Home stacked-union cockpit — phone (≤380px)', () => {
  test.use({ viewport: { width: 380, height: 820 } })

  test('AC-HS22: the stack lays out with no horizontal scroll on a ≤380px phone', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('__home-stacked')

    // The stacked surface scrolls vertically only; no horizontal overflow.
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
  })

  test('AC-HS23: a pure member can tap capture on a ≤380px phone', async ({ page }) => {
    await loginAs(page, MEMBER.email, MEMBER.password)
    await page.goto('__home-stacked')
    await expect(page.getByRole('link', { name: /Add a log entry/i })).toHaveAttribute('href', '/cafe/log')
  })
})
