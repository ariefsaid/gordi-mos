// GUARD-AUTH-TAP (#403, v4 port-sweep slice of #290): the auth cards author their controls
// inline at the 32px desktop density with no primitive underneath, so the phone tap floor
// (DESIGN.md §Responsive: every required tap target ≥44×44 at ≤767.98px, named measure 390)
// never reached them. This guard measures the REAL rendered geometry of EVERY visible
// interactive control inside the auth card — a census, not a sample — so the class can never
// again depend on a human eye. Geometry-layer twin of the structural jsdom assertion in
// src/components/ui/tap-targets.css.test.ts (#403 block). Requires the live local stack
// (state 2 hits resetPasswordForEmail, state 4 does a mailpit round-trip).
import { test, expect, type Page } from '@playwright/test'
import { VIEWER, ORPHAN, RECOVERY_VIEWER } from './fixtures/users'
import { loginAs } from './helpers/login'
import { clearMailpit, waitForEmail, extractAuthLink } from './helpers/mailpit'

const FLOOR = 43.5 // 44px floor, 0.5px sub-pixel tolerance (GUARD-TAP idiom)

// The census is closed: inputs, buttons, and the one <a> ("Back to sign in") are every
// interactive element the auth cards render.
const AUTH_CONTROLS = '.auth-card :is(input, button, a)'

async function assertAuthTapFloor(page: Page, surface: string) {
  const controls = page.locator(AUTH_CONTROLS).locator('visible=true')
  const count = await controls.count()
  expect(count, `${surface}: expected auth-card interactive controls to exist`).toBeGreaterThan(0)
  const offenders: string[] = []
  for (let i = 0; i < count; i += 1) {
    const el = controls.nth(i)
    const b = await el.boundingBox()
    if (!b) continue
    if (b.height < FLOOR || b.width < FLOOR) {
      let label = (await el.innerText().catch(() => '')).trim().slice(0, 40).replace(/\s+/g, ' ')
      if (!label) label = `input[type=${await el.getAttribute('type')}]`
      offenders.push(`${surface} "${label}" → ${Math.round(b.width)}×${Math.round(b.height)}px`)
    }
  }
  expect(offenders, `${surface}: every auth control must be ≥44×44 at ≤390px`).toEqual([])
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflows, `${surface}: no horizontal overflow at 390px`).toBe(false)
}

test.describe('auth tap-target floor (GUARD-AUTH-TAP, #403)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true }) // the ≤390px phone measure

  test('GUARD-AUTH-TAP: sign-in form controls are ≥44×44 at 390', async ({ page }) => {
    await page.goto('login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await assertAuthTapFloor(page, 'Sign-in')
  })

  test('GUARD-AUTH-TAP: reset-confirm "Back to sign in" is ≥44×44 at 390', async ({ page }) => {
    await page.goto('login')
    await page.getByLabel('Email').fill(VIEWER.email)
    await page.getByRole('button', { name: /forgot password/i }).click()
    await expect(page.getByText(/check your email to reset your password/i)).toBeVisible({ timeout: 10_000 })
    await assertAuthTapFloor(page, 'Reset-confirm')
  })

  test('GUARD-AUTH-TAP: recovery link-invalid "Back to sign in" <a> is ≥44×44 at 390', async ({ page }) => {
    await page.goto('recovery')
    await expect(page.getByRole('link', { name: /back to sign in/i })).toBeVisible({ timeout: 10_000 })
    await assertAuthTapFloor(page, 'Recovery (no link)')
  })

  test('GUARD-AUTH-TAP: the shared set-password form is ≥44×44 at 390 (real recovery link)', async ({ page }) => {
    test.setTimeout(120_000) // full email round-trip, same budget as AC-005
    await clearMailpit()
    await page.goto('login')
    await page.getByLabel('Email').fill(RECOVERY_VIEWER.email)
    await page.getByRole('button', { name: /forgot password/i }).click()
    await expect(page.getByText(/check your email to reset your password/i)).toBeVisible({ timeout: 5_000 })
    const { html, text } = await waitForEmail(RECOVERY_VIEWER.email, 20_000)
    const recoveryUrl = extractAuthLink(html, text)
    await page.goto(recoveryUrl)
    await expect(page.getByRole('heading', { name: /set a new password/i })).toBeVisible({ timeout: 15_000 })
    // Measure the form; do NOT submit — no rotation, RECOVERY_VIEWER's password stays stable.
    await assertAuthTapFloor(page, 'Set-password (recovery link)')
  })

  test('GUARD-AUTH-TAP: the orphan blocked screen inherits the same floor at 390', async ({ page }) => {
    await loginAs(page, ORPHAN.email, ORPHAN.password)
    await expect(page.getByText(/your account isn't set up yet/i)).toBeVisible({ timeout: 10_000 })
    await assertAuthTapFloor(page, 'Orphan')
  })
})
