// One-off rendered-verification capture for the Café/Kitchen surfaces.
// Not committed to the app; lives in scripts/ for repeatability. Drives the demo
// login and screenshots each kitchen screen at 1280 (desktop) and 390 (phone).
//   node scripts/shot-kitchen.mjs
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
// playwright lives in mos-app/node_modules; resolve from there regardless of cwd.
const require = createRequire(new URL('../mos-app/package.json', import.meta.url))
const { chromium } = require('playwright')

const BASE = 'http://localhost:5273/mos'
const OUT = new URL('../output/g-kitchen/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

// [persona demo-button text, route, filename-stem]
const SHOTS = [
  ['Kitchen', '/cafe',       'cafe-opening'],
  ['Kitchen', '/cafe/log',   'cafe-log'],
  ['Kitchen', '/cafe/plan',  'cafe-plan-pesanan'],   // member → Pesanan horizon
  ['Kitchen', '/cafe/stock', 'cafe-stock'],
  ['Cafe Ops', '/cafe/plan',   'cafe-plan-editor'],  // ops_lead → Plan editor
  ['Cafe Ops', '/cafe/review', 'cafe-review'],
  ['Cafe Ops', '/cafe/pushes', 'cafe-pushes'],
]

const WIDTHS = [
  { w: 1280, h: 900, tag: '1280' },
  { w: 390, h: 844, tag: '390' },
]

async function login(page, persona) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: persona, exact: true }).click()
  await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

const personas = [...new Set(SHOTS.map(s => s[0]))]
const browser = await chromium.launch()
try {
  for (const persona of personas) {
    for (const { w, h, tag } of WIDTHS) {
      // Fresh context per (persona, width) — /login redirects an authenticated
      // session, so a clean session is the only way to switch persona.
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
      const page = await ctx.newPage()
      await login(page, persona)
      for (const [p, route, stem] of SHOTS) {
        if (p !== persona) continue
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' })
        await page.waitForTimeout(900) // let KPI/table paint settle
        const file = `${OUT}${stem}-${tag}.png`
        await page.screenshot({ path: file, fullPage: true })
        console.log('shot', file)
      }
      await ctx.close()
    }
  }
} finally {
  await browser.close()
}
