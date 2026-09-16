/* eslint-disable no-restricted-syntax -- browser-computed color fixtures must use literal resolved values. */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONTROL_VARIANT_VOCABULARY,
  classifyControlSize,
  validateBoundedChoiceLifecyclePopulation,
  validateBoundedChoiceResolution,
  summarizeControlGroups,
  type BoundedChoiceIdentity,
  type ClassifiedControlMetrics,
  type ControlConsistencyRow,
} from './bounded-choices.ts'

test('rendered control heights resolve to the named design-system sizes', () => {
  assert.equal(classifyControlSize(44), 'touch-44')
  assert.equal(classifyControlSize(32), 'control-32')
  assert.equal(classifyControlSize(22), 'compact-22')
  assert.equal(classifyControlSize(36), 'nav-36')
  assert.equal(classifyControlSize(28), 'rail-toggle-28')
  assert.equal(classifyControlSize(59), 'tabbar-60')
  assert.equal(classifyControlSize(50), 'unresolved')
})

test('the control vocabulary names every approved shared primitive with authority', () => {
  const selectors = CONTROL_VARIANT_VOCABULARY.map((entry) => entry.selector)
  for (const selector of [
    '.btn.btn-primary',
    '.btn.btn-outline',
    '.btn.btn-ghost',
    '.btn.btn-destructive',
    '.btn-touch',
    '.mk-iconbtn',
    '.picker__trigger',
    '.mk-select__field',
    '.overdue-filter-btn--active',
    '.overdue-filter-btn',
    '.rail-item--dest',
    '.rail-item--child',
    '.bottom-tab',
    '.top-bar .border-input.bg-secondary',
    '.top-bar .tap-target-phone--icon',
    '.dt-sort-button',
    '.th-sort-btn',
    '.collection-toolbar__choice-trigger',
    '.rail-collapse-toggle',
    '.kms-tab',
    '.dt-group-toggle, .dt-cards-group-toggle',
  ]) assert.ok(selectors.includes(selector), `missing vocabulary entry ${selector}`)
  assert.ok(
    selectors.indexOf('.overdue-filter-btn--active') < selectors.indexOf('.overdue-filter-btn'),
    'the pressed attention pill must be matched before its resting form',
  )
  assert.ok(
    selectors.indexOf('.overdue-filter-btn') < selectors.indexOf('.picker__trigger'),
    'the tinted attention pill must be matched before the generic picker trigger',
  )
  assert.ok(
    selectors.indexOf('th[aria-sort="ascending"] .th-sort-btn, th[aria-sort="descending"] .th-sort-btn')
      < selectors.indexOf('.th-sort-btn'),
    'the sorted column header must be matched before the generic one',
  )
  assert.ok(
    selectors.indexOf('.rail-item--dest[aria-current="location"]') < selectors.indexOf('.rail-item--dest'),
    'the current-location rail parent must be matched before the generic destination',
  )
  assert.ok(
    selectors.indexOf('.top-bar .border-input.bg-secondary') < selectors.indexOf('.top-bar .tap-target-phone--icon'),
    'the bordered search trigger must be matched before the transparent header doors',
  )
  for (const entry of CONTROL_VARIANT_VOCABULARY) {
    assert.ok(entry.selector.trim())
    assert.ok(entry.component.trim())
    assert.ok(entry.variant.trim())
    assert.ok(entry.authority.trim())
  }
})

test('variant groups enforce one-pixel geometry tolerance and identical resolved colors', () => {
  const base: ClassifiedControlMetrics = {
    component: 'button',
    variant: 'outline',
    size: 'control-32',
    state: 'default',
    height: 32,
    radius: 8,
    borderWidth: 1,
    foreground: 'rgb(20, 20, 20)',
    background: 'rgb(255, 255, 255)',
  }
  const withinTolerance = summarizeControlGroups([base, { ...base, height: 33 }])[0]!
  assert.equal(withinTolerance.members, 2)
  assert.equal(withinTolerance.passed, true)

  const geometryDrift = summarizeControlGroups([base, { ...base, height: 34 }])[0]!
  assert.equal(geometryDrift.heightSpread, 2)
  assert.equal(geometryDrift.passed, false)

  const colorDrift = summarizeControlGroups([base, { ...base, foreground: 'rgb(30, 30, 30)' }])[0]!
  assert.equal(colorDrift.distinctForegrounds, 2)
  assert.equal(colorDrift.passed, false)
})

function identity(id: string, overrides: Partial<BoundedChoiceIdentity> = {}): BoundedChoiceIdentity {
  return {
    id,
    role: 'combobox',
    label: 'Status',
    marker: 'role=combobox',
    diagnosticSelector: `body > form > button#${id}`,
    valid: true,
    ...overrides,
  }
}

function lifecycleRow(id: string, overrides: Partial<ControlConsistencyRow> = {}): ControlConsistencyRow {
  return {
    cellId: 'bounded-choice-test',
    kind: 'bounded-choice',
    selector: id,
    component: 'bounded-choice',
    variant: 'select',
    size: 'control-32',
    state: 'lifecycle',
    authority: 'test',
    observed: true,
    passed: true,
    measured: '{}',
    ...overrides,
  }
}

