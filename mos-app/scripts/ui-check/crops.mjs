// Usage: node mos-app/scripts/ui-check/crops.mjs <area> [page...]   (SHOT_PORT, SHOT_USER as in check.mjs)
// Close-ups for polish and review: each part of each page at 2x pixel density, light and dark, 1440 and 390.
// Full-page shots hide 4–10px defects; reviewers judge these crops instead. Writes docs/ui-checks/<area>/crops/<page>-<w>[-dark]-<part>.png.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import { readOnly } from './readonly.mjs'
import { stress } from './stress.mjs'
const R = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, ''), base = `http://127.0.0.1:${process.env.SHOT_PORT || 4330}`
const { PAGES } = await import(`${R}/mos-app/scripts/ui-check/pages.mjs`)
const [area, ...only] = process.argv.slice(2)
const user = process.env.SHOT_USER ?? PAGES[area].user
const pages = Object.entries(PAGES[area].pages).filter(([n]) => !only.length || only.includes(n))
  .map(([n, p]) => [n, typeof p === 'string' ? { path: p === 'BRANCH' ? '/money/branch/GHQ' : p } : p])
const pw = JSON.parse(fs.readFileSync(`${R}/.claude/launch.json`, 'utf8')).configurations.flatMap((c) => c.runtimeArgs || []).find((a) => a.startsWith('VITE_LOCAL_VIEW_AS_PASSWORD=')).split('=')[1]
const out = `${process.env.SHOT_OUT || `${R}/docs/ui-checks/${area}`}/crops`; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true })
// Parts: first match of each selector list that is visible.
const PARTS = { // shell parts by landmark; page parts only inside <main>, so shell chrome is never mistaken for page content
  sidebar: 'aside[aria-label], aside', topbar: 'header', 'tab-bar': 'nav[class*="tab-bar"], [class*="bottom-tab"]',
  title: 'main .page-head, main h1', toolbar: 'main [class*="toolbar"]', tabs: 'main [role=tablist]',
  'group-header': 'main [class*="group-header"]', 'table-head': 'main thead, main .cap-head, main [role=columnheader]',
  rows: 'main tbody, main .cap-body, main [role=list], main ul[class*="list"]', form: 'main form, [role=dialog] form',
  'action-bar': '[class*="action-bar"]', notice: 'main .notice', dialog: '[role=dialog]', menu: '[role=menu], [role=listbox]',
}
const b = await chromium.launch()
for (const [w, h, theme] of [[1440, 900, 'light'], [390, 844, 'light'], [1440, 900, 'dark'], [390, 844, 'dark']]) {
  const page = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  await readOnly(page)
  if (process.env.STRESS) await stress(page) // STRESS=1: ~180 realistic Café items, browser only
  if (theme === 'dark') await page.addInitScript(() => localStorage.setItem('mos-theme', 'dark'))
  if (user) {
    await page.goto(`${base}/login`); await page.getByLabel('Email').fill(user); await page.getByLabel('Password', { exact: true }).fill(pw)
    await page.getByRole('button', { name: /^sign in$/i }).click(); await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
  }
  for (const [name, spec] of pages) {
    if ((spec.phone && w >= 768) || (spec.wide && w < 768)) continue
    await page.goto(`${base}${spec.path}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1200)
    for (const a of spec.act || []) { if (a.key) await page.keyboard.press(a.key); else await page.getByRole(a.role, { name: a.name }).first().click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(700) }
    const tag = `${name}-${w}${theme === 'dark' ? '-dark' : ''}`
    for (const [part, sel] of Object.entries(PARTS)) {
      const el = page.locator(sel).filter({ visible: true }).first() // first visible match of the part
      if (!(await el.count())) continue
      const box = await el.boundingBox(); if (!box || box.width < 20 || box.height < 12) continue
      const clip = { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8), width: Math.min(w, box.width + 16), height: Math.min(h, box.height + 16, 700) }
      await page.screenshot({ path: `${out}/${tag}-${part}.png`, clip }).catch(() => {})
    }
  }
  await page.close()
}
await b.close()
console.log(`${area}: ${fs.readdirSync(out).length} crops in ${out}`)
