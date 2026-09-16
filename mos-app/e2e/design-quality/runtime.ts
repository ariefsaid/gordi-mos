import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

import { assertAuditRoute } from './audit-route.ts'

import { loginAs } from '../helpers/login'
import { ADMIN, BAR_MEMBER, BAR_SUPERVISOR, MANAGER, ORPHAN, VIEWER } from '../fixtures/users'
import { assertDevServerOwnership, worktreeFingerprint } from '../../src/lib/dev-server'
import {
  AUDIT_RECEIVING_ONLY,
  auditFixtureDefinitions,
  auditOwnedReceivingFixture,
  assertAuditFixtureNamespace,
  assertAuditFixtureWritePolicy,
  type AuditFixtureIdentityDefinition,
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
import {
  classifyFailureSet,
  digestAutomaticFailureLane,
  AUTOMATIC_FAILURE_BASELINE_PATH,
  loadTrustedAutomaticFailureBaseline,
  type AutomaticFailureBaseline,
  type AutomaticFailure,
  type FailureComparison,
} from './change-gate.ts'

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
  verificationBase?: string
  mergeBaseSha?: string
  baselineSnapshot?: AutomaticFailureBaseline
}

type FixtureRunState = {
  provisioner: AuditProvisioner
  receipt: AuditFixtureReceipt
  bindingSecret: string
  identities: Map<string, AuditFixtureIdentityDefinition>
}

const fixtureRuns = new Map<string, FixtureRunState>()
const baselineRuns = new Map<string, Promise<AutomaticFailureBaseline>>()

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

function exactSnapshotBlobDigest(mergeBaseSha: string): string {
  const blob = execFileSync('git', ['show', `${mergeBaseSha}:${AUTOMATIC_FAILURE_BASELINE_PATH}`], {
    cwd: repoRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'ignore'],
  }) as Buffer
  return createHash('sha256').update(blob).digest('hex')
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

function fixtureBindingSecret(run: AuditRun, required: boolean): string {
  let secret = ''
  try {
    secret = readFileSync(path.join(run.outputDir, 'fixture-binding.secret'), 'utf8').trim()
  } catch {
    if (required) throw new Error('audit-owned fixture writes require the controller-provided session binding secret')
  }
  if (required && secret.length < 16) {
    throw new Error('audit-owned fixture writes require the controller-provided session binding secret')
  }
  return secret
}

function fixtureState(definitions: ReturnType<typeof auditFixtureDefinitions>, provisioner: AuditProvisioner, receipt: AuditFixtureReceipt, bindingSecret: string): FixtureRunState {
  const identities = new Map<string, AuditFixtureIdentityDefinition>()
  for (const identity of definitions.identities ?? []) identities.set(identity.fixture, identity)
  return { provisioner, receipt, bindingSecret, identities }
}

async function ensureAuditFixtures(run: AuditRun): Promise<FixtureRunState> {
  const key = fixtureRunKey(run)
  const current = fixtureRuns.get(key)
  if (current) return current
  const definitions = auditFixtureDefinitions(run.sessionId)
  const clients = fixtureClients(definitions)
  const hasWrites = (definitions.identities?.length ?? 0) > 0 || (definitions.records?.length ?? 0) > 0
  const bindingSecret = fixtureBindingSecret(run, hasWrites)
  const provisioner = new AuditProvisioner({
    candidateSha: run.candidateSha,
    sessionId: run.sessionId,
    definitions,
    bindingSecret,
    sql: clients.sql,
    auth: clients.auth,
    onReceipt: async (receipt) => { await run.writer.writeFixtureReceipt(receipt) },
  })
  const receipt = await provisioner.provision()
  const state = fixtureState(definitions, provisioner, receipt, bindingSecret)
  fixtureRuns.set(key, state)
  await run.writer.writeFixtureReceipt(receipt)
  return state
}

