// AC-PB-012 (docs/specs/plan-budget.spec.md) — real-browser journey for the Plan
// budget/COGS slice: capture a budget scenario from the linked BOM/cost-line read-models,
// then run pricing pre-flight and see both projected margin + fail-loud freshness warning.
//
// Run with the hide-first flag enabled:
//   VITE_SHOW_PLAN_BUDGET=true npx playwright test e2e/AC-PB-012-budget-pricing-preflight.spec.ts

import { test, expect } from '@playwright/test'
import { ADMIN } from './fixtures/users'
import { loginAs } from './helpers/login'
import { isShipGated } from './helpers/ship-gate'

test.describe('AC-PB-012: Plan budget capture → pricing pre-flight', () => {
  // issue 444 — this journey walks /money/budget and /money/pricing, both under the ship-gated
  // /money subtree, so every entry point forwards home and there is no surface to capture on.
  // Skipped on the gate itself, not deleted: the journey is still true of the built surface and
  // comes back the moment /money leaves SHIP_GATED_PATHS. This sits ABOVE the SHOW_PLAN_BUDGET
  // flag below — that flag decides whether the slice is switched on, the gate decides whether
  // Money ships at all, and a No there is a No regardless of the flag.
  test.skip(isShipGated('/money'), 'ship-gated surface (issue 444) — no route, no nav')

  test('AC-PB-012: capture a stale-cost budget scenario, then pricing shows margin + freshness warning', async ({ page }) => {
    test.skip(process.env.VITE_SHOW_PLAN_BUDGET !== 'true', 'SHOW_PLAN_BUDGET defaults false; rerun with VITE_SHOW_PLAN_BUDGET=true')

    await loginAs(page, ADMIN.email, ADMIN.password)

    await page.goto('money/budget')
    await expect(page.getByRole('heading', { name: /budget creation/i })).toBeVisible()

    await page.getByLabel('Menu item').selectOption('MENU-CROISS')
    await expect(page.getByRole('status').filter({ hasText: /stale/i })).toBeVisible()

    const label = `AC-PB-012 Promo ${Date.now()}`
    await page.getByLabel('Scenario label').fill(label)
    await page.getByLabel('Scenario type').selectOption('promo')
    await page.getByRole('button', { name: /capture budget/i }).click()
    await expect(page.getByText(/saved scenario/i)).toBeVisible()
    await expect(page.getByRole('row', { name: new RegExp(label) })).toBeVisible()

    await page.goto('money/pricing')
    await expect(page.getByRole('heading', { name: /pricing pre-flight/i })).toBeVisible()
    const budgetValue = await page.getByLabel('Budget scenario').evaluate((select, scenarioLabel) => {
      const options = Array.from((select as HTMLSelectElement).options)
      return options.find((option) => option.textContent?.includes(String(scenarioLabel)))?.value ?? ''
    }, label)
    expect(budgetValue).not.toBe('')
    await page.getByLabel('Budget scenario').selectOption(budgetValue)
    await page.getByLabel('Candidate price (Rp)').fill('45000')

    await expect(page.getByTestId('pricing-result')).toContainText('Gross margin')
    await expect(page.getByTestId('pricing-result')).toContainText('Margin %')
    await expect(page.getByTestId('pricing-freshness-warning')).toContainText(/do not price against this basis/i)
    await expect(page.getByTestId('pricing-freshness-warning')).toContainText(/stale/i)
  })
})
