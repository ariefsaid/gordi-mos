/* eslint-disable no-restricted-syntax -- candidate artifact fixtures model literal browser-computed colors. */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  DESIGN_QUALITY_MANIFEST,
  isManifestCellRunnable,
  manifestForArtifact,
  REQUIRED_DIMENSIONS,
  REQUIRED_RULE_FIELDS,
  validateManifest,
  validateManifestReadiness,
} from './manifest.ts'
import {
  APPROVED_MVP_COMPARISONS,
  FROZEN_MVP_CELL_IDS,
  FROZEN_MVP_CELL_IDS_SHA256,
} from './baseline-contract.ts'
import {
  REQUIRED_ARTIFACTS,
  ReportWriter,
  meaningfulCsv,
  validateMockupStatus,
  validateArtifactSet,
  validateVisibleContentCsv,
} from './report.ts'
import { MUTATION_FIXTURES, evaluateMutationFixture, parseCssColor } from './measurements.ts'
import {
  assertAuditFixtureWritePolicy,
  type AuditFixtureReceipt,
} from './audit-fixtures.ts'
import {
  AuditProvisioner,
  assertAuditOwnedCleanupSql,
  auditFixtureReceiptBinding,
  cleanupAuditFixtureReceipt,
  createLocalAuditAuthClient,
  createLocalAuditSqlClient,
  emptyAuditFixtureReceipt,
  validateAuditFixtureReceipt,
  validateAuditFixtureProvisionedReceipt,
} from './audit-provisioner.ts'
import { resetAuditScroll } from './scroll.ts'

const testBindingSecret = 'fixture-binding-secret-for-manifest-tests'

test('a full-value reveal may not point at a page-level container', () => {
  // The driver proves a reveal by finding the expected string inside it, and textContent does not
  // know about clipping — so any ancestor of the clipped element already contains it. A reveal of
  // `main` or `body` would exempt every truncation on the page while looking exercised. The driver
  // cannot tell the difference; this is the only thing that can.
  for (const reveal of ['main', 'body', '[role="main"]', '#root']) {
    const result = validateManifest({
      ...DESIGN_QUALITY_MANIFEST,
      lists: {
        ...DESIGN_QUALITY_MANIFEST.lists,
        fullValuePaths: [{
          selector: '.some-clipped-value',
          authority: 'test',
          reveal: { action: 'click' as const, selector: reveal },
        }],
      },
    })
    assert.equal(result.ok, false, `a reveal into ${reveal} must be refused`)
    assert.ok(
      result.errors.some((error) => error.includes('page-level container')),
      `a reveal into ${reveal} must say why: ${result.errors.join(' | ')}`,
    )
  }

  // The hole an independent review found: exempting anything that merely CONTAINED a class or
  // attribute meant `main .composer` named a page-level root and walked straight through the
  // guard built to stop exactly that. A reveal must carry the entry's own leading scope.
  for (const reveal of ['main .composer', 'body p.value', '[role="main"] .toolbar', '.some-other-field .menu']) {
    const result = validateManifest({
      ...DESIGN_QUALITY_MANIFEST,
      lists: {
        ...DESIGN_QUALITY_MANIFEST.lists,
        fullValuePaths: [{
          selector: "[data-filter-id='status'] .collection-toolbar__choice-value",
          authority: 'test',
          reveal: { action: 'click' as const, selector: reveal },
        }],
      },
    })
    assert.equal(result.ok, false, `a reveal of ${reveal} escapes the entry's own scope and must be refused`)
  }

  // And the real entry, which reveals into its own field's popover, must still be accepted.
  assert.ok(validateManifest(DESIGN_QUALITY_MANIFEST).ok, 'the shipped manifest stays valid')
})

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

test('the manifest declares the bounded-choice and control-consistency contract', () => {
  assert.equal(DESIGN_QUALITY_MANIFEST.version, '1.1.0')
  const ruleIds = new Set(DESIGN_QUALITY_MANIFEST.rules.map((rule) => rule.id))
  for (const ruleId of [
    'controls.native-select',
    'controls.bounded-choice-lifecycle',
    'controls.popup-containment',
    'controls.bounded-choice-contrast',
    'controls.variant-classification',
    'controls.variant-consistency',
  ]) assert.ok(ruleIds.has(ruleId), `missing control rule ${ruleId}`)
  assert.deepEqual(DESIGN_QUALITY_MANIFEST.lists.nativeSelectExceptions, [])

  const missingExceptions = structuredClone(DESIGN_QUALITY_MANIFEST)
  delete (missingExceptions.lists as Partial<typeof missingExceptions.lists>).nativeSelectExceptions
  const result = validateManifest(missingExceptions)
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /nativeSelectExceptions/)
})

test('the MVP cell and approved comparison populations are frozen', () => {
  const ids = DESIGN_QUALITY_MANIFEST.cells.map((cell) => cell.id).sort()
  const digest = createHash('sha256').update(`${ids.join('\n')}\n`).digest('hex')

  assert.equal(ids.length, 55)
  assert.deepEqual(ids, [...FROZEN_MVP_CELL_IDS])
  assert.equal(digest, FROZEN_MVP_CELL_IDS_SHA256)
  assert.equal(APPROVED_MVP_COMPARISONS.length, 5)
  assert.deepEqual(
    APPROVED_MVP_COMPARISONS.map((entry) => entry.sha256),
    [
      '030c2d84c7bf15086bcf6e4cdfa7d577c9f55e9c1811389c6e124ea2dc6943af',
      '3ae431c67ebf19f13ecad5cbd3f74dba13c530f78fe1cb64d4b8912676c5ede1',
      '23fa138616229ae0c43427097647b2ddcfa4d1eacf1c442d35383ccf4afd65c4',
      'f5263feab91d8e63fa612adbd9a501ab52cdd67b07f985f3e77760735dab46e9',
      '6fee9a716aa294e164b2f4ed49edc5d74986a8303f1804c3533a47a422307058',
    ],
  )
})

test('non-default cells require positive and negative state-specific evidence', () => {
  const generic = structuredClone(DESIGN_QUALITY_MANIFEST)
  const target = generic.cells.find((cell) => cell.id === 'tasks-filter-compact-en-light')!
  target.stateContract = {
    setup: [],
    assertion: { selector: 'main, [role="main"]' },
  }
  const genericResult = validateManifest(generic)
  assert.equal(genericResult.ok, false)
  assert.match(genericResult.errors.join('\n'), /generic main|negative assertion/i)

  const missingNegative = structuredClone(DESIGN_QUALITY_MANIFEST)
  delete missingNegative.cells.find((cell) => cell.id === 'signals-feed-compact')!.stateContract!.negativeAssertion
  const negativeResult = validateManifest(missingNegative)
  assert.equal(negativeResult.ok, false)
  assert.match(negativeResult.errors.join('\n'), /negative assertion/i)
})

