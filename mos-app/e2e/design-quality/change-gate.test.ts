import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  AUTOMATIC_FAILURE_BASELINE_PATH,
  classifyFailureSet,
  createAutomaticFailureBaseline,
  digestAutomaticFailureLane,
  digestAutomaticFailureBaseline,
  loadTrustedAutomaticFailureBaseline,
  produceAutomaticFailureBaseline,
  revalidateChangeGateSnapshot,
  serializeAutomaticFailureBaseline,
  validateAutomaticFailureBaseline,
  validateBaselineBinding,
  type AutomaticFailure,
  type AutomaticFailureBaselineProducerOptions,
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

const baselineSnapshot = (overrides: Record<string, unknown> = {}) => ({
  kind: 'mos.design-quality.automatic-failure-baseline',
  version: 1,
  source: {
    productSha: 'a'.repeat(40),
    harnessSha: 'b'.repeat(40),
    sessionId: 'a1b2c3d4',
    manifestDigest: 'c'.repeat(64),
  },
  failures: [{ ruleId: 'content.text-truncation', cellId: 'tasks-default-desktop', selector: 'main h1', state: 'default' }],
  untestedCellIds: ['tasks-empty-phone'],
  lanes: {
    quantitative: { complete: true, count: 1, digest: '1'.repeat(64) },
    controlConsistency: { complete: true, count: 1, digest: '2'.repeat(64) },
    contrast: { complete: true, count: 1, digest: '3'.repeat(64) },
    antiSlop: { complete: true, count: 1, digest: '4'.repeat(64) },
    axe: { complete: true, count: 1, digest: '5'.repeat(64) },
    mockup: { complete: true, count: 1, digest: '6'.repeat(64) },
  },
  digest: '0'.repeat(64),
  ...overrides,
})

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

const followupArtifactNames = [
  'contrast.csv',
  'geometry.csv',
  'number-census.csv',
  'control-census.csv',
  'control-consistency.csv',
  'state-matrix.csv',
  'affordance-census.csv',
  'copy-census.csv',
  'visible-content.csv',
] as const

type FollowupFixture = {
  repo: string
  evidenceDir: string
  baseSha: string
  measuredSha: string
  candidateSha: string
  sessionId: string
}

