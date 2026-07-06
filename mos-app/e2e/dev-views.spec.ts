// AC-UV-018: the zero-agent proof — compose → save → reopen → render, end-to-end, with no
// conversational agent anywhere in the path. Natural journey: an authenticated viewer opens the
// dev harness, pastes/keeps the seeded sample spec, saves it, reopens it from the saved-views
// list, and sees the panel render. Author-only per plan Task J3 — the dev harness is DEV +
// SHOW_USER_VIEWS flag gated (default false); this spec skips while the flag is off, mirroring
// the ops-log-add.spec.ts / weekly-update-submit.spec.ts convention.
import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'
import { SHOW_USER_VIEWS } from '../src/config/features'

test.beforeEach(() => {
  test.skip(!SHOW_USER_VIEWS, 'User Views substrate is flag-hidden (config/features.ts)')
})

test('AC-UV-018: compose → save → reopen → render a user view, zero agent in the path', async ({ page }) => {
  // ── 1. Login as VIEWER ─────────────────────────────────────────────────────
  await loginAs(page, VIEWER.email, VIEWER.password)

  // ── 2. Navigate to the dev harness ────────────────────────────────────────
  await page.goto('dev/views')
  await page.waitForURL(/\/dev\/views$/)
  await expect(page.getByRole('heading', { name: 'User Views' })).toBeVisible()

  // ── 3. The seeded sample spec is already valid JSON in the editor ─────────
  const jsonField = page.getByLabel('Composition spec (JSON)')
  await expect(jsonField).toBeVisible()
  await expect(jsonField).toHaveValue(/"version": 1/)
  await expect(jsonField).toHaveValue(/DataTable/)

  // ── 4. Name it + Save ──────────────────────────────────────────────────────
  const viewName = `AC-UV-018 e2e view ${Date.now()}`
  await page.getByLabel('View name').fill(viewName)
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved')).toBeVisible({ timeout: 10_000 })

  // ── 5. Reopen from the saved-views list ────────────────────────────────────
  const listItem = page.getByRole('link', { name: viewName })
  await expect(listItem).toBeVisible({ timeout: 10_000 })
  await listItem.click()
  await page.waitForURL(/\/dev\/views\/.+/)

  // ── 6. Assert GOAL: the reopened view renders end-to-end (compile→execute→hydrate) ──
  await expect(page.getByTestId('uv-panel-DataTable')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('uv-panel-row-count')).toBeVisible()
})
