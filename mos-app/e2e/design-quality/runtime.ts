import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

import { loginAs } from '../helpers/login'
import { ADMIN, BAR_MEMBER, BAR_SUPERVISOR, MANAGER, ORPHAN, VIEWER } from '../fixtures/users'
import { assertDevServerOwnership, worktreeFingerprint } from '../../src/lib/dev-server'
import {
  AUDIT_RECEIVING_ONLY,
  auditFixtureDefinitions,
  auditOwnedReceivingFixture,
  assertAuditFixtureNamespace,
  assertAuditFixtureWritePolicy,
} from './audit-fixtures'
import {
  AuditProvisioner,
  createLocalAuditAuthClient,
  createLocalAuditSqlClient,
  emptyAuditFixtureReceipt,
  type AuditFixtureAuthClient,
  type AuditFixtureReceipt,
  type AuditFixtureSqlClient,
} from './audit-provisioner.ts'
import { ReportWriter } from './report'
import type { DesignQualityManifest, ManifestCell } from './manifest'
import { resetAuditScroll } from './scroll'

const __filename = fileURLToPath(import.meta.url)
const __dir = path.dirname(__filename)
const appDir = path.resolve(__dir, '../..')
const repoRoot = path.resolve(appDir, '..')
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const authenticatedFixture = new WeakMap<Page, string>()

export const VIEWPORT_SIZES: Record<string, { width: number; height: number }> = {
  'phone-390x844': { width: 390, height: 844 },
  'compact-1024x768': { width: 1024, height: 768 },
  'desktop-1440x900': { width: 1440, height: 900 },
}

export type AuditRun = {
  baseURL: string
  outputDir: string
  candidateSha: string
  sessionId: string
  writer: ReportWriter
}

type FixtureRunState = {
  provisioner: AuditProvisioner
  receipt: AuditFixtureReceipt
}

const fixtureRuns = new Map<string, FixtureRunState>()

export type StateObservation = {
  status: 'covered' | 'untested'
  evidence: string
}

export function isAuditCellRunnable(cell: ManifestCell): boolean {
  return cell.status === 'covered'
    && Array.isArray(cell.stateContract?.setup)
    && Boolean(cell.stateContract?.assertion?.selector?.trim())
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function auditEnv(): Record<string, string> {
  const values: Record<string, string> = {}
  try {
    const content = readFileSync(path.join(appDir, '.env.e2e'), 'utf8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      const separator = trimmed.indexOf('=')
      if (!trimmed || trimmed.startsWith('#') || separator < 1) continue
      values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim()
    }
  } catch {
    // CI supplies credentials through process.env.
  }
  return values
}

function fixtureClients(definitions: ReturnType<typeof auditFixtureDefinitions>): {
  sql: AuditFixtureSqlClient
  auth?: AuditFixtureAuthClient
} {
  const configured = auditEnv()
  const url = env('VITE_SUPABASE_URL') || configured.VITE_SUPABASE_URL || 'http://127.0.0.1:44321'
  const key = env('SUPABASE_SERVICE_ROLE_KEY') || configured.SUPABASE_SERVICE_ROLE_KEY || ''
  const hasWrites = (definitions.identities?.length ?? 0) > 0 || (definitions.records?.length ?? 0) > 0
  if (hasWrites && !key) throw new Error('audit-owned fixture writes require SUPABASE_SERVICE_ROLE_KEY')
  if (!key) {
    return {
      sql: { execute: async () => [], query: async () => [] },
    }
  }
  return {
    sql: createLocalAuditSqlClient(url, key),
    auth: createLocalAuditAuthClient(url, key),
  }
}

function fixtureRunKey(run: AuditRun): string {
  return `${path.resolve(run.outputDir)}:${run.candidateSha}:${run.sessionId}`
}

async function ensureAuditFixtures(run: AuditRun): Promise<AuditFixtureReceipt> {
  const key = fixtureRunKey(run)
  const current = fixtureRuns.get(key)
  if (current) return current.receipt
  const definitions = auditFixtureDefinitions(run.sessionId)
  const clients = fixtureClients(definitions)
  const provisioner = new AuditProvisioner({
    candidateSha: run.candidateSha,
    sessionId: run.sessionId,
    definitions,
    sql: clients.sql,
    auth: clients.auth,
    onReceipt: async (receipt) => { await run.writer.writeFixtureReceipt(receipt) },
  })
  const receipt = await provisioner.provision()
  fixtureRuns.set(key, { provisioner, receipt })
  await run.writer.writeFixtureReceipt(receipt)
  return receipt
}

/** Finish the audit-owned fixture lifecycle and persist the final cleanup receipt. */
export async function cleanupAuditFixtures(run: AuditRun, onFailure = false): Promise<AuditFixtureReceipt> {
  const key = fixtureRunKey(run)
  let state = fixtureRuns.get(key)
  if (!state) {
    const definitions = auditFixtureDefinitions(run.sessionId)
    const clients = fixtureClients(definitions)
    const provisioner = new AuditProvisioner({
      candidateSha: run.candidateSha,
      sessionId: run.sessionId,
      definitions,
      sql: clients.sql,
      auth: clients.auth,
    })
    state = { provisioner, receipt: emptyAuditFixtureReceipt(run.candidateSha, run.sessionId) }
    fixtureRuns.set(key, state)
  }
  if (state.receipt.created.length === 0 && (state.receipt.ownedAuthUsers?.length ?? 0) === 0) {
    await state.provisioner.provision()
  }
  const receipt = await state.provisioner.cleanup({ onFailure })
  state.receipt = receipt
  await run.writer.writeFixtureReceipt(receipt)
  return receipt
}

export function auditRun(): AuditRun {
  const baseURL = env('DESIGN_AUDIT_BASE_URL')
  const outputDir = env('DESIGN_AUDIT_OUTPUT_DIR')
  const candidateSha = env('DESIGN_AUDIT_CANDIDATE_SHA')
  const sessionId = env('DESIGN_AUDIT_SESSION_ID')
  if (!baseURL || !outputDir || !candidateSha || !sessionId) {
    throw new Error('design audit requires DESIGN_AUDIT_BASE_URL, OUTPUT_DIR, CANDIDATE_SHA, and SESSION_ID')
  }
  return { baseURL, outputDir, candidateSha, sessionId, writer: new ReportWriter({ outputDir, candidateSha, sessionId }) }
}

export function auditEnabled(): boolean {
  return env('DESIGN_QUALITY_RUN') === '1'
}

export function assertAuditEnvironment(): void {
  if (!auditEnabled()) return
  if (env('MOS_DB_LOCK_HELD') !== '1') {
    throw new Error('design-quality browser runs must be nested under scripts/with-db-lock.sh')
  }
  const run = auditRun()
  const currentSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  if (currentSha !== run.candidateSha) {
    throw new Error(`candidate SHA changed during audit: expected ${run.candidateSha}, found ${currentSha}`)
  }
}

function localBaseUrl(value: string): URL {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('design audit base URL must be an absolute localhost URL')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error('design audit base URL must point to localhost, 127.0.0.1, or ::1')
  }
  if (parsed.username || parsed.password) throw new Error('design audit base URL cannot carry credentials')
  return parsed
}

