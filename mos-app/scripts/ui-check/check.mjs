// Usage: node mos-app/scripts/ui-check/check.mjs <area> [page...]   (SHOT_PORT, SHOT_USER as in shots.mjs)
// One signed-in pass per page at 1920, 1440 and 390: screenshot, axe-core, layout checks, Impeccable detector.
// Writes docs/ui-checks/<area>/shots/<page>-<w>.png, docs/ui-checks/<area>/checks.json and docs/ui-checks/<area>/detect.json.
// STRESS=1 enlarges Café item reads in the browser to a real catalogue (mos-app/scripts/ui-check/stress.mjs). Capture gates (layout): inner width,
// column alignment, adjacent-block spacing, and on phone every "Filters" select is operated. NO_DETECT=1 skips the detector (fast loops only).
// Exit 1 when anything blocks: axe serious/critical, horizontal scroll, phone targets < 44px,
// not exactly one h1, or any detector finding (owner ignores live in .impeccable/config.json).
// axe gate reused from gordi-mos e2e/axe-core-routes.spec.ts; sign-in from e2e/helpers/login.ts.
// Speed (same checks, same strictness): ONE sign-in per run (playwright storageState reused by every width/theme), the five
// width/theme passes run side by side as contexts of ONE Chromium (CHECK_SHAPES, default 3), and the detector scans every page of a viewport in
// one process (detect-batch.mjs, DETECT_CONC browsers side by side, default 1; viewports one after the other) alongside them instead of one process per page.
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { execFile, execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readOnly } from './readonly.mjs'
import { stress } from './stress.mjs'

const R = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '')
const PORT = process.env.SHOT_PORT || 4330
const base = `http://127.0.0.1:${PORT}`
const { PAGES } = await import(`${R}/mos-app/scripts/ui-check/pages.mjs`)
const [area, ...only] = process.argv.slice(2)
const user = process.env.SHOT_USER ?? PAGES[area].user
const pages = Object.entries(PAGES[area].pages).filter(([n]) => !only.length || only.includes(n))
  .map(([n, p]) => [n, typeof p === 'string' ? { path: p === 'BRANCH' ? '/money/branch/GHQ' : p } : p])
const pw = JSON.parse(fs.readFileSync(`${R}/.claude/launch.json`, 'utf8')).configurations.flatMap((c) => c.runtimeArgs || [])
  .find((a) => a.startsWith('VITE_LOCAL_VIEW_AS_PASSWORD=')).split('=')[1]
const axeScript = `${R}/mos-app/node_modules/axe-core/axe.min.js`
const out = process.env.SHOT_OUT || `${R}/docs/ui-checks/${area}`; fs.mkdirSync(`${out}/shots`, { recursive: true })

// Known exclusions for this job (set by run-proof from the brief, never by the builder): comma-separated
// axe ids / detector rules / layout prefixes, e.g. CHECK_IGNORE=label-content-name-mismatch. Recorded in checks.json.
const ignore = (process.env.CHECK_IGNORE || '').split(',').map((x) => x.trim()).filter(Boolean)
const kept = (s) => !ignore.some((i) => s.startsWith(i))
const T0 = Date.now(), secs = () => Math.round((Date.now() - T0) / 100) / 10
const browser = await chromium.launch()
// Every page in light at three widths, and in dark (the app's own theme setting) at desktop and phone.
const shapes = [[1920, 1080, 'light'], [1440, 900, 'light'], [390, 844, 'light'], [1440, 900, 'dark'], [390, 844, 'dark'], ...(PAGES[area].shapes || []).map(([w, h]) => [w, h, 'light'])]

// Sign in ONCE (the real form, as before); every width/theme context starts from this session instead of signing in again.
let storageState = null, sessionEntries = []
if (user) {
  const lctx = await browser.newContext(); const lp = await lctx.newPage(); await readOnly(lp)
  await lp.goto(`${base}/login`)
  await lp.getByLabel('Email').fill(user)
  await lp.getByLabel('Password', { exact: true }).fill(pw)
  await lp.getByRole('button', { name: /^sign in$/i }).click()
  await lp.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 120000 })
  storageState = await lctx.storageState(); await lctx.close()
  sessionEntries = (storageState.origins.find((o) => o.origin === base)?.localStorage || []).filter((e) => /^sb-.*-auth-token$/.test(e.name)).map((e) => [e.name, e.value])
  if (!sessionEntries.length) throw new Error(`sign-in as ${user} produced no session`)
}

