// Usage: cd <worktree> && SHOT_PORT=<port> node mos-app/scripts/ui-check/gate-all.mjs
//          [--areas cafe,money,...] [--only plain|stress] [--conc 2] [--shapes 2] [--detect-conc 1] [--min-free-gb 2] [--quiet]
// Runs check.mjs for EVERY area in pages.mjs, plain and with STRESS=1, side by side (bounded pool: --conc jobs at once, default 2, max 3; a job waits to start while free memory is under --min-free-gb),
// prints one summary table and exits 1 if any job failed or crashed. Each job is exactly `node check.mjs <area>`:
//   plain  -> docs/ui-checks/<area>/{checks.json,detect.json,shots/}        (the proof the build rules ask for)
//   STRESS -> docs/ui-checks/<area>/stress/{checks.json,detect.json,shots/} (same checks on the ~180-item catalogue)
// When the `preview` area is among the areas it also runs mos-app/scripts/ui-check/preview-off.mjs (the preview screens must NOT be reachable without the
// local opt-in; it starts two throw-away dev servers of its own); skip with --no-off-check.
// Run it from the worktree under test (check.mjs runs stylelint on ./mos-app). A failed job's first findings are printed
// under the table; its full log is in the logs folder named at the end.
import { execFileSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const R = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '')
const { PAGES } = await import(`${R}/mos-app/scripts/ui-check/pages.mjs`)
const argv = process.argv.slice(2)
const opt = (name, dflt) => { const i = argv.indexOf(name); return i < 0 ? dflt : argv[i + 1] }
const areas = (opt('--areas', '') ? opt('--areas', '').split(',') : Object.keys(PAGES)).filter(Boolean)
for (const a of areas) if (!PAGES[a]) { console.error(`unknown area: ${a} (have ${Object.keys(PAGES).join(', ')})`); process.exit(2) }
const only = opt('--only', '')
const conc = Math.min(3, Math.max(1, +opt('--conc', 2)))
const minFree = +opt('--min-free-gb', 2) * 2 ** 30
const env = { ...process.env, CHECK_SHAPES: opt('--shapes', process.env.CHECK_SHAPES || '2'), DETECT_CONC: opt('--detect-conc', process.env.DETECT_CONC || '1') }
const logs = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-all-'))

const jobs = areas.flatMap((area) => [
  ...(only === 'stress' ? [] : [{ area, stress: false, out: `${R}/docs/ui-checks/${area}` }]),
  ...(only === 'plain' ? [] : [{ area, stress: true, out: `${R}/docs/ui-checks/${area}/stress` }]),
]).map((j) => ({ ...j, name: j.stress ? `${j.area} (STRESS)` : j.area }))
// Longest first: the big areas start at once, the small ones fill the gaps.
const weight = (j) => Object.keys(PAGES[j.area].pages).length * (j.stress ? 1.3 : 1)
jobs.sort((a, b) => weight(b) - weight(a))

