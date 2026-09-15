import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises'
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
}

const SHA_RE = /^[0-9a-f]{40}$/i
const SESSION_ID_RE = /^[0-9a-f]{8,64}$/i

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

export async function loadChangeGateBaseline(
  evidenceDir: string,
  expectedCandidateSha: string,
  expectedArtifactDigest?: string,
): Promise<ChangeGateBaselineResult> {
  const errors: string[] = []
  let root: string
  try {
    root = await realpath(evidenceDir)
    const info = await stat(root)
    if (!info.isDirectory()) errors.push('baseline evidence path is not a directory')
  } catch {
    return { ok: false, errors: ['baseline evidence directory is missing or unreadable'] }
  }

  let session: Record<string, unknown> | null = null
  try {
    session = record(JSON.parse(await readFile(path.join(root, 'session.json'), 'utf8')))
  } catch {
    errors.push('baseline session.json is missing, unreadable, or invalid JSON')
  }
  if (!session) return { ok: false, errors }

  const binding = validateBaselineBinding(session, expectedCandidateSha)
  errors.push(...binding.errors)

  const declaredDir = session.contextHandoffDir
  if (declaredDir) {
    try {
      const declaredRealPath = await realpath(text(declaredDir))
      if (declaredRealPath !== root) errors.push('baseline contextHandoffDir does not match evidence directory')
    } catch {
      errors.push('baseline contextHandoffDir is missing or unreadable')
    }
  }

  const artifacts = await validateArtifactFiles(root, session, errors)
  const artifactDigest = digestValidatedArtifacts(artifacts.files)
  const recordedArtifactDigest = text(session.artifactDigest)
  if (/^[0-9a-f]{64}$/i.test(recordedArtifactDigest) && recordedArtifactDigest !== artifactDigest) {
    errors.push(`baseline artifact digest does not match its session binding (recorded ${recordedArtifactDigest}, found ${artifactDigest})`)
  }
  if (expectedArtifactDigest !== undefined && artifactDigest !== expectedArtifactDigest) {
    errors.push(`baseline artifact digest changed after preflight (expected ${expectedArtifactDigest}, found ${artifactDigest})`)
  }

  // Baselines carry the same complete artifact contract as a candidate.  The
  // change-gate exception is limited to mockup gaps; every automatic census
  // and every lane summary remains required and meaningful.
  try {
    const { validateArtifactSet } = await import('./report.ts')
    const validation = await validateArtifactSet(root, {
      candidateSha: text(session.candidateSha),
      sessionId: text(session.sessionId || session.auditId),
    }, { allowMockupGaps: true })
    if (!validation.ok) {
      errors.push(...validation.errors.map((error) => `baseline artifact contract: ${error}`))
    }
  } catch (error) {
    errors.push(`baseline artifact contract validator failed: ${String(error)}`)
  }
  const candidateSha = text(session.candidateSha)
  const sessionId = text(session.sessionId || session.auditId)
  const failures = uniqueFailures([
    ...collectFailures(artifacts.contents),
    ...collectUntestedCellFailures(artifacts.contents),
  ])

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    errors: [],
    baseline: {
      evidenceDir: root,
      candidateSha,
      sessionId,
      failures,
      untestedCellIds: collectUntestedCellIds(artifacts.contents),
      artifactDigest,
    },
  }
}
