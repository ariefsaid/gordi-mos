#!/usr/bin/env node

import { readFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { REQUIRED_ARTIFACTS, validateArtifactSet } from '../mos-app/e2e/design-quality/report.ts'
import {
  AUTOMATIC_FAILURE_BASELINE_PATH,
  loadTrustedAutomaticFailureBaseline,
  revalidateChangeGateSnapshot,
  serializeAutomaticFailureBaseline,
  validateAutomaticFailureBaselineSource,
  validateAutomaticFailureBaseline,
} from '../mos-app/e2e/design-quality/change-gate.ts'

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
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let session
try {
  session = JSON.parse(await readFile(path.join(evidenceDir, 'session.json'), 'utf8'))
} catch (error) {
  fail(`session.json is missing or invalid: ${String(error)}`)
}
if (!session || typeof session !== 'object' || Array.isArray(session)) {
  fail('session.json must contain an object')
}
const sessionCandidateSha = typeof session.candidateSha === 'string' ? session.candidateSha : ''
const sessionId = typeof session.sessionId === 'string' ? session.sessionId : ''
const baselineOnlyFollowUp = sessionCandidateSha !== expectedSha
if ((baselineOnlyFollowUp && !(requireFinalChangeGate || requireBrowserChangeGate))
  || !/^[0-9a-f]{8}$/.test(sessionId)) {
  fail('session metadata does not match the expected candidate', {
    expectedSha,
    candidateSha: sessionCandidateSha,
    sessionId,
  })
}

// A baseline-only H1 follow-up validates all measured artifacts against the
// bound H0 session. The snapshot revalidator below proves the H0→H1 Git and
// source relationship before this alternate metadata identity is accepted.
const evidenceCandidateSha = baselineOnlyFollowUp ? sessionCandidateSha : expectedSha

const validation = await validateArtifactSet(
  evidenceDir,
  { candidateSha: evidenceCandidateSha, sessionId },
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
const forbiddenBaselineFields = [
  'baselineEvidenceDir', 'baselineCandidateSha', 'baselineSessionId', 'baselineDigest',
]
if ((requireFinalChangeGate || requireBrowserChangeGate) && forbiddenBaselineFields.some((field) => Object.prototype.hasOwnProperty.call(session, field))) {
  changeGateErrors.push('filesystem baseline/session inputs are rejected; change-gate authority is the committed merge-base snapshot')
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(evidenceDir, relativePath), 'utf8'))
}

if (requireFinalChangeGate || requireBrowserChangeGate) {
  if (session.auditMode !== 'change-gate') changeGateErrors.push('evidence was not produced in change-gate mode')
  if (session.browserExitStatus !== 0 || session.fixtureExitStatus !== 0
    || (requireFinalChangeGate && session.chainExitStatus !== 0)) {
    changeGateErrors.push(`change gate is not green (browser=${String(session.browserExitStatus)}, fixture=${String(session.fixtureExitStatus)}, chain=${String(session.chainExitStatus)})`)
  }
  try {
    const summary = await readJson('quantitative-summary.json')
    if (summary.candidateSha !== evidenceCandidateSha || summary.sessionId !== sessionId) changeGateErrors.push('quantitative summary is stale')
    if (summary.auditMode !== 'change-gate' || summary.automaticChecksPassed !== true || !Array.isArray(summary.failures) || summary.failures.length > 0) {
      changeGateErrors.push('quantitative automatic checks did not pass in change-gate mode')
    }
  } catch (error) {
    changeGateErrors.push(`quantitative summary is missing or invalid: ${String(error)}`)
  }

  const verificationBase = typeof session.verificationBase === 'string' && session.verificationBase.trim()
    ? session.verificationBase
    : `origin/${process.env.MOS_PR_BASE || 'dev'}`
  if (requireBrowserChangeGate) {
    const trusted = await loadTrustedAutomaticFailureBaseline({ repoRoot, candidateSha: expectedSha, verificationBase })
    if (!trusted.ok || !trusted.snapshot) {
      changeGateErrors.push(`exact merge-base snapshot is invalid: ${trusted.errors.join('; ')}`)
    } else {
      if (session.mergeBaseSha !== trusted.mergeBaseSha) changeGateErrors.push('session mergeBaseSha does not match the independently resolved merge base')
      if (session.snapshotBlobDigest !== trusted.blobDigest) changeGateErrors.push('session snapshot blob digest is missing or does not match the independently loaded Git blob')
    }
    try {
      const emittedPath = path.join(evidenceDir, path.basename(AUTOMATIC_FAILURE_BASELINE_PATH))
      const emittedRealPath = await realpath(emittedPath)
      if (emittedRealPath !== evidenceDir && !emittedRealPath.startsWith(`${evidenceDir}${path.sep}`)) {
        throw new Error('emitted automatic-failure snapshot escapes the evidence directory')
      }
      if (!declared.has(emittedRealPath)) changeGateErrors.push('session does not declare the emitted automatic-failure snapshot')
      const emittedBytes = await readFile(emittedPath, 'utf8')
      const emitted = JSON.parse(emittedBytes)
      const emittedValidation = validateAutomaticFailureBaseline(emitted)
      if (!emittedValidation.ok) changeGateErrors.push(...emittedValidation.errors.map((error) => `emitted snapshot: ${error}`))
      else {
        changeGateErrors.push(...validateAutomaticFailureBaselineSource(repoRoot, emitted, expectedSha)
          .map((error) => `emitted snapshot: ${error}`))
        if (serializeAutomaticFailureBaseline(emitted) !== emittedBytes) changeGateErrors.push('emitted snapshot is not canonical')
      }
    } catch (error) {
      changeGateErrors.push(`emitted automatic-failure snapshot is missing or invalid: ${String(error)}`)
    }
  }
  if (requireFinalChangeGate || (requireBrowserChangeGate && baselineOnlyFollowUp)) {
    const result = await revalidateChangeGateSnapshot({
      repoRoot,
      evidenceDir,
      candidateSha: expectedSha,
      sessionId,
      verificationBase,
      ...(baselineOnlyFollowUp ? { measuredCandidateSha: evidenceCandidateSha } : {}),
    })
    if (!result.ok) changeGateErrors.push(...result.errors)
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
