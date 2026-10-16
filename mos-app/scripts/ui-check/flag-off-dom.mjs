// Usage: cd <worktree> && node mos-app/scripts/ui-check/flag-off-dom.mjs — starts two flag-OFF dev servers (main repo vs this worktree) and compares the normalised DOM of the released capture / Records / Available to transfer / Count pages (as a stream lead and as an admin reviewer); exit 1 on any difference.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { readOnly } from './readonly.mjs'
const R = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, ''), W = process.env.FLAG_OFF_WORKTREE || process.cwd() // the worktree under test (cwd by default)
const PA = +(process.env.FLAG_OFF_PORT || 4451), PB = PA + 1 // main repo, worktree
const launch = JSON.parse(fs.readFileSync(`${R}/.claude/launch.json`, 'utf8')).configurations.flatMap((c) => c.runtimeArgs || [])
const viteEnv = launch.filter((a) => a.startsWith('VITE_') && a.includes('=') && !a.startsWith('VITE_FUTURE_PREVIEW'))
const pw = viteEnv.find((a) => a.startsWith('VITE_LOCAL_VIEW_AS_PASSWORD=')).split('=')[1]
const env = { ...process.env, ...Object.fromEntries(viteEnv.map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)])) }
delete env.VITE_FUTURE_PREVIEW
const servers = []
const start = async (root, port) => { const c = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: `${root}/mos-app`, env, stdio: 'ignore', detached: true }); servers.push(c)
  for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/login`)).ok) return } catch {} await new Promise((r) => setTimeout(r, 1000)) } throw new Error('no start') }
await start(R, PA); await start(W, PB)
const b = await chromium.launch()
const norm = (h) => h.replace(/:r[0-9a-z]+:/g, ':rX:').replace(/radix-[:\w-]+/g, 'radix').replace(/\d{1,2}:\d{2}(:\d{2})?/g, 'T')
// Two viewers: a Kitchen stream lead, and an admin (a Count reviewer, who is the one who would see the stock comparison link and menu entry when the preview is on).
const runs = [
  { user: 'krishna@sample.gordi.test', pages: ['/cafe/production', '/cafe/transfer', '/cafe/waste', '/cafe/count', '/cafe/receive', '/cafe/request', '/cafe/records', '/cafe/stock', '/cafe/records?question=made&reading=entries'] },
  { user: 'dewi@sample.gordi.test', pages: ['/cafe', '/cafe/count?stream=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen', '/cafe/stock', '/cafe/records'] },
]
let bad = 0
for (const [w, h] of [[1440, 900], [390, 844]]) {
  for (const { user, pages } of runs) {
    const out = {}
    for (const port of [PA, PB]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h } }); const page = await ctx.newPage(); await readOnly(page, () => {})
      await page.goto(`http://127.0.0.1:${port}/login`); await page.getByLabel('Email').fill(user); await page.getByLabel('Password', { exact: true }).fill(pw)
      await page.getByRole('button', { name: /^sign in$/i }).click(); await page.waitForURL((u) => !u.pathname.endsWith('/login'))
      for (const p of pages) { await page.goto(`http://127.0.0.1:${port}${p}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500)
        ;(out[p] ||= {})[port] = norm(await page.evaluate(() => document.querySelector('#root, body').outerHTML)) }
      await ctx.close()
    }
    for (const p of pages) { const same = out[p][PA] === out[p][PB]; if (!same) bad++; console.log(w, user.split('@')[0], p, same ? 'IDENTICAL' : `DIFF (${out[p][PA].length} vs ${out[p][PB].length})`) }
  }
}
await b.close(); for (const c of servers) { try { process.kill(-c.pid, 'SIGTERM') } catch {} }
process.exit(bad ? 1 : 0)
