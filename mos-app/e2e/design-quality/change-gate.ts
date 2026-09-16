import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type AutomaticFailure = {
  ruleId: string
  cellId: string
  selector: string
  state: string
  message: string
  measured?: unknown
}

export type FailureIdentity = Pick<AutomaticFailure, 'ruleId' | 'cellId' | 'selector' | 'state'>

export type FailureComparison = {
  allFailures: AutomaticFailure[]
  inheritedFailures: AutomaticFailure[]
  newFailures: AutomaticFailure[]
  /** Alias used by the artifact contract for the blockers in this candidate. */
  failures: AutomaticFailure[]
  automaticChecksPassed: boolean
}

export type BaselineBindingResult = {
  ok: boolean
  errors: string[]
}

export type ChangeGateBaseline = {
  evidenceDir: string
  candidateSha: string
  sessionId: string
  failures: AutomaticFailure[]
  untestedCellIds: string[]
  artifactDigest: string
}

export type ChangeGateBaselineResult = {
  ok: boolean
  errors: string[]
  baseline?: ChangeGateBaseline
  snapshot?: AutomaticFailureBaseline
  mergeBaseSha?: string
}

const SHA_RE = /^[0-9a-f]{40}$/
const SESSION_ID_RE = /^[0-9a-f]{8}$/

/** The only path that may carry an automatic-failure comparison snapshot. */
export const AUTOMATIC_FAILURE_BASELINE_PATH = 'mos-app/e2e/design-quality/automatic-failure-baseline.json'
export const AUTOMATIC_FAILURE_BASELINE_NAME = 'automatic-failure-baseline.json'
export const AUTOMATIC_FAILURE_BASELINE_KIND = 'mos.design-quality.automatic-failure-baseline'
export const AUTOMATIC_FAILURE_BASELINE_VERSION = 1 as const
export const AUTOMATIC_FAILURE_LANES = [
  'quantitative',
  'controlConsistency',
  'contrast',
  'antiSlop',
  'axe',
  'mockup',
] as const

export type AutomaticFailureIdentity = {
  ruleId: string
  cellId: string
  selector: string
  state: string
}

export type AutomaticFailureLaneMetadata = {
  complete: true
  count: number
  digest: string
}

export type AutomaticFailureBaselineSource = {
  productSha: string
  harnessSha: string
  sessionId: string
  manifestDigest: string
}

export type AutomaticFailureBaseline = {
  kind: typeof AUTOMATIC_FAILURE_BASELINE_KIND
  version: typeof AUTOMATIC_FAILURE_BASELINE_VERSION
  source: AutomaticFailureBaselineSource
  failures: AutomaticFailureIdentity[]
  untestedCellIds: string[]
  lanes: Record<(typeof AUTOMATIC_FAILURE_LANES)[number], AutomaticFailureLaneMetadata>
  digest: string
}

export type TrustedAutomaticFailureBaselineOptions = {
  repoRoot: string
  candidateSha: string
  verificationBase: string
}

export type TrustedAutomaticFailureBaselineResult = {
  ok: boolean
  errors: string[]
  mergeBaseSha?: string
  blobDigest?: string
  snapshot?: AutomaticFailureBaseline
}

export type AutomaticFailureBaselineProducerOptions = {
  evidenceDir: string
  sourceProductSha: string
  sourceHarnessSha: string
  sourceSessionId: string
  repoRoot?: string
  outputPath?: string
  previousSnapshot?: AutomaticFailureBaseline
}

export type AutomaticFailureBaselineProducerResult = {
  ok: boolean
  errors: string[]
  snapshot?: AutomaticFailureBaseline
  bytes?: string
  outputPath?: string
}

export type ChangeGateSnapshotRevalidationOptions = {
  repoRoot: string
  evidenceDir: string
  candidateSha: string
  sessionId: string
  verificationBase?: string
}

export type ChangeGateSnapshotRevalidationResult = {
  ok: boolean
  errors: string[]
  mergeBaseSha?: string
  emittedBytes?: string
  candidateBytes?: string
}

// Keep this list local rather than importing report.ts.  report.ts owns the
// candidate validator and imports runtime helpers, while this module is used
// by those same helpers during a change-gate run.
const BASELINE_ARTIFACT_GROUPS = [
  { name: 'manifest.json', candidates: ['manifest.json'] },
  { name: 'fixture-receipt.json', candidates: ['fixture-receipt.json', 'fixture-results.json'] },
  { name: 'gate-log.txt', candidates: ['gate-log.txt', 'gate.log'] },
  { name: 'contrast.csv', candidates: ['contrast.csv'] },
  { name: 'geometry.csv', candidates: ['geometry.csv'] },
  { name: 'number-census.csv', candidates: ['number-census.csv', 'number-format.csv'] },
  { name: 'control-census.csv', candidates: ['control-census.csv'] },
  { name: 'control-consistency.csv', candidates: ['control-consistency.csv'] },
  { name: 'state-matrix.csv', candidates: ['state-matrix.csv', 'state.csv'] },
  { name: 'affordance-census.csv', candidates: ['affordance-census.csv', 'affordance.csv'] },
  { name: 'copy-census.csv', candidates: ['copy-census.csv', 'copy.csv'] },
  { name: 'visible-content.csv', candidates: ['visible-content.csv'] },
  { name: 'impeccable.json', candidates: ['impeccable.json'] },
  { name: 'mockup-diff/status.json', candidates: ['mockup-diff/status.json'] },
  // Every automatic browser lane writes a structured summary.  A baseline
  // without one cannot provide a complete comparison census.
  { name: 'quantitative-summary.json', candidates: ['quantitative-summary.json'] },
  { name: 'control-consistency-summary.json', candidates: ['control-consistency-summary.json'] },
  { name: 'contrast-summary.json', candidates: ['contrast-summary.json'] },
  { name: 'anti-slop-summary.json', candidates: ['anti-slop-summary.json'] },
  { name: 'axe-summary.json', candidates: ['axe-summary.json'] },
] as const