/** Verify both the worktree-derived identity endpoint and the exact candidate SHA before a page. */
export async function assertAuditServer(baseURL: string): Promise<void> {
  const parsed = localBaseUrl(baseURL)
  const run = auditEnabled() ? auditRun() : null
  if (run) {
    const currentSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    if (currentSha !== run.candidateSha) throw new Error('candidate SHA changed before browser measurement')
  }
  let actual: string | null = null
  try {
    const response = await fetch(`${parsed.origin}/_mos_dev_identity`)
    actual = response.ok ? (await response.text()).trim() : null
  } catch {
    actual = null
  }
  assertDevServerOwnership(worktreeFingerprint(appDir), actual, Number(parsed.port || 80))
}

const fixtureCredentials = {
  BAR_MEMBER,
  BAR_SUPERVISOR,
  VIEWER,
  MANAGER,
  ADMIN,
  ORPHAN,
} as const

export async function loginAuditFixture(page: Page, fixtureName: string, sessionId = env('DESIGN_AUDIT_SESSION_ID')): Promise<void> {
  if (authenticatedFixture.get(page) === fixtureName) return
  const fixture = fixtureName === AUDIT_RECEIVING_ONLY
    ? auditOwnedReceivingFixture(sessionId)
    : fixtureCredentials[fixtureName as keyof typeof fixtureCredentials]
  if (!fixture || !('password' in fixture)) throw new Error(`unknown audit fixture ${fixtureName}`)
  if ('owned' in fixture && fixture.owned) assertAuditFixtureNamespace(fixture.email, sessionId)
  await page.context().clearCookies()
  await page.goto('.')
  await page.evaluate(() => localStorage.clear())
  await loginAs(page, fixture.email, fixture.password)
  authenticatedFixture.set(page, fixtureName)
}

