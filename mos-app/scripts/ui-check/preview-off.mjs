// Usage: cd <worktree> && node mos-app/scripts/ui-check/preview-off.mjs
// Proves the PREVIEW screens (ship state `preview`, mos-app/src/lib/ship-gate.ts) are NOT reachable unless the dev server was launched with
// the opt-in on the allowed port. It starts two throw-away dev servers from this worktree, signs in as an admin and tries every preview path:
//   A  no VITE_FUTURE_PREVIEW at all (the production-like case)
//   B  VITE_FUTURE_PREVIEW=1 but on a port that is not 4400 and with no port override (flag set, wrong port)
// `--control` is the self-test: ONE server with the full opt-in (flag + its own port), where every routed preview path must stay reachable,
// proving the check can see a reachable preview (it is not passing because it looks at nothing).
// On each: the direct URL must forward away and show no preview screen, no Café menu / Café home link, Admin entry, person Modules section or People notice may name one, and
// the command menu must not offer it. Exit 1 on any finding. Every page is read-only (readOnly). Local data only.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import { readOnly } from './readonly.mjs'
import { stress } from './stress.mjs'

const R = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '')
const launch = JSON.parse(fs.readFileSync(`${R}/.claude/launch.json`, 'utf8')).configurations.flatMap((c) => c.runtimeArgs || [])
const viteEnv = launch.filter((a) => a.startsWith('VITE_') && a.includes('='))
const pw = viteEnv.find((a) => a.startsWith('VITE_LOCAL_VIEW_AS_PASSWORD=')).split('=')[1]
const USER = 'dewi@sample.gordi.test'
const PERSON = 'cbad6f1a-cd87-5565-acd7-c52fa722e764' // Bayu Barista
// ROUTED preview paths must forward away. A preview path with no route behind it (a descendant, /cafe/locations) must still show no preview screen.
const ROUTED = ['/cafe/transfer-routes', '/cafe/transfer-routes?route=new', '/cafe/locations', '/cafe/locations?layout=preview', '/cafe/locations?layout=preview&location=new', '/cafe/locations/change-location', '/cafe/locations/move', '/admin/modules', '/admin/modules?q=cafe', '/admin/access/modules', '/admin/access/modules?view=people', '/cafe/stock-comparison', '/cafe/stock-comparison?stream=2d63ab19-142c-5ecb-9f88-6b512eebe581:kitchen&layout=preview']
const UNROUTED = ['/cafe/transfer-routes/anything', '/cafe/locations/anything', '/cafe/stock-comparison/anything']
// Released pages that carry preview-only location fields; with the opt-in off they must be byte-for-byte what they were (no field, no label, no door).
const CAPTURE_USER = 'krishna@sample.gordi.test'
const CAPTURE = ['/cafe/production', '/cafe/transfer', '/cafe/waste', '/cafe/count', '/cafe/receive', '/cafe/records', '/cafe/stock']
const LOCATION_TEXT = /production location|store output in|storage location|store in\b|from storage|to storage|change location|lokasi produksi|simpan hasil di|lokasi penyimpanan|simpan di\b|dari penyimpanan|ke penyimpanan|pindah lokasi|not recorded|belum dicatat/i
const PATHS = [...ROUTED, ...UNROUTED]

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) }) })
const servers = []
const CONTROL = process.argv.includes('--control')
async function startServer(name, extraEnv, withFlag) {
  let port = await freePort()
  if (port === 4400) port = await freePort() // B must NOT be the allowed port
  const env = { ...process.env, ...Object.fromEntries(viteEnv.filter((a) => withFlag || !a.startsWith('VITE_FUTURE_PREVIEW')).map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)])), ...extraEnv }
  delete env.VITE_FUTURE_PREVIEW_PORT // a side-server override would make the wrong-port case pass for the wrong reason
  if (CONTROL) env.VITE_FUTURE_PREVIEW_PORT = String(port)
  if (!withFlag) delete env.VITE_FUTURE_PREVIEW
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: `${process.cwd()}/mos-app`, env, stdio: 'ignore', detached: true })
  servers.push(child)
  for (let i = 0; i < 90; i++) { try { if ((await fetch(`http://127.0.0.1:${port}/login`)).ok) return { name, port } } catch { /* not up yet */ } await new Promise((r) => setTimeout(r, 1000)) }
  throw new Error(`${name}: dev server did not start`)
}
const stopAll = () => { for (const c of servers) { try { process.kill(-c.pid, 'SIGTERM') } catch { /* already gone */ } } }
process.on('SIGINT', () => { stopAll(); process.exit(130) })

