// Certifies a served production build, then a populated authenticated route. Run after build.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

export function entryAsset(html) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)].map((match) => match[1])
  const entry = scripts.find((path) => /\/assets\/index-[^/]+\.js$/.test(path))
  if (!entry) throw new Error('production entry asset missing from HTML')
  return entry
}

function options(argv) {
  const found = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!key?.startsWith('--') || !argv[index + 1]) throw new Error('arguments must be --key value pairs')
    found[key.slice(2)] = argv[index + 1]
  }
  for (const key of ['url', 'sha', 'storage-state', 'route', 'ready-selector', 'ready-text']) {
    if (!found[key]) throw new Error(`missing --${key}`)
  }
  if (!/^[0-9a-f]{40}$/.test(found.sha)) throw new Error('--sha must be a full Git SHA')
  return found
}

export async function run(argv) {
  const input = options(argv)
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: appRoot, encoding: 'utf8' }).trim()
  if (head !== input.sha) throw new Error('candidate SHA differs from this checkout HEAD')
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: appRoot, encoding: 'utf8' }).trim()
  if (dirty) throw new Error('candidate checkout is dirty; commit the exact build before certifying it')

  const base = new URL(input.url.endsWith('/') ? input.url : `${input.url}/`)
  const request = (url) => fetch(url, { signal: AbortSignal.timeout(15_000) })
  const servedHtmlResponse = await request(base)
  if (!servedHtmlResponse.ok) throw new Error(`preview HTML returned ${servedHtmlResponse.status}`)
  const servedHtml = await servedHtmlResponse.text()
  const builtHtml = await readFile(resolve(appRoot, 'dist/index.html'), 'utf8')
  const servedAsset = entryAsset(servedHtml)
  const builtAsset = entryAsset(builtHtml)
  if (servedAsset !== builtAsset) throw new Error('served entry asset differs from this checkout build')
  const identityPath = resolve(appRoot, 'dist/mos-build-identity.json')
  const identityBytes = await readFile(identityPath)
  const identity = JSON.parse(identityBytes.toString('utf8'))
  if (identity.sha !== head || identity.clean !== true) throw new Error('build identity is stale or was built from a dirty checkout')
  if (!identity.assets?.['index.html'] || !identity.assets?.[builtAsset.replace(/^\/mos\//, '')]) {
    throw new Error('build identity does not cover the HTML and entry asset')
  }
  const servedIdentity = await request(new URL('mos-build-identity.json', base))
  if (!servedIdentity.ok || sha256(Buffer.from(await servedIdentity.arrayBuffer())) !== sha256(identityBytes)) {
    throw new Error('served build identity differs from this checkout')
  }
  for (const [path, digest] of Object.entries(identity.assets)) {
    if (typeof digest !== 'string' || !/^[0-9a-f]{64}$/.test(digest) ||
        path.startsWith('/') || path.split('/').includes('..')) throw new Error('invalid build identity asset')
    const localBytes = await readFile(resolve(appRoot, 'dist', path))
    if (sha256(localBytes) !== digest) throw new Error(`local build asset changed after build: ${path}`)
    const response = await request(new URL(path, base))
    if (!response.ok || sha256(Buffer.from(await response.arrayBuffer())) !== digest) {
      throw new Error(`served build asset differs from candidate: ${path}`)
    }
  }

  const { chromium } = await import('@playwright/test')
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ storageState: input['storage-state'] })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const route = new URL(input.route, base)
    if (route.origin !== base.origin) throw new Error('authenticated route must use the preview origin')
    const response = await page.goto(route.href, { waitUntil: 'domcontentloaded' })
    if (!response?.ok()) throw new Error(`authenticated route returned ${response?.status() ?? 'no response'}`)
    const marker = page.locator(input['ready-selector']).filter({ hasText: input['ready-text'] })
    await marker.first().waitFor({ state: 'visible', timeout: 15_000 })
    if (await marker.count() !== 1 || new URL(page.url()).pathname !== route.pathname) {
      throw new Error('populated record marker or route was not unique and exact')
    }
    if (errors.length) throw new Error(`browser runtime error: ${errors[0]}`)
    console.log(`preview preflight PASS: ${head} serves ${Object.keys(identity.assets).length} matching files; authenticated route rendered`)
  } finally {
    await browser.close()
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).catch((error) => {
    console.error(`preview preflight FAIL: ${error.message}`)
    process.exitCode = 1
  })
}