test('a frozen cell cannot become blocked, untested, or not-applicable through self-assertion', () => {
  const blocked = structuredClone(DESIGN_QUALITY_MANIFEST)
  blocked.cells[0]!.status = 'blocked'
  blocked.cells[0]!.note = 'fixture intentionally unavailable'
  const blockedResult = validateManifestReadiness(blocked)
  assert.equal(blockedResult.ok, false)
  assert.match(blockedResult.errors.join('\n'), /blocked/i)

  const untested = structuredClone(DESIGN_QUALITY_MANIFEST)
  untested.cells[0]!.status = 'untested'
  untested.cells[0]!.note = 'state setup intentionally absent'
  const untestedResult = validateManifestReadiness(untested)
  assert.equal(untestedResult.ok, false)
  assert.match(untestedResult.errors.join('\n'), /untested/i)

  const notApplicable = structuredClone(DESIGN_QUALITY_MANIFEST)
  notApplicable.cells[0]!.status = 'not-applicable'
  notApplicable.cells[0]!.authority = 'self-asserted exception'
  const notApplicableResult = validateManifestReadiness(notApplicable)
  assert.equal(notApplicableResult.ok, false)
  assert.match(notApplicableResult.errors.join('\n'), /exact-cell Director Decision/i)
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

test('visible-content evidence is measured for every runnable cell and every phone control', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-visible-content-'))
  const writer = new ReportWriter({
    outputDir,
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
  })
  const rows = DESIGN_QUALITY_MANIFEST.cells.filter(isManifestCellRunnable).flatMap((cell) => {
    const shared = { cellId: cell.id, selector: 'main h1', observed: true, passed: true }
    const measured = [
      {
        ...shared,
        kind: 'text-truncation',
        measured: JSON.stringify({
          scrollWidth: 100,
          clientWidth: 100,
          lineClamp: 'none',
          textOverflow: 'clip',
          fullValuePathExercised: false,
        }),
      },
      {
        ...shared,
        kind: 'viewport-occlusion',
        measured: JSON.stringify({
          intersectionRatio: 0,
          centerCovered: false,
          fullyReachable: true,
          persistentBandCount: 1,
        }),
      },
    ]
    return cell.viewport === 'phone-390x844'
      ? [...measured, {
        ...shared,
        kind: 'touch-separation',
        measured: JSON.stringify({ width: 44, height: 44, nearestDistance: null, populationSize: 1 }),
      }]
      : measured
  })
  const target = await writer.writeCsv('visible-content.csv', rows)
  const validText = await readFile(target, 'utf8')
  const valid = validateVisibleContentCsv(validText, DESIGN_QUALITY_MANIFEST)
  assert.equal(valid.ok, true, valid.reason)

  const missingColumn = validateVisibleContentCsv(
    validText.replace('cellId,kind,measured,observed,passed,selector', 'cellId,kind,measured,observed,passed'),
    DESIGN_QUALITY_MANIFEST,
  )
  assert.equal(missingColumn.ok, false)
  assert.match(missingColumn.reason ?? '', /missing columns/i)

  const missingPhoneControl = validateVisibleContentCsv(
    validText.split('\n').filter((line) =>
      !line.includes('tasks-default-phone') || !line.includes('touch-separation')).join('\n'),
    DESIGN_QUALITY_MANIFEST,
  )
  assert.equal(missingPhoneControl.ok, false)
  assert.match(missingPhoneControl.reason ?? '', /phone control denominator/i)

  const selfAsserted = await writer.writeCsv('visible-content.csv', [{
    cellId: 'tasks-default-desktop',
    selector: 'main',
    kind: 'text-truncation',
    observed: true,
    passed: true,
    measured: '{}',
  }])
  const invalid = validateVisibleContentCsv(await readFile(selfAsserted, 'utf8'), DESIGN_QUALITY_MANIFEST)
  assert.equal(invalid.ok, false)
  assert.match(invalid.reason ?? '', /measurements|self-asserted/i)
})

test('control-consistency evidence covers every runnable cell with an exact control denominator', async () => {
  assert.ok(REQUIRED_ARTIFACTS.includes('control-consistency.csv' as never))
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-control-consistency-'))
  const writer = new ReportWriter({
    outputDir,
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
  })
  const runnableCells = DESIGN_QUALITY_MANIFEST.cells.filter(isManifestCellRunnable)
  const firstCellId = runnableCells[0]!.id
  const rows = runnableCells.flatMap((cell) => [
    {
      cellId: cell.id,
      kind: 'population',
      selector: '__cell__',
      component: 'all-controls',
      variant: 'population',
      size: 'all',
      state: 'default',
      authority: 'issue #856 per-cell denominator',
      observed: true,
      passed: true,
      measured: JSON.stringify({ populationSize: 1, boundedChoicePopulation: cell.id === firstCellId ? 1 : 0, nativeSelectPopulation: 0 }),
    },
    {
      cellId: cell.id,
      kind: 'control',
      selector: 'main button:nth-of-type(1)',
      component: 'button',
      variant: 'outline',
      size: 'standard',
      state: 'default',
      authority: 'DESIGN.md button contract',
      observed: true,
      passed: true,
      measured: JSON.stringify({
        populationSize: 1,
        height: 32,
        radius: 8,
        borderWidth: 1,
        foreground: 'rgb(20, 20, 20)',
        background: 'rgb(255, 255, 255)',
        textContrast: 18,
        boundaryContrast: 3.1,
      }),
    },
    ...(cell.id === firstCellId ? [{
      cellId: cell.id,
      kind: 'bounded-choice',
      selector: 'main button[role="combobox"]',
      component: 'bounded-choice',
      variant: 'picker',
      size: 'control-32',
      state: 'lifecycle',
      authority: 'issue #856 lifecycle contract',
      observed: true,
      passed: true,
      measured: JSON.stringify({
        lifecycleApplicable: true,
        closed: true,
        opened: true,
        arrowKey: true,
        typeahead: true,
        enterSelected: true,
        escapeDismissed: true,
        outsideDismissed: true,
        focusReturnedAfterEscape: true,
        focusReturnedAfterEnter: true,
        popupContained: true,
        activeReachable: true,
        selectedEvidence: true,
        textContrast: 18,
        openTextContrast: 18,
        openBoundaryContrast: 3.1,
        selectedTextContrast: 18,
        openContrastRows: [{}],
        selectedContrastRows: [{}],
      }),
    }] : []),
  ])
  rows.push(...(['disabled', 'error'] as const).map((state) => ({
    cellId: firstCellId,
    kind: 'control-state',
    selector: '__population__',
    component: 'all-controls',
    variant: 'state-face',
    size: 'all',
    state,
    authority: 'issue #856 rendered population state contract',
    observed: true,
    passed: true,
    measured: JSON.stringify({ state, populationSize: 1 }),
  })))
  rows.push({
    cellId: firstCellId,
    kind: 'control-state',
    selector: 'main button:nth-of-type(1)',
    component: 'button',
    variant: 'outline',
    size: 'control-32',
    state: 'error',
    authority: 'DESIGN.md button state contract',
    observed: true,
    passed: true,
    measured: JSON.stringify({ textContrast: 18, boundaryContrast: 3.1, contrastRows: [{}] }),
  })
  const target = await writer.writeCsv('control-consistency.csv', rows)
  const validText = await readFile(target, 'utf8')
  const valid = meaningfulCsv('control-consistency.csv', validText, DESIGN_QUALITY_MANIFEST)
  assert.equal(valid.ok, true, valid.reason)

  const resolutionFailureRows = rows.map((row) => row.kind === 'bounded-choice'
    ? {
        ...row,
        selector: 'body > main > button:nth-of-type(1)',
        observed: false,
        passed: false,
        measured: JSON.stringify({
          lifecycleApplicable: true,
          resolutionFailure: {
            identity: 'body > main > button:nth-of-type(1)',
            id: '',
            role: 'combobox',
            marker: 'role=combobox',
            label: 'Status',
            diagnosticSelector: 'body > main > button:nth-of-type(1)',
            matchCount: 0,
            roleMatched: false,
            markerMatched: false,
            reason: 'keyless',
            passed: false,
          },
        }),
      }
    : row)
  const resolutionFailureTarget = await writer.writeCsv('control-consistency.csv', resolutionFailureRows)
  const resolutionFailure = meaningfulCsv('control-consistency.csv', await readFile(resolutionFailureTarget, 'utf8'), DESIGN_QUALITY_MANIFEST)
  assert.equal(resolutionFailure.ok, true, resolutionFailure.reason)
  assert.equal(resolutionFailureRows.find((row) => row.kind === 'bounded-choice')?.passed, false)

  const missingCell = DESIGN_QUALITY_MANIFEST.cells.find(isManifestCellRunnable)!.id
  const missingText = validText.split('\n').filter((line) => !line.includes(missingCell)).join('\n')
  const invalid = meaningfulCsv('control-consistency.csv', missingText, DESIGN_QUALITY_MANIFEST)
  assert.equal(invalid.ok, false)
  assert.match(invalid.reason ?? '', /runnable cell|denominator/i)

  const weakLifecycleRows = rows.map((row) => row.kind === 'bounded-choice'
    ? { ...row, measured: JSON.stringify({ opened: true }) }
    : row)
  const weakTarget = await writer.writeCsv('control-consistency.csv', weakLifecycleRows)
  const weakLifecycle = meaningfulCsv('control-consistency.csv', await readFile(weakTarget, 'utf8'), DESIGN_QUALITY_MANIFEST)
  assert.equal(weakLifecycle.ok, false)
  assert.match(weakLifecycle.reason ?? '', /lifecycle measurements/i)

  const missingStateContrastRows = rows.map((row) => row.kind === 'bounded-choice'
    ? { ...row, measured: JSON.stringify({ ...JSON.parse(row.measured), openTextContrast: undefined }) }
    : row)
  const missingContrastTarget = await writer.writeCsv('control-consistency.csv', missingStateContrastRows)
  const missingContrast = meaningfulCsv('control-consistency.csv', await readFile(missingContrastTarget, 'utf8'), DESIGN_QUALITY_MANIFEST)
  assert.equal(missingContrast.ok, false)
  assert.match(missingContrast.reason ?? '', /state contrast measurements/i)

  const missingStateTarget = await writer.writeCsv('control-consistency.csv', rows.filter((row) => row.state !== 'error'))
  const missingState = meaningfulCsv('control-consistency.csv', await readFile(missingStateTarget, 'utf8'), DESIGN_QUALITY_MANIFEST)
  assert.equal(missingState.ok, false)
  assert.match(missingState.reason ?? '', /error state/i)
})

test('gate log status updates preserve scanner evidence and replace pending values', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-design-quality-gate-'))
  const writer = new ReportWriter({
    outputDir,
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
  })

  await writer.writeGateLog([
    'browser_status=pending',
    'fixture_status=pending',
    'chain_status=pending',
    'axe_version=4.10.3',
    'axe_findings=0',
  ])
  await writer.writeGateLog(['browser_status=0', 'fixture_status=0', 'chain_status=not-run'])

  const log = await readFile(path.join(outputDir, 'gate-log.txt'), 'utf8')
  assert.match(log, /^# candidate_sha=a{40}\n# session_id=a1b2c3d4\n/)
  assert.match(log, /^axe_version=4\.10\.3$/m)
  assert.match(log, /^axe_findings=0$/m)
  assert.match(log, /^browser_status=0$/m)
  assert.match(log, /^fixture_status=0$/m)
  assert.match(log, /^chain_status=not-run$/m)
  assert.doesNotMatch(log, /pending/)
})

test('CSV evidence accepts product copy containing pending or placeholder', () => {
  const csv = [
    `# candidate_sha=${'a'.repeat(40)}`,
    '# session_id=a1b2c3d4',
    'route,copy',
    '/mos/cafe,Pending review on Submit',
    '/mos/work/tasks,Placeholder shown in training copy',
  ].join('\n')

  assert.deepEqual(meaningfulCsv('copy-census.csv', csv), { ok: true })
})

test('historical mockup diagnostics preserve measured mismatches and explicit incompleteness', () => {
  const laneMetadata = { complete: true, count: 1, digest: '0'.repeat(64) }
  assert.equal(validateMockupStatus({
    status: 'diagnostic',
    diagnosticStatus: 'complete',
    comparisons: [{ status: 'fail', score: 0.7, build: '/tmp/render.png', missingRegions: [], contradictedRegions: [] }],
    ...laneMetadata,
  }).ok, true)

  const blocked = validateMockupStatus({
    status: 'diagnostic',
    diagnosticStatus: 'incomplete',
    comparisons: [{ status: 'blocked', score: null, build: '', reason: 'image unavailable', missingRegions: [], contradictedRegions: [] }],
    ...laneMetadata,
  })
  assert.equal(blocked.ok, true, blocked.reason)

  const allPass = validateMockupStatus({
    status: 'diagnostic',
    diagnosticStatus: 'complete',
    comparisons: [{ status: 'pass', score: 0.92, build: '/tmp/render.png', missingRegions: [], contradictedRegions: [] }],
    ...laneMetadata,
  })
  assert.equal(allPass.ok, true, allPass.reason)

  const regionOnlyFailure = validateMockupStatus({
    status: 'diagnostic',
    diagnosticStatus: 'complete',
    comparisons: [{ status: 'fail', score: 0.92, build: '/tmp/render.png', missingRegions: ['toolbar'], contradictedRegions: [] }],
    ...laneMetadata,
  })
  assert.equal(regionOnlyFailure.ok, true, regionOnlyFailure.reason)

  const mixedFalsePass = validateMockupStatus({
    status: 'diagnostic',
    diagnosticStatus: 'complete',
    comparisons: [
      { status: 'fail', score: 0.7, build: '/tmp/render-a.png', missingRegions: [], contradictedRegions: [] },
      { status: 'pass', score: 0.1, build: '/tmp/render-b.png', missingRegions: [], contradictedRegions: [] },
    ],
    ...laneMetadata,
    count: 2,
  })
  assert.equal(mixedFalsePass.ok, false)
  assert.match(mixedFalsePass.reason ?? '', /every pass comparison must meet the 0\.75 score and region contract/i)

  const falsePass = validateMockupStatus({
    status: 'pass',
    comparisons: [{ status: 'pass', score: 0.7, build: '/tmp/render.png', missingRegions: [], contradictedRegions: [] }],
    ...laneMetadata,
  })
  assert.equal(falsePass.ok, false)
  assert.match(falsePass.reason ?? '', /0\.75 score and region contract/i)
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
    'content.text-truncation',
    'geometry.viewport-occlusion',
    'touch.phone-separation',
    'identity.full-value',
    'controls.native-select',
    'controls.bounded-choice-lifecycle',
    'controls.popup-containment',
    'controls.bounded-choice-contrast',
    'controls.variant-classification',
    'controls.variant-consistency',
  ]
  assert.deepEqual(MUTATION_FIXTURES.map((fixture) => fixture.ruleId), expectedRules)
  for (const fixture of MUTATION_FIXTURES) {
    const result = evaluateMutationFixture(fixture)
    assert.equal(result.ruleId, fixture.ruleId)
    assert.equal(result.passed, false, `${fixture.ruleId} mutation was not detected`)
  }
})

