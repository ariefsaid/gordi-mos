// DO-18 (backfill census, chrome-deputy-panel finding F3) — a CLEAN Task record panel must actually
// CLOSE, and STAY closed, when the user clicks ✕ or presses Escape. The live standing-audit found it
// re-opening itself the instant it closed: only the browser Back gesture ever escaped it.
//
// WHY this is an e2e (not RTL/jsdom): the defect is a REAL-BrowserRouter history-timing race and is
// invisible to MemoryRouter — exactly the same reason tasks-browser-back-dirty-veto.spec.ts lives at
// this layer. Opening a task from the list writes ?record=<id> (a PUSH) AND the OverlayHost pushes a
// route marker (a second PUSH); an explicit close pops one step (historyDeltaForClose(0) === -1) and
// lands on a history entry that STILL carries ?record=<id>. Under real async popstate timing the
// collection's open effect then re-fires while that ?record= lingers and resurrects the very session
// the user just closed. jsdom flushes navigate(-1) synchronously inside act(), so AC-V3-008b closes
// cleanly there and never sees this. The fix mirrors Signals' proven pattern (signals-archive-page):
// the Tasks OverlayHostSlot's onClose drops ?record= (replace, suppressing the re-open) BEFORE the
// host close commits, so the record cannot self-resurrect.
//
// Runs at the default desktop viewport (≥1100px) — the live split-view drawer via
// TasksWorkspace/OverlayHostSlot, the SAME surface the census drove. Requires the live local stack +
// global-setup seed (never staging). Oracle: the drawer's visibility (what "the record closes" means
// to the user) plus the ?record= query being gone from the address bar.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { createTaskViaUI } from './helpers/tasks'
import { VIEWER } from './fixtures/users'

test.describe('DO-18 — a clean Task record panel closes and stays closed', () => {
  test('✕ Close dismisses a clean task record and it does NOT re-open (?record= is cleared)', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)

    // Own task (VIEWER is R+A → editable) so the journey doesn't depend on shared seed state.
    const title = `Close clean ${Date.now()}`
    await createTaskViaUI(page, title)

    // Re-open from the list via an in-app row click (the PUSH path that wires the live overlay
    // session + ?record=), NOT a hard-load onto the record URL (that hits the OD-63 full page).
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)
    await page.getByText(title).first().click()

    const drawer = page.getByRole('complementary', { name: /task detail/i })
    await expect(drawer.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/[?&]record=/)

    // Clean record → clicking ✕ Close must dismiss it with no retain/discard dialog.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await drawer.getByRole('button', { name: 'Close' }).click()

    // The record closes AND the address bar no longer carries ?record=.
    await expect(drawer).toBeHidden({ timeout: 8_000 })
    await expect(page).not.toHaveURL(/[?&]record=/)

    // …and it STAYS closed. The live bug re-opened the record one async render after the close, so a
    // simple "hidden" assertion could pass on the closing frame and then flip back. Settle the event
    // loop and re-assert the drawer is still gone and ?record= has not resurrected.
    await page.waitForTimeout(500)
    await expect(drawer).toBeHidden()
    await expect(page).not.toHaveURL(/[?&]record=/)
  })

  test('Escape dismisses a clean task record and it does NOT re-open', async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password)
    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)

    const title = `Close clean esc ${Date.now()}`
    await createTaskViaUI(page, title)

    await page.goto('work/tasks')
    await page.waitForURL(/\/work\/tasks$/)
    await page.getByText(title).first().click()

    const drawer = page.getByRole('complementary', { name: /task detail/i })
    await expect(drawer.getByRole('heading', { name: title })).toBeVisible({ timeout: 10_000 })
    await expect(page).toHaveURL(/[?&]record=/)

    // Escape on a clean record → close, no dialog, no self-reopen.
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(drawer).toBeHidden({ timeout: 8_000 })
    await expect(page).not.toHaveURL(/[?&]record=/)

    await page.waitForTimeout(500)
    await expect(drawer).toBeHidden()
    await expect(page).not.toHaveURL(/[?&]record=/)
  })
})