async function createBaselineOnlyFollowup(extraPath = ''): Promise<FollowupFixture> {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'mos-change-gate-followup-repo-'))
  git(repo, 'init', '-q')
  git(repo, 'config', 'user.email', 'test@example.invalid')
  git(repo, 'config', 'user.name', 'test')
  await mkdir(path.join(repo, 'mos-app/src'), { recursive: true })
  await mkdir(path.join(repo, 'mos-app/e2e/design-quality'), { recursive: true })
  await writeFile(path.join(repo, 'mos-app/src/product.ts'), 'product\n')
  await writeFile(path.join(repo, 'mos-app/e2e/design-quality/manifest.ts'), 'manifest\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'product')
  const productSha = git(repo, 'rev-parse', 'HEAD')

  const trustedBytes = canonicalSnapshotWithDigest(baselineSnapshot({
    source: {
      productSha,
      harnessSha: productSha,
      sessionId: 'a1b2c3d4',
      manifestDigest: createHash('sha256').update('manifest\n').digest('hex'),
    },
    failures: [
      { ruleId: 'content.text-truncation', cellId: 'tasks-default-desktop', selector: 'main h1', state: 'default' },
      { ruleId: 'state.coverage', cellId: 'tasks-empty-phone', selector: '__state__', state: 'default' },
    ],
    untestedCellIds: ['tasks-empty-phone'],
  }) as Record<string, unknown>)
  const trustedPath = path.join(repo, AUTOMATIC_FAILURE_BASELINE_PATH)
  await mkdir(path.dirname(trustedPath), { recursive: true })
  await writeFile(trustedPath, serializeAutomaticFailureBaseline(trustedBytes as never))
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'trusted baseline')
  const baseSha = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'update-ref', 'refs/remotes/origin/dev', baseSha)

  await writeFile(path.join(repo, 'mos-app/e2e/design-quality/change-gate.ts'), 'harness\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'implementation')
  const measuredSha = git(repo, 'rev-parse', 'HEAD')
  const sessionId = 'b2c3d4e5'
  const evidenceDir = await mkdtemp(path.join(os.tmpdir(), 'mos-change-gate-followup-evidence-'))
  const cell = {
    id: 'tasks-default-desktop',
    area: 'tasks',
    journey: 'tasks-create',
    route: '/mos/work/tasks',
    fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900',
    theme: 'light',
    language: 'en',
    state: 'default',
    status: 'covered',
    stateContract: { setup: [], assertion: { selector: 'main' } },
  }
  const untestedCell = {
    id: 'tasks-empty-phone',
    area: cell.area,
    journey: cell.journey,
    route: cell.route,
    fixture: cell.fixture,
    viewport: 'phone-390x844',
    theme: cell.theme,
    language: cell.language,
    state: cell.state,
    status: 'untested',
  }
  await writeFile(path.join(evidenceDir, 'manifest.json'), JSON.stringify({
    candidateSha: measuredSha,
    sessionId,
    cells: [cell, untestedCell],
  }))
  const laneValues: Record<string, Record<string, unknown>> = {
    'quantitative-summary.json': { geometryRows: 1, visibleContentRows: 1, count: 2 },
    'control-consistency-summary.json': { rows: 1, count: 1 },
    'contrast-summary.json': { rows: 1, count: 1 },
    'anti-slop-summary.json': { cells: 1, count: 1 },
    'axe-summary.json': { scans: 1, count: 1 },
    'mockup-diff/status.json': {
      status: 'pass',
      comparisons: [{ cellId: cell.id, status: 'pass', score: 1, build: 'x', missingRegions: [], contradictedRegions: [] }],
      count: 1,
    },
  }
  const summary = (values: Record<string, unknown>) => {
    const payload = {
      candidateSha: measuredSha,
      sessionId,
      auditMode: 'change-gate',
      automaticChecksPassed: true,
      complete: true,
      failures: [],
      allFailures: [],
      inheritedFailures: [],
      newFailures: [],
      ...values,
    }
    return { ...payload, digest: digestAutomaticFailureLane(payload) }
  }
  for (const [name, values] of Object.entries(laneValues)) {
    const target = path.join(evidenceDir, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, JSON.stringify(summary(values)))
  }
  await writeFile(path.join(evidenceDir, 'fixture-receipt.json'), JSON.stringify({
    candidateSha: measuredSha,
    sessionId,
    created: [],
    ownedAuthUsers: [],
    sentinels: [],
  }))
  await writeFile(path.join(evidenceDir, 'gate-log.txt'), `candidate_sha=${measuredSha}\nsession_id=${sessionId}\nbrowser_status=0\n`)
  for (const name of followupArtifactNames) {
    const row = name === 'visible-content.csv'
      ? `${cell.id},text-truncation,main h1,default,false\n`
      : `${cell.id},true\n`
    const header = name === 'visible-content.csv' ? 'cellId,kind,selector,state,passed' : 'cellId,passed'
    await writeFile(path.join(evidenceDir, name), `# candidate_sha=${measuredSha}\n# session_id=${sessionId}\n${header}\n${row}`)
  }
  await writeFile(path.join(evidenceDir, 'impeccable.json'), JSON.stringify(summary({ status: 'pass', scannedFiles: ['src/App.tsx'], findings: [] })))

  const trusted = await loadTrustedAutomaticFailureBaseline({ repoRoot: repo, candidateSha: measuredSha, verificationBase: 'origin/dev' })
  assert.equal(trusted.ok, true, trusted.errors.join('; '))
  const produced = await produceAutomaticFailureBaseline({
    evidenceDir,
    sourceProductSha: measuredSha,
    sourceHarnessSha: measuredSha,
    sourceSessionId: sessionId,
    repoRoot: repo,
    previousSnapshot: trusted.snapshot,
  })
  assert.equal(produced.ok, true, produced.errors.join('; '))
  assert.equal(produced.snapshot?.source.productSha, measuredSha)
  await writeFile(path.join(evidenceDir, 'session.json'), JSON.stringify({
    auditId: sessionId,
    sessionId,
    candidateSha: measuredSha,
    auditMode: 'change-gate',
    verificationBase: 'origin/dev',
    mergeBaseSha: baseSha,
    snapshotBlobDigest: createHash('sha256').update(gitBlobForTest(repo, baseSha, AUTOMATIC_FAILURE_BASELINE_PATH)).digest('hex'),
    quantitativeArtifacts: [],
  }))

  await writeFile(trustedPath, produced.bytes!)
  if (extraPath) {
    const extraTarget = path.join(repo, extraPath)
    await mkdir(path.dirname(extraTarget), { recursive: true })
    await writeFile(extraTarget, 'unexpected H1 change\n')
  }
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'baseline-only follow-up')
  const candidateSha = git(repo, 'rev-parse', 'HEAD')
  return { repo, evidenceDir, baseSha, measuredSha, candidateSha, sessionId }
}