// Impeccable detector, signed in, both widths: one process per viewport for every page (detect-batch.mjs), started now so it
// runs while the pages are checked. If a batch fails as a whole, that viewport falls back to the per-page wrapper (never silent).
const detectPromise = (process.env.NO_DETECT || PAGES[area].detect === false) ? Promise.resolve([]) : (async () => { // NO_DETECT=1 skips the detector in fast loops (never for a final gate)
  const sessionFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'check-session-')), 'session.json'); fs.writeFileSync(sessionFile, JSON.stringify(sessionEntries))
  const urls = [...new Set(pages.map(([, { path: p }]) => `${base}${p}`))]
  const viewports = ['1440x900', '390x844']
  const batch = (vp) => new Promise((resolve) => execFile('node', [`${R}/mos-app/scripts/ui-check/detect-batch.mjs`, '--viewport', vp, '--session', sessionFile, '--conc', process.env.DETECT_CONC || '1', ...urls],
    { cwd: R, encoding: 'utf8', maxBuffer: 64 << 20 }, (err, stdout, stderr) => { try { resolve(JSON.parse(stdout)) } catch { console.log(`detector batch ${vp} failed (${err?.message?.split('\n')[0] || 'no JSON'}${stderr ? `: ${String(stderr).split('\n')[0]}` : ''}); falling back to one process per page`); resolve(null) } }))
  const perPage = (vp) => urls.flatMap((url) => { // the old way, one process per page
    let raw = '[]'
    try { raw = execFileSync('node', [`${R}/scripts/impeccable-detect.mjs`, '--json', '--viewport', vp, url], { cwd: R, env: { ...process.env, IMPECCABLE_SIGN_IN: user ?? 'none' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) }
    catch (e) { raw = e.stdout || '[]' }
    return JSON.parse(raw || '[]')
  })
  const byVp = {}; for (const vp of viewports) byVp[vp] = (await batch(vp)) ?? perPage(vp) // one viewport at a time: one detector browser at once by default
  fs.rmSync(path.dirname(sessionFile), { recursive: true, force: true }) // the session tokens live only for the scan
  const out = []
  for (const [name, { path: p }] of pages) for (const vp of viewports)
    for (const f of byVp[vp].filter((x) => x.file === `${base}${p}`)) out.push({ page: name, viewport: vp, rule: f.antipattern || f.id, where: f.selector || f.file, detail: f.description || f.message })
  return out
})()

