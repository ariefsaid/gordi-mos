// AC-090: Add a log entry → appears in the feed
// Natural journey: viewer logs in, navigates to /ops, adds a log entry,
// and the new entry appears at the top of the feed with the correct source badge and type.
// Asserts the GOAL: the floor log is updated with the new entry.

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/login'
import { VIEWER } from './fixtures/users'

test('AC-090: add a log entry → it appears in the feed with source badge + type', async ({ page }) => {
  // ── 1. Login as VIEWER ─────────────────────────────────────────────────────
  await loginAs(page, VIEWER.email, VIEWER.password)

  // ── 2. Navigate to the Daily Log ──────────────────────────────────────────
  await page.goto('ops')
  await page.waitForURL(/\/ops$/)

  // ── 3. Open "+ Add log entry" ──────────────────────────────────────────────
  // May be in toolbar (desktop) or submit bar (phone)
  const addLink = page.getByRole('link', { name: /add log entry/i }).first()
  await expect(addLink).toBeVisible({ timeout: 8_000 })
  await addLink.click()

  // ── 4. Fill the form ───────────────────────────────────────────────────────
  await page.waitForURL(/\/ops\/new$/)
  await expect(page.getByRole('heading', { name: 'Add log entry' })).toBeVisible()

  const entryTitle = `AC-090 Floor entry ${Date.now()}`

  // Business unit — select first available (defaults to primary unit)
  const buSelect = page.getByLabel(/business unit/i)
  await expect(buSelect).toBeVisible()
  // It may already be set to primary unit; just ensure there's a value selected
  const buValue = await buSelect.inputValue()
  if (!buValue) {
    // Select first real option if no default
    const firstOption = buSelect.locator('option').nth(1)
    const optVal = await firstOption.getAttribute('value')
    if (optVal) await buSelect.selectOption(optVal)
  }

  // Type — leave as "Other" (default)
  // Title — required
  await page.getByLabel(/title/i).fill(entryTitle)

  // Detail (optional)
  await page.getByLabel(/detail/i).fill('Logged via e2e test run')

  // ── 5. Submit ──────────────────────────────────────────────────────────────
  const submitBtn = page.getByRole('button', { name: /add log entry/i })
  await expect(submitBtn).toBeEnabled({ timeout: 5_000 })
  await submitBtn.click()

  // ── 6. Assert: navigated back to /ops ─────────────────────────────────────
  await page.waitForURL(/\/ops$/, { timeout: 10_000 })

  // ── 7. Assert GOAL: new entry appears in the feed ─────────────────────────
  await expect(page.getByText(entryTitle)).toBeVisible({ timeout: 10_000 })

  // Source badge is present on the row
  const entryRow = page.locator('li', { hasText: entryTitle })
  await expect(entryRow).toBeVisible()
  // The source badge (BU name) should be present in the row
  const badge = entryRow.getByTestId('ops-source-badge')
  await expect(badge).toBeVisible()

  // Type text is present (OpsTypeText — muted text, not a badge)
  const typeText = entryRow.getByTestId('ops-type-text')
  await expect(typeText).toBeVisible()
})