/** Finish the audit-owned fixture lifecycle and persist the final cleanup receipt. */
export async function cleanupAuditFixtures(run: AuditRun, onFailure = false): Promise<AuditFixtureReceipt> {
  const key = fixtureRunKey(run)
  let state = fixtureRuns.get(key)
  if (!state) {
    const definitions = auditFixtureDefinitions(run.sessionId)
    const clients = fixtureClients(definitions)
    const hasWrites = (definitions.identities?.length ?? 0) > 0 || (definitions.records?.length ?? 0) > 0
    const bindingSecret = fixtureBindingSecret(run, hasWrites)
    const provisioner = new AuditProvisioner({
      candidateSha: run.candidateSha,
      sessionId: run.sessionId,
      definitions,
      bindingSecret,
      sql: clients.sql,
      auth: clients.auth,
    })
    state = fixtureState(
      definitions,
      provisioner,
      emptyAuditFixtureReceipt(run.candidateSha, run.sessionId, bindingSecret),
      bindingSecret,
    )
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
  const forbiddenBaselineEnv = Object.keys(process.env).filter((name) => name.startsWith('DESIGN_AUDIT_BASELINE_'))
  if (forbiddenBaselineEnv.length > 0) {
    throw new Error(`change-gate baseline directory/session inputs are rejected: ${forbiddenBaselineEnv.join(', ')}`)
  }
  const verificationBase = env('DESIGN_AUDIT_VERIFICATION_BASE')
    || `origin/${env('MOS_PR_BASE') || 'dev'}`
  const mergeBaseSha = env('DESIGN_AUDIT_MERGE_BASE_SHA')
  return {
    baseURL,
    outputDir,
    candidateSha,
    sessionId,
    writer: new ReportWriter({ outputDir, candidateSha, sessionId }),
    verificationBase: verificationBase || undefined,
    mergeBaseSha: mergeBaseSha || undefined,
  }
}

/** Compare the complete candidate census against the exact-base evidence. */
export async function compareAutomaticFailures(
  run: AuditRun,
  candidateFailures: AutomaticFailure[],
): Promise<FailureComparison> {
  if (env('DESIGN_AUDIT_MODE') !== 'change-gate') return classifyFailureSet(candidateFailures, [])
  const expectedSha = run.candidateSha
  const verificationBase = run.verificationBase || `origin/${env('MOS_PR_BASE') || 'dev'}`
  const key = `${repoRoot}:${expectedSha}:${verificationBase}:${run.sessionId}`
  let pending = baselineRuns.get(key)
  if (!pending) {
    pending = loadTrustedAutomaticFailureBaseline({ repoRoot, candidateSha: expectedSha, verificationBase }).then((result) => {
      if (!result.ok || !result.snapshot) {
        throw new Error(`change-gate exact merge-base snapshot is invalid:\n${result.errors.join('\n')}`)
      }
      run.mergeBaseSha = result.mergeBaseSha
      run.baselineSnapshot = result.snapshot
      return result.snapshot
    })
    baselineRuns.set(key, pending)
  }
  const snapshot = await pending
  const baselineFailures: AutomaticFailure[] = snapshot.failures.map((identity) => ({
    ...identity,
    message: 'automatic failure recorded in exact merge-base snapshot',
  }))
  const untested = new Set(snapshot.untestedCellIds)
  // The compact snapshot stores untested IDs without a state field. Match the
  // candidate's actual state when classifying those coverage records, so an
  // inherited non-default cell does not become a false regression.
  for (const failure of candidateFailures) {
    if (failure.ruleId === 'state.coverage' && untested.has(failure.cellId)) {
      baselineFailures.push({
        ...failure,
        message: 'manifest cell was untested in the exact merge-base snapshot',
      })
    }
  }
  return classifyFailureSet(candidateFailures, baselineFailures)
}

/**
 * Lane-facing comparison seam. A malformed or missing exact-base snapshot is
 * itself a blocking failure, but the lane still writes its complete summary
 * before the caller performs its deliberate assertion.
 */
export async function compareAutomaticFailuresForLane(
  run: AuditRun,
  candidateFailures: AutomaticFailure[],
): Promise<FailureComparison> {
  try {
    return await compareAutomaticFailures(run, candidateFailures)
  } catch (error) {
    const baselineFailure: AutomaticFailure = {
      ruleId: 'change-gate.baseline',
      cellId: '__baseline__',
      selector: '__exact-merge-base-snapshot__',
      state: 'default',
      message: String(error),
    }
    const allFailures = [...candidateFailures, baselineFailure]
    return {
      allFailures,
      inheritedFailures: [],
      newFailures: allFailures,
      failures: allFailures,
      automaticChecksPassed: false,
    }
  }
}

export function auditMode(): 'mvp-assessment' | 'change-gate' {
  return env('DESIGN_AUDIT_MODE') === 'change-gate' ? 'change-gate' : 'mvp-assessment'
}

/** Write the common completion/count/digest envelope for an automatic lane. */
export async function writeAutomaticLaneSummary(
  run: AuditRun,
  artifact: string,
  payload: Record<string, unknown>,
  count: number,
): Promise<string> {
  const measured = {
    ...payload,
    auditMode: auditMode(),
    complete: true,
    count,
  }
  return run.writer.writeJson(artifact, {
    ...measured,
    digest: digestAutomaticFailureLane(measured),
  })
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
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  if (status) throw new Error('working tree changed during audit; evidence must be bound to one committed candidate')
  let session: Record<string, unknown>
  try {
    session = JSON.parse(readFileSync(path.join(run.outputDir, 'session.json'), 'utf8')) as Record<string, unknown>
  } catch {
    throw new Error('audit session metadata is missing or invalid')
  }
  if (session.candidateSha !== run.candidateSha || session.sessionId !== run.sessionId) {
    throw new Error('audit session metadata changed during the run')
  }
  if (env('DESIGN_AUDIT_MODE') === 'change-gate') {
    const verificationBase = run.verificationBase || `origin/${env('MOS_PR_BASE') || 'dev'}`
    const resolvedMergeBase = execFileSync('git', ['merge-base', run.candidateSha, verificationBase], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim()
    if (!/^[0-9a-f]{40}$/.test(resolvedMergeBase)) throw new Error('exact merge base is not a full lowercase SHA')
    if (session.verificationBase !== verificationBase || session.mergeBaseSha !== resolvedMergeBase) {
      throw new Error('audit session merge-base binding changed during the run')
    }
    if (typeof session.snapshotBlobDigest !== 'string' || !/^[0-9a-f]{64}$/.test(session.snapshotBlobDigest)) {
      throw new Error('audit session snapshot blob digest is missing or invalid')
    }
    let actualSnapshotBlobDigest = ''
    try {
      actualSnapshotBlobDigest = exactSnapshotBlobDigest(resolvedMergeBase)
    } catch {
      throw new Error('exact merge-base snapshot blob is missing or unreadable')
    }
    if (session.snapshotBlobDigest !== actualSnapshotBlobDigest) {
      throw new Error('audit session snapshot blob digest changed during the run')
    }
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
    assertAuditEnvironment()
    if (process.env.DESIGN_AUDIT_MODE === 'change-gate') {
      const trusted = await loadTrustedAutomaticFailureBaseline({
        repoRoot,
        candidateSha: run.candidateSha,
        verificationBase: run.verificationBase || `origin/${env('MOS_PR_BASE') || 'dev'}`,
      })
      if (!trusted.ok || !trusted.snapshot) throw new Error(`change-gate exact merge-base snapshot is invalid:\n${trusted.errors.join('\n')}`)
      run.mergeBaseSha = trusted.mergeBaseSha
      run.baselineSnapshot = trusted.snapshot
    }
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

export async function loginAuditFixture(
  page: Page,
  fixtureName: string,
  sessionId = env('DESIGN_AUDIT_SESSION_ID'),
  identity?: AuditFixtureIdentityDefinition,
): Promise<void> {
  if (authenticatedFixture.get(page) === fixtureName) return
  const fixture = fixtureName === AUDIT_RECEIVING_ONLY
    ? auditOwnedReceivingFixture(sessionId, identity)
    : fixtureCredentials[fixtureName as keyof typeof fixtureCredentials]
  if (!fixture || !('password' in fixture)) throw new Error(`unknown audit fixture ${fixtureName}`)
  if ('owned' in fixture && fixture.owned) assertAuditFixtureNamespace(fixture.email, sessionId)
  await page.context().clearCookies()
  await page.goto('.')
  await page.evaluate(() => localStorage.clear())
  await loginAs(page, fixture.email, fixture.password)
  authenticatedFixture.set(page, fixtureName)
}

export async function prepareAuditPage(page: Page, run: AuditRun, cell: ManifestCell): Promise<{ setupFailure?: string }> {
  const viewport = VIEWPORT_SIZES[cell.viewport]
  if (!viewport) throw new Error(`unknown audit viewport ${cell.viewport}`)
  await page.setViewportSize(viewport)
  const state = await ensureAuditFixtures(run)
  assertAuditFixtureWritePolicy({
    fixture: cell.fixture,
    sessionId: run.sessionId,
    candidateSha: run.candidateSha,
    bindingSecret: state.bindingSecret,
    receipt: state.receipt,
    writes: cell.stateContract?.writes === true,
  })
  await loginAuditFixture(page, cell.fixture, run.sessionId, state.identities.get(cell.fixture))
  await page.evaluate(({ theme, language }) => {
    // Providers read their persisted state during the first render. Seed both values while the
    // authenticated page is still mounted so each matrix cell exercises the real provider path.
    window.localStorage.setItem('mos.locale', language === 'id' ? 'id' : 'en')
    window.localStorage.setItem('mos-theme', theme === 'dark' ? 'dark' : 'light')
  }, { theme: cell.theme, language: cell.language })
  await page.goto(cell.route, { waitUntil: 'domcontentloaded' })
  assertAuditRoute(page.url(), cell.route)
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
  // A setup selector that does not resolve blocks for the action timeout and then throws. The
  // spec runs serial, so that used to end the whole lane before it wrote a single artifact: one
  // wrong selector cost an entire assessment run, which came back as empty stubs. A cell that
  // cannot reach its own state is one untested cell, not a lost run — the failure is carried on
  // the cell, where observeManifestCellState reports it, and every other cell still measures.
  for (const action of cell.stateContract?.setup ?? []) {
    const target = page.locator(action.selector).filter({ visible: true }).first()
    try {
      if (action.action === 'click') await target.click()
      else if (action.action === 'fill') await target.fill(action.value ?? '')
      else await target.press(action.value ?? '')
    } catch (error) {
      return { setupFailure: `${action.action} ${action.selector}: ${(error as Error).message.split('\n')[0]}` }
    }
  }
  return {}
}

/**
 * A route visit is only a smoke check. Covered cells execute their declared
 * browser actions and then require the exact selector/attribute assertion.
 * A prose description, URL, screenshot, or incidental copy cannot make a state
 * runnable or observed.
 */
export async function observeManifestCellState(page: Page, cell: ManifestCell, setupFailure?: string): Promise<StateObservation> {
  // The cell could not reach its own state. Say which action failed rather than reporting the
  // assertion that was never given a chance to match.
  if (setupFailure) return { status: 'untested', evidence: `state setup did not run: ${setupFailure}` }
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
  const matchingCount = async (
    selector: string,
    expected: { attribute?: string; value?: string },
  ): Promise<number> => {
    const candidates = page.locator(selector).filter({ visible: true })
    return expected.attribute
      ? candidates.evaluateAll((elements, condition) => elements.filter((element) => {
        const actual = element.getAttribute(condition.attribute)
        return condition.value === undefined ? actual !== null : actual === condition.value
      }).length, { attribute: expected.attribute, value: expected.value })
      : candidates.count()
  }
  const count = await matchingCount(assertion.selector, assertion)
  const negative = cell.stateContract!.negativeAssertion
  const negativeCount = negative
    ? await matchingCount(negative.selector, negative)
    : 0
  if (count > 0 && negativeCount === 0) await settleAnimations(page)
  return count > 0 && negativeCount === 0
    ? { status: 'covered', evidence: `${count} visible assertion target(s): ${assertion.selector}; default marker absent` }
    : { status: 'untested', evidence: `state assertion did not match: ${assertion.selector}` }
}

/**
 * Wait out entry transitions before anything is measured or captured.
 *
 * A surface that animates in is at its FROM keyframe the moment its assertion target becomes
 * visible. The Signals composer enters with `translateY(4px)` and a fade, so it measured 4px
 * past the bottom of the viewport and photographed half-transparent — a geometry failure and a
 * ghosted screenshot, both of a surface that fits and is opaque a sixth of a second later.
 */
export async function settleAnimations(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const running = document.getAnimations().filter((animation) => animation.playState === 'running')
    // An animation that never ends (a spinner) would hang the run, so give the batch a ceiling.
    await Promise.race([
      Promise.allSettled(running.map((animation) => animation.finished)),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ])
  })
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
  await settleAnimations(page)
  await page.screenshot({ path: screenshotPath, fullPage: false })
  return screenshotPath
}

export function cellsFor(manifest: DesignQualityManifest, area?: string): ManifestCell[] {
  return area ? manifest.cells.filter((cell) => cell.area === area) : [...manifest.cells]
}
