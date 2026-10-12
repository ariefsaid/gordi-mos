// Axe-core accessibility gate over the core routes at both reference viewports; fails on
// serious/critical violations. Runs in the ordinary e2e lane (needs the app + database).
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { loginAs } from './helpers/login'
import { ADMIN, MANAGER, VIEWER } from './fixtures/users'

type Actor = { email: string; password: string }

// The core routes, each with the persona that can see it (same pairing as shell-390-overflow).
const ROUTES: Array<{ path: string; label: string; actor: Actor }> = [
  { path: '/', label: 'Home', actor: VIEWER },
  { path: 'work/tasks', label: 'Tasks', actor: VIEWER },
  { path: 'work/signals', label: 'Signals', actor: VIEWER },
  { path: 'money', label: 'Money', actor: MANAGER },
  { path: 'inbox', label: 'Inbox', actor: VIEWER },
  { path: 'cafe', label: 'Café today', actor: VIEWER },
  { path: 'cafe/stock', label: 'Café stock', actor: VIEWER },
  { path: 'admin/people', label: 'Admin people', actor: ADMIN },
]

// Route → axe rule ids exempted from the serious/critical gate, each with the reason it is
// still open. The fix for an entry is deleting it, not widening it.
const ALLOWLIST: Record<string, string[]> = {}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  test.describe(`axe-core routes @ ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport })

    for (const { path, label, actor } of ROUTES) {
      test(`${label} has no serious or critical violations`, async ({ page }) => {
        await loginAs(page, actor.email, actor.password)
        await page.goto(path)
        await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible({ timeout: 10_000 })
        const results = await new AxeBuilder({ page }).analyze()
        const skipped = ALLOWLIST[path] ?? []
        const blocking = results.violations.filter(
          (v) => (v.impact === 'serious' || v.impact === 'critical') && !skipped.includes(v.id),
        )
        const detail = blocking
          .map((v) => `${v.id} [${v.impact}] ×${v.nodes.length}: ${v.help}`)
          .join(' · ')
        expect(
          blocking.map((v) => v.id),
          `${label} (${path}): ${detail || 'no blocking violations'}`,
        ).toEqual([])
      })
    }
  })
}
