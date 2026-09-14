import { execFile, execFileSync } from 'node:child_process'
import { access, mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import { test, expect } from '@playwright/test'

import { DESIGN_QUALITY_MANIFEST, type ManifestCell } from './manifest'
import {
  assertAuditEnvironment,
  assertAuditServer,
  auditEnabled,
  auditRun,
  captureCell,
  prepareAuditPage,
} from './runtime'

const execFileAsync = promisify(execFile)
const repoRoot = path.resolve(process.cwd(), '..')
const DETECTOR = path.join(repoRoot, 'scripts/impeccable-detect.mjs')
const SCORE_THRESHOLD = 0.75

type MockupAuthorityEntry = {
  path: string
  authority: string
  requiredRegions: string[]
  route?: string
  viewport?: string
}

type DiffComparison = {
  mockup: string
  build: string
  authority: string
  score: number | null
  requiredRegions: string[]
  missingRegions: string[]
  contradictedRegions: string[]
  status: 'pass' | 'fail' | 'blocked'
  reason?: string
}

function env(name: string): string {
  return process.env[name]?.trim() ?? ''
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(asString).filter(Boolean) : []
}

function authorityEntry(value: unknown, inheritedAuthority = ''): MockupAuthorityEntry {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('mockup authority entries must be objects')
  }
  const row = value as Record<string, unknown>
  const image = asString(row.path || row.file || row.authority_image)
  const authority = asString(row.authority || row.source_decision_citation || inheritedAuthority)
  if (!image || !authority) throw new Error('every mockup must name an image and its authority')
  if (row.status !== undefined && row.status !== 'approved') {
    throw new Error(`mockup ${image} is not approved by the supplied authority list`)
  }
  if (row.comp_diff_valid === false) {
    throw new Error(`mockup ${image} is not valid for comp-diff according to its authority list`)
  }
  return {
    path: path.resolve(repoRoot, image),
    authority,
    requiredRegions: asStringArray(row.requiredRegions ?? row.required_regions),
    route: asString(row.route),
    viewport: asString(row.viewport),
  }
}

function payloadEntries(payload: unknown): { entries: unknown[]; authorityRows: boolean; inheritedAuthority: string } {
  if (Array.isArray(payload)) return { entries: payload, authorityRows: false, inheritedAuthority: '' }
  if (typeof payload !== 'object' || payload === null) return { entries: [], authorityRows: false, inheritedAuthority: '' }
  const record = payload as Record<string, unknown>
  const entries = Array.isArray(record.mockups)
    ? record.mockups
    : Array.isArray(record.entries)
      ? record.entries
      : Array.isArray(record.rows)
        ? record.rows
        : []
  return {
    entries,
    authorityRows: Array.isArray(record.rows),
    inheritedAuthority: asString(record.authority),
  }
}

/**
 * Load only an explicit, authority-backed list. There is intentionally no
 * directory discovery fallback: archived/private docs must never silently
 * become a CI acceptance contract.
 */
export async function approvedMockups(): Promise<MockupAuthorityEntry[]> {
  const authorityPath = env('DESIGN_AUDIT_MOCKUP_AUTHORITY')
  const listPath = env('DESIGN_AUDIT_MOCKUP_LIST')
  const configuredPaths = env('DESIGN_AUDIT_MOCKUPS')

  if (authorityPath || listPath) {
    const source = authorityPath || listPath
    let payload: unknown
    try {
      payload = JSON.parse(await readFile(path.resolve(repoRoot, source), 'utf8'))
    } catch (error) {
      throw new Error(`mockup authority list could not be read: ${source} (${String(error)})`)
    }
    const parsed = payloadEntries(payload)
    // The private authority inventory contains historical/reference rows as
    // well as current approved rows. Only rows explicitly marked approved and
    // valid for comp-diff enter this acceptance lane; the inventory itself is
    // still required explicitly through the environment above.
    const candidates = parsed.authorityRows
      ? parsed.entries.filter((entry) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false
        const row = entry as Record<string, unknown>
        return row.status === 'approved' && row.comp_diff_valid === true
      })
      : parsed.entries
    const entries = candidates.map((entry) => authorityEntry(entry, parsed.inheritedAuthority))
    if (entries.length === 0) throw new Error('mockup authority list contains no approved comp-diff image entries')
    return entries
  }

  if (configuredPaths) {
    const authority = env('DESIGN_AUDIT_MOCKUP_AUTHORITY_CITATION')
    if (!authority) {
      throw new Error('DESIGN_AUDIT_MOCKUPS requires DESIGN_AUDIT_MOCKUP_AUTHORITY_CITATION')
    }
    return configuredPaths.split(',').map((value) => authorityEntry({ path: value, authority }))
  }

  throw new Error(
    'mockup fidelity requires an explicit authority-backed list via DESIGN_AUDIT_MOCKUP_AUTHORITY ' +
    'or DESIGN_AUDIT_MOCKUP_LIST; directory discovery is disabled',
  )
}