const text = (value: unknown, fallback = '') => {
  if (value === undefined || value === null) return fallback
  return String(value)
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

function identityPart(value: unknown, fallback = ''): string {
  return text(value, fallback)
}

export function failureIdentity(failure: Partial<AutomaticFailure>): FailureIdentity {
  return {
    ruleId: identityPart(failure.ruleId),
    cellId: identityPart(failure.cellId),
    selector: identityPart(failure.selector),
    state: identityPart(failure.state, 'default'),
  }
}

export function failureSignature(failure: Partial<AutomaticFailure>): string {
  const identity = failureIdentity(failure)
  return JSON.stringify([
    identity.ruleId,
    identity.cellId,
    identity.selector,
    identity.state,
  ])
}

export function classifyFailureSet(
  candidateFailures: AutomaticFailure[],
  baselineFailures: AutomaticFailure[],
): FailureComparison {
  const baselineSignatures = new Set(baselineFailures.map(failureSignature))
  const allFailures = [...candidateFailures]
  const inheritedFailures = allFailures.filter((failure) => baselineSignatures.has(failureSignature(failure)))
  const newFailures = allFailures.filter((failure) => !baselineSignatures.has(failureSignature(failure)))

  return {
    allFailures,
    inheritedFailures,
    newFailures,
    failures: newFailures,
    automaticChecksPassed: newFailures.length === 0,
  }
}

export function validateBaselineBinding(
  payload: unknown,
  expectedCandidateSha: string,
): BaselineBindingResult {
  const errors: string[] = []
  const session = record(payload)
  if (!session) {
    return { ok: false, errors: ['baseline session is missing or is not a JSON object with valid session metadata'] }
  }

  const candidateSha = text(session.candidateSha)
  if (!SHA_RE.test(candidateSha)) {
    errors.push('baseline session candidateSha is not a full commit SHA')
  }
  if (!SHA_RE.test(expectedCandidateSha) || candidateSha !== expectedCandidateSha) {
    errors.push(`baseline candidateSha ${candidateSha || '<missing>'} does not match exact merge-base ${expectedCandidateSha}`)
  }

  const sessionId = text(session.sessionId || session.auditId)
  if (!SESSION_ID_RE.test(sessionId)) {
    errors.push('baseline session is missing a valid sessionId')
  }

  const declared = session.quantitativeArtifacts
  if (!Array.isArray(declared) || declared.length === 0) {
    errors.push('baseline session is missing quantitativeArtifacts')
  }
  const artifactDigest = text(session.artifactDigest)
  if (!/^[0-9a-f]{64}$/i.test(artifactDigest)) {
    errors.push('baseline session is missing a full artifactDigest')
  }

  return { ok: errors.length === 0, errors }
}

function ruleIdForKind(kind: string, fallback = 'design-quality.automatic') {
  const normalized = kind.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const known: Record<string, string> = {
    'text-truncation': 'content.text-truncation',
    'visible-text-truncation': 'content.text-truncation',
    truncation: 'content.text-truncation',
    'occlusion-risk': 'content.occlusion-risk',
    'viewport-occlusion': 'content.occlusion-risk',
    occlusion: 'content.occlusion-risk',
    'touch-target-separation': 'touch.target-separation',
    'touch-separation': 'touch.target-separation',
    'target-separation': 'touch.target-separation',
    'bounded-choice': 'controls.bounded-choice-lifecycle',
    'bounded-choice-lifecycle': 'controls.bounded-choice-lifecycle',
    population: 'controls.population-consistency',
    'control-population': 'controls.population-consistency',
    'control-consistency': 'controls.variant-consistency',
    control: 'controls.variant-classification',
    'variant-consistency': 'controls.variant-consistency',
    'control-state': 'controls.state-colors',
    'state-colors': 'controls.state-colors',
    'population-consistency': 'controls.population-consistency',
    'contrast': 'contrast.state',
    'contrast-state': 'contrast.state',
    'text-contrast': 'contrast.text',
    'focus-contrast': 'contrast.focus',
  }
  return known[normalized] || (kind.includes('.') ? kind : fallback)
}

function parseMeasured(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

export function failureFromVisibleContentRow(row: Record<string, unknown>): AutomaticFailure {
  const kind = text(row.kind, 'visible-content')
  return {
    ruleId: ruleIdForKind(kind),
    cellId: text(row.cellId, text(row.cell, '')),
    selector: text(row.selector, '__visible-content__'),
    state: text(row.state, 'default'),
    message: text(row.message, `${kind} failed`),
    measured: parseMeasured(row.measured),
  }
}

export function failureFromControlConsistencyRow(row: Record<string, unknown>): AutomaticFailure {
  const kind = text(row.kind, 'control-consistency')
  const measured = parseMeasured(row.measured)
  let ruleId = ruleIdForKind(kind)
  const measuredRecord = record(measured)
  if (kind === 'control' && measuredRecord && record(measuredRecord.group)?.passed === false) {
    ruleId = 'controls.variant-consistency'
  }
  return {
    ruleId,
    cellId: text(row.cellId, text(row.cell, '')),
    selector: text(row.selector, text(row.control, '__control-consistency__')),
    state: text(row.state, 'default'),
    message: text(row.message, `${kind} failed`),
    measured,
  }
}

export function failureFromStructured(value: unknown, fallbackRule = 'design-quality.automatic'): AutomaticFailure | null {
  const item = record(value)
  if (!item) return null
  const rule = text(item.ruleId || item.rule || item.kind || item.check, fallbackRule)
  const cellId = text(item.cellId || item.cell || item.route || item.page, '')
  const targetList = Array.isArray(item.targets) ? item.targets.map((value) => text(value)).join('|') : ''
  const selector = text(item.selector || item.target || targetList || item.element || '__summary__')
  const state = text(item.state, 'default')
  const message = text(item.message || item.reason || item.detail, `${rule} failed`)
  return {
    ruleId: ruleIdForKind(rule, fallbackRule),
    cellId,
    selector,
    state,
    message,
    measured: item.measured || item.metrics,
  }
}

function failureFromLegacy(value: unknown, fallbackRule = 'design-quality.automatic'): AutomaticFailure | null {
  if (typeof value !== 'string') return failureFromStructured(value, fallbackRule)
  const raw = value.trim()
  if (!raw) return null

  // Existing MVP handoffs used strings such as:
  // `tasks-default-desktop: text truncation failed at main h1 ({...})`.
  const match = raw.match(/^([^:]+):\s*(.*?)\s+failed(?:\s+at\s+(.+?))?(?:\s+\((\{.*\})\))?$/i)
  if (!match) {
    return {
      ruleId: 'design-quality.automatic',
      cellId: '',
      selector: '__summary__',
      state: 'default',
      message: raw,
    }
  }
  return {
    ruleId: ruleIdForKind(match[2] || 'automatic'),
    cellId: match[1].trim(),
    selector: (match[3] || '__summary__').trim(),
    state: 'default',
    message: raw,
    measured: match[4] ? parseMeasured(match[4]) : undefined,
  }
}

function csvRows(contents: string): Record<string, unknown>[] {
  const lines = contents.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const header = lines.find((line) => !line.startsWith('#'))
  if (!header) return []
  const headerIndex = lines.indexOf(header)
  const columns = header.split(',').map((column) => column.trim())
  return lines.slice(headerIndex + 1).map((line) => {
    const values: string[] = []
    let current = ''
    let quoted = false
    for (let index = 0; index < line.length; index += 1) {
      const character = line[index]!
      if (character === '"') {
        if (quoted && line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          quoted = !quoted
        }
      } else if (character === ',' && !quoted) {
        values.push(current)
        current = ''
      } else {
        current += character
      }
    }
    values.push(current)
    return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? '']))
  })
}

function isFalse(value: unknown): boolean {
  return value === false || text(value).toLowerCase() === 'false' || text(value) === '0'
}

function addFailure(failures: AutomaticFailure[], failure: AutomaticFailure | null) {
  if (failure) failures.push(failure)
}

function uniqueFailures(failures: AutomaticFailure[]): AutomaticFailure[] {
  const unique = new Map<string, AutomaticFailure>()
  for (const failure of failures) {
    const signature = failureSignature(failure)
    if (!unique.has(signature)) unique.set(signature, failure)
  }
  return [...unique.values()]
}

type ValidatedArtifacts = {
  contents: Map<string, string>
  files: Map<string, Uint8Array>
}

