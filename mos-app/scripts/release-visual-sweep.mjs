#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'

import { ADMIN, BARISTA, BAR_MEMBER, BAR_SUPERVISOR, MANAGER, VIEWER } from '../e2e/fixtures/users.ts'
import { stubAccountLocale } from '../e2e/helpers/account-locale.ts'
import { DESIGN_QUALITY_MANIFEST } from '../e2e/design-quality/manifest.ts'
import { collectControls, collectGeometry, collectVisibleContent } from '../e2e/design-quality/measurements.ts'
import { assertDevServerOwnership, worktreeFingerprint } from '../src/lib/dev-server.ts'

const users = { ADMIN, BARISTA, BAR_MEMBER, BAR_SUPERVISOR, MANAGER, VIEWER }
const widths = [390, 768, 1440]
const viewportNames = new Map([[390, 'phone-390x844'], [768, 'release-768x1024'], [1440, 'desktop-1440x900']])

function options(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (!key.startsWith('--') || !argv[index + 1]) throw new Error(`invalid runner argument: ${key}`)
    result[key.slice(2)] = argv[++index]
  }
  for (const name of ['base-url', 'base', 'head', 'scope', 'out']) {
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

function geometrySelectors() {
  return [...new Set([
    'body',
    'main',
    '[role="dialog"]',
    '[role="listbox"]',
    '[role="menu"]',
    '[data-scroll-container]',
    '[data-primary-action-region]',
    ...DESIGN_QUALITY_MANIFEST.lists.alignedPanelGroups.map((entry) => entry.selector),
    ...DESIGN_QUALITY_MANIFEST.lists.intentionalDataScrollers.map((entry) => entry.selector),
  ])]
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

async function exerciseFullValuePaths(page, cell, width) {
  const exercised = []
  const viewport = width === 768 ? 'compact-1024x768' : viewportNames.get(width)
  const paths = DESIGN_QUALITY_MANIFEST.lists.fullValuePaths.filter((entry) =>
    (!entry.routes || entry.routes.includes(cell.route))
    && (!entry.viewports || entry.viewports.includes(viewport)),
  )
  for (const entry of paths) {
    if (!entry.reveal) continue
    const target = page.locator(entry.selector).filter({ visible: true }).first()
    if (await target.count() === 0) continue
    const expected = (await target.getAttribute('data-full-value'))
      || (await target.getAttribute('title'))
      || (await target.textContent())
      || ''
    if (entry.reveal.action === 'focus') await target.focus()
    else if (entry.reveal.action === 'hover') await target.hover()
    else await target.click()
    const visibleReveal = page.locator(entry.reveal.selector).filter({ visible: true })
    const text = await visibleReveal.allTextContents()
    if (expected.trim() && text.some((value) => value.trim().includes(expected.trim()))) {
      exercised.push(entry.selector)
    }
    if (entry.reveal.action === 'click') await page.keyboard.press('Escape')
  }
  return exercised
}

async function signIn(page, baseURL, fixture, cell) {
  const account = users[fixture]
  await stubAccountLocale(page, cell.language === 'id' ? 'id' : 'en')
  await page.addInitScript((theme) => localStorage.setItem('mos-theme', theme), cell.theme)
  await page.goto(new URL('login', baseURL).toString())
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 })
  await page.getByRole('navigation', { name: 'Primary' }).waitFor({ state: 'visible', timeout: 10_000 })
}

async function settleAnimations(page) {
  await page.evaluate(async () => {
    const running = document.getAnimations().filter((animation) => animation.playState === 'running')
    await Promise.race([
      Promise.allSettled(running.map((animation) => animation.finished)),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ])
  })
}

async function measureRoute(browser, baseURL, outputDir, route, width) {
  const cell = manifestCell(route)
  const viewport = { width, height: width === 390 ? 844 : width === 768 ? 1024 : 900 }
  const browserContext = await browser.newContext({ baseURL, viewport })
  try {
    const page = await browserContext.newPage()
    await signIn(page, baseURL, cell.fixture, cell)
    const target = new URL(route.replace(/^\//, ''), baseURL)
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded' })
    const identityUrl = new URL(page.url())
    if (identityUrl.pathname.replace(/\/$/, '') !== target.pathname.replace(/\/$/, '')) {
      throw new Error(`route did not stay on the requested surface: ${route}`)
    }
    await page.locator('main').waitFor({ state: 'visible', timeout: 10_000 })
    await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 10_000 })
    await settleAnimations(page)
    await page.setViewportSize(viewport)

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
    const exercisedFullValueSelectors = await exerciseFullValuePaths(page, cell, width)
    const visibleContent = await collectVisibleContent(page, context, `release-${width}-${route}`, exercisedFullValueSelectors)
    const intentional = DESIGN_QUALITY_MANIFEST.lists.intentionalDataScrollers
    const overflow = geometry.filter((row) => row.overflowX > 1
      && !intentional.some((entry) => row.selector.includes(entry.selector)))
    const clippedText = visibleContent.filter((row) => row.kind === 'text-truncation' && !row.passed)
    const smallTargets = controls.filter((row) => row.width < 44 || row.height < 44)
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
  if (scope.headSha !== args.head || scope.baseSha !== args.base
    || JSON.stringify(scope.widths) !== JSON.stringify(widths)
    || !Array.isArray(scope.routes) || scope.routes.length === 0) {
    throw new Error('scope metadata does not match the requested refs or viewport contract')
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
  const browser = await chromium.launch({ headless: true })
  try {
    const rows = []
    for (const route of scope.routes) {
      if (!DESIGN_QUALITY_MANIFEST.dimensions.route.includes(route)) {
        throw new Error(`scope route is not in the quantitative audit manifest: ${route}`)
      }
      for (const width of widths) rows.push(await measureRoute(browser, baseURL.toString(), outputDir, route, width))
    }
    await writeFile(path.join(outputDir, 'sweep-results.json'), `${JSON.stringify({ headSha: scope.headSha, rows }, null, 2)}\n`)
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error(`release-visual-sweep: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