function gitBlobForTest(repo: string, revision: string, relativePath: string): Buffer {
  return execFileSync('git', ['show', `${revision}:${relativePath}`], { cwd: repo, encoding: 'buffer' }) as Buffer
}

function canonicalSnapshotWithDigest(snapshot: Record<string, unknown>): Record<string, unknown> {
  const withoutDigest = { ...snapshot }
  delete withoutDigest.digest
  return { ...snapshot, digest: digestAutomaticFailureBaseline(withoutDigest) }
}

test('trusted loader reads only the exact merge-base Git blob', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'mos-change-gate-git-'))
  git(repo, 'init', '-q')
  git(repo, 'config', 'user.email', 'test@example.invalid')
  git(repo, 'config', 'user.name', 'test')
  await mkdir(path.join(repo, 'mos-app/src'), { recursive: true })
  await writeFile(path.join(repo, 'mos-app/src/product.ts'), 'base\n')
  await mkdir(path.join(repo, 'mos-app/e2e/design-quality'), { recursive: true })
  await writeFile(path.join(repo, 'mos-app/e2e/design-quality/manifest.ts'), 'manifest\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'product')
  const productSha = git(repo, 'rev-parse', 'HEAD')
  const source = baselineSnapshot({
    source: {
      productSha,
      harnessSha: productSha,
      sessionId: 'a1b2c3d4',
      manifestDigest: createHash('sha256').update('manifest\n').digest('hex'),
    },
  })
  const valid = canonicalSnapshotWithDigest(source as Record<string, unknown>)
  const fixedPath = path.join(repo, AUTOMATIC_FAILURE_BASELINE_PATH)
  await mkdir(path.dirname(fixedPath), { recursive: true })
  await writeFile(fixedPath, serializeAutomaticFailureBaseline(valid as never))
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'reviewed automatic baseline')
  const baseSha = git(repo, 'rev-parse', 'HEAD')
  await writeFile(path.join(repo, 'mos-app/src/product.ts'), 'candidate\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'candidate')
  const candidateSha = git(repo, 'rev-parse', 'HEAD')
  git(repo, 'update-ref', 'refs/remotes/origin/dev', baseSha)

  // A poisoned working-tree copy and an unrelated baseline directory must not be read.
  await writeFile(fixedPath, JSON.stringify({ ...valid, failures: [] }))
  const poisonedDir = path.join(repo, 'forged-baseline')
  await mkdir(poisonedDir)
  await writeFile(path.join(poisonedDir, 'session.json'), JSON.stringify({ failures: [] }))

  const result = await loadTrustedAutomaticFailureBaseline({ repoRoot: repo, candidateSha, verificationBase: 'origin/dev' })
  assert.equal(result.ok, true, result.errors.join('; '))
  assert.deepEqual(result.snapshot?.failures, valid.failures)
  assert.equal(result.mergeBaseSha, baseSha)
})

