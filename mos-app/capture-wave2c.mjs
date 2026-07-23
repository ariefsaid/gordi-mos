import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
mkdirSync('/private/tmp/v3-runs/shots', { recursive: true })
const BASE = 'http://localhost:5173/mos'
const users = {
  cahya: { email: 'cahya.dev@example.test', password: 'Passw0rd!dev' },
  dewi:  { email: 'dewi.dev@example.test',  password: 'Passw0rd!dev' },
}
async function login(page, { email, password }) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL(/\/mos\/?$|\/home|\/work/i, { timeout: 15_000 }).catch(() => {})
}
const browser = await chromium.launch()
for (const [who, creds] of Object.entries(users)) {
  for (const [label, w, h, url] of [
    ['tasks-desktop', 1280, 900, `${BASE}/work/tasks?view=mine`],
    ['tasks-phone',   390, 844, `${BASE}/work/tasks?view=mine`],
  ]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    const page = await ctx.newPage()
    try {
      await login(page, creds)
      await page.goto(url)
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
      await page.waitForTimeout(800)
      const path = `/private/tmp/v3-runs/shots/${who}-${label}.png`
      await page.screenshot({ path, fullPage: false })
      if (label === 'tasks-desktop') {
        const dims = await page.evaluate(() => {
          const vp = { w: window.innerWidth, h: window.innerHeight }
          const headers = Array.from(document.querySelectorAll('th, [role="columnheader"]')).map(th => ({ text: (th.textContent||'').trim().slice(0,18), right: Math.round(th.getBoundingClientRect().right) }))
          const due = headers.find(h => /due/i.test(h.text))
          return { vp, headers, dueVisible: due ? due.right <= vp.w : null }
        })
        console.log(`${who}-${label}:`, JSON.stringify(dims))
      }
      console.log(`captured: ${path}`)
    } catch (e) {
      console.error(`${who}-${label} FAILED:`, e.message)
    }
    await ctx.close()
  }
}
await browser.close()
