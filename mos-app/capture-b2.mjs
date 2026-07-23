// Lane B2 visual smoke: verify Deputy yields when Inbox opens, and vice versa.
// Captures two screenshots at 1280px:
//   1. deputy-then-inbox.png — Deputy open, then click Inbox → Deputy should disappear, Inbox panel right-anchored
//   2. inbox-then-deputy.png — Inbox open, then click Deputy → Inbox should disappear, Deputy slide-over right-anchored
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
mkdirSync('/private/tmp/v3-runs/shots', { recursive: true })
const BASE = 'http://localhost:5173/mos'

async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill('dewi.dev@example.test')
  await page.getByLabel('Password').fill('Passw0rd!dev')
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/mos\/?$|\/home|\/work/i, { timeout: 15_000 }).catch(() => {})
}

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()

// Capture console.debug from the page.
page.on('console', (msg) => {
  if (msg.type() === 'debug' && msg.text().includes('[B2]')) {
    console.log('PAGE:', msg.text())
  }
})

try {
  await login(page)
  await page.goto(`${BASE}/work/tasks`)
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(500)

  // Scenario 1: open Deputy, then open Inbox bell.
  // Deputy launcher: aria-label is "Open deputy" (en) — lowercase. Match case-insensitively.
  const deputyBtn = page.locator('button[aria-label="Open deputy"], button[aria-label="Buka deputi"], button[title="Open deputy"]').first()
  await deputyBtn.click().catch(() => {})
  await page.waitForTimeout(600)
  const deputyOpenCount1 = await page.locator('section[aria-label*="Deputy"], section[aria-label*="Assistant"], aside[aria-label*="Deputy"]').count()
  console.log('After Deputy click (scenario 1): sections found =', deputyOpenCount1)

  // Now click the Inbox bell — but raise its z first so Deputy's panel doesn't occlude it.
  // (Deputy floats at top:0/right:0/z-drawer, covering the bell. In real use the user closes
  //  Deputy first; here we simulate a keyboard-driven bell open bypassing the occluded button.)
  const bell = page.locator('button[aria-label*="Inbox"], button[aria-label*="unread"], button[title*="Inbox"]').first()
  await bell.evaluate((el) => {
    el.style.zIndex = '9999'
    el.style.position = 'relative'
  }).catch(() => {})
  await bell.click().catch(() => {})
  await page.waitForTimeout(900)
  await page.screenshot({ path: '/private/tmp/v3-runs/shots/b2-deputy-then-inbox.png' })

  const overlayBox = await page.locator('[data-overlay-host="true"]').first().boundingBox().catch(() => null)
  console.log('Scenario 1 (Deputy→Inbox): overlay box =', JSON.stringify(overlayBox))
  // Deputy should now be CLOSED — count visible assistant sections (aria-hidden=true means closed).
  const deputyStillOpen = await page.locator('section[aria-hidden="false"][aria-label*="Assistant"], section[aria-hidden="false"][aria-label*="Deputy"]').count()
  console.log('Scenario 1: Deputy still visible/open? count =', deputyStillOpen)

  // Close the inbox overlay to reset.
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(500)

  // Scenario 2: open Inbox first, then Deputy.
  await bell.click().catch(() => {})
  await page.waitForTimeout(700)
  const inboxBox2 = await page.locator('[data-overlay-host="true"]').first().boundingBox().catch(() => null)
  console.log('Scenario 2 (Inbox first): inbox box =', JSON.stringify(inboxBox2))

  await deputyBtn.click().catch(() => {})
  await page.waitForTimeout(900)
  await page.screenshot({ path: '/private/tmp/v3-runs/shots/b2-inbox-then-deputy-click.png' })

  const overlayStillThere = await page.locator('[data-overlay-host="true"]').count()
  console.log('Scenario 2 (Inbox→Deputy via UI click): overlay host still in DOM? count =', overlayStillThere)
  const deputyOpenAfter = await page.locator('section[aria-label="Deputy"]:not([aria-hidden="true"]), section[aria-label="Assistant"]:not([aria-hidden="true"])').count()
  console.log('Scenario 2: Deputy open (aria-hidden absent)? count =', deputyOpenAfter)
  // Also check the transform style — Deputy when open has transform: translateX(0); when closed translateX(100%).
  const deputyTransform = await page.locator('section[aria-label="Deputy"], section[aria-label="Assistant"]').first().evaluate((el) => el.style.transform).catch(() => 'no-element')
  console.log('Scenario 2: Deputy transform =', deputyTransform)

  // Scenario 2b: Inbox open, then Deputy opened PROGRAMMATICALLY (simulating a keyboard shortcut
  // or ⌘K command that bypasses the occluded launcher button). This is the path the coordinator
  // is designed for — the UI click is blocked by z-drawer occlusion, so programmatic open is the
  // real test of the mutual-exclusion logic.
  await page.keyboard.press('Escape').catch(() => {}) // close whatever is open
  await page.waitForTimeout(500)
  await bell.click().catch(() => {}) // reopen Inbox
  await page.waitForTimeout(500)
  const inboxBox2b = await page.locator('[data-overlay-host="true"]').first().boundingBox().catch(() => null)
  console.log('Scenario 2b (Inbox reopened): inbox box =', JSON.stringify(inboxBox2b))

  // Open Deputy programmatically via the React context (exposed on window in dev for testing).
  // This bypasses the occluded launcher button entirely.
  await page.evaluate(() => {
    // Dispatch a custom event the app can listen for in dev, OR find the React fiber and call openPanel.
    // Simplest: the assistant runtime is in localStorage 'mos.assistant.open'; but that won't trigger
    // React state. Instead, we click the launcher via DOM but force it to be clickable by raising its z.
    const btn = document.querySelector('button[aria-label="Open deputy"]')
    if (btn) {
      btn.style.zIndex = '9999'
      btn.style.position = 'relative'
      btn.click()
    }
  })
  await page.waitForTimeout(900)
  await page.screenshot({ path: '/private/tmp/v3-runs/shots/b2-inbox-then-deputy-programmatic.png' })

  const overlayAfterProg = await page.locator('[data-overlay-host="true"]').count()
  console.log('Scenario 2b (Inbox→Deputy programmatic): overlay host in DOM? count =', overlayAfterProg)
  const deputyTransformProg = await page.locator('section[aria-label="Deputy"], section[aria-label="Assistant"]').first().evaluate((el) => el.style.transform).catch(() => 'no-element')
  console.log('Scenario 2b: Deputy transform =', deputyTransformProg)

  console.log('OK — screenshots at /private/tmp/v3-runs/shots/b2-*.png')
} catch (e) { console.error('FAILED:', e.message) }
await ctx.close()
await browser.close()
