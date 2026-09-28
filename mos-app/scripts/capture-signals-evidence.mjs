// One-off rendered-evidence capture for the signals lane (MVP wave 1). Launches its OWN browser
// against the already-running worktree dev server (never `npx playwright test` — that would pull
// in global-setup/teardown built for the shared e2e DB lock, which this is explicitly not). Every
// request the page makes is read-only guarded (scripts/review-read-only.mjs), so this cannot
// mutate the shared demo database. Not part of the test suite; run manually, screenshots only.
import { chromium } from '@playwright/test'
import { installReadOnlyReviewGuard } from '../../scripts/review-read-only.mjs'

const PORT = process.env.PORT || '4243'
const BASE = `http://127.0.0.1:${PORT}/mos`
const OUT = process.env.OUT_DIR || '/Users/ariefsaid/Coding/gordi-mos/docs/reviews/2026-09-28-mvp-wave1/signals'
const EMAIL = 'dewi.dev@example.test'
const PASSWORD = 'Passw0rd!dev'

async function shoot(page, path, name, viewport) {
  await page.setViewportSize(viewport)
  await page.goto(`${BASE}${path}`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

const browser = await chromium.launch()

// Sign in on an UNGUARDED context first (the password grant itself is a write the guard would
// block) — mirrors the brief's "sign in in a separate unguarded context, save storageState,
// reuse it" so every screenshot navigation after this point is read-only guarded.
const loginContext = await browser.newContext()
const loginPage = await loginContext.newPage()
await loginPage.goto(`${BASE}/login`)
await loginPage.getByLabel('Email').fill(EMAIL)
await loginPage.getByLabel('Password').fill(PASSWORD)
await loginPage.getByRole('button', { name: /sign in/i }).click()
await loginPage.waitForSelector('text=Dewi Director', { timeout: 20_000 })
const storageState = await loginContext.storageState()
await loginContext.close()

const context = await browser.newContext({ storageState })
await installReadOnlyReviewGuard(context, `http://127.0.0.1:${PORT}`)
const page = await context.newPage()

// #775 — a Signal outside the viewer's access: blank archetype + one Back, no retry.
await shoot(page, '/work/signals/00000000-0000-0000-0000-000000000000', 'ac046-denied-1440', { width: 1440, height: 900 })
await shoot(page, '/work/signals/00000000-0000-0000-0000-000000000000', 'ac046-denied-390', { width: 390, height: 844 })

// #770 — the two-row Signals archive toolbar (current-state check: already satisfied).
await shoot(page, '/work/signals?layout=feed', 'ac021-archive-feed-1440', { width: 1440, height: 900 })
await shoot(page, '/work/signals?layout=feed', 'ac029-archive-feed-390', { width: 390, height: 844 })

// #772 — the Signal record panel (current-state check on the pinned header/control row).
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${BASE}/work/signals?layout=feed`)
await page.waitForLoadState('networkidle')
await page.locator('main [role="button"]', { hasText: 'Urgent' }).first().click().catch(() => {})
await page.locator('main button', { hasText: /Open signal/i }).first().click().catch(() => {})
await page.waitForTimeout(500)
await page.screenshot({ path: `${OUT}/ac034-record-panel-1440.png` })

// #774 — Inbox rows (current-state check + the actor-title fix's live surface).
await shoot(page, '/inbox', 'ac073-inbox-1440', { width: 1440, height: 900 })
await shoot(page, '/inbox', 'ac073-inbox-390', { width: 390, height: 844 })

await browser.close()
console.log('done')
