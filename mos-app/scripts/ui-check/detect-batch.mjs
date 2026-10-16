// Usage: node mos-app/scripts/ui-check/detect-batch.mjs --viewport 1440x900 [--session <json file>] [--conc 3] <url> [url...]
// The vendored Impeccable detector (scripts/impeccable-detect.mjs) for MANY pages in one process: the same engine call
// (detectUrl, networkidle0, no settle), the same config ignores, the same signed-in session, the same JSON finding shape
// as `impeccable-detect.mjs --json <url>`, but one sign-in and a few browser launches for the whole list instead of a
// process, a browser and a sign-in per page. The session is a JSON array of [name, value] localStorage entries (the `sb-*-auth-token` ones), as
// the wrapper injects; without --session no sign-in is done (public pages). --conc N = N browsers side by side (one browser
// cannot scan pages in parallel). Prints one JSON array; each finding's `file`
// is the page URL it came from. A page whose scan throws is retried once, then reported as a `scan-failed` finding
// (the per-page wrapper dropped such a page silently; this never does).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const R = fileURLToPath(new URL('../../..', import.meta.url)).replace(/\/$/, '')
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (existsSync(chrome) ? chrome : undefined)
const { detectUrl } = await import(`${R}/scripts/vendor/impeccable/detector/engines/browser/detect-url.mjs`)
const { filterDetectionFindings, readDetectionConfig } = await import(`${R}/scripts/vendor/impeccable/lib/impeccable-config.mjs`)
const { filterByScopes } = await import(`${R}/scripts/vendor/impeccable/detector/registry/antipatterns.mjs`)

const args = process.argv.slice(2)
const opt = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v }
const vp = /^(\d+)x(\d+)$/.exec(opt('--viewport', '1280x800'))
const viewport = { width: +vp[1], height: +vp[2] }
const sessionFile = opt('--session', null)
const conc = Math.max(1, +opt('--conc', 3))
const urls = args.filter((a) => /^https?:\/\//.test(a))
const session = sessionFile ? JSON.parse(readFileSync(sessionFile, 'utf8')) : []

const config = readDetectionConfig(R) // .impeccable/config.json of the main repo, as the wrapper reads it (cwd = R)
// One browser per worker: pages of ONE browser share a single "visible" tab, and the detector's scroll sweeps need
// requestAnimationFrame, so background tabs crawl (4 pages in one browser took 3 minutes each). Pages are scanned
// one at a time in each browser; --conc browsers run side by side.
async function launch() {
  const browser = await puppeteer.launch({ headless: true, executablePath })
  const realNewPage = browser.newPage.bind(browser)
  browser.newPage = async () => { // loginAs: inject only the session entries before the app boots, on every page
    const p = await realNewPage()
    if (session.length) await p.evaluateOnNewDocument((entries) => { for (const [n, v] of entries) localStorage.setItem(n, v) }, session)
    return p
  }
  return browser
}

const found = new Map(urls.map((u) => [u, null]))
const queue = [...found.keys()]
async function scan(browser, url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await detectUrl(url, { inlineIgnores: true, viewport, browser }) } catch (e) { if (attempt) return [{ antipattern: 'scan-failed', file: url, description: `detector could not scan the page: ${String(e.message).split('\n')[0]}`, snippet: '' }] }
  }
}
await Promise.all(Array.from({ length: Math.min(conc, queue.length) }, async () => {
  const browser = await launch()
  for (let url; (url = queue.shift());) { const t = Date.now(); found.set(url, await scan(browser, url)); if (process.env.DETECT_DEBUG) console.error(`${Math.round((Date.now() - t) / 100) / 10}s ${url}`) }
  await browser.close()
}))
let all = [...found.values()].flat()
all = filterDetectionFindings(all, config)
all = filterByScopes(all, [])
process.stdout.write(JSON.stringify(all) + '\n')
process.exit(0)
