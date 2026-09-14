import { createHash } from 'node:crypto'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { validateManifest } from './manifest.ts'

export const REQUIRED_ARTIFACTS = [
  'manifest.json',
  'gate-log.txt',
  'contrast.csv',
  'geometry.csv',
  'number-census.csv',
  'control-census.csv',
  'state-matrix.csv',
  'affordance-census.csv',
  'copy-census.csv',
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

function meaningfulJson(artifact: string, payload: unknown): { ok: boolean; reason?: string } {
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
  }
  return { ok: true }
}

export function meaningfulCsv(artifact: string, text: string): { ok: boolean; reason?: string } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length < 4) {
    return { ok: false, reason: `${artifact} must contain metadata, a header, and at least one data row` }
  }
  if (!lines[0]!.startsWith('# candidate_sha=') || !lines[1]!.startsWith('# session_id=')) {
    return { ok: false, reason: `${artifact} is missing its metadata preamble` }
  }
  return { ok: true }
}

function meaningfulGateLog(text: string): { ok: boolean; reason?: string } {
  if (/\bpending\b/i.test(text)) return { ok: false, reason: 'gate log still contains a pending status' }
  if (!/^browser_status=(?:0|[1-9][0-9]*|not-run|skipped)$/m.test(text)) {
    return { ok: false, reason: 'gate log has no terminal browser status' }
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
              const comparisons = isRecord(payload) ? payload.comparisons : null
              const completedStatus = payload.status === 'pass'
                || (options.allowMockupGaps === true && payload.status === 'assessed-with-gaps')
              if (!isRecord(payload) || !completedStatus || !Array.isArray(comparisons) || comparisons.length === 0) {
                addUnique(invalid, artifact)
                errors.push(`${artifact}: status.json must report an allowed completed status with at least one comparison`)
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
        content = meaningfulJson(artifact, JSON.parse(text))
      } else if (artifact === 'gate-log.txt') {
        content = meaningfulGateLog(text)
      } else {
        content = meaningfulCsv(artifact, text)
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