test('computed CSS colors include modern sRGB and Display-P3 syntax', () => {
  assert.deepEqual(parseCssColor('color(srgb 0.2 0.4 0.6)'), [51, 102, 153])
  const displayP3 = parseCssColor('color(display-p3 0.145 0.141 0.133)')
  assert.ok(displayP3)
  assert.ok(displayP3.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 255))
})

test('write-state audit cells require a provisioned receipt bound to the candidate and session', () => {
  const candidateSha = 'a'.repeat(40)
  const receipt: AuditFixtureReceipt = {
    candidateSha,
    sessionId: 'a1b2c3d4',
    namespace: 'design-audit-a1b2c3d4',
    created: [{ table: 'mos.tasks', ids: ['a1b2c3d4-0000-0000-0000-000000000001'], fixture: 'AUDIT_RECEIVING_ONLY', lifecycle: ['created'] }],
    cleanup: [],
    unrelatedSentinelsPreserved: true,
    binding: '',
    sentinels: [
      { table: 'mos.tasks', id: 'sentinel-task', beforeHash: 'a'.repeat(64), afterHash: 'a'.repeat(64), beforePresent: true, afterPresent: true },
      { table: 'mos.weekly_updates', id: 'sentinel-update', beforeHash: 'b'.repeat(64), afterHash: 'b'.repeat(64), beforePresent: true, afterPresent: true },
      { table: 'ops.log_entries', id: 'sentinel-log', beforeHash: 'c'.repeat(64), afterHash: 'c'.repeat(64), beforePresent: true, afterPresent: true },
    ],
    ownedDatabaseIds: [{ table: 'mos.tasks', ids: ['a1b2c3d4-0000-0000-0000-000000000001'], fixture: 'AUDIT_RECEIVING_ONLY', lifecycle: ['created'], ownership: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', title: 'design-audit-a1b2c3d4 owned' }], versions: ['101'] }],
    ownedAuthUsers: [],
    ownedAuthUserIds: [],
    remainingAuthUserIds: [],
    cleanupOnFailure: { attempted: false, completed: false },
  }
  receipt.binding = auditFixtureReceiptBinding(receipt, testBindingSecret)

  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha,
    writes: true,
  }), /receipt/i)
  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha: 'b'.repeat(40),
    bindingSecret: testBindingSecret,
    receipt,
    writes: true,
  }), /candidate SHA/i)
  assert.doesNotThrow(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha,
    bindingSecret: testBindingSecret,
    receipt,
    writes: true,
  }))
  assert.equal(validateAuditFixtureProvisionedReceipt(receipt, { candidateSha, sessionId: 'a1b2c3d4' }).ok, true)
  assert.equal(validateAuditFixtureReceipt(receipt, { candidateSha, sessionId: 'a1b2c3d4' }).ok, false)
  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha,
    bindingSecret: testBindingSecret,
    receipt: { ...receipt, sentinels: [] },
    writes: true,
  }), /sentinel/i)
  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha,
    bindingSecret: testBindingSecret,
    receipt: { ...receipt, cleanup: [{ table: 'mos.tasks', deleted: 1, remaining: 0 }], cleanupOnFailure: { attempted: false, completed: true } },
    writes: true,
  }), /live|cleaned|provisioned/i)
})

