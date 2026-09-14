import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Page } from '@playwright/test'

import { loginAs } from '../helpers/login'
import { ADMIN, BAR_MEMBER, BAR_SUPERVISOR, MANAGER, ORPHAN, VIEWER } from '../fixtures/users'
import { assertDevServerOwnership, worktreeFingerprint } from '../../src/lib/dev-server'
import {
  AUDIT_RECEIVING_ONLY,
  auditOwnedReceivingFixture,
  assertAuditFixtureNamespace,
  assertAuditFixtureWritePolicy,
} from './audit-fixtures'
import { ReportWriter } from './report'
import type { DesignQualityManifest, ManifestCell } from './manifest'

const __filename = fileURLToPath(import.meta.url)
const __dir = path.dirname(__filename)
const appDir = path.resolve(__dir, '../..')
const repoRoot = path.resolve(appDir, '..')
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

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

export type StateObservation = {
  status: 'covered' | 'untested'
  evidence: string
}

export function isAuditCellRunnable(cell: ManifestCell): boolean {
  return cell.status === 'covered'
    && Boolean(cell.stateContract?.setup?.trim())
    && Boolean(cell.stateContract?.assertion?.trim())
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
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
  const fixture = fixtureName === AUDIT_RECEIVING_ONLY
    ? auditOwnedReceivingFixture(sessionId)
    : fixtureCredentials[fixtureName as keyof typeof fixtureCredentials]
  if (!fixture || !('password' in fixture)) throw new Error(`unknown audit fixture ${fixtureName}`)
  if ('owned' in fixture && fixture.owned) assertAuditFixtureNamespace(fixture.email, sessionId)
  await loginAs(page, fixture.email, fixture.password)
}

export async function prepareAuditPage(page: Page, run: AuditRun, cell: ManifestCell): Promise<void> {
  const viewport = VIEWPORT_SIZES[cell.viewport]
  if (!viewport) throw new Error(`unknown audit viewport ${cell.viewport}`)
  await page.setViewportSize(viewport)
  assertAuditFixtureWritePolicy({
    fixture: cell.fixture,
    sessionId: run.sessionId,
    writes: cell.stateContract?.writes === true,
  })
  await loginAuditFixture(page, cell.fixture, run.sessionId)
  await page.goto(cell.route, { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ theme, language }) => {
    document.documentElement.dataset.theme = theme
    document.documentElement.lang = language === 'id' ? 'id' : 'en'
  }, { theme: cell.theme, language: cell.language })
  await page.waitForTimeout(100)
  void run
}

/**
 * A route visit is only a smoke check. Non-default manifest states need a
 * rendered marker or they are written as untested and fail readiness. This
 * deliberately does not infer a state from a URL, a screenshot, or a copy word.
 * Product fixtures can expose `data-design-audit-state` (or an existing
 * `data-state`/`data-status`) once their deterministic setup is ready.
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
  if (cell.state === 'default') {
    const visible = await page.locator('main, [role="main"]').filter({ visible: true }).count()
    return visible > 0
      ? { status: 'covered', evidence: 'visible main landmark after route settle' }
      : { status: 'untested', evidence: 'no visible main landmark after route settle' }
  }
  const escaped = cell.state.replace(/"/g, '\\"')
  const selectors = [
    `[data-design-audit-state="${escaped}"]`,
    `[data-state="${escaped}"]`,
    `[data-status="${escaped}"]`,
  ].join(', ')
  const count = await page.locator(selectors).filter({ visible: true }).count()
  return count > 0
    ? { status: 'covered', evidence: `${count} visible state marker(s): ${selectors}` }
    : { status: 'untested', evidence: `no visible deterministic state marker for ${cell.state}` }
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

export function screenshotName(cell: ManifestCell): string {
  const slug = cell.route.replace(/^\/mos\//, '').replace(/[^a-z0-9]+/gi, '-')
  return `${slug}-${cell.fixture}-${cell.viewport}-${cell.theme}-${cell.language}-${cell.state}.png`.toLowerCase()
}

export async function captureCell(page: Page, run: AuditRun, cell: ManifestCell): Promise<string> {
  const screenshotDir = path.join(run.outputDir, 'screenshots')
  const screenshotPath = path.join(screenshotDir, screenshotName(cell))
  await page.screenshot({ path: screenshotPath, fullPage: false })
  return screenshotPath
}

export function cellsFor(manifest: DesignQualityManifest, area?: string): ManifestCell[] {
  return area ? manifest.cells.filter((cell) => cell.area === area) : [...manifest.cells]
}