function productionUiFiles(): string[] {
  const output = execFileSync('git', ['ls-files', 'mos-app/src'], { cwd: repoRoot, encoding: 'utf8' })
  return output.split(/\r?\n/).filter((file) => {
    if (!/\.(?:css|html|jsx|tsx|vue|svelte|astro)$/i.test(file)) return false
    return !/(?:\.test\.|\.spec\.|\.stories\.|\/__tests__\/|\/fixtures\/)/i.test(file)
  })
}

type DetectorResult = {
  status: 'pass' | 'findings' | 'blocked'
  findings: unknown[]
  scannedFiles: string[]
  error?: string
}

function parseJsonArray(text: string): unknown[] | null {
  try {
    const payload = JSON.parse(text)
    return Array.isArray(payload) ? payload : null
  } catch {
    return null
  }
}

async function runImpeccableDetector(): Promise<DetectorResult> {
  const scannedFiles = productionUiFiles()
  if (scannedFiles.length === 0) {
    return { status: 'blocked', findings: [], scannedFiles, error: 'no production UI source files were found' }
  }
  try {
    const result = await execFileAsync('node', [DETECTOR, '--json', '--no-advisory', ...scannedFiles], {
      cwd: repoRoot,
      maxBuffer: 16 * 1024 * 1024,
    })
    const findings = parseJsonArray(result.stdout)
    if (!findings) return { status: 'blocked', findings: [], scannedFiles, error: 'detector did not emit a JSON findings array' }
    return { status: findings.length === 0 ? 'pass' : 'findings', findings, scannedFiles }
  } catch (error) {
    const candidate = error as { stdout?: string; stderr?: string; message?: string }
    const findings = parseJsonArray(candidate.stdout ?? '')
    if (findings) {
      return {
        status: findings.length === 0 ? 'pass' : 'findings',
        findings,
        scannedFiles,
        error: candidate.stderr?.trim() || candidate.message,
      }
    }
    return { status: 'blocked', findings: [], scannedFiles, error: candidate.stderr?.trim() || candidate.message || String(error) }
  }
}

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return null
}

function normalizeRegions(payload: unknown): Array<{ name: string; status: string }> {
  if (!Array.isArray(payload)) return []
  return payload.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Record<string, unknown>
    const name = asString(row.name || row.id || row.region)
    const status = asString(row.status || row.verdict || row.result).toLowerCase()
    return name ? [{ name, status }] : []
  })
}

function scoreFrom(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null) return null
  const row = payload as Record<string, unknown>
  for (const candidate of [row.overallScore, row.overall_score, row.score, row.similarity, row.ssim]) {
    const value = numberFrom(candidate)
    if (value !== null) return value
  }
  return null
}

function evaluateComparison(
  entry: MockupAuthorityEntry,
  build: string,
  payload: unknown,
): DiffComparison {
  const score = scoreFrom(payload)
  const regions = normalizeRegions(typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>).regions
    : null)
  const missingRegions = entry.requiredRegions.filter((required) => {
    const region = regions.find((candidate) => candidate.name === required)
    return !region || region.status === 'missing'
  })
  const contradictedRegions = entry.requiredRegions.filter((required) => {
    const region = regions.find((candidate) => candidate.name === required)
    return region?.status === 'contradicted' || region?.status === 'fail'
  })
  const passed = score !== null && score >= SCORE_THRESHOLD && missingRegions.length === 0 && contradictedRegions.length === 0
  return {
    mockup: entry.path,
    build,
    authority: entry.authority,
    score,
    requiredRegions: entry.requiredRegions,
    missingRegions,
    contradictedRegions,
    status: passed ? 'pass' : 'fail',
    reason: passed
      ? undefined
      : `overall score must be >=${SCORE_THRESHOLD} and required regions must be present and uncontradicted`,
  }
}

async function compareWithImageMagick(comp: string, build: string): Promise<unknown> {
  try {
    const result = await execFileAsync('magick', ['compare', '-metric', 'RMSE', comp, build, 'null:'], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    })
    const text = `${result.stdout}\n${result.stderr}`
    const fraction = /\(([0-9]+(?:\.[0-9]+)?)\)/.exec(text)?.[1]
    const rmse = fraction === undefined ? null : Number(fraction)
    return { score: rmse === null ? null : Math.max(0, Math.min(1, 1 - rmse)), regions: [] }
  } catch (error) {
    const candidate = error as { stdout?: string; stderr?: string; message?: string }
    const text = `${candidate.stdout ?? ''}\n${candidate.stderr ?? ''}`
    const fraction = /\(([0-9]+(?:\.[0-9]+)?)\)/.exec(text)?.[1]
    if (fraction !== undefined) {
      const rmse = Number(fraction)
      return { score: Math.max(0, Math.min(1, 1 - rmse)), regions: [] }
    }
    throw new Error(candidate.stderr?.trim() || candidate.message || String(error))
  }
}