export async function prepareAuditPage(page: Page, run: AuditRun, cell: ManifestCell): Promise<void> {
  const viewport = VIEWPORT_SIZES[cell.viewport]
  if (!viewport) throw new Error(`unknown audit viewport ${cell.viewport}`)
  await page.setViewportSize(viewport)
  const receipt = await ensureAuditFixtures(run)
  assertAuditFixtureWritePolicy({
    fixture: cell.fixture,
    sessionId: run.sessionId,
    candidateSha: run.candidateSha,
    receipt,
    writes: cell.stateContract?.writes === true,
  })
  await loginAuditFixture(page, cell.fixture, run.sessionId)
  await page.evaluate(({ theme, language }) => {
    // Providers read their persisted state during the first render. Seed both values while the
    // authenticated page is still mounted so each matrix cell exercises the real provider path.
    window.localStorage.setItem('mos.locale', language === 'id' ? 'id' : 'en')
    window.localStorage.setItem('mos-theme', theme === 'dark' ? 'dark' : 'light')
  }, { theme: cell.theme, language: cell.language })
  await page.goto(cell.route, { waitUntil: 'domcontentloaded' })
  await page.locator('main').waitFor({ state: 'visible', timeout: 10_000 })
  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 10_000 })
  const expectedLanguage = cell.language === 'id' ? 'id' : 'en'
  const expectedTheme = cell.theme === 'dark' ? 'dark' : 'light'
  await page.waitForFunction(
    ({ language, theme }) => document.documentElement.lang === language
      && document.documentElement.classList.contains('dark') === (theme === 'dark'),
    { language: expectedLanguage, theme: expectedTheme },
  )
  const actualPreferences = await page.evaluate(() => ({
    language: document.documentElement.lang,
    theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  }))
  if (actualPreferences.language !== expectedLanguage || actualPreferences.theme !== expectedTheme) {
    throw new Error(
      `audit providers did not apply ${expectedTheme}/${expectedLanguage}; `
      + `observed ${actualPreferences.theme}/${actualPreferences.language}`,
    )
  }
  for (const action of cell.stateContract?.setup ?? []) {
    const target = page.locator(action.selector).filter({ visible: true }).first()
    if (action.action === 'click') await target.click()
    else if (action.action === 'fill') await target.fill(action.value ?? '')
    else await target.press(action.value ?? '')
  }
}

/**
 * A route visit is only a smoke check. Covered cells execute their declared
 * browser actions and then require the exact selector/attribute assertion.
 * A prose description, URL, screenshot, or incidental copy cannot make a state
 * runnable or observed.
 */
export async function observeManifestCellState(page: Page, cell: ManifestCell): Promise<StateObservation> {
  if (!isAuditCellRunnable(cell)) {
    return {
      status: 'untested',
      evidence: cell.status === 'blocked' || cell.status === 'untested'
        ? `manifest cell is explicitly ${cell.status}; browser state setup/assertion was skipped`
        : 'manifest cell has no deterministic state setup/assertion; browser state measurement was skipped',
    }
  }
  const assertion = cell.stateContract!.assertion
  const target = page.locator(assertion.selector).filter({ visible: true })
  await target.first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
  const count = assertion.attribute
    ? await target.evaluateAll((elements, expected) => elements.filter((element) => {
      const actual = element.getAttribute(expected.attribute)
      return expected.value === undefined ? actual !== null : actual === expected.value
    }).length, { attribute: assertion.attribute, value: assertion.value })
    : await target.count()
  return count > 0
    ? { status: 'covered', evidence: `${count} visible assertion target(s): ${assertion.selector}` }
    : { status: 'untested', evidence: `state assertion did not match: ${assertion.selector}` }
}

/** Drive a real interaction state before collecting contrast, or report it absent. */
export async function driveInteractionState(page: Page, state: string): Promise<boolean> {
  const controls = page.locator('button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"]')
  const first = controls.filter({ visible: true }).first()
  if (state === 'default') return true
  if (state === 'hover') {
    if (await first.count() === 0) return false
    await first.hover()
    return true
  }
  if (state === 'focus') {
    if (await first.count() === 0) return false
    await first.focus()
    return true
  }
  const stateSelector = `[data-state="${state}"], [data-status="${state}"], [data-variant="${state}"], [aria-${state}="true"]`
  return await page.locator(stateSelector).filter({ visible: true }).count() > 0
}

export function screenshotName(cell: ManifestCell, lane?: string): string {
  const slug = cell.route.replace(/^\/mos\//, '').replace(/[^a-z0-9]+/gi, '-')
  const laneSuffix = lane ? `-${lane.replace(/[^a-z0-9]+/gi, '-')}` : ''
  return `${slug}-${cell.fixture}-${cell.viewport}-${cell.theme}-${cell.language}-${cell.state}${laneSuffix}.png`.toLowerCase()
}

export async function captureCell(page: Page, run: AuditRun, cell: ManifestCell, lane?: string): Promise<string> {
  const screenshotDir = path.join(run.outputDir, 'screenshots')
  const screenshotPath = path.join(screenshotDir, screenshotName(cell, lane))
  await page.evaluate(resetAuditScroll)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  return screenshotPath
}

export function cellsFor(manifest: DesignQualityManifest, area?: string): ManifestCell[] {
  return area ? manifest.cells.filter((cell) => cell.area === area) : [...manifest.cells]
}
