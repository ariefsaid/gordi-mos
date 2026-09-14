#!/usr/bin/env node
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'

import { REQUIRED_ARTIFACTS, validateArtifactSet } from '../mos-app/e2e/design-quality/report.ts'

function fail(message, details = {}) {
  process.stdout.write(`${JSON.stringify({ ok: false, errors: [message], ...details })}\n`)
  process.exit(1)
}

const [evidenceArg, expectedSha, ...flags] = process.argv.slice(2)
if (!evidenceArg || !/^[0-9a-f]{40}$/.test(expectedSha || '')) {
  fail('usage: validate-design-evidence.mjs <evidence-dir> <40-char-sha> [--require-green|--require-change-gate]')
}
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
  { allowMockupGaps: flags.includes('--require-change-gate') },
)
const declared = new Set(await Promise.all(
  (Array.isArray(session.quantitativeArtifacts) ? session.quantitativeArtifacts : []).map(async (entry) => {
    if (typeof entry !== 'string') return ''
    try {
      return await realpath(path.resolve(entry))
    } catch {
      return path.resolve(entry)
    }
  }),
))
const declarationErrors = REQUIRED_ARTIFACTS
  .map((artifact) => path.join(evidenceDir, artifact))
  .filter((artifactPath) => !declared.has(artifactPath))
  .map((artifactPath) => `session does not declare ${path.relative(evidenceDir, artifactPath)}`)
const statusErrors = flags.includes('--require-green') && (session.browserExitStatus !== 0 || session.chainExitStatus !== 0)
  ? [`evidence run is not green (browser=${String(session.browserExitStatus)}, chain=${String(session.chainExitStatus)})`]
  : []
const changeGateErrors = []
if (flags.includes('--require-change-gate')) {
  if (session.auditMode !== 'change-gate') changeGateErrors.push('evidence was not produced in change-gate mode')
  if (session.browserExitStatus !== 0 || session.chainExitStatus !== 0) {
    changeGateErrors.push(`change gate is not green (browser=${String(session.browserExitStatus)}, chain=${String(session.chainExitStatus)})`)
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