test('snapshot validation fails closed for missing, malformed, stale, and tampered source records', () => {
  const valid = canonicalSnapshotWithDigest(baselineSnapshot() as Record<string, unknown>)
  assert.equal(validateAutomaticFailureBaseline(valid).ok, true)
  for (const mutation of [
    { kind: 'other' },
    { version: 2 },
    { source: { ...(valid.source as object), productSha: 'd'.repeat(40) } },
    { source: { ...(valid.source as object), sessionId: 'bad' } },
    { digest: 'e'.repeat(64) },
    { lanes: { ...(valid.lanes as object), axe: { complete: false, count: 1, digest: '5'.repeat(64) } } },
  ]) {
    const candidate = { ...valid, ...mutation }
    assert.equal(validateAutomaticFailureBaseline(candidate).ok, false, JSON.stringify(mutation))
  }
})

test('snapshot serialization is canonical and retains sorted identity failures and untested IDs', () => {
  const input = baselineSnapshot({
    failures: [
      { ruleId: 'z', cellId: 'b', selector: 's', state: 'default', message: 'discarded' },
      { ruleId: 'a', cellId: 'a', selector: 's', state: 'hover', measured: { noisy: true } },
    ],
    untestedCellIds: ['z', 'a'],
  }) as Record<string, unknown>
  const canonical = createAutomaticFailureBaseline(input)
  assert.deepEqual(canonical.failures, [
    { ruleId: 'a', cellId: 'a', selector: 's', state: 'hover' },
    { ruleId: 'z', cellId: 'b', selector: 's', state: 'default' },
  ])
  assert.deepEqual(canonical.untestedCellIds, ['a', 'z'])
  assert.equal(canonical.digest, digestAutomaticFailureBaseline({ ...canonical, digest: undefined } as never))
  assert.equal(serializeAutomaticFailureBaseline(canonical as never), serializeAutomaticFailureBaseline(canonical as never))
})

