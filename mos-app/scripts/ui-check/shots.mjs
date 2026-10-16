// Usage: node mos-app/scripts/ui-check/shots.mjs <area: cafe|money> [page-name...]
// Signs in on the local app (port 4330, the mos-port launch entry) and saves docs/ui-checks/<area>/shots/<page>-390.png and -1440.png.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
const root = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '')
const launch = JSON.parse(fs.readFileSync(`${root}/.claude/launch.json`, 'utf8'))
const pw = launch.configurations.flatMap((c) => c.runtimeArgs || []).find((a) => a.startsWith('VITE_LOCAL_VIEW_AS_PASSWORD=')).split('=')[1]
const { PAGES } = await import('./pages.mjs')
const [area, ...only] = process.argv.slice(2)
const { pages } = PAGES[area]; const user = process.env.SHOT_USER || PAGES[area].user // null = signed out
const out = process.env.SHOT_OUT ? `${process.env.SHOT_OUT}/shots` : `${root}/docs/ui-checks/${area}/shots`; fs.mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  if (user) {
    await page.goto(`http://127.0.0.1:${process.env.SHOT_PORT || 4330}/login`)
    await page.fill('input[type=email]', user); await page.fill('input[type=password]', pw)
    await page.keyboard.press('Enter'); await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
  }
  for (const [name, path] of Object.entries(pages)) {
    if (only.length && !only.includes(name)) continue
    let url = path
    if (path === 'BRANCH') {
      await page.goto(`http://127.0.0.1:${process.env.SHOT_PORT || 4330}/money`); await page.waitForTimeout(2500)
      url = await page.locator('a[href*="/money/branch/"]').first().getAttribute('href').catch(() => null)
      if (!url) { console.log('no branch link'); continue }
    }
    await page.goto(`http://127.0.0.1:${process.env.SHOT_PORT || 4330}${url}`); await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${out}/${name}-${w}.png`, fullPage: false })
    console.log(`${name}-${w} ${page.url()}`)
  }
  await ctx.close()
}
await browser.close()