async function compareMockup(entry: MockupAuthorityEntry, build: string): Promise<unknown> {
  const configuredTool = env('DESIGN_AUDIT_COMP_DIFF')
  if (configuredTool) {
    const result = await execFileAsync(configuredTool, [
      '--comp', entry.path,
      '--build', build,
      '--json',
    ], { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 })
    return JSON.parse(result.stdout)
  }
  return compareWithImageMagick(entry.path, build)
}

function viewportName(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = /^(\d+)x(\d+)$/.exec(value)
  if (!match) return undefined
  const prefix = match[1] === '390' ? 'phone' : match[1] === '1024' ? 'compact' : 'desktop'
  return `${prefix}-${match[1]}x${match[2]}`
}

function cellForMockup(entry: MockupAuthorityEntry): ManifestCell | undefined {
  const viewport = viewportName(entry.viewport)
  return DESIGN_QUALITY_MANIFEST.cells.find((cell) =>
    (!entry.route || cell.route === entry.route) && (!viewport || cell.viewport === viewport),
  )
}

test.describe.configure({ mode: 'serial' })

test('the vendored Impeccable detector scans production UI and writes its own artifact', async () => {
  test.skip(!auditEnabled(), 'set DESIGN_QUALITY_RUN=1 through scripts/design-quality-audit.sh')
  assertAuditEnvironment()
  const run = auditRun()
  const result = await runImpeccableDetector()
  await run.writer.writeJson('impeccable.json', result)
  expect(result.status, result.error ?? 'Impeccable detector found blocking production findings').toBe('pass')
})

test('mockup fidelity requires an authority list and enforces score and region contracts', async ({ page }) => {
  test.skip(!auditEnabled(), 'set DESIGN_QUALITY_RUN=1 through scripts/design-quality-audit.sh')
  assertAuditEnvironment()
  const run = auditRun()
  await assertAuditServer(run.baseURL)
  const comparisons: DiffComparison[] = []
  let authorityEntries: MockupAuthorityEntry[] = []
  let blockedReason = ''
  try {
    authorityEntries = await approvedMockups()
  } catch (error) {
    blockedReason = String(error)
  }

  if (authorityEntries.length === 0) {
    await run.writer.writeJson('mockup-diff/status.json', {
      status: 'blocked',
      comparisons,
      reason: blockedReason || 'no authority-backed mockups were supplied',
    })
    expect(authorityEntries, blockedReason || 'mockup authority list is required').toHaveLength(1)
    return
  }

  for (const entry of authorityEntries) {
    await access(entry.path)
    const cell = cellForMockup(entry)
    if (!cell) {
      comparisons.push({
        mockup: entry.path,
        build: '',
        authority: entry.authority,
        score: null,
        requiredRegions: entry.requiredRegions,
        missingRegions: entry.requiredRegions,
        contradictedRegions: [],
        status: 'blocked',
        reason: 'authority row does not map to a manifest route and viewport',
      })
      continue
    }
    await prepareAuditPage(page, run, cell)
    const build = await captureCell(page, run, cell)
    const relativeDir = path.join('mockup-diff', path.basename(entry.path, path.extname(entry.path)))
    const outDir = path.join(run.outputDir, relativeDir)
    await mkdir(outDir, { recursive: true })
    try {
      const raw = await compareMockup(entry, build)
      const comparison = evaluateComparison(entry, build, raw)
      comparisons.push(comparison)
      await run.writer.writeJson(path.join(relativeDir, 'report.json'), comparison)
    } catch (error) {
      const comparison: DiffComparison = {
        mockup: entry.path,
        build,
        authority: entry.authority,
        score: null,
        requiredRegions: entry.requiredRegions,
        missingRegions: entry.requiredRegions,
        contradictedRegions: [],
        status: 'blocked',
        reason: String(error),
      }
      comparisons.push(comparison)
      await run.writer.writeJson(path.join(relativeDir, 'report.json'), comparison)
    }
  }

  const passed = comparisons.length > 0 && comparisons.every((comparison) => comparison.status === 'pass')
  await run.writer.writeJson('mockup-diff/status.json', {
    status: passed ? 'pass' : 'fail',
    threshold: SCORE_THRESHOLD,
    comparisons,
  })
  expect(comparisons, 'every authority entry must produce a comparison').not.toHaveLength(0)
  expect(comparisons.filter((comparison) => comparison.status !== 'pass'), 'mockup fidelity score/region contract failed').toEqual([])
})