const findings = []
const embedded = [] // capture / Records / Available to transfer pages that show a location field
const recipeMarks = [] // Recipes shows the Hide in MOS preview (switch, Show hidden, In MOS column, preview mark)
const browser = await chromium.launch()
try {
  const targets = CONTROL ? [await startServer('C: full opt-in (control)', {}, true)] : [await startServer('A: no flag', {}, false), await startServer('B: flag on, port is not 4400', {}, true)]
  for (const { name, port } of targets) {
    const base = `http://127.0.0.1:${port}`
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } })
      const page = await ctx.newPage(); await readOnly(page, () => {})
      await page.goto(`${base}/login`)
      await page.getByLabel('Email').fill(USER)
      await page.getByLabel('Password', { exact: true }).fill(pw)
      await page.getByRole('button', { name: /^sign in$/i }).click()
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
      for (const path of PATHS) {
        await page.goto(`${base}${path}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(800)
        const at = new URL(page.url())
        const kept = ROUTED.includes(path) && at.pathname === path.split('?')[0]
        const preview = await page.getByText(/preview · not saved|pratinjau · belum disimpan/i).count()
        const heading = await page.getByRole('heading', { level: 1, name: /^(transfer routes|modules|locations|lokasi|change location|pindah lokasi|stock comparison|perbandingan persediaan)$/i }).count()
        if (kept || preview || heading) findings.push(`${name} ${w}: ${path} stayed reachable (at ${at.pathname}, preview marks ${preview}, headings ${heading})`)
      }
      // No door to them anywhere in the navigation the viewer can open.
      for (const menuPath of ['/cafe', '/cafe/count', '/cafe/stock', '/cafe/records', '/admin/access', '/admin/people', `/admin/people/${PERSON}`, '/admin/people?overrides=cafe']) {
        await page.goto(`${base}${menuPath}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(800)
        const links = await page.locator('a[href*="/cafe/transfer-routes"], a[href*="/cafe/locations"], a[href*="/cafe/stock-comparison"], a[href*="/admin/access/modules"], a[href*="/admin/modules"]').count()
        const tab = await page.getByRole('tab', { name: /^(modules|modul)$/i }).count()
        // Admin's phone section switcher, a person's Modules section and the People overrides notice are doors too.
        const switcher = await page.locator('nav.admin-settings-nav option').filter({ hasText: /^(modules|modul)$/i }).count()
        const section = await page.getByRole('heading', { level: 2, name: /^(modules|modul)$/i }).count()
        const notice = await page.getByText(/personal module overrides|pengecualian modul pribadi/i).count()
        if (links || tab || switcher || section || notice) findings.push(`${name} ${w}: ${menuPath} offers a preview door (${links} links, ${tab} tabs, ${switcher} switcher entries, ${section} person sections, ${notice} notices)`)
      }
      if (w >= 768) {
        await page.goto(`${base}/`); await page.waitForLoadState('networkidle').catch(() => {}); await page.keyboard.press('Meta+k'); await page.waitForTimeout(500)
        for (const query of ['Transfer routes', 'Stock comparison']) {
          await page.keyboard.type(query); await page.waitForTimeout(500)
          const offered = await page.locator('[role=option], [role=dialog] a').evaluateAll((els) => els.map((el) => `${el.textContent} ${el.getAttribute('href') || ''}`).filter((text) => !/^\s*no matches/i.test(text) && /transfer[- ]routes|stock[- ]comparison|\/admin\/(access\/)?modules/i.test(text)))
          if (offered.length) findings.push(`${name}: the command menu offers a preview screen (${offered.join(' | ').slice(0, 120)})`)
          await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace')
        }
      }
      await ctx.close()
    }
    // The released capture / Records / Available to transfer pages: no location field, label, link or Change location door.
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } })
      const page = await ctx.newPage(); await readOnly(page, () => {})
      await page.goto(`${base}/login`)
      await page.getByLabel('Email').fill(CAPTURE_USER)
      await page.getByLabel('Password', { exact: true }).fill(pw)
      await page.getByRole('button', { name: /^sign in$/i }).click()
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
      for (const path of CAPTURE) {
        await page.goto(`${base}${path}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1200)
        const marks = await page.locator('[data-location-preview]').count()
        const doors = await page.locator('a[href*="/cafe/locations"], a[href*="/cafe/stock-comparison"]').count()
        const text = await page.locator('main').innerText().catch(() => '')
        const hit = LOCATION_TEXT.exec(text)
        if (marks || doors || hit) embedded.push(`${name} ${w}: ${path} shows location fields (marks ${marks}, links ${doors}${hit ? `, text "${hit[0]}"` : ''})`)
      }
      await ctx.close()
    }
    // Recipes: Hide in MOS is a preview inside a released page. With the opt-in off there is no switch, no Show hidden filter, no In MOS column and no preview mark.
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } })
      const page = await ctx.newPage(); await readOnly(page, () => {}); await stress(page) // the local data has no recipes: STRESS adds some, browser only
      await page.goto(`${base}/login`)
      await page.getByLabel('Email').fill(USER)
      await page.getByLabel('Password', { exact: true }).fill(pw)
      await page.getByRole('button', { name: /^sign in$/i }).click()
      await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 20000 })
      for (const path of ['/cafe/recipes', '/cafe/recipes?recipe=STRESS-0028:9040']) {
        await page.goto(`${base}${path}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500)
        const listed = await page.getByRole('link', { name: /Batch|Portion/ }).count() // the recipes did load, so an absent switch is not an empty page
        const marks = await page.getByRole('switch').count() + await page.getByRole('checkbox', { name: /show hidden|tampilkan yang disembunyikan/i }).count()
          + await page.getByText(/^(in mos|di mos)$/i).count() + await page.getByText(/preview · not saved|pratinjau · belum disimpan/i).count()
        if (!listed) recipeMarks.push(`${name} ${w}: ${path} listed no recipes, so the check proves nothing`)
        else if (marks) recipeMarks.push(`${name} ${w}: ${path} shows ${marks} Hide in MOS elements`)
      }
      await ctx.close()
    }
  }
} catch (e) { findings.push(`check could not run: ${e.message}`) } finally { await browser.close(); stopAll() }
if (CONTROL) {
  const reachable = findings.filter((f) => /stayed reachable/.test(f))
  const ok = reachable.length >= ROUTED.length && embedded.length >= CAPTURE.length && recipeMarks.filter((f) => /shows \d+ Hide/.test(f)).length >= 3 // every routed path, at least once per width; every released page shows its fields
  console.log(ok ? `PREVIEW-OFF CONTROL PASS: with the full opt-in the check sees ${reachable.length} reachable preview paths and ${embedded.length} released pages showing location fields, and ${recipeMarks.length} Recipes views showing Hide in MOS` : `PREVIEW-OFF CONTROL FAIL: only ${reachable.length} reachable findings; the check may be blind\n  ${findings.join('\n  ')}`)
  process.exit(ok ? 0 : 1)
}
findings.push(...embedded, ...recipeMarks)
if (findings.length) { console.log(`PREVIEW-OFF FAIL (${findings.length})`); for (const f of findings) console.log(`  ${f}`); process.exit(1) }
console.log(`PREVIEW-OFF PASS: ${PATHS.length} preview paths forward away, no menu/tab/command-menu door, ${CAPTURE.length} released pages show no location field, Recipes shows no Hide in MOS switch, filter, column or mark, flag off and flag on at the wrong port`)
