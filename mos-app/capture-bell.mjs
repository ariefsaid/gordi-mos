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
try {
  await login(page)
  await page.goto(`${BASE}/work/tasks`)
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(500)
  // Click the Bell (Inbox) icon in the top bar
  const bell = page.locator('button[aria-label*="Inbox"], button[aria-label*="unread"], button[title*="Inbox"]').first()
  await bell.click().catch(async () => {
    // fallback: any bell-icon button in the top bar
    const fallback = page.locator('button:has(svg)').filter({ hasText: /^$/ }).first()
    await fallback.click().catch(() => {})
  })
  await page.waitForTimeout(800)
  await page.screenshot({ path: '/private/tmp/v3-runs/shots/bell-panel-desktop.png' })
  // Measure the panel
  const panel = await page.locator('[data-overlay-host="true"]').first()
  const box = await panel.boundingBox().catch(() => null)
  console.log('Bell panel box:', JSON.stringify(box))
  console.log('captured: /private/tmp/v3-runs/shots/bell-panel-desktop.png')
} catch (e) { console.error('FAILED:', e.message) }
await ctx.close()
await browser.close()