test('every write-state fixture must prove at least one audit-owned identity or record', () => {
  const receipt = emptyAuditFixtureReceipt('a'.repeat(40), 'a1b2c3d4')
  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha: 'a'.repeat(40),
    bindingSecret: testBindingSecret,
    receipt,
    writes: true,
  }), /audit-owned records|ownership/i)
})

test('audit write receipts reject created identities or records outside the session namespace', () => {
  const receipt: AuditFixtureReceipt = {
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    namespace: 'design-audit-another-run',
    created: [{ table: 'mos.tasks', ids: ['a1b2c3d4-0000-0000-0000-000000000001'], fixture: 'AUDIT_RECEIVING_ONLY', lifecycle: ['created'] }],
    cleanup: [{ table: 'mos.tasks', deleted: 1, remaining: 0 }],
    unrelatedSentinelsPreserved: true,
    binding: '',
    sentinels: [],
    ownedDatabaseIds: [{ table: 'mos.tasks', ids: ['a1b2c3d4-0000-0000-0000-000000000001'], fixture: 'AUDIT_RECEIVING_ONLY', lifecycle: ['created'], ownership: [{ id: 'a1b2c3d4-0000-0000-0000-000000000001', title: 'design-audit-a1b2c3d4 owned' }], versions: ['101'] }],
    ownedAuthUsers: [],
    ownedAuthUserIds: [],
    remainingAuthUserIds: [],
    cleanupOnFailure: { attempted: false, completed: true },
  }
  receipt.binding = auditFixtureReceiptBinding(receipt, testBindingSecret)

  assert.throws(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha: 'a'.repeat(40),
    bindingSecret: testBindingSecret,
    receipt,
    writes: true,
}), /namespace/i)
})

test('audit fixture records require inspectable namespaced columns and keep sentinels read-only', () => {
  const namespace = 'design-audit-a1b2c3d4'
  const sql = { execute: async () => [], query: async () => [] }
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    definitions: {
      records: [{
        fixture: 'AUDIT_RECEIVING_ONLY',
        table: 'mos.tasks',
        id: 'a1b2c3d4-0000-0000-0000-000000000005',
        namespace,
      }],
    },
  }), /columns/i)
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    definitions: {
      sentinels: [{
        table: 'mos.tasks',
        id: 'sentinel',
        query: "DELETE FROM mos.tasks WHERE id IN ('sentinel');",
      }],
    },
  }), /custom sentinel|full row/i)
})

test('audit fixture ownership is session-bound and generated IDs carry the session prefix', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const sharedId = 'a1000000-0000-0000-0000-000000000007'
  const sentinels = [
    { table: 'mos.tasks', id: 'sentinel-task' },
    { table: 'mos.weekly_updates', id: 'sentinel-update' },
    { table: 'ops.log_entries', id: 'sentinel-log' },
  ]
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: { execute: async () => [], query: async () => [{ id: 'sentinel' }] },
    definitions: {
      records: [{ fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: sharedId, namespace, columns: { id: sharedId, title: `${namespace} owned` } }],
      sentinels,
    },
  }), /session|namespace/i)
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: { execute: async () => [], query: async () => [{ id: 'sentinel' }] },
    definitions: {
      records: [{
        fixture: 'AUDIT_RECEIVING_ONLY',
        table: 'mos.tasks',
        id: 'shared-design-audit-a1b2c3d4-owned',
        namespace,
        columns: { id: 'shared-design-audit-a1b2c3d4-owned', title: `${namespace} owned` },
      }],
      sentinels: [{ table: 'mos.tasks', id: 'sentinel' }],
    },
  }), /session|namespace/i)

  const executed: string[] = []
  const provisioner = new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: {
      execute: async (query) => {
        executed.push(query)
        return /^INSERT\s/i.test(query)
          ? [{ id: [...query.matchAll(/'((?:''|[^'])*)'/g)].at(-1)?.[1]?.replace(/''/g, "'"), audit_fixture_xmin: '101' }]
          : []
      },
      query: async () => [{ id: 'sentinel' }],
    },
    definitions: {
      records: [{ fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', namespace, columns: { title: `${namespace} generated` } }],
      sentinels,
    },
  })
  await provisioner.provision()
  assert.match(executed[0] ?? '', /a1b2c3d4-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
})