async function runShape([w, h, theme]) {
  const results = [], sigs = [] // this shape's own; merged in shape order below
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(storageState ? { storageState } : {}) }) // already signed in
  const page = await ctx.newPage()
  page.setDefaultTimeout(60000); page.setDefaultNavigationTimeout(120000) // several builders share one slow machine: a cold dev-server page load can take over 30s
  await readOnly(page)
  if (process.env.STRESS) await stress(page) // STRESS=1: ~180 realistic Café items, browser only
  const tag = theme === 'dark' ? `${w}-dark` : `${w}`
  if (theme === 'dark') await page.addInitScript(() => localStorage.setItem('mos-theme', 'dark'))
  for (const [name, spec] of pages) {
    const { path, act = [] } = spec
    if (spec.phone && w >= 768) continue
    if (spec.wide && w < 768) continue
    if (spec.user && spec.user !== user) continue // shell pages for another user run in their own pass
    await page.goto(`${base}${path}`); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1200)
    if (PAGES[area].choose) { // a viewer with several streams and no default: pick the stream (kept in the tab's session for the next pages)
      const pick = page.getByRole('button', { name: PAGES[area].choose }).first()
      if (await pick.count()) { await pick.click().catch(() => {}); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500) }
    }
    for (const a of act) {
      if (a.key) await page.keyboard.press(a.key)
      else if (a.text) await page.locator('main summary').filter({ hasText: a.text }).first().click({ timeout: 5000 }).catch(() => {}) // a phone Filters disclosure (a <summary> has no button role); skipped where it is absent (desktop)
      else await page.getByRole(a.role, { name: a.name }).first().click({ timeout: 5000 }).catch((e) => console.log(`${name}: could not ${a.name}: ${e.message.split('\n')[0]}`))
      await page.waitForTimeout(700)
    }
    await page.screenshot({ path: `${out}/shots/${name}-${tag}.png` })
    await page.addScriptTag({ path: axeScript })
    const axe = await page.evaluate(async () => (await window.axe.run(document)).violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => `${v.id} [${v.impact}] ×${v.nodes.length}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`))
    const layout = await page.evaluate((phone) => {
      const issues = []
      const se = document.scrollingElement
      if (se.scrollWidth > se.clientWidth + 1) issues.push(`horizontal page scroll: ${se.scrollWidth}px > ${se.clientWidth}px`)
      const h1 = document.querySelectorAll('h1').length
      if (h1 !== 1) issues.push(`h1 count ${h1} (want 1)`)
      // One choice, one control: a page must not offer the same set of choices twice. A tablist (or radio group) is compared with
      // every other tablist / radio group / native select inside <main>: when one control has an entry for each of >= 2 of the
      // other's labels (an entry covers a label when the entry's words include all of the label's words, counts and punctuation
      // ignored), the viewer is asked the same question twice ("Logs & Counts" in a select AND Logs / Counts as tabs). Two selects
      // are never compared (From / To legitimately share a list). Visible controls only; the app's designed Select is read through its hidden native <select data-select-native>.
      {
        const words = (s) => (s.toLowerCase().match(/\p{L}+/gu) || []).filter((x) => !['and', 'dan', 'of', 'the', 'yang', 'atau', 'or'].includes(x))
        const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
        const scope = document.querySelector('main') || document.body
        const controls = []
        for (const tl of scope.querySelectorAll('[role=tablist]')) if (vis(tl)) controls.push({ kind: 'tabs', name: tl.getAttribute('aria-label') || 'tabs', labels: [...tl.querySelectorAll('[role=tab]')].map((x) => x.innerText.trim()) })
        for (const rg of scope.querySelectorAll('[role=radiogroup]')) if (vis(rg)) controls.push({ kind: 'choice buttons', name: rg.getAttribute('aria-label') || 'radio group', labels: [...rg.querySelectorAll('[role=radio], label')].map((x) => (x.innerText || '').trim()) })
        for (const sel of scope.querySelectorAll('select')) { // the app's designed Select shows a combobox button and keeps its options in a hidden native <select data-select-native>
          const host = sel.hasAttribute('data-select-native') ? sel.closest('.mk-select') : sel
          if (host && vis(host)) controls.push({ kind: 'select', name: host.querySelector('label')?.innerText.trim() || sel.getAttribute('aria-label') || sel.labels?.[0]?.innerText.trim() || 'select', labels: [...sel.options].map((o) => o.textContent.trim()) })
        }
        for (const a of controls) {
          if (a.kind === 'select') continue // the strip (tabs / radio group) is the thing being checked against everything else
          const mine = a.labels.map(words).filter((w) => w.length)
          if (mine.length < 2) continue
          for (const b of controls) {
            if (b === a || (b.kind !== 'select' && controls.indexOf(b) < controls.indexOf(a))) continue // each pair once
            const entries = b.labels.map(words)
            const covered = mine.filter((w) => entries.some((e) => w.every((x) => e.includes(x)))).length
            if (covered >= 2) issues.push(`duplicate choices: ${a.kind} "${a.name}" (${a.labels.map((x) => x.replace(/\s+/g, ' ')).join(' / ')}) offers the same choices as ${b.kind} "${b.name}" (${b.labels.slice(0, 6).map((x) => x.replace(/\s+/g, ' ')).join(' / ')}${b.labels.length > 6 ? ' / …' : ''}) — one choice needs one control`)
          }
        }
      }
      // One page width everywhere: on wide screens the content track fills the space beside the sidebar.
      const track = document.querySelector('.page-frame__content'), main = track?.parentElement
      if (!phone && track && main) {
        const tr = track.getBoundingClientRect(), mr = main.getBoundingClientRect()
        if (tr.width < 0.9 * (mr.width - 64)) issues.push(`page width: content ${Math.round(tr.width)}px of ${Math.round(mr.width)}px available`)
        if (tr.left - mr.left > 48) issues.push(`page width: content starts ${Math.round(tr.left - mr.left)}px in (centred, not on the left edge)`)
      }
      // Icons sit on the centre line of the text beside them (same row, up to 3 parents up; stacked icons skipped).
      const offs = []
      for (const svg of document.querySelectorAll('svg')) {
        const sr = svg.getBoundingClientRect(); if (sr.width < 6 || sr.width > 40 || sr.bottom < 0 || sr.top > innerHeight) continue
        // An icon inside a labelled control is compared with that control's own text. A free-standing icon, or an
        // icon-only control (e.g. a menu chevron beside its label), uses the nearest text on its row, up to 2 parents up.
        let ctl = svg.closest('a,button,summary,[role=button],[role=tab],[role=menuitem],[role=option]'), start = svg
        if (ctl && !(ctl.innerText || '').trim()) { start = ctl; ctl = null }
        let row = ctl || start.parentElement, line = null
        for (let up = 0; up < (ctl ? 1 : 3) && row && !line; up++, row = row.parentElement) {
          const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT); let best = Infinity
          for (let n; (n = walker.nextNode());) {
            const pe = n.parentElement, ps = getComputedStyle(pe), pr = pe.getBoundingClientRect()
            if (!n.textContent.trim() || ps.visibility === 'hidden' || pr.width <= 1 || pr.height <= 1 || ps.clipPath === 'inset(50%)' || ps.clip === 'rect(0px, 0px, 0px, 0px)') continue // invisible screen-reader text is not "beside" the icon
            const rg = document.createRange(); rg.selectNodeContents(n); const rs = [...rg.getClientRects()]
            if (rs.length !== 1) continue
            const l = rs[0]; if (!l.width || l.top >= sr.bottom || l.bottom <= sr.top) continue // beside the icon, not above/below
            // The icon's label is the text that shares most of its height, then the nearest one sideways.
            const overlap = Math.min(l.bottom, sr.bottom) - Math.max(l.top, sr.top), gap = Math.max(l.left - sr.right, sr.left - l.right, 0)
            const score = -overlap * 1000 + gap
            if (score < best) { best = score; line = l }
          }
        }
        if (!line) continue
        const d = (sr.top + sr.height / 2) - (line.top + line.height / 2)
        if (Math.abs(d) > 3) offs.push(`${svg.closest('a,button,summary,[role]')?.getAttribute('aria-label') || row?.innerText?.trim().slice(0, 24) || 'icon'} ${d > 0 ? '+' : ''}${Math.round(d)}px`)
      }
      if (offs.length) issues.push(`icon off text centre: ${offs.slice(0, 6).join('; ')}${offs.length > 6 ? ` (+${offs.length - 6})` : ''}`)
      if (phone) {
        const small = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=checkbox],summary')]
          .filter((el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
            return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && (r.width < 44 || r.height < 44) && r.bottom > 0 && r.top < innerHeight })
          .map((el) => { const r = el.getBoundingClientRect(); return `${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 30)}" ${Math.round(r.width)}×${Math.round(r.height)}` })
        if (small.length) issues.push(`targets < 44px (first viewport): ${small.slice(0, 8).join('; ')}${small.length > 8 ? ` (+${small.length - 8})` : ''}`)
      }
      // ── Capture-defect gates: found by the owner on a real catalogue (long names, long units, 180 rows) ──
      const shown = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
      const mainEl = document.querySelector('main'), trk = document.querySelector('.page-frame__content') || mainEl
      const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}${(el.innerText || el.getAttribute('aria-label') || el.placeholder || '').trim() ? ` "${(el.innerText || el.getAttribute('aria-label') || el.placeholder).trim().slice(0, 24)}"` : ''}`
      if (mainEl && trk) {
        const tr = trk.getBoundingClientRect()
        // (a) Inner width: the main table/list fills the content track (a record or side panel beside it counts as used).
        const tables = [...mainEl.querySelectorAll('table, [role=table], [role=grid], .dt-cards')].filter((e) => shown(e) && !e.closest('[role=dialog]') && e.querySelectorAll('tr, .dt-card, [role=row]').length >= 3)
        const area = (e) => { const r = e.getBoundingClientRect(); return r.width * Math.min(r.height, 1200) }
        const tbl = tables.sort((a, b) => area(b) - area(a))[0]
        if (tbl) {
          const cr = tbl.getBoundingClientRect()
          const beside = [...mainEl.querySelectorAll('*')].filter((e) => {
            if (e === tbl || e.contains(tbl) || tbl.contains(e) || !shown(e)) return false
            const r = e.getBoundingClientRect()
            return r.width >= 140 && r.height >= 60 && r.top < cr.bottom && r.bottom > cr.top - 200 // beside the list, or beside its toolbar just above it
              && (r.left >= cr.right - 1 || r.right <= cr.left + 1) && r.left >= tr.left - 1 && r.right <= tr.right + 1
          })
          const outer = beside.filter((e) => !beside.some((o) => o !== e && o.contains(e)))
          const used = cr.width + outer.reduce((n, e) => n + e.getBoundingClientRect().width, 0)
          if (used < 0.9 * tr.width) issues.push(`inner width: the main ${tbl.tagName === 'TABLE' ? 'table' : 'list'} is ${Math.round(cr.width)}px of a ${Math.round(tr.width)}px content track${outer.length ? ` (+${Math.round(used - cr.width)}px side panel)` : ''}`)
        }
        // (b) Column alignment: the n-th quantity input (and its unit) of every row starts at the same x.
        const qty = [...mainEl.querySelectorAll('input[inputmode=decimal], input[inputmode=numeric], input[type=number]')].filter((e) => shown(e) && !e.closest('[role=dialog]'))
        const rowOf = (e) => e.closest('tr, [role=group], article, li, .dt-card')
        const byRow = new Map()
        for (const el of qty) { const rw = rowOf(el); if (rw) byRow.set(rw, [...(byRow.get(rw) || []), el]) }
        const unitOf = (input) => { // the first visible text beside the input on its line
          const rw = rowOf(input), ir = input.getBoundingClientRect(); if (!rw) return null
          const walker = document.createTreeWalker(rw, NodeFilter.SHOW_TEXT)
          for (let n; (n = walker.nextNode());) {
            if (!n.textContent.trim() || !(input.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) || input.contains(n)) continue
            const pe = n.parentElement, ps = getComputedStyle(pe); if (ps.visibility === 'hidden' || ps.display === 'none' || ps.clipPath === 'inset(50%)') continue
            const rg = document.createRange(); rg.selectNodeContents(n); const l = rg.getClientRects()[0]
            if (!l || !l.width || l.width < 2 || l.left < ir.right - 2 || l.bottom <= ir.top || l.top >= ir.bottom) continue
            return l.left
          }
          return null
        }
        const cols = {} // column index -> { q: [lefts], u: [lefts] }
        for (const list of byRow.values()) list.forEach((el, k) => {
          const c = (cols[k] ||= { q: [], u: [] }); c.q.push(el.getBoundingClientRect().left)
          const u = unitOf(el); if (u != null) c.u.push(u)
        })
        const spread = (a) => Math.max(...a) - Math.min(...a)
        for (const [k, c] of Object.entries(cols)) {
          if (c.q.length >= 2 && spread(c.q) > 1) issues.push(`column alignment: quantity inputs${Object.keys(cols).length > 1 ? ` (field ${+k + 1})` : ''} start between ${Math.round(Math.min(...c.q))} and ${Math.round(Math.max(...c.q))}px across ${c.q.length} rows`)
          if (c.u.length >= 2 && spread(c.u) > 1) issues.push(`column alignment: unit labels${Object.keys(cols).length > 1 ? ` (field ${+k + 1})` : ''} start between ${Math.round(Math.min(...c.u))} and ${Math.round(Math.max(...c.u))}px across ${c.u.length} rows`)
        }
        // (b2) Header cells: in a capture list the quantity box and its unit sit under the header cells that name them (<= 1px),
        // wide or stacked. Checked on the first row's box and unit against the header's box and unit cells.
        for (const tb of mainEl.querySelectorAll('.cap-table')) {
          if (!shown(tb)) continue
          const heads = [...tb.querySelectorAll('.cap-head__control')].filter(shown)
          const rows = [...tb.querySelectorAll('.cap-row')].filter(shown)
          heads.forEach((hd, k) => {
            const hb = hd.children[0], hu = hd.children[1]; if (!hb) return
            const bad = []
            for (const rw of rows.slice(0, 40)) {
              const ctl = [...rw.querySelectorAll('.cap-control')].filter(shown)[k]; if (!ctl) continue
              const box = ctl.querySelector('input'), unit = ctl.querySelector('.cap-unit, .quantity-field-suffix'); if (!box) continue
              const dq = box.getBoundingClientRect().left - hb.getBoundingClientRect().left
              const ur = unit && shown(unit) ? unit.getBoundingClientRect() : null, br = box.getBoundingClientRect()
              const du = hu && ur && ur.top < br.bottom - 2 ? ur.left - hu.getBoundingClientRect().left : 0 // a long unit may drop under the box: not beside it, not compared
              if (Math.abs(dq) > 1) bad.push(`box ${Math.round(dq)}px`)
              if (Math.abs(du) > 1) bad.push(`unit ${Math.round(du)}px`)
              if (bad.length) break
            }
            if (bad.length) issues.push(`column alignment: ${bad[0].startsWith('box') ? 'quantity boxes' : 'units'}${heads.length > 1 ? ` (field ${k + 1})` : ''} are ${bad[0].replace(/^\w+ /, '')} off the header cell "${(bad[0].startsWith('box') ? hb : hu).innerText.trim().slice(0, 20)}"`)
          })
        }
        // (d) Adjacent blocks: a painted box (control or band) never touches a wide band above or below it (>= 8px gap),
        // except inside one table/list (its own header, group bands and rows stack by design).
        const painted = []
        for (const el of mainEl.querySelectorAll('*')) {
          if (!shown(el) || el.closest('[role=dialog]')) continue
          const s = getComputedStyle(el), r = el.getBoundingClientRect()
          let fixed = false; for (let a = el; a && a !== mainEl; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'fixed' || p === 'sticky') { fixed = true; break } }
          if (fixed || r.height < 24 || r.width < 40) continue
          const bg = s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent'
          const box = ['Top', 'Right', 'Bottom', 'Left'].every((d) => parseFloat(s[`border${d}Width`]) >= 1 && s[`border${d}Style`] !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(s[`border${d}Color`]))
          const ctl = /^(input|select|textarea|button)$/i.test(el.tagName) || el.getAttribute('role') === 'combobox'
          if (bg || (box && (ctl || r.width >= 0.6 * tr.width))) painted.push({ el, r, band: bg && r.width >= 0.6 * tr.width && !ctl })
        }
        const root = (e) => e.closest('table, [role=table], [role=grid], [role=list], .dt-cards, .dt-table, [class*="worksheet"]')
        const chrome = (e) => /(^|\s)(group-header|[\w-]*-head|[\w-]*__header|[\w-]*__columns)(\s|$)/.test(typeof e.className === 'string' ? e.className : '') // a list's own header and group bands stack by design
        const touches = []
        for (const b of painted.filter((p) => p.band)) for (const p of painted) {
          if (p === b || b.el.contains(p.el) || p.el.contains(b.el) || (root(p.el) && root(p.el) === root(b.el)) || (chrome(p.el) && chrome(b.el))) continue
          const over = Math.min(p.r.right, b.r.right) - Math.max(p.r.left, b.r.left); if (over < 8) continue
          const above = b.r.top - p.r.bottom, below = p.r.top - b.r.bottom // p sits above b / below b
          if (above >= -0.5 && above < 8) touches.push(`${label(p.el)} → ${label(b.el)} (${Math.max(0, Math.round(above))}px)`)
          else if (below >= -0.5 && below < 8) touches.push(`${label(b.el)} → ${label(p.el)} (${Math.max(0, Math.round(below))}px)`)
        }
        if (touches.length) issues.push(`adjacent blocks touch: ${[...new Set(touches)].slice(0, 4).join('; ')}${touches.length > 4 ? ` (+${touches.length - 4})` : ''}`)
      }
      // (e) Capture pages scroll with the PAGE, like Production / Transfer / Waste: a pinned bottom action bar, a sticky table header and a sticky side panel.
      // Found on the owner's 1728x1117 window: Receive / Request were bounded to the window with the list scrolling inside its own pane, and the page ended with
      // empty space under the bar. Two gates (desktop): (1) the pinned bar's bottom edge is the window's bottom edge (no empty band under it), at the top of the page and at the end;
      // (2) no big pane inside the page scrolls on its own (sticky side panels excepted).
      if (!phone) {
        const bar = document.querySelector('.cafe-capture-footer')
        if (bar && shown(bar)) {
          const gap = (el) => Math.round(innerHeight - el.getBoundingClientRect().bottom)
          // the page scrolls inside the shell's <main> (the app is one 100dvh viewport): the nearest scrollable ancestor of the content, else the document
          let sc = document.scrollingElement; for (let a = document.querySelector('.page-frame__content'); a; a = a.parentElement) if (/(auto|scroll)/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight + 1) { sc = a; break }
          const top = gap(bar); sc.scrollTo({ top: sc.scrollHeight, behavior: 'instant' }); const end = gap(bar); sc.scrollTo({ top: 0, behavior: 'instant' })
          // (3) the table header sticks under the top bar while a long list scrolls by
          const head = [...document.querySelectorAll('.cap-table .cap-head:not(.cap-head--hidden)')].find(shown)
          if (head && head.closest('.cap-table').getBoundingClientRect().height > 2.2 * innerHeight && sc.scrollHeight > sc.clientHeight + 700) {
            sc.scrollTo({ top: 700, behavior: 'instant' })
            const hr = head.getBoundingClientRect(), st = sc === document.scrollingElement ? 0 : sc.getBoundingClientRect().top
            if (hr.top < st - 1 || hr.top > st + 40) issues.push(`sticky header: after scrolling 700px the table header is at ${Math.round(hr.top - st)}px from the top of the page area — it must stay in view (sticky)`)
            sc.scrollTo({ top: 0, behavior: 'instant' })
          }
          if (Math.abs(top) > 2 || Math.abs(end) > 2) issues.push(`capture bar: the pinned action bar ends ${top}px (top of page) / ${end}px (end of page) from the window bottom (${innerHeight}px tall) — it must sit on the window edge with no empty band under it`)
        }
        const panes = []
        for (const el of document.querySelector('.cafe-capture-footer, .cap-table') ? document.querySelectorAll('.page-frame__content *') : []) { // capture pages only (master/detail setup pages scroll their panes by design)
          if (el.closest('[role=dialog], dialog, [role=listbox], [role=menu]') || !shown(el)) continue
          const s = getComputedStyle(el); if (!/(auto|scroll)/.test(s.overflowY) || el.clientHeight < 240 || el.scrollHeight <= el.clientHeight + 4) continue
          let sticky = false; for (let a = el; a && a !== document.body; a = a.parentElement) if (['sticky', 'fixed'].includes(getComputedStyle(a).position)) { sticky = true; break }
          if (!sticky) panes.push(`${label(el)} (${el.clientHeight}px pane, ${el.scrollHeight}px of content)`)
        }
        if (panes.length) issues.push(`inner scroll pane: ${panes.slice(0, 3).join('; ')} scrolls on its own — capture lists scroll with the page (sticky header, pinned bar, sticky side panel)`)
      }
      return issues
    }, w < 768)
    sigs.push({ page: name, tag, ...(await page.evaluate(() => {
      const st = (el) => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return `${s.fontSize}/${s.fontWeight}/${Math.round(r.height)}px` }
      const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && r.top < innerHeight })
      const one = (sel) => [...new Set(vis(sel).map(st))]
      return {
        'page title': one('h1').map((x) => x.replace(/\/\d+px$/, '')),
        'text box / select height': [...new Set(vis('input[type=text],input[type=search],input[type=email],input[type=date],input:not([type]),[role=combobox],select').filter((e) => e.getBoundingClientRect().height >= 20).map((e) => Math.round(e.getBoundingClientRect().height) + 'px'))],
        'table header': one('th, [role=columnheader]').map((x) => x.replace(/\/\d+px$/, '')),
      }
    })) })
    // Menu hierarchy: a group heading in the sidebar must read differently from the items under it.
    const flat = await page.evaluate(() => {
      const nav = document.querySelector('aside nav, nav[aria-label]'); if (!nav) return []
      const heads = [...nav.querySelectorAll('[class*="heading"],[class*="group-label"],[role=heading],h2,h3,h4')].filter((e) => e.getBoundingClientRect().height)
      const out = []
      for (const hd of heads) {
        const item = hd.parentElement?.querySelector('a[href]:not(:has(*[class*="heading"]))'); if (!item || item.contains(hd)) continue
        const a = getComputedStyle(hd), b = getComputedStyle(item)
        const ratio = Math.max(parseFloat(a.fontSize), parseFloat(b.fontSize)) / Math.min(parseFloat(a.fontSize), parseFloat(b.fontSize))
        if (ratio < 1.15 && Math.abs(+a.fontWeight - +b.fontWeight) < 200 && a.textTransform === b.textTransform)
          out.push(`"${hd.innerText.trim()}" ${a.fontSize}/${a.fontWeight} vs "${item.innerText.trim()}" ${b.fontSize}/${b.fontWeight}`)
      }
      return [...new Set(out)]
    })
    if (flat.length) layout.push(`flat menu hierarchy: ${flat.slice(0, 3).join('; ')}`)
    const sig = sigs.at(-1)
    if (sig['text box / select height'].length > 1) layout.push(`controls differ in height: ${sig['text box / select height'].join(' vs ')}`)
    // (c) Operate the phone Filters: open it, set every select to its second option, check the page followed, close it.
    if (w < 768 && theme === 'light') {
      const opener = page.locator('summary, button, [role=button]').filter({ hasText: /^\s*Filters/ }).filter({ visible: true }).first()
      if (await opener.count()) {
        const thrown = []; const onErr = (e) => thrown.push(e.message.split('\n')[0]); page.on('pageerror', onErr)
        const snap = () => page.evaluate(() => `${location.pathname}${location.search}|${document.querySelector('.ktb-count')?.innerText ?? ''}|${document.querySelectorAll('main tbody tr:not(.dt-group-row), main .dt-card, main [role=group][aria-labelledby], main .cwl-item-row').length}|${document.querySelectorAll('.ktb-chips > *').length}`)
        try {
          await opener.click({ timeout: 4000 }); await page.waitForTimeout(400)
          const scope = (await opener.evaluate((el) => el.tagName === 'SUMMARY')) ? opener.locator('xpath=..') : page // only the controls the Filters panel reveals
          const ctls = scope.locator('[role=combobox]:visible:not([disabled]):not([aria-disabled=true]), select:visible:not([aria-hidden=true]):not([disabled])') // a disabled control (a preview filter that says why) cannot be operated
          const n = await ctls.count()
          if (n === 0) layout.push('filters: "Filters" opens but shows no controls to change')
          for (let i = 0; i < n; i++) {
            const c = ctls.nth(i), name = (await c.getAttribute('aria-label')) || (await c.innerText().catch(() => '')) || `control ${i + 1}`
            const before = await snap(), was = (await c.innerText().catch(() => '')) || (await c.inputValue().catch(() => ''))
            try {
              await c.click({ timeout: 3000 })
              const isNative = await c.evaluate((el) => el.tagName === 'SELECT')
              if (!isNative) {
                await page.locator('[role=option]:visible').first().waitFor({ state: 'visible', timeout: 1500 }) // an opened Select shows its options
                if ((await page.locator('[role=option]:visible').count()) < 2) { await page.keyboard.press('Escape'); continue } // one choice: nothing to change
                const opts = page.locator('[role=option]:visible'), texts = (await opts.allInnerTexts()).map((x) => x.trim())
                const current = (was || '').trim().split('\n')[0]
                // the second option, or (when that is already chosen) the first one that differs
                let pick = 1; if (texts[1] === current || (await opts.nth(1).getAttribute('aria-selected')) === 'true') pick = texts.findIndex((x, i) => i !== 1 && x !== current)
                await opts.nth(pick < 0 ? 1 : pick).click({ timeout: 3000 })
              } else await c.selectOption({ index: 1 }, { timeout: 3000 })
              await page.waitForTimeout(400)
              const after = await snap(), now = (await c.innerText().catch(() => '')) || (await c.inputValue().catch(() => ''))
              if (now === was) layout.push(`filters: "${String(name).slice(0, 30)}" did not take its second option`)
              else if (after === before) layout.push(`filters: "${String(name).slice(0, 30)}" changed but the list, count, URL and chips did not`)
            } catch (e) { layout.push(`filters: "${String(name).slice(0, 30)}" cannot be used: ${e.message.split('\n')[0].slice(0, 90)}`); await page.keyboard.press('Escape').catch(() => {}) }
          }
          await opener.click({ timeout: 3000 }).catch(() => layout.push('filters: could not close the Filters panel again'))
        } catch (e) { layout.push(`filters: cannot open "Filters": ${e.message.split('\n')[0].slice(0, 90)}`) }
        page.off('pageerror', onErr)
        if (thrown.length) layout.push(`filters: page threw while operating: ${thrown[0]}`)
      }
    }
    results.push({ page: name, path, width: w, theme, url: page.url(), axe, layout })
    console.log(`${name}-${tag}: axe ${axe.length}, layout ${layout.length}`)
  }
  await ctx.close()
  return { results, sigs }
}

const shapeRuns = new Array(shapes.length); const shapeQueue = shapes.map((sh, i) => i)
await Promise.all(Array.from({ length: Math.min(+(process.env.CHECK_SHAPES || 3), shapes.length) }, async () => {
  for (let i; (i = shapeQueue.shift()) !== undefined;) shapeRuns[i] = await runShape(shapes[i])
}))
const results = shapeRuns.flatMap((r) => r.results), sigs = shapeRuns.flatMap((r) => r.sigs) // computed styles of shared parts, compared across pages below
await browser.close()
const tPages = secs()

// Same part, same look on every page of the area (per width and theme).
const drift = []
for (const key of ['page title', 'table header']) for (const tag of new Set(sigs.map((x) => x.tag))) {
  const seen = {}; for (const x of sigs.filter((y) => y.tag === tag)) for (const v of x[key]) (seen[v] ||= []).push(x.page)
  if (Object.keys(seen).length > 1) drift.push(`${key} differs across pages at ${tag}: ${Object.entries(seen).map(([v, p]) => `${v} (${p.slice(0, 3).join(', ')})`).join(' vs ')}`)
}
// Styles go through tokens: stylelint bans raw hex/rgb, raw font sizes and the old --ds tokens.
let lint = []
try { execFileSync('npx', ['stylelint', 'src/**/*.css', '--formatter', 'compact'], { cwd: `${fs.existsSync(`${process.cwd()}/mos-app`) ? process.cwd() : R}/mos-app`, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }
catch (e) { lint = (e.stdout || '').split('\n').filter((l) => l.includes(': line ')).map((l) => l.replace(/^.*?mos-app\//, '')) }

const detect = await detectPromise // Impeccable detector findings, signed in, both widths (started above)
console.log(`timing: pages ${tPages}s, detector done at ${secs()}s (it runs alongside the pages)`)

const failed = results.filter((r) => r.axe.some(kept) || r.layout.some(kept)).length + detect.filter((d) => kept(d.rule)).length
  + (kept('drift') ? drift.length : 0) + (kept('lint') ? lint.length : 0)
fs.writeFileSync(`${out}/checks.json`, JSON.stringify({ area, at: new Date().toISOString(), pass: failed === 0, ignored: ignore, drift, lint, results }, null, 1))
if (drift.length) console.log(`drift:\n  ${drift.join('\n  ')}`)
if (lint.length) console.log(`stylelint: ${lint.length} problems (first: ${lint[0]})`)
fs.writeFileSync(`${out}/detect.json`, JSON.stringify(detect, null, 1))
console.log(`${area}: ${failed === 0 ? 'PASS' : 'FAIL'} — ${results.filter((r) => r.axe.length).length} page×width with axe, ${results.filter((r) => r.layout.length).length} with layout issues, ${detect.length} detector findings`)
process.exit(failed === 0 ? 0 : 1)