function isContained(root: string, target: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`)
}

async function containedRealpath(root: string, target: string): Promise<string> {
  const rootReal = await realpath(root)
  const targetReal = await realpath(target)
  if (!isContained(rootReal, targetReal)) {
    throw new Error(`path escapes evidence directory: ${target}`)
  }
  return targetReal
}

async function collectFiles(
  root: string,
  target: string,
  files: Map<string, Uint8Array>,
  errors: string[],
): Promise<void> {
  let info
  try {
    // realpath is checked even for a symlink that points at a file inside the
    // evidence root.  A symlink that escapes is never allowed to contribute to
    // the baseline digest.
    await containedRealpath(root, target)
    info = await lstat(target)
  } catch (error) {
    errors.push(`baseline artifact path is missing, unreadable, or escapes evidence directory: ${target} (${String(error)})`)
    return
  }

  try {
    const followed = await stat(target)
    if (followed.isDirectory()) {
      const entries = await readdir(target, { withFileTypes: true })
      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        await collectFiles(root, path.join(target, entry.name), files, errors)
      }
      return
    }
    if (!followed.isFile() && !info.isSymbolicLink()) {
      errors.push(`baseline artifact path is not a regular file or directory: ${target}`)
      return
    }
    const bytes = await readFile(target)
    const relative = path.relative(root, target).split(path.sep).join('/')
    files.set(relative, bytes)
  } catch (error) {
    errors.push(`baseline artifact path is unreadable: ${target} (${String(error)})`)
  }
}

async function readArtifact(root: string, relativePath: string): Promise<{
  absolutePath: string
  realPath: string
  contents: string
  bytes: Uint8Array
}> {
  const absolutePath = path.resolve(root, relativePath)
  const realPath = await containedRealpath(root, absolutePath)
  const bytes = await readFile(realPath)
  return { absolutePath, realPath, contents: bytes.toString('utf8'), bytes }
}

/** Compute a stable digest over every validated declared artifact path and its bytes. */
export function digestValidatedArtifacts(files: ReadonlyMap<string, Uint8Array>): string {
  const digest = createHash('sha256')
  for (const [relativePath, bytes] of [...files.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const normalized = relativePath.split(path.sep).join('/')
    digest.update(`${normalized}\0${bytes.byteLength}\0`)
    digest.update(bytes)
  }
  return digest.digest('hex')
}

async function validateArtifactFiles(
  root: string,
  session: Record<string, unknown>,
  errors: string[],
): Promise<ValidatedArtifacts> {
  const contents = new Map<string, string>()
  const files = new Map<string, Uint8Array>()
  const declared: string[] = []
  const declaredRealpaths: string[] = []
  if (Array.isArray(session.quantitativeArtifacts)) {
    for (const entry of session.quantitativeArtifacts) {
      if (typeof entry !== 'string' || !entry.trim()) {
        errors.push('baseline session quantitativeArtifacts contains an invalid path')
        continue
      }
      const absolute = path.resolve(root, entry)
      declared.push(absolute)
      try {
        declaredRealpaths.push(await containedRealpath(root, absolute))
      } catch (error) {
        errors.push(`baseline artifact declaration escapes evidence directory: ${entry} (${String(error)})`)
      }
    }
  }
  const expectedCandidateSha = text(session.candidateSha)
  const expectedSessionId = text(session.sessionId || session.auditId)

  const validateMetadata = (relativePath: string, artifactContents: string) => {
    const candidateMatches = [
      artifactContents.match(/candidate_sha\s*[:=]\s*([^\s\r\n#]+)/i)?.[1],
      artifactContents.match(/"candidateSha"\s*:\s*"([^"\r\n]+)"/i)?.[1],
    ].filter(Boolean)
    const sessionMatches = [
      artifactContents.match(/session_id\s*[:=]\s*([^\s\r\n#]+)/i)?.[1],
      artifactContents.match(/"sessionId"\s*:\s*"([^"\r\n]+)"/i)?.[1],
    ].filter(Boolean)
    if (candidateMatches.length === 0) {
      errors.push(`baseline artifact ${relativePath} is missing candidate metadata`)
    } else if (candidateMatches.some((value) => value !== expectedCandidateSha)) {
      errors.push(`baseline artifact ${relativePath} has stale or invalid candidate metadata`)
    }
    if (sessionMatches.length === 0) {
      errors.push(`baseline artifact ${relativePath} is missing session metadata`)
    } else if (sessionMatches.some((value) => value !== expectedSessionId)) {
      errors.push(`baseline artifact ${relativePath} has stale or invalid session metadata`)
    }
  }

  const readOne = async (name: string, candidates: readonly string[], required: boolean) => {
    const declaredCandidateResults = await Promise.all(candidates.map(async (candidate) => {
      const absolute = path.resolve(root, candidate)
      try {
        const candidateReal = await containedRealpath(root, absolute)
        return declaredRealpaths.some((entry) => entry === candidateReal || candidateReal.startsWith(`${entry}${path.sep}`))
      } catch {
        return false
      }
    }))
    const declaredCandidates = declaredCandidateResults.some(Boolean)
    if (required && !declaredCandidates) errors.push(`baseline session does not declare ${name}`)

    for (const candidate of candidates) {
      try {
        const file = await readArtifact(root, candidate)
        contents.set(name, file.contents)
        files.set(path.relative(root, file.realPath).split(path.sep).join('/'), file.bytes)
        if (!file.contents.trim()) errors.push(`baseline artifact ${candidate} is empty`)
        if (candidate.endsWith('.json')) {
          try {
            JSON.parse(file.contents)
          } catch {
            errors.push(`baseline artifact ${candidate} is not valid JSON`)
          }
        }
        return
      } catch {
        // An alias may be absent while the other name is present.
      }
    }
    if (required) errors.push(`baseline artifact ${name} is missing or unreadable`)
  }

  for (const group of BASELINE_ARTIFACT_GROUPS) await readOne(group.name, group.candidates, true)
  for (const declaredPath of declared) {
    await collectFiles(root, declaredPath, files, errors)
  }
  for (const [relativePath, bytes] of files) {
    // Screenshots and heatmaps are binary evidence and cannot carry the text
    // metadata preamble.  Every machine-readable artifact is metadata-bound.
    // The canonical change-gate snapshot intentionally has source metadata in
    // its own schema rather than candidate/session preamble fields.
    if (relativePath === AUTOMATIC_FAILURE_BASELINE_PATH || relativePath === AUTOMATIC_FAILURE_BASELINE_NAME) continue
    if (/\.(?:json|csv|txt)$/i.test(relativePath)) {
      validateMetadata(relativePath, Buffer.from(bytes).toString('utf8'))
    }
  }
  return { contents, files }
}

export async function computeArtifactDigest(
  evidenceDir: string,
  session: Record<string, unknown>,
): Promise<{ ok: boolean; errors: string[]; digest?: string }> {
  const errors: string[] = []
  let root: string
  try {
    root = await realpath(evidenceDir)
    const info = await stat(root)
    if (!info.isDirectory()) errors.push('evidence path is not a directory')
  } catch {
    return { ok: false, errors: ['evidence directory is missing or unreadable'] }
  }
  const artifacts = await validateArtifactFiles(root, session, errors)
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, errors: [], digest: digestValidatedArtifacts(artifacts.files) }
}

function collectFailures(contents: Map<string, string>): AutomaticFailure[] {
  const failures: AutomaticFailure[] = []
  const summary = contents.get('quantitative-summary.json')
  if (summary) {
    try {
      const payload = record(JSON.parse(summary))
      for (const key of ['allFailures', 'inheritedFailures', 'failures']) {
        const values = payload?.[key]
        if (Array.isArray(values)) values.forEach((value) => addFailure(failures, failureFromLegacy(value)))
      }
    } catch {
      // validateArtifactFiles already reports malformed JSON.
    }
  }

  const visible = contents.get('visible-content.csv')
  if (visible) {
    for (const row of csvRows(visible)) {
      if (isFalse(row.passed) || isFalse(row.observed)) addFailure(failures, failureFromVisibleContentRow(row))
    }
  }

  const controls = contents.get('control-consistency.csv')
  if (controls) {
    for (const row of csvRows(controls)) {
      if (isFalse(row.passed) || isFalse(row.observed)) {
        addFailure(failures, failureFromControlConsistencyRow(row))
      }
    }
  }

  const contrast = contents.get('contrast.csv')
  if (contrast) {
    for (const row of csvRows(contrast)) {
      if (isFalse(row.passes) || isFalse(row.passed) || isFalse(row.observed)) {
        const cellId = text(row.cellId, text(row.cell, [row.route, row.journey, row.fixture, row.viewport, row.theme, row.language].map((value) => text(value)).join('|')))
        addFailure(failures, {
          ruleId: text(row.kind) === 'boundary' ? 'contrast.boundary' : 'contrast.text',
          cellId,
          selector: text(row.selector, '__contrast__'),
          state: text(row.state, 'default'),
          message: text(row.message, 'contrast check failed'),
          measured: parseMeasured(row.measured),
        })
      }
    }
  }

  for (const [fileName, fallbackRule] of [
    ['anti-slop-summary.json', 'anti-slop.automatic'],
    ['contrast-summary.json', 'contrast.state'],
    ['axe-summary.json', 'accessibility.axe'],
  ] as const) {
    const contentsForSummary = contents.get(fileName)
    if (!contentsForSummary) continue
    try {
      const payload = record(JSON.parse(contentsForSummary))
      const values = payload?.failures || payload?.blocking || payload?.newFailures
      if (Array.isArray(values)) values.forEach((value) => addFailure(failures, failureFromLegacy(value, fallbackRule)))
    } catch {
      // validateArtifactFiles reports malformed JSON.
    }
  }

  const impeccable = contents.get('impeccable.json')
  if (impeccable) {
    try {
      const payload = record(JSON.parse(impeccable))
      if (Array.isArray(payload?.findings)) {
        payload.findings.forEach((value) => addFailure(failures, failureFromStructured(value, 'impeccable.finding')))
      }
    } catch {
      // validateArtifactFiles reports malformed JSON.
    }
  }

  const mockupStatus = contents.get('mockup-diff/status.json')
  if (mockupStatus) {
    try {
      const payload = record(JSON.parse(mockupStatus))
      if (Array.isArray(payload?.comparisons)) {
        payload.comparisons.forEach((value) => {
          const comparison = record(value)
          if (!comparison || text(comparison.status) === 'pass') return
          addFailure(failures, {
            ruleId: 'mockup.fidelity',
            cellId: text(comparison.cellId),
            selector: text(comparison.mockup, '__mockup__'),
            state: 'default',
            message: text(comparison.reason, 'mockup fidelity comparison failed'),
            measured: comparison,
          })
        })
      }
    } catch {
      // validateArtifactFiles reports malformed JSON.
    }
  }

  return uniqueFailures(failures)
}

function collectUntestedCellIds(contents: Map<string, string>): string[] {
  const manifest = contents.get('manifest.json')
  if (!manifest) return []
  try {
    const payload = record(JSON.parse(manifest))
    if (!Array.isArray(payload?.cells)) return []
    return payload.cells
      .map(record)
      .filter((cell): cell is Record<string, unknown> => Boolean(cell))
      .filter((cell) => text(cell.status).toLowerCase() === 'untested')
      .map((cell) => text(cell.id))
      .filter(Boolean)
  } catch {
    return []
  }
}

function collectUntestedCellFailures(contents: Map<string, string>): AutomaticFailure[] {
  const manifest = contents.get('manifest.json')
  if (!manifest) return []
  try {
    const payload = record(JSON.parse(manifest))
    if (!Array.isArray(payload?.cells)) return []
    return payload.cells
      .map(record)
      .filter((cell): cell is Record<string, unknown> => Boolean(cell))
      .filter((cell) => text(cell.status).toLowerCase() === 'untested')
      .map((cell) => ({
        ruleId: 'state.coverage',
        cellId: text(cell.id),
        selector: '__state__',
        state: text(cell.state, 'default'),
        message: text(cell.note, 'manifest cell was untested at the exact base'),
      }))
      .filter((failure) => failure.cellId)
  } catch {
    return []
  }
}

const SNAPSHOT_TOP_LEVEL_KEYS = ['kind', 'version', 'source', 'failures', 'untestedCellIds', 'lanes', 'digest'] as const
const SNAPSHOT_SOURCE_KEYS = ['productSha', 'harnessSha', 'sessionId', 'manifestDigest'] as const
const SNAPSHOT_LANE_KEYS = [...AUTOMATIC_FAILURE_LANES] as string[]
const SNAPSHOT_PATHS = {
  quantitative: 'quantitative-summary.json',
  controlConsistency: 'control-consistency-summary.json',
  contrast: 'contrast-summary.json',
  antiSlop: 'anti-slop-summary.json',
  axe: 'axe-summary.json',
  mockup: 'mockup-diff/status.json',
} as const
const SNAPSHOT_PRODUCT_PATHS = [
  'mos-app/src',
  'mos-app/public',
  'mos-app/package.json',
  'mos-app/package-lock.json',
  'package.json',
  'package-lock.json',
  'DESIGN.md',
  'supabase',
]

function sortedStrings(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, entry]) => [key, stableJsonValue(entry)]))
}

function snapshotWithoutDigest(snapshot: Record<string, unknown>): Record<string, unknown> {
  const withoutDigest = { ...snapshot }
  delete withoutDigest.digest
  return withoutDigest
}

/** Return the canonical SHA-256 over a snapshot with its digest field excluded. */
export function digestAutomaticFailureBaseline(snapshot: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(stableJsonValue(snapshotWithoutDigest(snapshot)))).digest('hex')
}

function identityFromUnknown(value: unknown): AutomaticFailureIdentity | null {
  const item = record(value)
  if (!item) return null
  const ruleId = text(item.ruleId)
  const cellId = text(item.cellId)
  const selector = text(item.selector)
  const state = text(item.state, 'default')
  if (!ruleId || !cellId || !selector || !state) return null
  return { ruleId, cellId, selector, state }
}

function compareIdentities(left: AutomaticFailureIdentity, right: AutomaticFailureIdentity): number {
  for (const key of ['ruleId', 'cellId', 'selector', 'state'] as const) {
    const compared = left[key] < right[key] ? -1 : left[key] > right[key] ? 1 : 0
    if (compared !== 0) return compared
  }
  return 0
}

function identityFailures(values: unknown): AutomaticFailureIdentity[] {
  if (!Array.isArray(values)) return []
  const unique = new Map<string, AutomaticFailureIdentity>()
  for (const value of values) {
    const identity = identityFromUnknown(value)
    if (!identity) continue
    unique.set(JSON.stringify(identity), identity)
  }
  return [...unique.values()].sort(compareIdentities)
}

function snapshotLane(value: unknown): AutomaticFailureLaneMetadata {
  const lane = record(value)
  return {
    complete: lane?.complete === true,
    count: Number(lane?.count ?? 0),
    digest: text(lane?.digest),
  } as AutomaticFailureLaneMetadata
}

function normalizedSnapshot(input: Record<string, unknown>): AutomaticFailureBaseline {
  const source = record(input.source) ?? {}
  const inputLanes = record(input.lanes) ?? {}
  const lanes = Object.fromEntries(AUTOMATIC_FAILURE_LANES.map((name) => [name, snapshotLane(inputLanes[name])])) as AutomaticFailureBaseline['lanes']
  const payload = {
    kind: AUTOMATIC_FAILURE_BASELINE_KIND as typeof AUTOMATIC_FAILURE_BASELINE_KIND,
    version: AUTOMATIC_FAILURE_BASELINE_VERSION,
    source: {
      productSha: text(source.productSha),
      harnessSha: text(source.harnessSha),
      sessionId: text(source.sessionId),
      manifestDigest: text(source.manifestDigest),
    },
    failures: identityFailures(input.failures),
    untestedCellIds: sortedStrings(Array.isArray(input.untestedCellIds)
      ? input.untestedCellIds.map((value) => text(value)).filter(Boolean)
      : []),
    lanes,
  }
  return { ...payload, digest: digestAutomaticFailureBaseline(payload) }
}

/** Serialize the fixed snapshot with stable key order and no incidental whitespace. */
export function serializeAutomaticFailureBaseline(snapshot: AutomaticFailureBaseline): string {
  const normalized = normalizedSnapshot(snapshot as unknown as Record<string, unknown>)
  return `${JSON.stringify({
    kind: normalized.kind,
    version: normalized.version,
    source: normalized.source,
    failures: normalized.failures,
    untestedCellIds: normalized.untestedCellIds,
    lanes: normalized.lanes,
    digest: normalized.digest,
  })}\n`
}

export function validateAutomaticFailureBaseline(
  payload: unknown,
): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const snapshot = record(payload)
  if (!snapshot) return { ok: false, errors: ['automatic-failure baseline must be a JSON object'] }
  const actualKeys = Object.keys(snapshot).sort()
  const expectedKeys = [...SNAPSHOT_TOP_LEVEL_KEYS].sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    errors.push(`automatic-failure baseline schema keys must be exactly ${SNAPSHOT_TOP_LEVEL_KEYS.join(', ')}`)
  }
  if (snapshot.kind !== AUTOMATIC_FAILURE_BASELINE_KIND) errors.push('automatic-failure baseline kind is invalid')
  if (snapshot.version !== AUTOMATIC_FAILURE_BASELINE_VERSION) errors.push('automatic-failure baseline version is invalid')

  const source = record(snapshot.source)
  if (!source) errors.push('automatic-failure baseline source is missing')
  else {
    const sourceKeys = Object.keys(source).sort()
    if (JSON.stringify(sourceKeys) !== JSON.stringify([...SNAPSHOT_SOURCE_KEYS].sort())) errors.push('automatic-failure baseline source schema is invalid')
    if (!SHA_RE.test(text(source.productSha))) errors.push('automatic-failure baseline source product SHA is invalid')
    if (!SHA_RE.test(text(source.harnessSha))) errors.push('automatic-failure baseline source harness SHA is invalid')
    if (!SESSION_ID_RE.test(text(source.sessionId))) errors.push('automatic-failure baseline source session id is invalid')
    if (!/^[0-9a-f]{64}$/.test(text(source.manifestDigest))) errors.push('automatic-failure baseline source manifest digest is invalid')
  }

  if (!Array.isArray(snapshot.failures)) errors.push('automatic-failure baseline failures must be an array')
  else {
    const identities = snapshot.failures.map(identityFromUnknown)
    if (identities.some((identity) => !identity)) errors.push('automatic-failure baseline failures must contain identity-only entries')
    const clean = identities.filter((identity): identity is AutomaticFailureIdentity => Boolean(identity))
    if (JSON.stringify(clean) !== JSON.stringify([...clean].sort(compareIdentities))) errors.push('automatic-failure baseline failures must be sorted')
    if (new Set(clean.map((identity) => JSON.stringify(identity))).size !== clean.length) errors.push('automatic-failure baseline failures must be unique')
    for (const value of snapshot.failures) {
      if (record(value) && JSON.stringify(Object.keys(record(value)!).sort()) !== JSON.stringify(['cellId', 'ruleId', 'selector', 'state'])) {
        errors.push('automatic-failure baseline failure entries may contain identity fields only')
        break
      }
    }
  }
  if (!Array.isArray(snapshot.untestedCellIds)
    || snapshot.untestedCellIds.some((value) => typeof value !== 'string' || !value)
    || JSON.stringify(snapshot.untestedCellIds) !== JSON.stringify(sortedStrings(snapshot.untestedCellIds as unknown[] as string[]))) {
    errors.push('automatic-failure baseline untestedCellIds must be a sorted unique string array')
  }

  const lanes = record(snapshot.lanes)
  if (!lanes) errors.push('automatic-failure baseline lanes are missing')
  else {
    const laneKeys = Object.keys(lanes).sort()
    if (JSON.stringify(laneKeys) !== JSON.stringify([...SNAPSHOT_LANE_KEYS].sort())) errors.push('automatic-failure baseline lane schema is incomplete')
    for (const name of AUTOMATIC_FAILURE_LANES) {
      const lane = record(lanes[name])
      if (!lane || Object.keys(lane).sort().join(',') !== 'complete,count,digest') {
        errors.push(`automatic-failure baseline lane ${name} metadata is invalid`)
        continue
      }
      if (lane.complete !== true) errors.push(`automatic-failure baseline lane ${name} is incomplete`)
      if (!Number.isInteger(lane.count) || Number(lane.count) <= 0) errors.push(`automatic-failure baseline lane ${name} count is invalid`)
      if (!/^[0-9a-f]{64}$/.test(text(lane.digest))) errors.push(`automatic-failure baseline lane ${name} digest is invalid`)
    }
  }
  if (!/^[0-9a-f]{64}$/.test(text(snapshot.digest))) errors.push('automatic-failure baseline digest is invalid')
  else if (text(snapshot.digest) !== digestAutomaticFailureBaseline(snapshot)) errors.push('automatic-failure baseline digest does not match its canonical payload')
  return { ok: errors.length === 0, errors }
}

function gitText(repoRoot: string, args: string[]): string {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function isAncestor(repoRoot: string, ancestor: string, descendant: string): boolean {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { cwd: repoRoot, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function productTreeEquivalent(repoRoot: string, sourceProductSha: string, sourceHarnessSha: string): boolean {
  if (sourceProductSha === sourceHarnessSha) return true
  try {
    execFileSync('git', ['diff', '--quiet', `${sourceProductSha}..${sourceHarnessSha}`, '--', ...SNAPSHOT_PRODUCT_PATHS], { cwd: repoRoot, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function gitBlob(repoRoot: string, revision: string, relativePath: string): Buffer {
  return execFileSync('git', ['show', `${revision}:${relativePath}`], {
    cwd: repoRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'ignore'],
  }) as Buffer
}

function sourceManifestDigest(repoRoot: string, source: AutomaticFailureBaselineSource): string | null {
  try {
    return createHash('sha256').update(gitBlob(repoRoot, source.harnessSha, 'mos-app/e2e/design-quality/manifest.ts')).digest('hex')
  } catch {
    return null
  }
}

export function validateAutomaticFailureBaselineSource(
  repoRoot: string,
  snapshot: AutomaticFailureBaseline,
  descendant: string,
): string[] {
  const errors: string[] = []
  const source = snapshot.source
  if (!isAncestor(repoRoot, source.productSha, descendant)) {
    errors.push('automatic-failure baseline source product SHA is stale or unrelated to the verified commit')
  }
  if (!isAncestor(repoRoot, source.harnessSha, descendant)) {
    errors.push('automatic-failure baseline source harness SHA is stale or unrelated to the verified commit')
  }
  if (!isAncestor(repoRoot, source.productSha, source.harnessSha)) {
    errors.push('automatic-failure baseline source harness is not descended from the source product')
  }
  if (!productTreeEquivalent(repoRoot, source.productSha, source.harnessSha)) {
    errors.push('automatic-failure baseline bootstrap source changed the product tree')
  }
  return errors
}

/**
 * Load the baseline from the Git object named by the exact merge base. No
 * filesystem path supplied by a candidate or session is consulted.
 */
export async function loadTrustedAutomaticFailureBaseline(
  options: TrustedAutomaticFailureBaselineOptions,
): Promise<TrustedAutomaticFailureBaselineResult> {
  const errors: string[] = []
  const { repoRoot, candidateSha, verificationBase } = options
  if (!SHA_RE.test(candidateSha)) errors.push('candidate SHA is invalid')
  if (!verificationBase?.trim()) errors.push('verification base is missing')
  if (errors.length > 0) return { ok: false, errors }
  let mergeBaseSha = ''
  let blob: Buffer
  try {
    mergeBaseSha = gitText(repoRoot, ['merge-base', candidateSha, verificationBase])
    if (!SHA_RE.test(mergeBaseSha)) throw new Error('merge-base is not a full SHA')
    blob = gitBlob(repoRoot, mergeBaseSha, AUTOMATIC_FAILURE_BASELINE_PATH)
  } catch (error) {
    return { ok: false, errors: [`exact merge-base snapshot is missing, invalid, or unreadable: ${String(error)}`], mergeBaseSha: mergeBaseSha || undefined }
  }
  const blobDigest = createHash('sha256').update(blob).digest('hex')
  let payload: unknown
  try {
    payload = JSON.parse(blob.toString('utf8'))
  } catch (error) {
    return { ok: false, errors: [`exact merge-base snapshot is not valid JSON: ${String(error)}`], mergeBaseSha, blobDigest }
  }
  const validation = validateAutomaticFailureBaseline(payload)
  errors.push(...validation.errors)
  const snapshot = record(payload)
  if (snapshot && validateAutomaticFailureBaseline(snapshot).ok) {
    const normalized = normalizedSnapshot(snapshot)
    if (serializeAutomaticFailureBaseline(normalized) !== blob.toString('utf8')) {
      errors.push('automatic-failure baseline blob is not canonical compact serialization')
    }
    errors.push(...validateAutomaticFailureBaselineSource(repoRoot, normalized, mergeBaseSha))
  }
  if (errors.length > 0) return { ok: false, errors, mergeBaseSha, blobDigest }
  return {
    ok: true,
    errors: [],
    mergeBaseSha,
    blobDigest,
    snapshot: normalizedSnapshot(payload as Record<string, unknown>),
  }
}

const LANE_VOLATILE_KEYS = new Set([
  'candidateSha', 'candidate_sha', 'sessionId', 'session_id', 'auditId', 'adwId',
  'auditMode', 'baselineEvidenceDir', 'baselineCandidateSha', 'baselineSessionId',
  'baselineDigest', 'verificationBase', 'mergeBaseSha', 'screenshots', 'paths',
  'build', 'outputPath', 'artifactPath', 'artifactDigest', 'digest', 'complete', 'count',
])

function stripLaneVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripLaneVolatile)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !LANE_VOLATILE_KEYS.has(key))
    .map(([key, entry]) => [key, stripLaneVolatile(entry)]))
}

function laneStablePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return stripLaneVolatile(payload) as Record<string, unknown>
}

/** Digest the measured portion of one lane, excluding run identity and metadata. */
export function digestAutomaticFailureLane(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(stableJsonValue(laneStablePayload(payload)))).digest('hex')
}

function laneCount(name: keyof typeof SNAPSHOT_PATHS, payload: Record<string, unknown>): number {
  switch (name) {
    case 'quantitative': return ['geometryRows', 'controlRows', 'headingRows', 'focusRows', 'typographyRows', 'touchSeparationRows', 'regionRows', 'cardRows', 'visibleContentRows'].reduce((sum, key) => sum + Math.max(0, Number(payload[key]) || 0), 0)
    case 'controlConsistency': return Math.max(0, Number(payload.rows) || 0)
    case 'contrast': return Math.max(0, Number(payload.rows) || 0)
    case 'antiSlop': return Math.max(0, Number(payload.cells) || 0)
    case 'axe': return Array.isArray(payload.scans) ? payload.scans.length : 0
    case 'mockup': return Array.isArray(payload.comparisons) ? payload.comparisons.length : 0
  }
}

function laneComplete(name: keyof typeof SNAPSHOT_PATHS, payload: Record<string, unknown>): boolean {
  if (payload.complete !== true) return false
  if (payload.status === 'pending' || payload.status === 'running' || payload.status === 'blocked') return false
  if (!Array.isArray(payload.failures) || !Array.isArray(payload.allFailures)
    || !Array.isArray(payload.inheritedFailures) || !Array.isArray(payload.newFailures)) return false
  switch (name) {
    case 'quantitative': return Number(payload.geometryRows) > 0 && Number(payload.visibleContentRows) > 0
    case 'controlConsistency': return Number(payload.rows) > 0
    case 'contrast': return Number(payload.rows) > 0
    case 'antiSlop': return Number(payload.cells) > 0
    case 'axe': return Array.isArray(payload.scans) && payload.scans.length > 0
    case 'mockup': return Array.isArray(payload.comparisons) && payload.comparisons.length > 0
  }
}

function laneDeclaredCount(payload: Record<string, unknown>): number {
  return Number(payload.count)
}

function metadataMatchesPayload(payload: Record<string, unknown>, candidateSha: string, sessionId: string): string[] {
  const errors: string[] = []
  if (payload.candidateSha !== candidateSha) errors.push('candidate SHA metadata is stale')
  if (payload.sessionId !== sessionId) errors.push('session metadata is stale')
  if (!['mvp-assessment', 'change-gate'].includes(text(payload.auditMode))) errors.push('auditMode metadata is missing or invalid')
  return errors
}

async function safeEvidenceFile(root: string, relativePath: string): Promise<{ bytes: Buffer; text: string }> {
  const absolute = path.resolve(root, relativePath)
  if (!isContained(root, absolute)) throw new Error(`evidence path escapes root: ${relativePath}`)
  const info = await lstat(absolute)
  if (info.isSymbolicLink()) {
    const target = await realpath(absolute)
    if (!isContained(await realpath(root), target)) throw new Error(`evidence path escapes root: ${relativePath}`)
  }
  const bytes = await readFile(absolute)
  return { bytes, text: bytes.toString('utf8') }
}

function manifestDigest(payload: Record<string, unknown>): string {
  const copy = { ...payload }
  delete copy.candidateSha
  delete copy.candidate_sha
  delete copy.sessionId
  delete copy.session_id
  return createHash('sha256').update(JSON.stringify(stableJsonValue(copy))).digest('hex')
}

function sameSnapshotCensus(left: AutomaticFailureBaseline, right: AutomaticFailureBaseline): boolean {
  return JSON.stringify({ failures: left.failures, untestedCellIds: left.untestedCellIds, lanes: left.lanes, manifestDigest: left.source.manifestDigest })
    === JSON.stringify({ failures: right.failures, untestedCellIds: right.untestedCellIds, lanes: right.lanes, manifestDigest: right.source.manifestDigest })
}

export async function produceAutomaticFailureBaseline(
  options: AutomaticFailureBaselineProducerOptions,
): Promise<AutomaticFailureBaselineProducerResult> {
  const errors: string[] = []
  const root = path.resolve(options.evidenceDir)
  let rootReal: string
  try {
    rootReal = await realpath(root)
    if (!(await stat(rootReal)).isDirectory()) throw new Error('evidence path is not a directory')
  } catch (error) {
    return { ok: false, errors: [`evidence directory is missing or unreadable: ${String(error)}`] }
  }
  if (!SHA_RE.test(options.sourceProductSha) || !SHA_RE.test(options.sourceHarnessSha)) errors.push('source product and harness SHA must be full revisions')
  if (!SESSION_ID_RE.test(options.sourceSessionId)) errors.push('source session id is invalid')
  if (options.repoRoot && SHA_RE.test(options.sourceProductSha) && SHA_RE.test(options.sourceHarnessSha)) {
    if (!isAncestor(options.repoRoot, options.sourceProductSha, options.sourceHarnessSha)) errors.push('source harness commit is not descended from the source product commit')
    if (!productTreeEquivalent(options.repoRoot, options.sourceProductSha, options.sourceHarnessSha)) errors.push('bootstrap relation is invalid because the product tree changed')
  }
  let manifestPayload: Record<string, unknown> | null = null
  let manifestRunnableCount = 0
  const requiredEvidencePaths = [
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
    'mockup-diff/status.json',
  ] as const
  try {
    const file = await safeEvidenceFile(rootReal, 'manifest.json')
    manifestPayload = record(JSON.parse(file.text))
    if (!manifestPayload) throw new Error('manifest must be a JSON object')
    const manifestMetadataErrors = []
    if (manifestPayload.candidateSha !== options.sourceProductSha) manifestMetadataErrors.push('candidate SHA metadata is stale')
    if (manifestPayload.sessionId !== options.sourceSessionId) manifestMetadataErrors.push('session metadata is stale')
    errors.push(...manifestMetadataErrors.map((message) => `manifest.json: ${message}`))
    if (!Array.isArray(manifestPayload.cells) || manifestPayload.cells.length === 0) errors.push('manifest.json has no complete cell census')
    const manifestCells = Array.isArray(manifestPayload.cells) ? manifestPayload.cells : []
    const ids = manifestCells.map((cell) => text(record(cell)?.id))
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) errors.push('manifest.json has missing or duplicate cell IDs')
    const statuses = new Set(['covered', 'not-applicable', 'blocked', 'untested'])
    for (const [index, cellValue] of manifestCells.entries()) {
      const cell = record(cellValue)
      const requiredCellFields = ['id', 'area', 'journey', 'route', 'fixture', 'viewport', 'theme', 'language', 'state', 'status']
      if (!cell || requiredCellFields.some((field) => !text(cell[field]).trim())
        || !statuses.has(text(cell?.status))) {
        errors.push(`manifest.json cell ${index} is incomplete or has an invalid status`)
      }
    }
    const readinessErrors = Array.isArray(manifestPayload.readinessErrors)
      ? manifestPayload.readinessErrors.filter((value): value is string => typeof value === 'string')
      : []
    const expectedIncompleteStatuses = manifestCells
      .filter((cellValue) => ['blocked', 'untested'].includes(text(record(cellValue)?.status)))
      .map((cellValue) => text(record(cellValue)?.id))
    if (manifestPayload.readiness === 'ready' && expectedIncompleteStatuses.length > 0) {
      errors.push('manifest.json readiness claims ready while the census contains blocked or untested cells')
    }
    if (manifestPayload.readiness === 'incomplete') {
      const statusErrors = new Set(expectedIncompleteStatuses.flatMap((id) => [
        `cell ${id} is blocked; readiness cannot be green`,
        `cell ${id} is untested; readiness cannot be green`,
      ]))
      if (readinessErrors.length === 0 || readinessErrors.some((error) => !statusErrors.has(error))) {
        errors.push('manifest.json declares a structurally incomplete census')
      }
    }
    manifestRunnableCount = manifestCells.filter((cellValue) => {
      const cell = record(cellValue)
      const contract = record(cell?.stateContract)
      return ['covered', 'untested'].includes(text(cell?.status)) && Array.isArray(contract?.setup)
        && Boolean(text(record(contract.assertion)?.selector).trim())
    }).length
    if (manifestRunnableCount <= 0) errors.push('manifest.json has no runnable census cells')
  } catch (error) {
    errors.push(`manifest.json is missing, invalid, or escapes the evidence root: ${String(error)}`)
  }

  const contents = new Map<string, string>()
  // Every declared raw artifact is part of the census.  A summary by itself is
  // insufficient evidence because its denominator and measured rows cannot be
  // independently checked.
  for (const relativePath of requiredEvidencePaths) {
    try {
      const file = await safeEvidenceFile(rootReal, relativePath)
      if (file.bytes.byteLength === 0) throw new Error('artifact is empty')
      if (relativePath.endsWith('.json')) {
        const payload = record(JSON.parse(file.text))
        if (!payload) throw new Error('JSON artifact must be an object')
        if (payload.candidateSha !== options.sourceProductSha || payload.sessionId !== options.sourceSessionId) {
          throw new Error('artifact metadata does not match the source product/session')
        }
      } else if (relativePath.endsWith('.csv')) {
        const lines = file.text.split(/\r?\n/).filter((line) => line.trim().length > 0)
        if (lines.length < 4 || !lines[0]!.startsWith('# candidate_sha=') || !lines[1]!.startsWith('# session_id=')) {
          throw new Error('CSV artifact is missing metadata or measured rows')
        }
        if (lines[0]!.slice('# candidate_sha='.length) !== options.sourceProductSha
          || lines[1]!.slice('# session_id='.length) !== options.sourceSessionId) {
          throw new Error('CSV artifact metadata does not match the source product/session')
        }
      } else if (relativePath === 'gate-log.txt') {
        const lines = file.text.split(/\r?\n/).filter((line) => line.trim().length > 0)
        if (lines.length < 3 || !lines.some((line) => line === `candidate_sha=${options.sourceProductSha}`)
          || !lines.some((line) => line === `session_id=${options.sourceSessionId}`)) {
          throw new Error('gate log is missing source metadata or status entries')
        }
      }
      contents.set(relativePath, file.text)
    } catch (error) {
      errors.push(`${relativePath} is missing, invalid, incomplete, or escapes the evidence root: ${String(error)}`)
    }
  }
  const laneMetadata = {} as AutomaticFailureBaseline['lanes']
  for (const name of AUTOMATIC_FAILURE_LANES) {
    const relativePath = SNAPSHOT_PATHS[name]
    let payload: Record<string, unknown> | null = null
    try {
      const file = await safeEvidenceFile(rootReal, relativePath)
      payload = record(JSON.parse(file.text))
      if (!payload) throw new Error('lane artifact must be a JSON object')
      contents.set(relativePath, file.text)
      errors.push(...metadataMatchesPayload(payload, options.sourceProductSha, options.sourceSessionId).map((message) => `${relativePath}: ${message}`))
      if (!laneComplete(name, payload)) errors.push(`${relativePath}: lane is incomplete or has no measured census`)
      const count = laneDeclaredCount(payload)
      const measuredCount = laneCount(name, payload)
      if (!Number.isInteger(count) || count <= 0) errors.push(`${relativePath}: lane count is missing or invalid`)
      if (Number.isInteger(count) && count !== measuredCount) errors.push(`${relativePath}: denominator mismatch (declared ${count}, measured ${measuredCount})`)
      if ((name === 'antiSlop' || name === 'axe') && manifestRunnableCount > 0 && count !== manifestRunnableCount) {
        errors.push(`${relativePath}: denominator mismatch with manifest runnable census (declared ${count}, manifest ${manifestRunnableCount})`)
      }
      const digest = digestAutomaticFailureLane(payload)
      if (!/^[0-9a-f]{64}$/.test(text(payload.digest))) errors.push(`${relativePath}: lane digest is missing or invalid`)
      else if (payload.digest !== digest) errors.push(`${relativePath}: lane digest does not match its measured payload`)
      laneMetadata[name] = { complete: true, count, digest }
    } catch (error) {
      errors.push(`${relativePath} is missing, invalid, or escapes the evidence root: ${String(error)}`)
      laneMetadata[name] = { complete: false, count: 0, digest: '' } as unknown as AutomaticFailureLaneMetadata
    }
  }

  if (manifestPayload) contents.set('manifest.json', JSON.stringify(manifestPayload))
  if (errors.length > 0) return { ok: false, errors }

  const collectedFailures = [
    ...collectFailures(contents),
    ...collectUntestedCellFailures(contents),
  ]
  if (collectedFailures.some((failure) => !failure.ruleId || !failure.cellId || !failure.selector || !failure.state)) {
    errors.push('automatic failures must carry complete identity fields')
  }
  if (errors.length > 0) return { ok: false, errors }
  const failures = uniqueFailures(collectedFailures)
  const source: AutomaticFailureBaselineSource = {
    productSha: options.sourceProductSha,
    harnessSha: options.sourceHarnessSha,
    sessionId: options.sourceSessionId,
    manifestDigest: manifestPayload ? manifestDigest(manifestPayload) : '',
  }
  if (options.repoRoot) {
    const derived = sourceManifestDigest(options.repoRoot, source)
    if (!derived) errors.push('source manifest is unavailable in the harness commit')
    else source.manifestDigest = derived
  }
  if (errors.length > 0) return { ok: false, errors }
  const next = normalizedSnapshot({
    source,
    failures,
    untestedCellIds: collectUntestedCellIds(contents),
    lanes: laneMetadata,
  })
  let outputSnapshot = next
  if (options.previousSnapshot) {
    const previousValidation = validateAutomaticFailureBaseline(options.previousSnapshot)
    if (!previousValidation.ok) {
      return { ok: false, errors: previousValidation.errors.map((error) => `previous snapshot is invalid: ${error}`) }
    }
    if (options.repoRoot) {
      const previousSourceErrors = validateAutomaticFailureBaselineSource(options.repoRoot, options.previousSnapshot, options.sourceHarnessSha)
      if (previousSourceErrors.length > 0) {
        return { ok: false, errors: previousSourceErrors.map((error) => `previous snapshot source is invalid: ${error}`) }
      }
    }
    if (sameSnapshotCensus(next, options.previousSnapshot)) outputSnapshot = options.previousSnapshot
  }
  const bytes = serializeAutomaticFailureBaseline(outputSnapshot)
  const outputPath = options.outputPath || path.join(rootReal, 'automatic-failure-baseline.json')
  try {
    const absoluteOutputPath = path.resolve(outputPath)
    if (!isContained(rootReal, absoluteOutputPath)) throw new Error('snapshot output escapes evidence root')
    const parentReal = await realpath(path.dirname(absoluteOutputPath))
    if (!isContained(rootReal, parentReal)) throw new Error('snapshot output parent escapes evidence root')
    const existing = await lstat(absoluteOutputPath).catch(() => null)
    if (existing?.isSymbolicLink()) throw new Error('snapshot output cannot be a symlink')
    await writeFile(absoluteOutputPath, bytes, 'utf8')
  } catch (error) {
    return { ok: false, errors: [`unable to emit automatic-failure baseline: ${String(error)}`] }
  }
  return { ok: true, errors: [], snapshot: outputSnapshot, bytes, outputPath }
}

/** Re-derive the candidate snapshot and compare it with both evidence and HEAD. */
export async function revalidateChangeGateSnapshot(
  options: ChangeGateSnapshotRevalidationOptions,
): Promise<ChangeGateSnapshotRevalidationResult> {
  const errors: string[] = []
  const verificationBase = options.verificationBase || 'origin/dev'
  if (!SHA_RE.test(options.candidateSha)) errors.push('candidate SHA is invalid')
  if (!SESSION_ID_RE.test(options.sessionId)) errors.push('session id is invalid')
  try {
    const head = gitText(options.repoRoot, ['rev-parse', 'HEAD'])
    if (head !== options.candidateSha) errors.push(`candidate SHA changed during final validation (expected ${options.candidateSha}, found ${head})`)
    const status = gitText(options.repoRoot, ['status', '--porcelain', '--untracked-files=all'])
    if (status) errors.push('working tree changed during final validation')
  } catch (error) {
    errors.push(`unable to inspect candidate Git state: ${String(error)}`)
  }
  let session: Record<string, unknown> | null = null
  try {
    session = record(JSON.parse((await safeEvidenceFile(path.resolve(options.evidenceDir), 'session.json')).text))
  } catch (error) {
    errors.push(`audit session is missing or invalid: ${String(error)}`)
  }
  if (!session) return { ok: false, errors }
  if (session.candidateSha !== options.candidateSha || session.sessionId !== options.sessionId) errors.push('audit session metadata changed during final validation')
  if (session.auditMode !== 'change-gate') errors.push('audit session is not in change-gate mode')

  const sessionVerificationBase = text(session.verificationBase)
  if (sessionVerificationBase !== verificationBase) errors.push('audit session verification base is missing or changed during final validation')
  const trusted = await loadTrustedAutomaticFailureBaseline({ repoRoot: options.repoRoot, candidateSha: options.candidateSha, verificationBase })
  if (session.mergeBaseSha !== trusted.mergeBaseSha) errors.push('audit session merge base is missing or changed during final validation')
  if (session.snapshotBlobDigest !== trusted.blobDigest) errors.push('audit session snapshot blob digest is missing or changed during final validation')
  if (!trusted.ok || !trusted.snapshot) errors.push(...trusted.errors.map((error) => `exact merge-base snapshot: ${error}`))

  let emitted: { bytes: string; snapshot: AutomaticFailureBaseline } | null = null
  try {
    const emittedFile = await safeEvidenceFile(path.resolve(options.evidenceDir), 'automatic-failure-baseline.json')
    const payload = JSON.parse(emittedFile.text)
    const validation = validateAutomaticFailureBaseline(payload)
    if (!validation.ok) errors.push(...validation.errors.map((error) => `emitted snapshot: ${error}`))
    else {
      const snapshot = normalizedSnapshot(payload as Record<string, unknown>)
      errors.push(...validateAutomaticFailureBaselineSource(options.repoRoot, snapshot, options.candidateSha).map((error) => `emitted snapshot: ${error}`))
      if (serializeAutomaticFailureBaseline(snapshot) !== emittedFile.text) errors.push('emitted snapshot is not canonical compact serialization')
      emitted = { bytes: emittedFile.text, snapshot }
    }
  } catch (error) {
    errors.push(`emitted automatic-failure baseline is missing or invalid: ${String(error)}`)
  }

  let candidateBytes = ''
  try {
    candidateBytes = gitBlob(options.repoRoot, options.candidateSha, AUTOMATIC_FAILURE_BASELINE_PATH).toString('utf8')
    const candidatePayload = JSON.parse(candidateBytes)
    const validation = validateAutomaticFailureBaseline(candidatePayload)
    if (!validation.ok) errors.push(...validation.errors.map((error) => `committed snapshot: ${error}`))
    else {
      const snapshot = normalizedSnapshot(candidatePayload)
      errors.push(...validateAutomaticFailureBaselineSource(options.repoRoot, snapshot, options.candidateSha).map((error) => `committed snapshot: ${error}`))
      if (serializeAutomaticFailureBaseline(snapshot) !== candidateBytes) errors.push('committed snapshot is not canonical compact serialization')
    }
  } catch (error) {
    errors.push(`committed candidate snapshot is missing or invalid: ${String(error)}`)
  }
  if (emitted && candidateBytes && candidateBytes !== emitted.bytes) errors.push('committed candidate snapshot does not byte-match emitted output')
  if (emitted && trusted.snapshot) {
    const rederivedPath = path.join(path.resolve(options.evidenceDir), '.automatic-failure-baseline.revalidated.json')
    let derived: AutomaticFailureBaselineProducerResult
    try {
      derived = await produceAutomaticFailureBaseline({
        evidenceDir: options.evidenceDir,
        sourceProductSha: options.candidateSha,
        sourceHarnessSha: options.candidateSha,
        sourceSessionId: options.sessionId,
        repoRoot: options.repoRoot,
        previousSnapshot: trusted.snapshot,
        outputPath: rederivedPath,
      })
    } finally {
      await rm(rederivedPath, { force: true })
    }
    if (!derived.ok || !derived.bytes) errors.push(...derived.errors.map((error) => `re-derived snapshot: ${error}`))
    else if (derived.bytes !== emitted.bytes) errors.push('emitted snapshot does not byte-match deterministic re-derivation')
  }
  return {
    ok: errors.length === 0,
    errors,
    mergeBaseSha: trusted.mergeBaseSha,
    emittedBytes: emitted?.bytes,
    candidateBytes: candidateBytes || undefined,
  }
}

/**
 * Build a canonical snapshot from a payload, or run the operator-only evidence
 * producer when passed producer options. The overload keeps the canonical
 * serializer synchronous for unit callers while the evidence path remains async.
 */
export function createAutomaticFailureBaseline(input: AutomaticFailureBaselineProducerOptions): Promise<AutomaticFailureBaselineProducerResult>
export function createAutomaticFailureBaseline(input: Record<string, unknown>): AutomaticFailureBaseline
export function createAutomaticFailureBaseline(input: Record<string, unknown> | AutomaticFailureBaselineProducerOptions): AutomaticFailureBaseline | Promise<AutomaticFailureBaselineProducerResult> {
  if ('evidenceDir' in input) return produceAutomaticFailureBaseline(input as AutomaticFailureBaselineProducerOptions)
  return normalizedSnapshot(input)
}

/**
 * Compatibility facade for the old name. The first argument is now the
 * repository root, never an evidence directory. A string path is deliberately
 * treated as a repository root so a candidate cannot smuggle a filesystem
 * baseline into a change-gate run.
 */
export async function loadChangeGateBaseline(
  options: TrustedAutomaticFailureBaselineOptions | string,
  expectedCandidateSha?: string,
  verificationBase = 'origin/dev',
): Promise<ChangeGateBaselineResult> {
  const trusted = typeof options === 'string'
    ? await loadTrustedAutomaticFailureBaseline({
      repoRoot: options,
      candidateSha: expectedCandidateSha || '',
      verificationBase,
    })
    : await loadTrustedAutomaticFailureBaseline(options)
  if (!trusted.ok || !trusted.snapshot) return trusted
  const snapshot = trusted.snapshot
  const failures: AutomaticFailure[] = snapshot.failures.map((identity) => ({
    ...identity,
    message: 'automatic failure recorded in exact merge-base snapshot',
  }))
  failures.push(...snapshot.untestedCellIds.map((cellId) => ({
    ruleId: 'state.coverage',
    cellId,
    selector: '__state__',
    state: 'default',
    message: 'manifest cell was untested at the exact merge base',
  })))
  return {
    ok: true,
    errors: [],
    mergeBaseSha: trusted.mergeBaseSha,
    snapshot,
    baseline: {
      evidenceDir: `git:${trusted.mergeBaseSha}:${AUTOMATIC_FAILURE_BASELINE_PATH}`,
      candidateSha: snapshot.source.productSha,
      sessionId: snapshot.source.sessionId,
      failures,
      untestedCellIds: snapshot.untestedCellIds,
      artifactDigest: snapshot.digest,
    },
  }
}
