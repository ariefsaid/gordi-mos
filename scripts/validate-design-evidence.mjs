#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

import { REQUIRED_ARTIFACTS, validateArtifactSet } from '../mos-app/e2e/design-quality/report.ts'
import { loadChangeGateBaseline } from '../mos-app/e2e/design-quality/change-gate.ts'

function fail(message, details = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, errors: [message], ...details })}\n`)
  process.exit(1)
}

const [evidenceArg, expectedSha, ...flags] = process.argv.slice(2)
if (!evidenceArg || !/^[0-9a-f]{40}$/.test(expectedSha || '')) {
  fail('usage: validate-design-evidence.mjs <evidence-dir> <40-char-sha> [--require-green|--require-change-gate|--require-browser-change-gate]')
}
const knownFlags = new Set(['--require-green', '--require-change-gate', '--require-browser-change-gate'])
const unknownFlags = flags.filter((flag) => !knownFlags.has(flag))
if (unknownFlags.length > 0) fail(`unknown flag(s): ${unknownFlags.join(', ')}`)
const requireFinalChangeGate = flags.includes('--require-change-gate')
const requireBrowserChangeGate = flags.includes('--require-browser-change-gate')
const evidenceDir = await realpath(path.resolve(evidenceArg))
let session
try {
  session = JSON.parse(await readFile(path.join(evidenceDir, 'session.json'), 'utf8'))
} catch (error) {
  fail(`session.json is missing or invalid: ${String(error)}`)
}
const sessionId = typeof session.sessionId === 'string' ? session.sessionId : ''
if (session.candidateSha !== expectedSha || !/^[0-9a-f]{8}$/.test(sessionId)) {
  fail('session metadata does not match the expected candidate', {
    expectedSha,
    candidateSha: session.candidateSha,
    sessionId,
  })
}

const validation = await validateArtifactSet(
  evidenceDir,
  { candidateSha: expectedSha, sessionId },
  { allowMockupGaps: requireFinalChangeGate || requireBrowserChangeGate },
)
const declared = new Set(await Promise.all(
  (Array.isArray(session.quantitativeArtifacts) ? session.quantitativeArtifacts : []).map(async (entry) => {
    if (typeof entry !== 'string') return ''
    try {
      const resolved = path.resolve(evidenceDir, entry)
      const actual = await realpath(resolved)
      if (actual !== evidenceDir && !actual.startsWith(`${evidenceDir}${path.sep}`)) return ''
      return actual
    } catch {
      return ''
    }
  }),
))
const declarationErrors = []
for (const artifact of REQUIRED_ARTIFACTS) {
  const artifactPath = path.join(evidenceDir, artifact)
  try {
    const actual = await realpath(artifactPath)
    if (actual !== evidenceDir && !actual.startsWith(`${evidenceDir}${path.sep}`)) {
      declarationErrors.push(`artifact escapes evidence directory: ${artifact}`)
    } else if (!declared.has(actual)) {
      declarationErrors.push(`session does not declare ${path.relative(evidenceDir, artifactPath)}`)
    }
  } catch {
    // validateArtifactSet reports missing/unreadable paths with the shared
    // artifact contract below.
  }
}
const statusErrors = flags.includes('--require-green')
  && (session.browserExitStatus !== 0 || session.fixtureExitStatus !== 0 || session.chainExitStatus !== 0)
  ? [`evidence run is not green (browser=${String(session.browserExitStatus)}, fixture=${String(session.fixtureExitStatus)}, chain=${String(session.chainExitStatus)})`]
  : []
const changeGateErrors = []
if (requireFinalChangeGate || requireBrowserChangeGate) {
  if (session.auditMode !== 'change-gate') changeGateErrors.push('evidence was not produced in change-gate mode')
  if (session.browserExitStatus !== 0 || session.fixtureExitStatus !== 0
    || (requireFinalChangeGate && session.chainExitStatus !== 0)) {
    changeGateErrors.push(`change gate is not green (browser=${String(session.browserExitStatus)}, fixture=${String(session.fixtureExitStatus)}, chain=${String(session.chainExitStatus)})`)
  }
  try {
    const summary = JSON.parse(await readFile(path.join(evidenceDir, 'quantitative-summary.json'), 'utf8'))
    if (summary.candidateSha !== expectedSha || summary.sessionId !== sessionId) changeGateErrors.push('quantitative summary is stale')
    if (summary.auditMode !== 'change-gate' || summary.automaticChecksPassed !== true || !Array.isArray(summary.failures) || summary.failures.length > 0) {
      changeGateErrors.push('quantitative automatic checks did not pass in change-gate mode')
    }
  } catch (error) {
    changeGateErrors.push(`quantitative summary is missing or invalid: ${String(error)}`)
  }
  const baselineEvidenceDir = typeof session.baselineEvidenceDir === 'string' ? session.baselineEvidenceDir : ''
  const baselineSha = typeof session.baselineCandidateSha === 'string' ? session.baselineCandidateSha : ''
  const mergeBaseSha = typeof session.mergeBaseSha === 'string' ? session.mergeBaseSha : ''
  const baselineSessionId = typeof session.baselineSessionId === 'string' ? session.baselineSessionId : ''
  const baselineDigest = typeof session.baselineDigest === 'string' ? session.baselineDigest : ''
  if (!baselineEvidenceDir) changeGateErrors.push('change-gate baseline is missing baselineEvidenceDir')
  if (!/^[0-9a-f]{40}$/.test(baselineSha) || baselineSha !== mergeBaseSha) {
    changeGateErrors.push('change-gate baseline is missing or not bound to its recorded exact merge-base')
  }
  if (!/^[0-9a-f]{8}$/.test(baselineSessionId)) {
    changeGateErrors.push('change-gate baseline is missing a valid baselineSessionId')
  }
  if (!/^[0-9a-f]{64}$/.test(baselineDigest)) {
    changeGateErrors.push('change-gate baseline is missing its preflight SHA-256 digest')
  }
  if (baselineEvidenceDir && /^[0-9a-f]{40}$/.test(baselineSha)
    && baselineSha === mergeBaseSha && /^[0-9a-f]{64}$/.test(baselineDigest)) {
    const baseline = await loadChangeGateBaseline(baselineEvidenceDir, baselineSha, baselineDigest)
    if (!baseline.ok || !baseline.baseline) {
      changeGateErrors.push(`change-gate baseline evidence is invalid: ${baseline.errors.join('; ')}`)
    } else if (baselineSessionId !== baseline.baseline.sessionId) {
      changeGateErrors.push('change-gate baseline session binding is stale')
    }
  }
}
const errors = [...validation.errors, ...declarationErrors, ...statusErrors, ...changeGateErrors]
process.stdout.write(`${JSON.stringify({
  ok: errors.length === 0,
  candidateSha: expectedSha,
  sessionId,
  files: validation.files,
  missing: validation.missing,
  stale: validation.stale,
  invalid: validation.invalid,
  errors,
})}\n`)
process.exit(errors.length === 0 ? 0 : 1)