test('provision receipts durably record database IDs and auth emails before side effects', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const taskId = 'a1b2c3d4-0000-0000-0000-000000000008'
  const email = `${namespace}.writer@example.test`
  const events: string[] = []
  const receipts: AuditFixtureReceipt[] = []
  const provisioner = new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: {
      execute: async (query) => {
        if (/^INSERT\s/i.test(query)) {
          events.push('insert')
          throw new Error('planted insert failure')
        }
        events.push('delete')
        return []
      },
      query: async () => [{ id: 'sentinel' }],
    },
    auth: {
      createUser: async () => {
        events.push('create-user')
        return { data: { user: { id: 'a1b2c3d4-0000-0000-0000-000000000009' } } }
      },
      deleteUser: async () => { events.push('delete-user'); return {} },
      listUsers: async () => [],
    },
    definitions: {
      identities: [{ fixture: 'AUDIT_RECEIVING_ONLY', email, password: 'test-password' }],
      records: [{ fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: taskId, namespace, columns: { id: taskId, title: `${namespace} owned` } }],
      sentinels: [
        { table: 'mos.tasks', id: 'sentinel-task' },
        { table: 'mos.weekly_updates', id: 'sentinel-update' },
        { table: 'ops.log_entries', id: 'sentinel-log' },
      ],
    },
    onReceipt: (receipt) => { events.push('receipt'); receipts.push(receipt) },
  })

  await assert.rejects(() => provisioner.provision(), /planted insert failure/)
  const pendingAuth = receipts.find((receipt) => {
    const owners = (receipt as unknown as { ownedAuthUsers?: Array<{ email?: string; id?: string }> }).ownedAuthUsers ?? []
    return owners.some((owner) => owner.email === email && !owner.id)
  })
  assert.ok(pendingAuth, 'auth email intent was not emitted before createUser')
  assert.ok(receipts.some((receipt) => receipt.created.some((group) => group.ids.includes(taskId))), 'database ID intent was not emitted before INSERT')
  assert.ok(events.indexOf('create-user') > 0)
  assert.ok(events.indexOf('insert') > events.indexOf('create-user'))
})

test('audit-owned writes require all three unrelated sentinel tables before provisioning can begin', () => {
  const namespace = 'design-audit-a1b2c3d4'
  assert.throws(() => new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql: { execute: async () => [], query: async () => [] },
    definitions: {
      records: [{
        fixture: 'AUDIT_RECEIVING_ONLY',
        table: 'mos.tasks',
        id: 'a1b2c3d4-0000-0000-0000-000000000006',
        namespace,
        columns: { id: 'a1b2c3d4-0000-0000-0000-000000000006', title: `${namespace} owned` },
      }],
    },
  }), /mos\.tasks.*mos\.weekly_updates.*ops\.log_entries/i)
})

test('audit-owned provisioning cleans captured rows and users when a later insert fails', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const ownedTask = 'a1b2c3d4-0000-0000-0000-000000000006'
  const authUser = 'a1b2c3d4-0000-0000-0000-000000000007'
  const rows = new Set<string>(['sentinel-task', 'sentinel-update', 'sentinel-log'])
  const versions = new Map<string, string>([[ownedTask, '101']])
  const users = new Map<string, { id: string; email: string; userMetadata?: Record<string, unknown> }>()
  const sql = {
    async query(query: string): Promise<unknown[]> {
      const ids = query.match(/'[^']*'/g)?.map((value) => value.slice(1, -1)) ?? []
      return ids.flatMap((id) => rows.has(id)
        ? [{ id, ...(id === ownedTask ? { title: `${namespace} first-owned-row` } : {}), ...(query.includes('audit_fixture_xmin') ? { audit_fixture_xmin: versions.get(id) } : {}) }]
        : [])
    },
    async execute(query: string): Promise<unknown> {
      if (query.includes('second-owned-row')) throw new Error('planted insert failure')
      const inserted = /values\s*\(\s*'([^']+)'/i.exec(query)?.[1]
      if (inserted) rows.add(inserted)
      const deleted = /delete\s+from\s+([a-z_]+\.[a-z_]+)\s+where\s+xmin::text\s*=\s*'([^']+)'\s+and\s+id\s*=\s*'([^']+)'/i.exec(query)
      if (deleted && versions.get(deleted[3]!) === deleted[2]) {
        rows.delete(deleted[3]!)
        versions.delete(deleted[3]!)
      }
      return /^INSERT\s/i.test(query) ? [{ id: inserted, audit_fixture_xmin: inserted === ownedTask ? '101' : '102' }] : []
    },
  }
  const auth = {
    async createUser(input: { email: string; user_metadata: Record<string, unknown> }) {
      users.set(authUser, { id: authUser, email: input.email, userMetadata: input.user_metadata })
      return { data: { user: { id: authUser } } }
    },
    async deleteUser(id: string) { users.delete(id); return {} },
    async listUsers() { return [...users.values()] },
  }
  const receipts: AuditFixtureReceipt[] = []
  const provisioner = new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    auth,
    onReceipt: (receipt) => { receipts.push(receipt) },
    definitions: {
      identities: [{ fixture: 'AUDIT_RECEIVING_ONLY', email: `${namespace}.writer@example.test`, password: 'test-password' }],
      records: [
        { fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: ownedTask, namespace, columns: { id: ownedTask, title: `${namespace} first-owned-row` } },
        { fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', namespace, columns: { title: `${namespace} second-owned-row` } },
      ],
      sentinels: [
        { table: 'mos.tasks', id: 'sentinel-task' },
        { table: 'mos.weekly_updates', id: 'sentinel-update' },
        { table: 'ops.log_entries', id: 'sentinel-log' },
      ],
    },
  })

  await assert.rejects(provisioner.provision(), /planted insert failure/)
  assert.equal(rows.has(ownedTask), false)
  assert.deepEqual([...users], [])
  const finalReceipt = receipts.at(-1)
  assert.ok(finalReceipt)
  assert.deepEqual(finalReceipt.cleanupOnFailure, { attempted: true, completed: true })
  assert.equal(finalReceipt.cleanup.every(({ remaining }) => remaining === 0), true)
  assert.equal(finalReceipt.unrelatedSentinelsPreserved, true)
})