test('operator producer is deterministic and rejects missing or incomplete lanes', async () => {
  const evidenceDir = await mkdtemp(path.join(os.tmpdir(), 'mos-change-gate-evidence-'))
  const candidateSha = 'a'.repeat(40)
  const sourceProductSha = 'b'.repeat(40)
  const sessionId = 'a1b2c3d4'
  const cell = (id: string, status: string) => ({
    id,
    area: 'tasks',
    journey: 'tasks-create',
    route: '/mos/work/tasks',
    fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900',
    theme: 'light',
    language: 'en',
    state: 'default',
    status,
    ...(status === 'covered' ? { stateContract: { setup: [], assertion: { selector: 'main' } } } : {}),
  })
  await writeFile(path.join(evidenceDir, 'manifest.json'), JSON.stringify({
    candidateSha,
    sessionId,
    cells: [cell('z', 'untested'), cell('a', 'covered')],
  }))
  const laneValues: Record<string, Record<string, unknown>> = {
    'quantitative-summary.json': { geometryRows: 1, visibleContentRows: 1, count: 2 },
    'control-consistency-summary.json': { rows: 1, count: 1 },
    'contrast-summary.json': { rows: 1, count: 1 },
    'anti-slop-summary.json': { cells: 1, count: 1 },
    'axe-summary.json': { scans: 1, count: 1 },
    'mockup-diff/status.json': { status: 'pass', comparisons: [{ cellId: 'a', status: 'pass', score: 1, build: 'x', missingRegions: [], contradictedRegions: [] }], count: 1 },
  }
  const summary = (values: Record<string, unknown>) => {
    const payload = { candidateSha, sessionId, auditMode: 'change-gate', automaticChecksPassed: true, complete: true, failures: [], allFailures: [], inheritedFailures: [], newFailures: [], ...values }
    return { ...payload, digest: digestAutomaticFailureLane(payload) }
  }
  for (const [name, values] of Object.entries(laneValues)) {
    const target = path.join(evidenceDir, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, JSON.stringify(summary(values)))
  }
  await writeFile(path.join(evidenceDir, 'fixture-receipt.json'), JSON.stringify({ candidateSha, sessionId, created: [], ownedAuthUsers: [], sentinels: [] }))
  await writeFile(path.join(evidenceDir, 'gate-log.txt'), `candidate_sha=${candidateSha}\nsession_id=${sessionId}\nbrowser_status=0\n`)
  for (const name of ['contrast.csv', 'geometry.csv', 'number-census.csv', 'control-census.csv', 'control-consistency.csv', 'state-matrix.csv', 'affordance-census.csv', 'copy-census.csv', 'visible-content.csv']) {
    await writeFile(path.join(evidenceDir, name), `# candidate_sha=${candidateSha}\n# session_id=${sessionId}\ncellId,passed\na,true\n`)
  }
  const impeccable = summary({ status: 'pass', scannedFiles: ['src/App.tsx'], findings: [] })
  await writeFile(path.join(evidenceDir, 'impeccable.json'), JSON.stringify(impeccable))
  const options: AutomaticFailureBaselineProducerOptions = { evidenceDir, sourceProductSha, sourceHarnessSha: candidateSha, sourceSessionId: sessionId }
  const first = await createAutomaticFailureBaseline(options)
  const second = await createAutomaticFailureBaseline(options)
  assert.equal(first.ok, true, first.errors.join('; '))
  assert.equal(second.ok, true, second.errors.join('; '))
  assert.equal(first.bytes, second.bytes)
  assert.equal(first.snapshot?.source.productSha, sourceProductSha)
  assert.equal(first.snapshot?.source.harnessSha, candidateSha)
  assert.deepEqual(first.snapshot?.untestedCellIds, ['z'])

  const originalVisible = await readFile(path.join(evidenceDir, 'visible-content.csv'), 'utf8')
  await writeFile(path.join(evidenceDir, 'visible-content.csv'), originalVisible.replace('a,true', 'a,false'))
  const changed = await createAutomaticFailureBaseline({ ...options, previousSnapshot: first.snapshot })
  assert.equal(changed.ok, true, changed.errors.join('; '))
  assert.notEqual(changed.bytes, first.bytes)
  await writeFile(path.join(evidenceDir, 'visible-content.csv'), originalVisible)

  for (const name of Object.keys(laneValues)) {
    const target = path.join(evidenceDir, name)
    const original = await readFile(target, 'utf8')
    await rm(target)
    const missing = await produceAutomaticFailureBaseline(options)
    assert.equal(missing.ok, false, `${name} missing lane was accepted`)
    assert.match(missing.errors.join('\n'), new RegExp(name.split('/').pop()!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
    await writeFile(target, '{}')
    const incomplete = await produceAutomaticFailureBaseline(options)
    assert.equal(incomplete.ok, false, `${name} incomplete lane was accepted`)
    assert.match(incomplete.errors.join('\n'), new RegExp(name.split('/').pop()!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
    await writeFile(target, original)
  }
})

test('operator bootstrap rejects a harness commit that changed the product tree', async () => {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'mos-change-gate-bootstrap-'))
  const evidenceDir = await mkdtemp(path.join(os.tmpdir(), 'mos-change-gate-bootstrap-evidence-'))
  git(repo, 'init', '-q')
  git(repo, 'config', 'user.email', 'test@example.invalid')
  git(repo, 'config', 'user.name', 'test')
  await mkdir(path.join(repo, 'mos-app/src'), { recursive: true })
  await mkdir(path.join(repo, 'mos-app/e2e/design-quality'), { recursive: true })
  await writeFile(path.join(repo, 'mos-app/src/product.ts'), 'base\n')
  await writeFile(path.join(repo, 'mos-app/e2e/design-quality/manifest.ts'), 'manifest\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'product')
  const productSha = git(repo, 'rev-parse', 'HEAD')
  await writeFile(path.join(repo, 'mos-app/src/product.ts'), 'changed\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'changed product')
  const harnessSha = git(repo, 'rev-parse', 'HEAD')
  const result = await produceAutomaticFailureBaseline({
    evidenceDir,
    sourceProductSha: productSha,
    sourceHarnessSha: harnessSha,
    sourceSessionId: 'a1b2c3d4',
    repoRoot: repo,
  })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /product tree|bootstrap/i)
})

test('H0 evidence is accepted by the sole H1 baseline-only follow-up', async () => {
  const fixture = await createBaselineOnlyFollowup()
  const result = await revalidateChangeGateSnapshot({
    repoRoot: fixture.repo,
    evidenceDir: fixture.evidenceDir,
    candidateSha: fixture.candidateSha,
    sessionId: fixture.sessionId,
    verificationBase: 'origin/dev',
  })
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.equal(result.mergeBaseSha, fixture.baseSha)
})

test('baseline-only follow-up rejects any additional product or harness path change', async () => {
  for (const extraPath of ['mos-app/src/product.ts', 'mos-app/e2e/design-quality/extra-harness.ts']) {
    const fixture = await createBaselineOnlyFollowup(extraPath)
    const result = await revalidateChangeGateSnapshot({
      repoRoot: fixture.repo,
      evidenceDir: fixture.evidenceDir,
      candidateSha: fixture.candidateSha,
      sessionId: fixture.sessionId,
      verificationBase: 'origin/dev',
    })
    assert.equal(result.ok, false, `${extraPath} was accepted`)
    assert.match(result.errors.join('\n'), /baseline-only|snapshot-only|path|diff/i)
  }
})

test('baseline-only follow-up rejects stale H0 session binding and tampered or missing evidence', async () => {
  const stale = await createBaselineOnlyFollowup()
  await writeFile(path.join(stale.evidenceDir, 'session.json'), JSON.stringify({
    candidateSha: stale.baseSha,
    sessionId: stale.sessionId,
    auditMode: 'change-gate',
    verificationBase: 'origin/dev',
    mergeBaseSha: stale.baseSha,
    snapshotBlobDigest: createHash('sha256').update(gitBlobForTest(stale.repo, stale.baseSha, AUTOMATIC_FAILURE_BASELINE_PATH)).digest('hex'),
  }))
  const staleResult = await revalidateChangeGateSnapshot({
    repoRoot: stale.repo,
    evidenceDir: stale.evidenceDir,
    candidateSha: stale.candidateSha,
    sessionId: stale.sessionId,
    verificationBase: 'origin/dev',
  })
  assert.equal(staleResult.ok, false)
  assert.match(staleResult.errors.join('\n'), /H0|source|session|candidate|stale/i)

  const tampered = await createBaselineOnlyFollowup()
  const emittedPath = path.join(tampered.evidenceDir, 'automatic-failure-baseline.json')
  await writeFile(emittedPath, `${await readFile(emittedPath, 'utf8')} `)
  const tamperedResult = await revalidateChangeGateSnapshot({
    repoRoot: tampered.repo,
    evidenceDir: tampered.evidenceDir,
    candidateSha: tampered.candidateSha,
    sessionId: tampered.sessionId,
    verificationBase: 'origin/dev',
  })
  assert.equal(tamperedResult.ok, false)
  assert.match(tamperedResult.errors.join('\n'), /canonical|byte-match|tamper/i)

  const missing = await createBaselineOnlyFollowup()
  await rm(path.join(missing.evidenceDir, 'visible-content.csv'))
  const missingResult = await revalidateChangeGateSnapshot({
    repoRoot: missing.repo,
    evidenceDir: missing.evidenceDir,
    candidateSha: missing.candidateSha,
    sessionId: missing.sessionId,
    verificationBase: 'origin/dev',
  })
  assert.equal(missingResult.ok, false)
  assert.match(missingResult.errors.join('\n'), /missing|visible-content/i)
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