// Memory (macOS): free = free + inactive + speculative pages from vm_stat; used by the gate = RSS of everything under this process.
const freeBytes = () => { const o = execFileSync('vm_stat', { encoding: 'utf8' }); const page = +/page size of (\d+)/.exec(o)[1]; const n = (k) => +(new RegExp(`${k}:\\s+(\\d+)`).exec(o)?.[1] || 0); return (n('Pages free') + n('Pages inactive') + n('Pages speculative')) * page }
const gateRss = () => { const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' }).trim().split('\n').map((l) => l.trim().split(/\s+/).map(Number)); const kids = new Map(); for (const [pid, ppid, rss] of rows) { (kids.get(ppid) || kids.set(ppid, []).get(ppid)).push([pid, rss]) } let sum = 0; const walk = (pid) => { for (const [c, rss] of kids.get(pid) || []) { sum += rss; walk(c) } }; walk(process.pid); return sum * 1024 }
let peakRss = 0, minFreeSeen = Infinity
const sampler = setInterval(() => { try { peakRss = Math.max(peakRss, gateRss()); minFreeSeen = Math.min(minFreeSeen, freeBytes()) } catch { /* sampling only */ } }, 2000)
const waitForMemory = async (name) => { for (let warned = false; freeBytes() < minFree; warned = true) { if (!warned) console.log(`waiting to start ${name}: free memory ${(freeBytes() / 2 ** 30).toFixed(1)}GB < ${minFree / 2 ** 30}GB`); await new Promise((r) => setTimeout(r, 5000)) } }
const t0 = Date.now()
const run = async (j) => { await waitForMemory(j.name); return new Promise((resolve) => {
  const start = Date.now()
  const log = fs.createWriteStream(path.join(logs, `${j.area}${j.stress ? '-stress' : ''}.log`))
  const child = spawn('node', [`${R}/mos-app/scripts/ui-check/check.mjs`, j.area], { env: { ...env, SHOT_OUT: j.out, ...(j.stress ? { STRESS: '1' } : { STRESS: '' }) }, stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.pipe(log); child.stderr.pipe(log)
  child.on('exit', (code) => {
    j.secs = Math.round((Date.now() - start) / 1000); j.code = code
    try { j.checks = JSON.parse(fs.readFileSync(`${j.out}/checks.json`, 'utf8')); j.detect = JSON.parse(fs.readFileSync(`${j.out}/detect.json`, 'utf8')) } catch { j.checks = null }
    // a stale checks.json from an earlier run must not read as this run's result
    if (j.checks && Date.parse(j.checks.at) < start) j.checks = null
    j.ok = code === 0 && !!j.checks?.pass
    if (!argv.includes('--quiet')) console.log(`[${Math.round((Date.now() - t0) / 1000)}s] ${j.ok ? 'PASS' : 'FAIL'} ${j.name} (${j.secs}s)`)
    resolve()
  })
}) }
const queue = [...jobs]
await Promise.all(Array.from({ length: Math.min(conc, jobs.length) }, async () => { for (let j; (j = queue.shift());) await run(j) }))

// One summary table, in area order.
const order = (j) => areas.indexOf(j.area) * 2 + (j.stress ? 1 : 0)
jobs.sort((a, b) => order(a) - order(b))
const cell = (s, n) => String(s).padEnd(n)
console.log(`\n${cell('area', 22)}${cell('result', 8)}${cell('secs', 6)}${cell('pages', 7)}${cell('axe', 5)}${cell('layout', 8)}${cell('detector', 10)}${cell('drift', 7)}lint`)
for (const j of jobs) {
  const c = j.checks
  console.log(`${cell(j.name, 22)}${cell(j.ok ? 'PASS' : c ? 'FAIL' : 'CRASH', 8)}${cell(j.secs, 6)}${cell(Object.keys(PAGES[j.area].pages).length, 7)}${c ? `${cell(c.results.filter((r) => r.axe.length).length, 5)}${cell(c.results.filter((r) => r.layout.length).length, 8)}${cell(j.detect.length, 10)}${cell(c.drift.length, 7)}${c.lint.length}` : `exit ${j.code}, see log`}`)
}
clearInterval(sampler)
// The preview-off check: the preview screens must be unreachable without the opt-in. One job, after the pool, so it never adds load beside it.
let offCheck = null
if (areas.includes('preview') && !argv.includes('--no-off-check')) {
  const start = Date.now()
  offCheck = await new Promise((resolve) => {
    let out = ''
    const child = spawn('node', [`${R}/mos-app/scripts/ui-check/preview-off.mjs`], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { out += d })
    child.on('exit', (code) => resolve({ ok: code === 0, secs: Math.round((Date.now() - start) / 1000), out: out.trim() }))
  })
  console.log(`\n${offCheck.ok ? 'PASS' : 'FAIL'} preview-off (${offCheck.secs}s): ${offCheck.out.split('\n')[0]}`)
  if (!offCheck.ok) for (const line of offCheck.out.split('\n').slice(1, 8)) console.log(line)
}
const bad = jobs.filter((j) => !j.ok)
for (const j of bad) {
  console.log(`\n-- ${j.name}`)
  const c = j.checks
  if (!c) { console.log(`   no fresh checks.json (exit ${j.code}); log: ${logs}/${j.area}${j.stress ? '-stress' : ''}.log`); continue }
  const seen = new Set(); let n = 0
  for (const r of c.results) for (const f of [...r.axe, ...r.layout]) { const k = `${r.page}|${f}`; if (seen.has(k) || n++ >= 6) continue; seen.add(k); console.log(`   ${r.page} ${r.width}${r.theme === 'dark' ? '-dark' : ''}: ${f.slice(0, 200)}`) }
  for (const d of j.detect.slice(0, 4)) console.log(`   detector ${d.page} ${d.viewport}: ${d.rule}`)
  for (const d of c.drift.slice(0, 2)) console.log(`   drift: ${d.slice(0, 200)}`)
  for (const l of c.lint.slice(0, 2)) console.log(`   lint: ${l.slice(0, 200)}`)
}
console.log(`\n${bad.length || offCheck?.ok === false ? `FAIL: ${bad.length + (offCheck?.ok === false ? 1 : 0)} of ${jobs.length + (offCheck ? 1 : 0)} jobs` : `ALL PASS: ${jobs.length + (offCheck ? 1 : 0)} jobs`} in ${Math.round((Date.now() - t0) / 1000)}s (pool ${conc}, shapes ${env.CHECK_SHAPES}); peak gate memory ${(peakRss / 2 ** 30).toFixed(1)}GB RSS (browsers + node), lowest free memory seen ${(minFreeSeen / 2 ** 30).toFixed(1)}GB; logs ${logs}`)
process.exit(bad.length || offCheck?.ok === false ? 1 : 0)
