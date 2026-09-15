import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  classifyFailureSet,
  validateBaselineBinding,
  type AutomaticFailure,
} from './change-gate.ts'
import { isTextTruncated } from './measurements.ts'

const candidateFailure = (overrides: Partial<AutomaticFailure> = {}): AutomaticFailure => ({
  ruleId: 'content.text-truncation',
  cellId: 'tasks-default-desktop',
  selector: 'main h1',
  state: 'default',
  message: 'text is clipped',
  measured: { scrollWidth: 220, clientWidth: 120 },
  ...overrides,
})

test('change-gate retains inherited failures while exposing only new signatures as blockers', () => {
  const inherited = candidateFailure()
  const introduced = candidateFailure({
    ruleId: 'geometry.horizontal-fit',
    selector: 'main',
    message: 'main overflows',
    measured: { scrollWidth: 401, clientWidth: 390 },
  })

  const result = classifyFailureSet([inherited, introduced], [inherited])

  assert.equal(result.allFailures.length, 2)
  assert.equal(result.inheritedFailures.length, 1)
  assert.equal(result.newFailures.length, 1)
  assert.deepEqual(result.failures, [introduced])
  assert.equal(result.automaticChecksPassed, false)
})

test('change-gate accepts a candidate whose complete failed census is inherited', () => {
  const inherited = candidateFailure()
  const result = classifyFailureSet([inherited], [inherited])

  assert.deepEqual(result.failures, [])
  assert.equal(result.automaticChecksPassed, true)
  assert.deepEqual(result.inheritedFailures, [inherited])
})

test('a missing base identity is a new regression and MVP mode stays strict without a baseline', () => {
  const failure = candidateFailure({ ruleId: 'controls.variant-consistency', selector: 'main button' })
  const missingBaseRow = classifyFailureSet([failure], [])
  assert.deepEqual(missingBaseRow.failures, [failure])
  assert.equal(missingBaseRow.automaticChecksPassed, false)

  // No baseline is the strict backward-compatible contract: an existing
  // failure cannot be silently treated as inherited.
  const strictMvp = classifyFailureSet([failure], [])
  assert.equal(strictMvp.failures.length, 1)
  assert.equal(strictMvp.automaticChecksPassed, false)
})

test('baseline binding rejects a missing, stale, or malformed exact-base session', () => {
  const expectedSha = 'a'.repeat(40)
  assert.equal(validateBaselineBinding(null, expectedSha).ok, false)
  assert.match(validateBaselineBinding(null, expectedSha).errors.join('\n'), /missing|invalid/i)

  const stale = validateBaselineBinding({ candidateSha: 'b'.repeat(40), sessionId: 'a1b2c3d4' }, expectedSha)
  assert.equal(stale.ok, false)
  assert.match(stale.errors.join('\n'), /merge-base|candidate/i)

  const malformed = validateBaselineBinding({ candidateSha: expectedSha }, expectedSha)
  assert.equal(malformed.ok, false)
  assert.match(malformed.errors.join('\n'), /session/i)
})

test('baseline binding rejects an unreadable or tampered artifact metadata record', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-change-gate-baseline-'))
  const expectedSha = 'a'.repeat(40)
  await writeFile(path.join(outputDir, 'session.json'), JSON.stringify({
    candidateSha: expectedSha,
    sessionId: 'a1b2c3d4',
    quantitativeArtifacts: [path.join(outputDir, 'visible-content.csv')],
  }))
  await writeFile(path.join(outputDir, 'visible-content.csv'), '# candidate_sha=bbbb\n# session_id=a1b2c3d4\n')

  const result = await import('./change-gate.ts').then(({ loadChangeGateBaseline }) =>
    loadChangeGateBaseline(outputDir, expectedSha))
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /metadata|stale|invalid/i)
})

test('fitting ellipsis is not truncation while clipped ellipsis remains a failure', () => {
  assert.equal(isTextTruncated({
    scrollWidth: 120,
    clientWidth: 120,
    scrollHeight: 24,
    clientHeight: 24,
    lineClamp: 'none',
    textOverflow: 'ellipsis',
  }), false)
  assert.equal(isTextTruncated({
    scrollWidth: 240,
    clientWidth: 120,
    scrollHeight: 24,
    clientHeight: 24,
    lineClamp: 'none',
    textOverflow: 'ellipsis',
  }), true)
})
