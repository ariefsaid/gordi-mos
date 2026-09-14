import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DESIGN_QUALITY_MANIFEST,
  manifestForArtifact,
  REQUIRED_DIMENSIONS,
  REQUIRED_RULE_FIELDS,
  validateManifest,
  validateManifestReadiness,
} from './manifest.ts'
import {
  REQUIRED_ARTIFACTS,
  ReportWriter,
  validateArtifactSet,
} from './report.ts'
import { MUTATION_FIXTURES, evaluateMutationFixture } from './measurements.ts'

test('the design manifest covers every required dimension and declares complete rules', () => {
  const result = validateManifest(DESIGN_QUALITY_MANIFEST)

  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.deepEqual(Object.keys(DESIGN_QUALITY_MANIFEST.dimensions), REQUIRED_DIMENSIONS)
  for (const rule of DESIGN_QUALITY_MANIFEST.rules) {
    for (const field of REQUIRED_RULE_FIELDS) {
      assert.ok(rule[field], `${rule.id} is missing ${field}`)
    }
  }
})

test('a required blocked or untested cell fails readiness while authority-backed not-applicable passes', () => {
  const baseline = structuredClone(DESIGN_QUALITY_MANIFEST)
  baseline.cells = baseline.cells.map((cell) => ({
    ...cell,
    status: 'not-applicable',
    authority: 'DD-MVP-12',
  }))

  const blocked = structuredClone(baseline)
  blocked.cells[0]!.status = 'blocked'
  blocked.cells[0]!.note = 'fixture intentionally unavailable'
  const blockedResult = validateManifestReadiness(blocked)
  assert.equal(blockedResult.ok, false)
  assert.match(blockedResult.errors.join('\n'), /blocked/i)

  const untested = structuredClone(baseline)
  untested.cells[0]!.status = 'untested'
  untested.cells[0]!.note = 'state setup intentionally absent'
  const untestedResult = validateManifestReadiness(untested)
  assert.equal(untestedResult.ok, false)
  assert.match(untestedResult.errors.join('\n'), /untested/i)

  const notApplicableResult = validateManifestReadiness(baseline)
  assert.equal(notApplicableResult.ok, true, notApplicableResult.errors.join('\n'))
})

test('the report writer emits stable, candidate-bound JSON and CSV artifacts', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-design-quality-'))
  const writer = new ReportWriter({
    outputDir,
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
  })

  await writer.writeJson('manifest.json', { cells: [] })
  await writer.writeCsv('geometry.csv', [
    { route: '/mos/work/tasks', width: '390', overflow: '0' },
  ])
  const validation = await validateArtifactSet(outputDir, {
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
  })

  assert.equal(validation.ok, false)
  assert.ok(REQUIRED_ARTIFACTS.some((name) => validation.missing.includes(name)))

  const manifest = JSON.parse(await readFile(path.join(outputDir, 'manifest.json'), 'utf8')) as Record<string, unknown>
  assert.equal(manifest.candidateSha, 'a'.repeat(40))
  assert.equal(manifest.sessionId, 'a1b2c3d4')
  assert.match(await readFile(path.join(outputDir, 'geometry.csv'), 'utf8'), /^# candidate_sha=a{40}\n# session_id=a1b2c3d4\n/)
})

test('manifestForArtifact binds the shared manifest to the runner metadata', () => {
  const artifact = manifestForArtifact('a'.repeat(40), 'a1b2c3d4')
  assert.equal(artifact.candidateSha, 'a'.repeat(40))
  assert.equal(artifact.sessionId, 'a1b2c3d4')
  assert.equal(artifact.cells.length, DESIGN_QUALITY_MANIFEST.cells.length)
})

test('each planted fixture defect makes its owning rule fail with the expected rule id', () => {
  const expectedRules = [
    'contrast.body',
    'touch.phone-target',
    'geometry.horizontal-fit',
    'actions.primary',
    'structure.nested-cards',
    'structure.heading-outline',
    'a11y.accessible-name',
  ]
  assert.deepEqual(MUTATION_FIXTURES.map((fixture) => fixture.ruleId), expectedRules)
  for (const fixture of MUTATION_FIXTURES) {
    const result = evaluateMutationFixture(fixture)
    assert.equal(result.ruleId, fixture.ruleId)
    assert.equal(result.passed, false, `${fixture.ruleId} mutation was not detected`)
  }
})
