import assert from 'node:assert/strict'
import test from 'node:test'

import { validateMockupStatus } from './report.ts'

const envelope = (comparisons: unknown[], overrides: Record<string, unknown> = {}) => ({
  complete: true,
  count: comparisons.length,
  digest: 'a'.repeat(64),
  comparisons,
  ...overrides,
})

const failedComparison = (overrides: Record<string, unknown> = {}) => ({
  mockup: '/primary/docs/mockups/tasks.png',
  build: '/tmp/tasks.png',
  authority: 'DD-MVP-21',
  cellId: 'tasks-default-desktop',
  score: 0.91,
  requiredRegions: ['toolbar'],
  missingRegions: [],
  contradictedRegions: ['toolbar'],
  status: 'fail',
  reason: 'required region contradicted',
  ...overrides,
})

test('historical mismatches remain valid diagnostic evidence without a gate waiver', () => {
  const result = validateMockupStatus(envelope([failedComparison()], {
    status: 'diagnostic',
    diagnosticStatus: 'complete',
  }))

  assert.equal(result.ok, true, result.reason)
})

test('blocked historical comparisons are recorded as incomplete diagnostics', () => {
  const result = validateMockupStatus(envelope([failedComparison({
    build: '',
    score: null,
    status: 'blocked',
    reason: 'authority image is unavailable',
  })], {
    status: 'diagnostic',
    diagnosticStatus: 'incomplete',
  }))

  assert.equal(result.ok, true, result.reason)
})

test('diagnostic status cannot hide a blocked comparison or claim an incomplete run is complete', () => {
  const blocked = failedComparison({ build: '', score: null, status: 'blocked' })
  const complete = validateMockupStatus(envelope([blocked], {
    status: 'diagnostic',
    diagnosticStatus: 'complete',
  }))
  assert.equal(complete.ok, false)

  const incomplete = validateMockupStatus(envelope([failedComparison()], {
    status: 'diagnostic',
    diagnosticStatus: 'incomplete',
  }))
  assert.equal(incomplete.ok, false)
})

test('a pass comparison still has to satisfy the score and region contract', () => {
  const result = validateMockupStatus(envelope([failedComparison({
    status: 'pass',
    score: 0.7,
    contradictedRegions: [],
  })], {
    status: 'diagnostic',
    diagnosticStatus: 'complete',
  }))

  assert.equal(result.ok, false)
  assert.match(result.reason ?? '', /pass comparison|0\.75|region/i)
})