test('lifecycle population matches stable ids even when the diagnostic path and label change', () => {
  const captured = [identity('tasks-filter-attention', {
    label: '12 tasks need attention',
    diagnosticSelector: 'body > div:nth-of-type(9) > button:nth-of-type(1)',
  })]
  const rerendered = lifecycleRow('tasks-filter-attention', {
    measured: JSON.stringify({
      diagnosticSelector: 'body > div:nth-of-type(3) > button:nth-of-type(1)',
      label: '11 tasks need attention',
      legacyPath: 'stale value that must be ignored',
    }),
  })

  const result = validateBoundedChoiceLifecyclePopulation(captured, [rerendered])
  assert.equal(result.passed, true, JSON.stringify(result))
  assert.equal(result.expectedCount, 1)
  assert.equal(result.lifecycleCount, 1)
  assert.deepEqual(result.missingIdentities, [])
  assert.deepEqual(result.extraIdentities, [])
  assert.deepEqual(result.invalidIdentities, [])
})

test('duplicate visible labels remain independently addressable by distinct ids', () => {
  const captured = [
    identity('status-primary', { label: 'Status' }),
    identity('status-secondary', { label: 'Status' }),
  ]
  const result = validateBoundedChoiceLifecyclePopulation(captured, [
    lifecycleRow('status-secondary'),
    lifecycleRow('status-primary'),
  ])

  assert.equal(validateBoundedChoiceResolution(captured[0]!, 1, true, true).passed, true)
  assert.equal(validateBoundedChoiceResolution(captured[1]!, 1, true, true).passed, true)
  assert.equal(result.passed, true, JSON.stringify(result))
  assert.deepEqual(result.duplicateIdentities, [])
})

test('missing and failed lifecycle rows stay in population accounting', () => {
  const captured = [identity('group'), identity('missing')]
  const missing = validateBoundedChoiceLifecyclePopulation(captured, [lifecycleRow('group')])
  assert.equal(missing.passed, false)
  assert.deepEqual(missing.missingIdentities, ['missing'])

  const failed = validateBoundedChoiceLifecyclePopulation(captured, [
    lifecycleRow('group'),
    lifecycleRow('missing', {
      observed: false,
      passed: false,
      measured: JSON.stringify({ reason: 'missing' }),
    }),
  ])
  assert.equal(failed.passed, false)
  assert.deepEqual(failed.failedIdentities, ['missing'])
})

test('duplicate ids fail closed even when each duplicate produced a lifecycle row', () => {
  const captured = [
    identity('duplicate', { valid: false, invalidReason: 'duplicate' }),
    identity('duplicate', { valid: false, invalidReason: 'duplicate', diagnosticSelector: 'body > div:nth-of-type(2) button' }),
  ]
  const result = validateBoundedChoiceLifecyclePopulation(captured, [
    lifecycleRow('duplicate', { observed: false, passed: false, measured: JSON.stringify({ reason: 'ambiguous' }) }),
    lifecycleRow('duplicate', { observed: false, passed: false, measured: JSON.stringify({ reason: 'ambiguous' }) }),
  ])
  const resolution = validateBoundedChoiceResolution(captured[0]!, 2, false, false)

  assert.equal(resolution.reason, 'ambiguous')
  assert.equal(resolution.passed, false)
  assert.equal(result.passed, false, JSON.stringify(result))
  assert.deepEqual(result.duplicateIdentities, ['duplicate'])
  assert.deepEqual(result.failedIdentities, ['duplicate'])
  assert.deepEqual(result.invalidIdentities, ['duplicate'])
})

test('keyless captures remain counted and fail closed before a lifecycle action', () => {
  const captured = [identity('', {
    valid: false,
    invalidReason: 'keyless',
    diagnosticSelector: 'body > div:nth-of-type(4) button:nth-of-type(1)',
  })]
  const result = validateBoundedChoiceLifecyclePopulation(captured, [lifecycleRow('', {
    observed: false,
    passed: false,
    measured: JSON.stringify({ reason: 'keyless' }),
  })])
  const resolution = validateBoundedChoiceResolution(captured[0]!, 0, false, false)

  assert.equal(resolution.reason, 'keyless')
  assert.equal(resolution.passed, false)
  assert.equal(result.expectedCount, 1)
  assert.equal(result.lifecycleCount, 1)
  assert.equal(result.passed, false, JSON.stringify(result))
  assert.deepEqual(result.keylessIdentities, [captured[0]!.diagnosticSelector])
  assert.deepEqual(result.invalidIdentities, [captured[0]!.diagnosticSelector])
})

test('role or bounded-choice marker changes fail closed before actions', () => {
  const captured = identity('role-mismatch')
  const roleMismatch = validateBoundedChoiceResolution(captured, 1, false, true)
  const markerMismatch = validateBoundedChoiceResolution(captured, 1, true, false)

  assert.equal(roleMismatch.reason, 'role-mismatched')
  assert.equal(roleMismatch.passed, false)
  assert.equal(markerMismatch.reason, 'role-mismatched')
  assert.equal(markerMismatch.passed, false)
})

test('extra and duplicate lifecycle ids fail exact population accounting', () => {
  const captured = [identity('group')]
  const result = validateBoundedChoiceLifecyclePopulation(captured, [
    lifecycleRow('group'),
    lifecycleRow('group'),
    lifecycleRow('unexpected'),
  ])

  assert.equal(result.passed, false, JSON.stringify(result))
  assert.deepEqual(result.duplicateIdentities, ['group'])
  assert.deepEqual(result.extraIdentities, ['unexpected'])
})
