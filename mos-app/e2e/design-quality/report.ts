import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { validateAuditFixtureReceipt, type AuditFixtureReceipt } from './audit-provisioner.ts'
import { isManifestCellRunnable, validateManifest, type DesignQualityManifest } from './manifest.ts'

export const REQUIRED_ARTIFACTS = [
  'manifest.json',
  'fixture-receipt.json',
  'gate-log.txt',
  'contrast.csv',
  'geometry.csv',
  'number-census.csv',
  'control-census.csv',
  'control-consistency.csv',
  'state-matrix.csv',
  'affordance-census.csv',
  'copy-census.csv',
  'visible-content.csv',
  'quantitative-summary.json',
  'control-consistency-summary.json',
  'contrast-summary.json',
  'anti-slop-summary.json',
  'axe-summary.json',
  'impeccable.json',
  'mockup-diff',
] as const

export type RequiredArtifact = (typeof REQUIRED_ARTIFACTS)[number]
export type FindingDisposition = 'fixed' | 'false-positive' | 'sanctioned-exception' | 'blocker'
export type FindingSeverity = 'critical' | 'important' | 'minor'

export type FindingDispositionRecord = {
  id: string
  ruleId: string
  surface: string
  severity: FindingSeverity
  message: string
  disposition: FindingDisposition
  evidence: string
  authority?: string
}

export type ReportRunMetadata = {
  candidateSha: string
  sessionId: string
}

export type ArtifactValidation = {
  ok: boolean
  missing: string[]
  stale: string[]
  invalid: string[]
  files: string[]
  errors: string[]
}

const SHA = /^[0-9a-f]{40}$/
const SESSION_ID = /^[0-9a-f]{8}$/

function assertMetadata(metadata: ReportRunMetadata): void {
  if (!SHA.test(metadata.candidateSha)) throw new Error('candidateSha must be a 40-character lowercase git SHA')
  if (!SESSION_ID.test(metadata.sessionId)) throw new Error('sessionId must be the runner-minted 8-character hex id')
}

function metadataLines(metadata: ReportRunMetadata): string {
  return `# candidate_sha=${metadata.candidateSha}\n# session_id=${metadata.sessionId}\n`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateMockupStatus(
  payload: unknown,
  allowMockupGaps: boolean,
): { ok: boolean; reason?: string } {
  if (!isRecord(payload) || !Array.isArray(payload.comparisons) || payload.comparisons.length === 0) {
    return { ok: false, reason: 'status.json must contain at least one comparison' }
  }
  if (payload.complete !== true || !Number.isInteger(payload.count) || Number(payload.count) !== payload.comparisons.length
    || typeof payload.digest !== 'string' || !/^[0-9a-f]{64}$/.test(payload.digest)) {
    return { ok: false, reason: 'status.json must declare complete/count/digest lane metadata' }
  }
  const comparisons = payload.comparisons
  const measured = comparisons.every((comparison) => isRecord(comparison)
    && (comparison.status === 'pass' || comparison.status === 'fail')
    && typeof comparison.score === 'number'
    && typeof comparison.build === 'string'
    && comparison.build.length > 0
    && Array.isArray(comparison.missingRegions)
    && Array.isArray(comparison.contradictedRegions))
  if (!measured) {
    return { ok: false, reason: 'every comparison must be completed; blocked or unmeasured comparisons are invalid' }
  }
  const passEntriesMeetContract = comparisons.every((comparison) => !isRecord(comparison)
    || comparison.status !== 'pass'
    || ((comparison.score as number) >= 0.75
      && (comparison.missingRegions as unknown[]).length === 0
      && (comparison.contradictedRegions as unknown[]).length === 0))
  if (!passEntriesMeetContract) {
    return { ok: false, reason: 'every pass comparison must meet the 0.75 score and region contract' }
  }
  if (payload.status === 'pass') {
    return comparisons.every((comparison) => isRecord(comparison)
      && comparison.status === 'pass'
      && (comparison.score as number) >= 0.75
      && (comparison.missingRegions as unknown[]).length === 0
      && (comparison.contradictedRegions as unknown[]).length === 0)
      ? { ok: true }
      : { ok: false, reason: 'pass status requires every comparison to meet the 0.75 score and region contract' }
  }
  if (allowMockupGaps && (payload.status === 'assessed-with-gaps' || payload.status === 'fail')) {
    const failures = comparisons.filter((comparison) => isRecord(comparison) && comparison.status === 'fail')
    if (failures.length > 0 && failures.every((comparison) => (comparison.score as number) < 0.75)) {
      return { ok: true }
    }
    return { ok: false, reason: 'assessed-with-gaps requires at least one completed comparison below the 0.75 threshold' }
  }
  return { ok: false, reason: 'status.json does not report an allowed completed status' }
}

function csvValue(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvRows(rows: readonly Record<string, unknown>[]): string {
  const columnNames = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort()
  if (columnNames.length === 0) return ''
  const lines = [columnNames.map(csvValue).join(',')]
  for (const row of rows) lines.push(columnNames.map((column) => csvValue(row[column])).join(','))
  return `${lines.join('\n')}\n`
}

async function allFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...(await allFiles(child)))
    else if (entry.isFile()) files.push(child)
  }
  return files
}

