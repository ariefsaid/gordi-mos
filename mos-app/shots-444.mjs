// Throwaway capture script for issue 444 (deleted before commit).
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2]
const BASE = 'http://localhost:25933/mos'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()

async function login(page) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Director', exact: true }).click()
    try {
      await page.waitForSelector('[aria-label="Primary"], .bottom-tab-bar', { timeout: 15000 })
      return
    } catch {
      /* retry */
    }
  }
  throw new Error('login never produced a shell')
}

async function shot(width, height, name, path = '/', after) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  await login(page)
  if (path !== '/') {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  }
  await page.waitForTimeout(3500)
  if (after) await after(page)
  console.log(`${name}: url=${page.url()}`)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
  await ctx.close()
}

await shot(1280, 900, '01-home-1280')
await shot(390, 844, '02-home-390')
await shot(390, 844, '03-drawer-390', '/', async (page) => {
  await page.locator('.bottom-tab-bar button').last().click()
  await page.waitForTimeout(800)
})
await shot(1280, 900, '04-money-redirects-to-home-1280', '/money')
await shot(1280, 900, '05-work-objectives-redirects-1280', '/work/objectives')
await shot(1024, 900, '06-compact-rail-1024')
await shot(1280, 900, '07-command-palette-1280', '/', async (page) => {
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(1000)
})

await browser.close()
