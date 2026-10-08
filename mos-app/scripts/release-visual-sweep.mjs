#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

import { ADMIN, BARISTA, BAR_MEMBER, BAR_SUPERVISOR, MANAGER, VIEWER } from '../e2e/fixtures/users.ts'
import { DESIGN_QUALITY_MANIFEST } from '../e2e/design-quality/manifest.ts'
import { collectControls, collectGeometry, collectVisibleContent } from '../e2e/design-quality/measurements.ts'
import {
  cleanupAuditFixtures,
  exerciseFullValuePaths,
  filterHorizontalOverflow,
  filterSmallTapTargets,
  geometrySelectors,
  prepareAuditPage,
  settleAnimations,
} from '../e2e/design-quality/runtime.ts'
import { ReportWriter } from '../e2e/design-quality/report.ts'
import { assertDevServerOwnership, worktreeFingerprint } from '../src/lib/dev-server.ts'

const users = { ADMIN, BARISTA, BAR_MEMBER, BAR_SUPERVISOR, MANAGER, VIEWER }
const widths = [390, 768, 1440]
const viewportNames = new Map([[390, 'phone-390x844'], [768, 'release-768x1024'], [1440, 'desktop-1440x900']])
const auditViewports = new Map([[390, 'phone-390x844'], [768, 'compact-1024x768'], [1440, 'desktop-1440x900']])

function options(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--') || !argv[index + 1]) throw new Error(`invalid runner argument: ${key}`)
    result[key.slice(2)] = argv[++index]
  }
  for (const name of ['base-url', 'head', 'scope', 'out']) {
    if (!result[name]) throw new Error(`missing --${name}`)
  }
  return result
}

function manifestCell(route) {
  const cell = DESIGN_QUALITY_MANIFEST.cells.find((candidate) =>
    candidate.route === route && candidate.state === 'default' && candidate.status === 'covered')
  if (!cell) throw new Error(`route has no covered default Gordi Sample fixture in the quantitative manifest: ${route}`)
  if (!Object.hasOwn(users, cell.fixture)) throw new Error(`route fixture is not a supported seeded sample persona: ${route}`)
  return cell
}

async function assertOwnedServer(baseURL) {
  const parsed = new URL(baseURL)
  let actual = null
  try {
    const response = await fetch(new URL('/_mos_dev_identity', parsed.origin))
    if (response.ok) actual = (await response.text()).trim()
  } catch {
    actual = null
  }
  assertDevServerOwnership(worktreeFingerprint(process.cwd()), actual, Number(parsed.port || 80))
}

function auditRun(args, outputDir, baseURL) {
  const sessionId = randomBytes(4).toString('hex')
  return {
    baseURL: baseURL.toString(),
    outputDir,
    candidateSha: args.head,
    sessionId,
    writer: new ReportWriter({ outputDir, candidateSha: args.head, sessionId }),
  }
}

async function measureRoute(browser, run, baseURL, outputDir, route, manifestRoute, width) {
  const cell = manifestCell(manifestRoute)
  const viewport = { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 }
  const browserContext = await browser.newContext({ baseURL, viewport })
  try {
    const page = await browserContext.newPage()
    const prepared = await prepareAuditPage(page, run, cell)
    if (prepared.setupFailure) throw new Error(`audit page preparation failed for ${route}: ${prepared.setupFailure}`)

    const target = new URL(route.replace(/^\//, ''), baseURL)
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded' })
    const identityUrl = new URL(page.url())
    if (identityUrl.pathname.replace(/\/$/, '') !== target.pathname.replace(/\/$/, '')) {
      throw new Error(`route did not stay on the requested surface: ${route}`)
    }
    await page.locator('main').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 10_000 })
    await page.setViewportSize(viewport)
    await settleAnimations(page)

    const context = {
      route,
      journey: cell.journey,
      fixture: cell.fixture,
      viewport: viewportNames.get(width),
      theme: cell.theme,
      language: cell.language,
      state: 'default',
    }
    const geometry = await collectGeometry(page, context, geometrySelectors())
    const controls = await collectControls(page, context)
    const exercisedFullValueSelectors = await exerciseFullValuePaths(page, cell, auditViewports.get(width))
    const visibleContent = await collectVisibleContent(page, context, `release-${width}-${route}`, exercisedFullValueSelectors)
    const overflow = filterHorizontalOverflow(geometry)
    const clippedText = visibleContent.filter((row) => row.kind === 'text-truncation' && !row.passed)
    const smallTargets = filterSmallTapTargets(controls, auditViewports.get(width))
    await page.evaluate(() => window.scrollTo(0, 0))
    const slug = route.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-') || 'home'
    const screenshot = `screenshots/${slug}-${width}.png`
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: false })
    return {
      route,
      width,
      overflowCount: overflow.length,
      maxHorizontalOverflowPx: overflow.reduce((maximum, row) => Math.max(maximum, Math.ceil(row.overflowX)), 0),
      clippedTextCount: clippedText.length,
      smallTapTargetCount: smallTargets.length,
      screenshot,
    }
  } finally {
    await browserContext.close()
  }
}

async function main() {
  const args = options(process.argv.slice(2))
  const scope = JSON.parse(await readFile(args.scope, 'utf8'))
  const hasRoutes = scope.mode === 'routes' && scope.baseSha === null && !args.base
  const hasDiff = scope.mode === 'diff' && typeof args.base === 'string' && scope.baseSha === args.base
  if (scope.headSha !== args.head
    || (!hasRoutes && !hasDiff)
    || JSON.stringify(scope.widths) !== JSON.stringify(widths)
    || !Array.isArray(scope.routes) || scope.routes.length === 0
    || !scope.manifestRoutes || typeof scope.manifestRoutes !== 'object') {
    throw new Error('scope metadata does not match the requested refs, routes, or viewport contract')
  }
  const baseURL = new URL(args['base-url'])
  if (!['http:', 'https:'].includes(baseURL.protocol)
    || !['localhost', '127.0.0.1', '::1'].includes(baseURL.hostname)
    || baseURL.pathname !== '/' || baseURL.search || baseURL.hash
    || baseURL.username || baseURL.password) {
    throw new Error('base URL must be a bare localhost origin')
  }
  await assertOwnedServer(baseURL.toString())
  const outputDir = path.resolve(args.out)
  await mkdir(path.join(outputDir, 'screenshots'), { recursive: true })
  const run = auditRun(args, outputDir, baseURL)
  let browser
  let failed = true
  try {
    browser = await chromium.launch({ headless: true })
    const rows = []
    for (const route of scope.routes) {
      const manifestRoute = scope.manifestRoutes[route]
      if (typeof route !== 'string' || typeof manifestRoute !== 'string'
        || !DESIGN_QUALITY_MANIFEST.dimensions.route.includes(manifestRoute)) {
        throw new Error(`scope route has no quantitative manifest fixture: ${route}`)
      }
      if (scope.mode === 'diff' && route !== manifestRoute) {
        throw new Error(`diff scope route must match its manifest route: ${route}`)
      }
      manifestCell(manifestRoute)
      for (const width of widths) {
        rows.push(await measureRoute(browser, run, baseURL.toString(), outputDir, route, manifestRoute, width))
      }
    }
    await writeFile(path.join(outputDir, 'sweep-results.json'), `${JSON.stringify({ headSha: scope.headSha, rows }, null, 2)}\n`)
    failed = false
  } finally {
    if (browser) await browser.close()
    await cleanupAuditFixtures(run, failed)
  }
}

main().catch((error) => {
  console.error(`release-visual-sweep: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