export class ReportWriter {
  readonly outputDir: string
  readonly metadata: ReportRunMetadata

  constructor(options: { outputDir: string } & ReportRunMetadata) {
    assertMetadata(options)
    this.outputDir = path.resolve(options.outputDir)
    this.metadata = { candidateSha: options.candidateSha, sessionId: options.sessionId }
  }

  private target(name: string): string {
    if (!name || path.isAbsolute(name) || name.split(path.sep).includes('..')) {
      throw new Error(`artifact name must stay beneath the report directory: ${name}`)
    }
    return path.join(this.outputDir, name)
  }

  async writeJson(name: string, value: unknown): Promise<string> {
    const target = this.target(name)
    await mkdir(path.dirname(target), { recursive: true })
    const payload = isRecord(value)
      ? { ...value, candidateSha: this.metadata.candidateSha, sessionId: this.metadata.sessionId }
      : { candidateSha: this.metadata.candidateSha, sessionId: this.metadata.sessionId, data: value }
    await writeFile(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return target
  }

  async writeCsv(name: string, rows: readonly Record<string, unknown>[]): Promise<string> {
    const target = this.target(name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, `${metadataLines(this.metadata)}${csvRows(rows)}`, 'utf8')
    return target
  }

  async writeText(name: string, text: string): Promise<string> {
    const target = this.target(name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, `${metadataLines(this.metadata)}${text.replace(/\s+$/, '')}\n`, 'utf8')
    return target
  }

  async writeGateLog(entries: readonly string[]): Promise<string> {
    const target = this.target('gate-log.txt')
    let existing: string[] = []
    try {
      existing = (await readFile(target, 'utf8'))
        .split(/\r?\n/)
        .filter((line) => line.length > 0 && !line.startsWith('# candidate_sha=') && !line.startsWith('# session_id='))
    } catch {
      existing = []
    }
    const entryKeys = new Set(entries.map((line) => /^([a-z0-9_]+)=/i.exec(line)?.[1]).filter(Boolean))
    const preserved = existing.filter((line) => {
      const key = /^([a-z0-9_]+)=/i.exec(line)?.[1]
      return !key || !entryKeys.has(key)
    })
    return this.writeText('gate-log.txt', [...preserved, ...entries].join('\n'))
  }

  async writeFindingDispositions(
    findings: readonly FindingDispositionRecord[],
  ): Promise<string> {
    return this.writeJson('finding-dispositions.json', { findings })
  }

  async writeSession(session: Record<string, unknown>): Promise<string> {
    return this.writeJson('session.json', session)
  }

  async writeFixtureReceipt(receipt: AuditFixtureReceipt): Promise<string> {
    const target = this.target('fixture-receipt.json')
    await mkdir(path.dirname(target), { recursive: true })
    const payload = { ...receipt, candidateSha: this.metadata.candidateSha, sessionId: this.metadata.sessionId }
    const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`
    try {
      const handle = await open(temporary, 'wx')
      try {
        await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      await rename(temporary, target)
      return target
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }

  async hash(name: string): Promise<string> {
    const content = await readFile(this.target(name))
    return createHash('sha256').update(content).digest('hex')
  }
}

function metadataFromJson(payload: unknown): ReportRunMetadata | null {
  if (!isRecord(payload)) return null
  const candidateSha = payload.candidateSha ?? payload.candidate_sha
  const sessionId = payload.sessionId ?? payload.session_id ?? payload.adwId
  if (typeof candidateSha !== 'string' || typeof sessionId !== 'string') return null
  return { candidateSha, sessionId }
}

function metadataFromLines(text: string): ReportRunMetadata | null {
  const candidateSha = /^# candidate_sha=([^\r\n]+)$/m.exec(text)?.[1]
  const sessionId = /^# session_id=([^\r\n]+)$/m.exec(text)?.[1]
  if (!candidateSha || !sessionId) return null
  return { candidateSha, sessionId }
}

function metadataMatches(actual: ReportRunMetadata | null, expected: ReportRunMetadata): boolean {
  return actual?.candidateSha === expected.candidateSha && actual.sessionId === expected.sessionId
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value)
}

function meaningfulJson(
  artifact: string,
  payload: unknown,
  expected?: ReportRunMetadata,
): { ok: boolean; reason?: string } {
  if (!isRecord(payload)) return { ok: false, reason: 'JSON payload must be an object' }
  if (payload.status === 'pending' || payload.status === 'running') {
    return { ok: false, reason: `status=${String(payload.status)} is not a completed result` }
  }
  if (artifact === 'manifest.json') {
    if (!Array.isArray(payload.cells) || payload.cells.length === 0) {
      return { ok: false, reason: 'manifest must contain rendered or explicitly skipped cells' }
    }
    const manifest = payload as unknown as Parameters<typeof validateManifest>[0]
    const validation = validateManifest(manifest)
    return validation.ok
      ? { ok: true }
      : { ok: false, reason: `structurally invalid manifest: ${validation.errors.join('; ')}` }
  }
  if (artifact === 'fixture-receipt.json') {
    if (!expected) return { ok: false, reason: 'fixture receipt validation requires the expected run metadata' }
    const validation = validateAuditFixtureReceipt(payload, expected)
    return validation.ok
      ? { ok: true }
      : { ok: false, reason: validation.errors.join('; ') }
  }
  if (artifact === 'impeccable.json') {
    if (!Array.isArray(payload.scannedFiles) || payload.scannedFiles.length === 0) {
      return { ok: false, reason: 'detector artifact must list scanned production files' }
    }
    if (!Array.isArray(payload.findings)) {
      return { ok: false, reason: 'detector artifact must include a findings array' }
    }
    if (!['pass', 'findings', 'blocked'].includes(String(payload.status))) {
      return { ok: false, reason: 'detector artifact has no completed status' }
    }
    if (!['mvp-assessment', 'change-gate'].includes(String(payload.auditMode))
      || payload.complete !== true || !Number.isInteger(payload.count) || Number(payload.count) <= 0
      || typeof payload.digest !== 'string' || !/^[0-9a-f]{64}$/.test(payload.digest)
      || !Array.isArray(payload.failures) || !Array.isArray(payload.allFailures)
      || !Array.isArray(payload.inheritedFailures) || !Array.isArray(payload.newFailures)) {
      return { ok: false, reason: 'detector artifact must declare complete lane metadata and failure census arrays' }
    }
  }
  if (artifact.endsWith('-summary.json')) {
    const automaticSummary = validateAutomaticSummary(artifact, payload)
    if (!automaticSummary.ok) return automaticSummary
  }
  return { ok: true }
}

function validateAutomaticSummary(
  artifact: string,
  payload: Record<string, unknown>,
): { ok: boolean; reason?: string } {
  if (!['mvp-assessment', 'change-gate'].includes(String(payload.auditMode))) {
    return { ok: false, reason: `${artifact} must declare a completed auditMode` }
  }
  if (typeof payload.automaticChecksPassed !== 'boolean') {
    return { ok: false, reason: `${artifact} must declare automaticChecksPassed` }
  }
  if (payload.complete !== true || !Number.isInteger(payload.count) || Number(payload.count) <= 0
    || typeof payload.digest !== 'string' || !/^[0-9a-f]{64}$/.test(payload.digest)) {
    return { ok: false, reason: `${artifact} must declare complete/count/digest lane metadata` }
  }
  const failureArrays = ['failures', 'allFailures', 'inheritedFailures', 'newFailures']
  if (failureArrays.some((key) => !Array.isArray(payload[key]))) {
    return { ok: false, reason: `${artifact} must include complete failure census arrays` }
  }
  if (artifact === 'axe-summary.json'
    && !((Array.isArray(payload.scans) && payload.scans.length > 0)
      || (Number.isInteger(payload.scans) && Number(payload.scans) > 0))) {
    return { ok: false, reason: `${artifact} must include at least one scan result` }
  }
  if (artifact === 'quantitative-summary.json'
    && (!Number.isInteger(payload.geometryRows) || Number(payload.geometryRows) <= 0
      || !Number.isInteger(payload.visibleContentRows) || Number(payload.visibleContentRows) <= 0)) {
    return { ok: false, reason: `${artifact} must include measured geometry and visible-content rows` }
  }
  if (artifact === 'control-consistency-summary.json'
    && (!Number.isInteger(payload.rows) || Number(payload.rows) <= 0)) {
    return { ok: false, reason: `${artifact} must include measured control rows` }
  }
  if (artifact === 'contrast-summary.json'
    && (!Number.isInteger(payload.rows) || Number(payload.rows) <= 0)) {
    return { ok: false, reason: `${artifact} must include measured contrast rows` }
  }
  if (artifact === 'anti-slop-summary.json'
    && (!Number.isInteger(payload.cells) || Number(payload.cells) <= 0)) {
    return { ok: false, reason: `${artifact} must include measured cells` }
  }
  return { ok: true }
}

export function meaningfulCsv(
  artifact: string,
  text: string,
  manifest: DesignQualityManifest | null = null,
): { ok: boolean; reason?: string } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 4) {
    return { ok: false, reason: `${artifact} must contain metadata, a header, and at least one data row` }
  }
  if (!lines[0]!.startsWith('# candidate_sha=') || !lines[1]!.startsWith('# session_id=')) {
    return { ok: false, reason: `${artifact} is missing its metadata preamble` }
  }
  if (artifact === 'control-consistency.csv') return validateControlConsistencyCsv(text, manifest)
  return { ok: true }
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(value)
      value = ''
    } else value += char
  }
  values.push(value)
  return values
}

function measuredObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

const BOUNDED_CHOICE_RESOLUTION_FAILURE_REASONS = new Set([
  'keyless',
  'invalid-id',
  'missing',
  'ambiguous',
  'duplicate',
  'role-mismatched',
  'action-failed',
  'popup-unassociated',
  'popup-missing',
  'popup-ambiguous',
  'popup-role-mismatched',
  'popup-not-open',
  'outside-dismissal-failed',
  'active-option-missing',
  'active-option-ambiguous',
  'active-option-role-mismatched',
  'selected-option-missing',
  'selected-option-ambiguous',
  'selected-option-id-missing',
])

const BOUNDED_CHOICE_MARKERS = new Set([
  'role=combobox',
  'aria-haspopup=listbox',
  'picker-trigger',
  'select-field',
])

export function validateControlConsistencyCsv(
  text: string,
  manifest: DesignQualityManifest | null,
): { ok: boolean; reason?: string } {
  if (!manifest) return { ok: false, reason: 'control-consistency evidence requires a valid manifest.json' }
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 4) return { ok: false, reason: 'control-consistency.csv has no measured population' }
  const header = parseCsvLine(lines[2]!)
  const required = ['authority', 'cellId', 'component', 'kind', 'measured', 'observed', 'passed', 'selector', 'size', 'state', 'variant']
  const missing = required.filter((column) => !header.includes(column))
  if (missing.length > 0) return { ok: false, reason: `control-consistency.csv is missing columns: ${missing.join(', ')}` }
  const rows = lines.slice(3).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(header.map((column, index) => [column, values[index] ?? '']))
  })
  const runnable = manifest.cells.filter(isManifestCellRunnable)
  const runnableIds = new Set(runnable.map((cell) => cell.id))
  const kinds = new Set(['population', 'control', 'control-state', 'bounded-choice', 'native-select'])
  for (const row of rows) {
    if (!runnableIds.has(row.cellId)) return { ok: false, reason: `control-consistency.csv has a row outside the runnable manifest: ${row.cellId}` }
    if (!kinds.has(row.kind)) return { ok: false, reason: `control-consistency.csv has unknown kind ${row.kind}` }
    if (!row.selector || !['true', 'false'].includes(row.observed) || !['true', 'false'].includes(row.passed)) {
      return { ok: false, reason: 'control-consistency.csv contains an unbound or self-asserted row' }
    }
    if (!measuredObject(row.measured)) return { ok: false, reason: 'control-consistency.csv rows require machine measurements' }
  }
  for (const cell of runnable) {
    const cellRows = rows.filter((row) => row.cellId === cell.id)
    const populationRows = cellRows.filter((row) => row.kind === 'population')
    if (populationRows.length !== 1) return { ok: false, reason: `${cell.id} requires exactly one control denominator row` }
    const population = measuredObject(populationRows[0]!.measured)!
    const populationSize = Number(population.populationSize)
    const boundedChoicePopulation = Number(population.boundedChoicePopulation)
    const nativeSelectPopulation = Number(population.nativeSelectPopulation)
    if (!Number.isInteger(populationSize) || populationSize <= 0) {
      return { ok: false, reason: `${cell.id} control denominator must be greater than zero` }
    }
    const controls = cellRows.filter((row) => row.kind === 'control')
    if (controls.length !== populationSize) return { ok: false, reason: `${cell.id} control rows do not match the denominator` }
    if (cellRows.filter((row) => row.kind === 'bounded-choice').length !== boundedChoicePopulation) {
      return { ok: false, reason: `${cell.id} bounded-choice rows do not match the denominator` }
    }
    if (cellRows.filter((row) => row.kind === 'native-select').length !== nativeSelectPopulation) {
      return { ok: false, reason: `${cell.id} native-select rows do not match the denominator` }
    }
    for (const row of cellRows.filter((candidate) => candidate.kind === 'bounded-choice')) {
      const measured = measuredObject(row.measured)!
      const resolutionFailure = measured.resolutionFailure
      if (isRecord(resolutionFailure)) {
        const identity = resolutionFailure.identity
        if (row.observed !== 'false'
          || row.passed !== 'false'
          || measured.lifecycleApplicable !== true
          || typeof identity !== 'string'
          || identity.trim().length === 0
          || row.selector !== identity
          || typeof resolutionFailure.id !== 'string'
          || typeof resolutionFailure.role !== 'string'
          || resolutionFailure.role.trim().length === 0
          || typeof resolutionFailure.marker !== 'string'
          || !BOUNDED_CHOICE_MARKERS.has(resolutionFailure.marker)
          || typeof resolutionFailure.label !== 'string'
          || typeof resolutionFailure.diagnosticSelector !== 'string'
          || resolutionFailure.diagnosticSelector.trim().length === 0
          || !Number.isInteger(resolutionFailure.matchCount)
          || Number(resolutionFailure.matchCount) < 0
          || typeof resolutionFailure.roleMatched !== 'boolean'
          || typeof resolutionFailure.markerMatched !== 'boolean'
          || typeof resolutionFailure.reason !== 'string'
          || !BOUNDED_CHOICE_RESOLUTION_FAILURE_REASONS.has(resolutionFailure.reason)
          || resolutionFailure.passed !== false
          || (resolutionFailure.error !== undefined && typeof resolutionFailure.error !== 'string')) {
          return { ok: false, reason: `${cell.id} bounded choice resolution failure is malformed` }
        }
        continue
      }
      if (measured.lifecycleApplicable === false) {
        if (measured.disabled !== true || typeof measured.closed !== 'boolean' || typeof measured.textContrast !== 'number') {
          return { ok: false, reason: `${cell.id} disabled bounded choice lacks lifecycle measurements` }
        }
        continue
      }
      const lifecycleFields = [
        'closed',
        'opened',
        'arrowKey',
        'typeahead',
        'enterSelected',
        'escapeDismissed',
        'outsideDismissed',
        'focusReturnedAfterEscape',
        'focusReturnedAfterEnter',
        'popupContained',
        'activeReachable',
        'selectedEvidence',
      ]
      if (measured.lifecycleApplicable !== true
        || lifecycleFields.some((field) => typeof measured[field] !== 'boolean')
        || typeof measured.textContrast !== 'number') {
        return { ok: false, reason: `${cell.id} bounded choice lacks lifecycle measurements` }
      }
      if (typeof measured.openTextContrast !== 'number'
        || typeof measured.openBoundaryContrast !== 'number'
        || typeof measured.selectedTextContrast !== 'number'
        || !Array.isArray(measured.openContrastRows)
        || !Array.isArray(measured.selectedContrastRows)) {
        return { ok: false, reason: `${cell.id} bounded choice lacks state contrast measurements` }
      }
    }
    for (const row of cellRows.filter((candidate) => candidate.kind === 'native-select')) {
      const measured = measuredObject(row.measured)!
      if (typeof measured.exceptionMatched !== 'boolean') {
        return { ok: false, reason: `${cell.id} native select lacks exact exception evidence` }
      }
    }
    for (const row of controls) {
      const measured = measuredObject(row.measured)!
      if (!['height', 'radius', 'borderWidth', 'foreground', 'background', 'textContrast', 'boundaryContrast', 'populationSize']
        .every((field) => Object.hasOwn(measured, field))) {
        return { ok: false, reason: `${cell.id} control row lacks computed style measurements` }
      }
      if (Number(measured.populationSize) !== populationSize) {
        return { ok: false, reason: `${cell.id} control row carries the wrong denominator` }
      }
      if (row.passed === 'true' && (!row.component || !row.variant || !row.size || !row.state || !row.authority)) {
        return { ok: false, reason: `${cell.id} passing control row lacks a named classification or authority` }
      }
    }
  }
  for (const state of ['disabled', 'error']) {
    const stateRows = rows.filter((row) => row.kind === 'control-state' && row.state === state && row.selector === '__population__')
    if (stateRows.length !== 1) return { ok: false, reason: `control-consistency.csv requires exactly one ${state} state population row` }
    const measured = measuredObject(stateRows[0]!.measured)!
    if (measured.state !== state || !Number.isInteger(Number(measured.populationSize))) {
      return { ok: false, reason: `control-consistency.csv has invalid ${state} state measurements` }
    }
  }
  for (const row of rows.filter((candidate) => candidate.kind === 'control-state' && candidate.selector !== '__population__')) {
    const measured = measuredObject(row.measured)!
    if (!Array.isArray(measured.contrastRows)
      || (typeof measured.textContrast !== 'number' && typeof measured.boundaryContrast !== 'number')) {
      return { ok: false, reason: `${row.cellId} ${row.state} control state lacks computed contrast measurements` }
    }
    if (row.passed === 'true' && (!row.component || !row.variant || !row.size || !row.authority)) {
      return { ok: false, reason: `${row.cellId} passing ${row.state} control state lacks classification authority` }
    }
  }
  return { ok: true }
}

export function validateVisibleContentCsv(
  text: string,
  manifest: DesignQualityManifest | null,
): { ok: boolean; reason?: string } {
  if (!manifest) return { ok: false, reason: 'visible-content evidence requires a valid manifest.json' }
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 4) return { ok: false, reason: 'visible-content.csv has no measured population' }
  const header = parseCsvLine(lines[2]!)
  const required = ['cellId', 'kind', 'measured', 'observed', 'passed', 'selector']
  const missing = required.filter((column) => !header.includes(column))
  if (missing.length > 0) return { ok: false, reason: `visible-content.csv is missing columns: ${missing.join(', ')}` }
  const rows = lines.slice(3).map((line) => {
    const values = parseCsvLine(line)
    return Object.fromEntries(header.map((column, index) => [column, values[index] ?? '']))
  })
  const kinds = new Set(['text-truncation', 'viewport-occlusion', 'touch-separation'])
  for (const row of rows) {
    if (!kinds.has(row.kind)) return { ok: false, reason: `visible-content.csv has unknown kind ${row.kind}` }
    if (!row.cellId || !row.selector) return { ok: false, reason: 'visible-content.csv contains an unbound row' }
    if (!['true', 'false'].includes(row.observed) || !['true', 'false'].includes(row.passed)) {
      return { ok: false, reason: 'visible-content.csv observed/passed values must be booleans' }
    }
    const measured = measuredObject(row.measured)
    if (!measured || Object.keys(measured).length === 0) {
      return { ok: false, reason: 'visible-content.csv rows require machine measurements, not self-asserted verdicts' }
    }
    if (row.kind === 'text-truncation'
      && !['scrollWidth', 'clientWidth', 'lineClamp', 'textOverflow', 'fullValuePathExercised']
        .every((field) => Object.hasOwn(measured, field))) {
      return { ok: false, reason: 'text-truncation rows lack required measurements' }
    }
    if (row.kind === 'viewport-occlusion'
      && !['intersectionRatio', 'centerCovered', 'fullyReachable', 'persistentBandCount']
        .every((field) => Object.hasOwn(measured, field))) {
      return { ok: false, reason: 'viewport-occlusion rows lack required measurements' }
    }
    if (row.kind === 'touch-separation'
      && !['width', 'height', 'nearestDistance', 'populationSize']
        .every((field) => Object.hasOwn(measured, field))) {
      return { ok: false, reason: 'touch-separation rows lack required measurements' }
    }
  }
  for (const cell of manifest.cells.filter(isManifestCellRunnable)) {
    const cellRows = rows.filter((row) => row.cellId === cell.id)
    for (const kind of ['text-truncation', 'viewport-occlusion']) {
      if (!cellRows.some((row) => row.kind === kind)) {
        return { ok: false, reason: `${cell.id} has no ${kind} evidence` }
      }
    }
    if (cell.viewport === 'phone-390x844') {
      const touchRows = cellRows.filter((row) => row.kind === 'touch-separation')
      if (touchRows.length === 0) return { ok: false, reason: `${cell.id} has no phone control denominator` }
      const sizes = touchRows.map((row) => Number(measuredObject(row.measured)?.populationSize))
      if (sizes.some((size) => !Number.isInteger(size) || size <= 0 || size !== touchRows.length)) {
        return { ok: false, reason: `${cell.id} touch rows do not cover every visible phone control` }
      }
    }
  }
  return { ok: true }
}

function meaningfulGateLog(text: string): { ok: boolean; reason?: string } {
  if (/\bpending\b/i.test(text)) return { ok: false, reason: 'gate log still contains a pending status' }
  if (!/^browser_status=(?:0|[1-9][0-9]*|not-run|skipped)$/m.test(text)) {
    return { ok: false, reason: 'gate log has no terminal browser status' }
  }
  if (!/^fixture_status=(?:0|[1-9][0-9]*|not-run|skipped)$/m.test(text)) {
    return { ok: false, reason: 'gate log has no terminal fixture status' }
  }
  if (!/^chain_status=(?:0|[1-9][0-9]*|not-run|skipped)$/m.test(text)) {
    return { ok: false, reason: 'gate log has no terminal chain status' }
  }
  return { ok: true }
}

export async function validateArtifactSet(
  outputDir: string,
  expected: ReportRunMetadata,
  options: { allowMockupGaps?: boolean } = {},
): Promise<ArtifactValidation> {
  assertMetadata(expected)
  const root = path.resolve(outputDir)
  const missing: string[] = []
  const stale: string[] = []
  const invalid: string[] = []
  const files: string[] = []
  const errors: string[] = []
  let coverageManifest: DesignQualityManifest | null = null
  try {
    const candidate = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8')) as DesignQualityManifest
    if (validateManifest(candidate).ok) coverageManifest = candidate
  } catch {
    coverageManifest = null
  }

  for (const artifact of REQUIRED_ARTIFACTS) {
    const target = path.join(root, artifact)
    let info
    try {
      info = await stat(target)
    } catch {
      missing.push(artifact)
      continue
    }
    if (artifact === 'mockup-diff') {
      if (!info.isDirectory()) addUnique(invalid, artifact)
      else {
        const nested = await allFiles(target)
        if (nested.length === 0) addUnique(missing, artifact)
        else {
          files.push(...nested)
          const statusPath = path.join(target, 'status.json')
          if (!nested.includes(statusPath)) {
            addUnique(invalid, artifact)
            errors.push(`${artifact}: status.json is required to bind the directory to this run`)
          } else {
            try {
              const payload = JSON.parse(await readFile(statusPath, 'utf8'))
              const actual = metadataFromJson(payload)
              if (!actual) addUnique(invalid, artifact)
              else if (!metadataMatches(actual, expected)) addUnique(stale, artifact)
              const mockupStatus = validateMockupStatus(payload, options.allowMockupGaps === true)
              if (!mockupStatus.ok) {
                addUnique(invalid, artifact)
                errors.push(`${artifact}: ${mockupStatus.reason}`)
              }
            } catch (error) {
              addUnique(invalid, artifact)
              errors.push(`${artifact}: invalid status.json (${String(error)})`)
            }
          }
        }
      }
      continue
    }
    if (!info.isFile() || info.size === 0) {
      addUnique(invalid, artifact)
      continue
    }
    files.push(target)
    try {
      const text = await readFile(target, 'utf8')
      let actual: ReportRunMetadata | null
      if (artifact.endsWith('.json')) {
        try {
          actual = metadataFromJson(JSON.parse(text))
        } catch (error) {
          addUnique(invalid, artifact)
          errors.push(`${artifact}: invalid JSON (${String(error)})`)
          continue
        }
      } else actual = metadataFromLines(text)
      if (!actual) addUnique(invalid, artifact)
      else if (!metadataMatches(actual, expected)) addUnique(stale, artifact)

      let content: { ok: boolean; reason?: string }
      if (artifact.endsWith('.json')) {
        content = meaningfulJson(artifact, JSON.parse(text), expected)
      } else if (artifact === 'gate-log.txt') {
        content = meaningfulGateLog(text)
      } else if (artifact === 'visible-content.csv') {
        content = validateVisibleContentCsv(text, coverageManifest)
      } else {
        content = meaningfulCsv(artifact, text, coverageManifest)
      }
      if (!content.ok) {
        addUnique(invalid, artifact)
        errors.push(`${artifact}: ${content.reason ?? 'content is not meaningful evidence'}`)
      }
    } catch (error) {
      addUnique(invalid, artifact)
      errors.push(`${artifact}: unreadable (${String(error)})`)
    }
  }

  if (missing.length > 0) errors.push(`missing required artifacts: ${missing.join(', ')}`)
  if (stale.length > 0) errors.push(`artifacts belong to another candidate/session: ${stale.join(', ')}`)
  if (invalid.length > 0) errors.push(`invalid or empty artifacts: ${invalid.join(', ')}`)
  return { ok: errors.length === 0, missing, stale, invalid, files, errors }
}

export function requiredArtifactPaths(outputDir: string): string[] {
  return REQUIRED_ARTIFACTS.map((name) => path.join(path.resolve(outputDir), name))
}