test('local fixture clients fail closed on malformed database and auth responses', async () => {
  for (const url of [
    'https://example.test',
    'http://localhost.example.test',
    'ftp://127.0.0.1:44321',
    'http://user:secret@127.0.0.1:44321',
  ]) {
    assert.throws(() => createLocalAuditSqlClient(url, 'test-key'), /local database/)
    assert.throws(() => createLocalAuditAuthClient(url, 'test-key'), /local auth service/)
  }
  const previousFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response('not-json', { status: 200 })
    await assert.rejects(
      createLocalAuditSqlClient('http://127.0.0.1:44321', 'test-key').query('SELECT 1'),
      /invalid JSON/,
    )

    globalThis.fetch = async () => new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
    await assert.rejects(
      createLocalAuditAuthClient('http://127.0.0.1:44321', 'test-key').listUsers!(),
      /invalid response/,
    )
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('local auth cleanup paginates short pages until an empty page when totals are absent', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const unrelatedId = 'b1b2c3d4-0000-0000-0000-000000000001'
  const unrelatedLaterId = 'b1b2c3d4-0000-0000-0000-000000000002'
  const ownedId = 'a1b2c3d4-0000-0000-0000-000000000001'
  const users = new Map<string, { id: string; email: string }>([
    [unrelatedId, { id: unrelatedId, email: 'unrelated@example.test' }],
    [ownedId, { id: ownedId, email: `${namespace}.later@example.test` }],
    [unrelatedLaterId, { id: unrelatedLaterId, email: 'unrelated-later@example.test' }],
  ])
  const requestedPages: number[] = []
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    response.setHeader('Content-Type', 'application/json')
    if (requestUrl.pathname === '/auth/v1/admin/users' && request.method === 'GET') {
      const page = Number(requestUrl.searchParams.get('page') ?? '1')
      requestedPages.push(page)
      const pageUsers = [...users.values()].slice(page - 1, page)
      response.end(JSON.stringify({ users: pageUsers }))
      return
    }
    const deleteMatch = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(requestUrl.pathname)
    if (deleteMatch && request.method === 'DELETE') {
      users.delete(decodeURIComponent(deleteMatch[1]!))
      response.end(JSON.stringify({}))
      return
    }
    response.statusCode = 404
    response.end(JSON.stringify({ message: 'not found' }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    const auth = createLocalAuditAuthClient(`http://127.0.0.1:${address.port}`, 'test-key')
    const discovered = await auth.listUsers!()
    const owned = discovered.find((user) => user.id === ownedId)
    assert.ok(owned, 'the namespaced account on the later page was not discovered')
    const deletion = await auth.deleteUser(owned.id)
    assert.equal(deletion.error, undefined)

    const afterCleanup = await auth.listUsers!()
    assert.equal(afterCleanup.some((user) => user.id === ownedId), false)
    assert.ok(requestedPages.filter((page) => page === 3).length >= 2,
      `pagination did not reach the empty page for cleanup verification: ${requestedPages.join(',')}`)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('local auth pagination honors the Supabase x-total-count header', async () => {
  const users = [
    { id: 'b1b2c3d4-0000-0000-0000-000000000001', email: 'first@example.test' },
    { id: 'b1b2c3d4-0000-0000-0000-000000000002', email: 'second@example.test' },
  ]
  const requestedPages: number[] = []
  const previousFetch = globalThis.fetch
  try {
    globalThis.fetch = async (input) => {
      const url = new URL(String(input))
      const page = Number(url.searchParams.get('page') ?? '1')
      requestedPages.push(page)
      assert.equal(page, 1, 'the reported total should terminate pagination without another request')
      return new Response(JSON.stringify({ users }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'x-total-count': String(users.length) },
      })
    }
    const listed = await createLocalAuditAuthClient('http://127.0.0.1:44321', 'test-key').listUsers!()
    assert.deepEqual(listed, users)
    assert.deepEqual(requestedPages, [1])
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('local HTTP fixture clients recover a failed provision across separate instances', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const firstTask = 'a1b2c3d4-0000-0000-0000-000000000010'
  const secondTask = 'a1b2c3d4-0000-0000-0000-000000000011'
  const authUsers = new Map<string, { id: string; email: string }>()
  const tables = new Map<string, Map<string, Record<string, unknown>>>([
    ['mos.tasks', new Map([['sentinel-task', { id: 'sentinel-task', title: 'keep task' }]])],
    ['mos.weekly_updates', new Map([['sentinel-update', { id: 'sentinel-update', body: 'keep update' }]])],
    ['ops.log_entries', new Map([['sentinel-log', { id: 'sentinel-log', detail: 'keep log' }]])],
  ])
  const rowVersions = new Map<string, string>()
  const sqlRequests: string[] = []
  const authListPages: number[] = []
  let failSecondInsert = true
  let failFirstDelete = true
  let nextAuthId = 20
  let nextRowVersion = 100

  const server = createServer((request, response) => {
    void (async () => {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
      const respond = (status: number, body: unknown) => {
        response.statusCode = status
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify(body))
      }
      try {
        if (requestUrl.pathname === '/pg/query' && request.method === 'POST') {
          const body = JSON.parse(await new Promise<string>((resolve, reject) => {
            let content = ''
            request.setEncoding('utf8')
            request.on('data', (chunk) => { content += chunk })
            request.on('end', () => resolve(content))
            request.on('error', reject)
          })) as { query?: string }
          const query = body.query ?? ''
          sqlRequests.push(query)
          if (failSecondInsert && /^INSERT\s/i.test(query) && query.includes('second-owned-row')) {
            failSecondInsert = false
            respond(500, { message: 'planted insert failure' })
            return
          }
          if (failFirstDelete && /^DELETE\s/i.test(query)) {
            failFirstDelete = false
            respond(500, { message: 'planted cleanup failure' })
            return
          }
          const table = /(?:FROM|INTO)\s+([a-z_]+\.[a-z_]+)/i.exec(query)?.[1]
          const ids = query.match(/'[^']*'/g)?.map((value) => value.slice(1, -1)) ?? []
          if (/^INSERT\s/i.test(query) && table) {
            const id = /VALUES\s*\(\s*'([^']+)'/i.exec(query)?.[1]
            const title = query.includes('first-owned-row')
              ? `${namespace} first-owned-row`
              : `${namespace} second-owned-row`
            const version = String(nextRowVersion++)
            if (id) {
              tables.get(table)?.set(id, { id, title })
              rowVersions.set(id, version)
            }
            respond(200, id ? [{ id, audit_fixture_xmin: version }] : [])
            return
          }
          if (/^DELETE\s/i.test(query) && table) {
            const version = /xmin::text\s*=\s*'([^']+)'/i.exec(query)?.[1]
            const id = /\bid\s*=\s*'([^']+)'/i.exec(query)?.[1]
            if (id && version && rowVersions.get(id) === version) {
              tables.get(table)?.delete(id)
              rowVersions.delete(id)
            }
            respond(200, [])
            return
          }
          if (/^(?:SELECT|WITH)\s/i.test(query) && table) {
            const rows = [...(tables.get(table)?.entries() ?? [])]
              .filter(([id]) => ids.includes(id))
              .map(([id, row]) => query.includes('audit_fixture_xmin')
                ? { ...row, audit_fixture_xmin: rowVersions.get(id) }
                : row)
            respond(200, rows)
            return
          }
          respond(200, [])
          return
        }
        if (requestUrl.pathname === '/auth/v1/admin/users' && request.method === 'POST') {
          const body = JSON.parse(await new Promise<string>((resolve, reject) => {
            let content = ''
            request.setEncoding('utf8')
            request.on('data', (chunk) => { content += chunk })
            request.on('end', () => resolve(content))
            request.on('error', reject)
          })) as { email?: string; user_metadata?: Record<string, unknown> }
          const id = `a1b2c3d4-0000-0000-0000-0000000000${nextAuthId++}`
          const user = { id, email: body.email ?? '', user_metadata: body.user_metadata ?? {} }
          authUsers.set(id, user)
          respond(200, user)
          return
        }
        const deleteMatch = /^\/auth\/v1\/admin\/users\/([^/]+)$/.exec(requestUrl.pathname)
        if (deleteMatch && request.method === 'DELETE') {
          authUsers.delete(decodeURIComponent(deleteMatch[1]!))
          respond(200, {})
          return
        }
        if (requestUrl.pathname === '/auth/v1/admin/users' && request.method === 'GET') {
          const page = Number(requestUrl.searchParams.get('page') ?? '1')
          authListPages.push(page)
          const users = [...authUsers.values()]
          const pageSize = 1
          respond(200, { users: users.slice((page - 1) * pageSize, page * pageSize), total: users.length })
          return
        }
        respond(404, { message: 'not found' })
      } catch (error) {
        respond(500, { message: String(error) })
      }
    })()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`
  const definitions = {
    identities: [
      { fixture: 'AUDIT_RECEIVING_ONLY', email: `${namespace}.one@example.test`, password: 'test-password' },
      { fixture: 'AUDIT_RECEIVING_ONLY', email: `${namespace}.two@example.test`, password: 'test-password' },
    ],
    records: [
      { fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: firstTask, namespace, columns: { id: firstTask, title: `${namespace} first-owned-row` } },
      { fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: secondTask, namespace, columns: { id: secondTask, title: `${namespace} second-owned-row` } },
    ],
    sentinels: [
      { table: 'mos.tasks', id: 'sentinel-task' },
      { table: 'mos.weekly_updates', id: 'sentinel-update' },
      { table: 'ops.log_entries', id: 'sentinel-log' },
    ],
  }
  let persisted: AuditFixtureReceipt | undefined
  try {
    const first = new AuditProvisioner({
      candidateSha: 'a'.repeat(40),
      sessionId: 'a1b2c3d4',
      bindingSecret: testBindingSecret,
      definitions,
      sql: createLocalAuditSqlClient(baseUrl, 'test-key'),
      auth: createLocalAuditAuthClient(baseUrl, 'test-key'),
      onReceipt: (receipt) => { persisted = receipt },
    })
    await assert.rejects(() => first.provision(), /audit fixture SQL failed \(500\)/)
    assert.ok(persisted)
    assert.ok(persisted.created.some((group) => group.ids.includes(secondTask)), 'failed INSERT intent was not persisted')
    assert.ok((persisted as unknown as { ownedAuthUsers?: unknown[] }).ownedAuthUsers?.length === 2, 'auth email intents were not persisted')
    assert.equal(persisted.cleanupOnFailure.completed, false)

    const recovered = await cleanupAuditFixtureReceipt(persisted, {
      candidateSha: 'a'.repeat(40),
      sessionId: 'a1b2c3d4',
      bindingSecret: testBindingSecret,
      sql: createLocalAuditSqlClient(baseUrl, 'test-key'),
      auth: createLocalAuditAuthClient(baseUrl, 'test-key'),
      onFailure: true,
    })
    assert.equal(validateAuditFixtureReceipt(recovered, { candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' }).ok, true)
    for (const original of persisted.sentinels) {
      const cleaned = recovered.sentinels.find((sentinel) => sentinel.table === original.table && sentinel.id === original.id)
      assert.ok(cleaned, `missing cleaned sentinel evidence for ${original.table}:${original.id}`)
      assert.equal(cleaned.beforeHash, original.beforeHash)
      assert.equal(cleaned.beforePresent, true)
      assert.equal(cleaned.afterPresent, true)
      assert.equal(cleaned.afterHash, original.beforeHash)
    }
    assert.equal(tables.get('mos.tasks')?.has(firstTask), false)
    assert.equal(tables.get('mos.tasks')?.has(secondTask), false)
    assert.equal(tables.get('mos.tasks')?.has('sentinel-task'), true)
    assert.equal(tables.get('mos.weekly_updates')?.has('sentinel-update'), true)
    assert.equal(tables.get('ops.log_entries')?.has('sentinel-log'), true)
    assert.equal(authUsers.size, 0)
    assert.ok(authListPages.includes(2), `auth cleanup did not paginate: ${authListPages.join(',')}`)
    assert.ok(sqlRequests.some((query) => /^INSERT\s/i.test(query)))
    assert.ok(sqlRequests.some((query) => /^DELETE\s/i.test(query)))
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

test('audit cleanup permits captured IDs and rejects broad business-data deletion', () => {
  assert.doesNotThrow(() => assertAuditOwnedCleanupSql(
    "DELETE FROM mos.tasks WHERE xmin::text = '101' AND id = 'a1000000-0000-0000-0000-000000000005';",
  ))
  assert.throws(() => assertAuditOwnedCleanupSql(
    "DELETE FROM mos.tasks WHERE org_id = 'shared-org';",
  ), /explicit captured primary-key list/i)
})

test('audit-owned setup and cleanup preserve task, weekly-update, and operations-log sentinels', async () => {
  const namespace = 'design-audit-a1b2c3d4'
  const ownedTask = 'a1b2c3d4-0000-0000-0000-000000000001'
  const authUser = 'a1b2c3d4-0000-0000-0000-000000000002'
  const tables = new Map<string, Map<string, Record<string, unknown>>>([
    ['mos.tasks', new Map([['sentinel-task', { id: 'sentinel-task', title: 'Owner task' }]])],
    ['mos.weekly_updates', new Map([['sentinel-update', { id: 'sentinel-update', body: 'Owner update' }]])],
    ['ops.log_entries', new Map([['sentinel-log', { id: 'sentinel-log', detail: 'Owner log' }]])],
  ])
  const rowVersions = new Map<string, string>()
  const users = new Map<string, { id: string; email: string; userMetadata?: Record<string, unknown> }>()
  const sql = {
    async query(query: string): Promise<unknown[]> {
      const match = /from\s+([a-z_]+\.[a-z_]+)[\s\S]*?in\s*\(([^)]+)\)/i.exec(query)
      if (!match) return []
      const table = tables.get(match[1]!)
      if (!table) return []
      const ids = match[2]!.match(/'[^']*'/g)?.map((id) => id.slice(1, -1)) ?? []
      return ids.flatMap((id) => table.has(id)
        ? [query.includes('audit_fixture_xmin') ? { ...table.get(id), audit_fixture_xmin: rowVersions.get(id) } : table.get(id)]
        : [])
    },
    async execute(query: string): Promise<unknown> {
      const insert = /insert\s+into\s+([a-z_]+\.[a-z_]+)\s*\([^)]*\)\s*values\s*\(\s*'([^']+)'/i.exec(query)
      if (insert) {
        tables.get(insert[1]!)?.set(insert[2]!, { id: insert[2]!, title: `${namespace} owned` })
        rowVersions.set(insert[2]!, '101')
      }
      const deletion = /delete\s+from\s+([a-z_]+\.[a-z_]+)\s+where\s+xmin::text\s*=\s*'([^']+)'\s+and\s+id\s*=\s*'([^']+)'/i.exec(query)
      if (deletion && rowVersions.get(deletion[3]!) === deletion[2]) {
        tables.get(deletion[1]!)?.delete(deletion[3]!)
        rowVersions.delete(deletion[3]!)
      }
      return /^INSERT\s/i.test(query)
        ? [{ id: /values\s*\(\s*'([^']+)'/i.exec(query)?.[1], audit_fixture_xmin: '101' }]
        : []
    },
  }
  const auth = {
    async createUser(input: { email: string; user_metadata: Record<string, unknown> }) {
      users.set(authUser, { id: authUser, email: input.email, userMetadata: input.user_metadata })
      return { data: { user: { id: authUser } } }
    },
    async deleteUser(id: string) { users.delete(id); return {} },
    async listUsers() { return [...users.values()] },
  }
  const provisioner = new AuditProvisioner({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    auth,
    definitions: {
      identities: [{ fixture: 'AUDIT_RECEIVING_ONLY', email: `${namespace}.writer@example.test`, password: 'test-password' }],
      records: [{ fixture: 'AUDIT_RECEIVING_ONLY', table: 'mos.tasks', id: ownedTask, namespace, columns: { id: ownedTask, title: `${namespace} owned` } }],
      sentinels: [
        { table: 'mos.tasks', id: 'sentinel-task' },
        { table: 'mos.weekly_updates', id: 'sentinel-update' },
        { table: 'ops.log_entries', id: 'sentinel-log' },
      ],
    },
  })

  const provisioned = await provisioner.provision()
  assert.doesNotThrow(() => assertAuditFixtureWritePolicy({
    fixture: 'AUDIT_RECEIVING_ONLY',
    sessionId: 'a1b2c3d4',
    candidateSha: 'a'.repeat(40),
    bindingSecret: testBindingSecret,
    receipt: provisioned,
    writes: true,
  }))
  const receipt = await cleanupAuditFixtureReceipt(provisioned, {
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    auth,
  })
  assert.equal(tables.get('mos.tasks')?.has(ownedTask), false)
  assert.equal(tables.get('mos.tasks')?.has('sentinel-task'), true)
  assert.equal(tables.get('mos.weekly_updates')?.has('sentinel-update'), true)
  assert.equal(tables.get('ops.log_entries')?.has('sentinel-log'), true)
  assert.deepEqual([...users], [])
  assert.equal(receipt.unrelatedSentinelsPreserved, true)
  assert.equal(receipt.sentinels?.length, 3)
  assert.deepEqual(receipt.cleanup, [{ table: 'mos.tasks', deleted: 1, remaining: 0 }])
  assert.equal(validateAuditFixtureReceipt(receipt, { candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' }).ok, true)
  const repeated = await cleanupAuditFixtureReceipt(receipt, {
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    bindingSecret: testBindingSecret,
    sql,
    auth,
  })
  assert.equal(validateAuditFixtureReceipt(repeated, { candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' }).ok, true)
  assert.deepEqual(repeated.cleanup, [{ table: 'mos.tasks', deleted: 1, remaining: 0 }])
})

test('artifact validation fails closed for an incomplete or changed fixture receipt', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-design-quality-receipt-'))
  const writer = new ReportWriter({ outputDir, candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' })
  await writer.writeFixtureReceipt({
    candidateSha: 'a'.repeat(40),
    sessionId: 'a1b2c3d4',
    namespace: 'design-audit-a1b2c3d4',
    created: [{
      table: 'mos.tasks',
      ids: ['a1b2c3d4-0000-0000-0000-000000000003'],
      fixture: 'AUDIT_RECEIVING_ONLY',
      lifecycle: ['created'],
    }],
    cleanup: [{ table: 'mos.tasks', deleted: 0, remaining: 1 }],
    unrelatedSentinelsPreserved: false,
    binding: '0'.repeat(64),
    sentinels: [{ table: 'mos.tasks', id: 'sentinel', beforeHash: 'a'.repeat(64), afterHash: 'b'.repeat(64) }],
    ownedDatabaseIds: [{
      table: 'mos.tasks',
      ids: ['a1b2c3d4-0000-0000-0000-000000000003'],
      fixture: 'AUDIT_RECEIVING_ONLY',
      lifecycle: ['created'],
      ownership: [{ id: 'a1b2c3d4-0000-0000-0000-000000000003', title: 'design-audit-a1b2c3d4 owned' }],
      versions: ['102'],
    }],
    ownedAuthUsers: [{
      fixture: 'AUDIT_RECEIVING_ONLY',
      email: 'design-audit-a1b2c3d4.writer@example.test',
      id: 'a1b2c3d4-0000-0000-0000-000000000004',
      ownershipToken: 'a1b2c3d4-0000-0000-0000-000000000005',
      lifecycle: 'created',
    }],
    ownedAuthUserIds: ['a1b2c3d4-0000-0000-0000-000000000004'],
    remainingAuthUserIds: ['a1b2c3d4-0000-0000-0000-000000000004'],
    cleanupOnFailure: { attempted: true, completed: false },
  })
  const validation = await validateArtifactSet(outputDir, { candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' })
  assert.equal(validation.ok, false)
  assert.ok(validation.invalid.includes('fixture-receipt.json'))
  assert.match(validation.errors.join('\n'), /leaves owned rows|sentinel|auth user|cleanup did not complete/i)
})

test('fixture receipt replacement is atomic and leaves no partial file beside the artifact', async () => {
  const outputDir = await mkdtemp(path.join(os.tmpdir(), 'mos-design-quality-atomic-receipt-'))
  const writer = new ReportWriter({ outputDir, candidateSha: 'a'.repeat(40), sessionId: 'a1b2c3d4' })
  const receipt = emptyAuditFixtureReceipt('a'.repeat(40), 'a1b2c3d4')
  await writer.writeFixtureReceipt(receipt)
  await writer.writeFixtureReceipt({ ...receipt, cleanupOnFailure: { attempted: true, completed: true } })

  const stored = JSON.parse(await readFile(path.join(outputDir, 'fixture-receipt.json'), 'utf8')) as AuditFixtureReceipt
  assert.deepEqual(stored.cleanupOnFailure, { attempted: true, completed: true })
  assert.deepEqual((await readdir(outputDir)).filter((name) => name.includes('.tmp')), [])
})

test('audit captures reset the browser and app-owned scroll regions to the origin', () => {
  const windowTarget = { scrollTop: 96, scrollLeft: 17 }
  const mainTarget = { scrollTop: 240, scrollLeft: 12 }
  const dataTarget = { scrollTop: 180, scrollLeft: 8 }
  const taskTarget = { scrollTop: 120, scrollLeft: 32 }
  const viewTarget = { scrollTop: 4, scrollLeft: 88 }
  const recordPanelTarget = { scrollTop: 200, scrollLeft: 0 }
  const scrollCalls: unknown[][] = []
  const fakeDocument = {
    scrollingElement: windowTarget,
    documentElement: windowTarget,
    body: windowTarget,
    querySelectorAll: (selector: string) => {
      if (selector === '*') return [mainTarget, dataTarget, taskTarget, viewTarget, recordPanelTarget]
      return []
    },
  }
  const fakeWindow = { scrollTo: (...args: unknown[]) => scrollCalls.push(args) }
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow })
  try {
    resetAuditScroll()
  } finally {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else delete (globalThis as Record<string, unknown>).document
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow)
    else delete (globalThis as Record<string, unknown>).window
  }

  assert.deepEqual(scrollCalls, [[0, 0]])
  for (const target of [windowTarget, mainTarget, dataTarget, taskTarget, viewTarget, recordPanelTarget]) {
    assert.equal(target.scrollTop, 0)
    assert.equal(target.scrollLeft, 0)
  }
})
