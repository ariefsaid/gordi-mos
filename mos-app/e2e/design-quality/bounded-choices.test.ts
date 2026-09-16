/* eslint-disable no-restricted-syntax -- browser-computed color fixtures must use literal resolved values. */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CONTROL_VARIANT_VOCABULARY,
  classifyControlSize,
  validateBoundedChoiceLifecyclePopulation,
  summarizeControlGroups,
  type ClassifiedControlMetrics,
} from './bounded-choices.ts'

test('rendered control heights resolve to the named design-system sizes', () => {
  assert.equal(classifyControlSize(44), 'touch-44')
  assert.equal(classifyControlSize(32), 'control-32')
  assert.equal(classifyControlSize(22), 'compact-22')
  assert.equal(classifyControlSize(35), 'unresolved')
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
  ]) assert.ok(selectors.includes(selector), `missing vocabulary entry ${selector}`)
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

test('Tasks and Café Log lifecycle rows cover every captured bounded choice after scrolling', () => {
  const capturedByCell = [
    {
      cellId: 'tasks-default-desktop',
      selectors: ['#group', '#business-unit', '#person', '#sort', '#attention'],
    },
    {
      cellId: 'cafe-log-default-desktop',
      selectors: ['#destination', '#status'],
    },
  ]

  for (const { cellId, selectors } of capturedByCell) {
    const lifecycleRows = selectors.map((selector) => ({
      cellId,
      kind: 'bounded-choice' as const,
      selector,
      component: 'bounded-choice',
      variant: 'picker',
      size: 'control-32',
      state: 'lifecycle',
      authority: 'test',
      observed: true,
      passed: true,
      measured: '{}',
    }))
    const result = validateBoundedChoiceLifecyclePopulation(selectors, lifecycleRows)
    assert.equal(result.expectedCount, new Set(selectors).size)
    assert.equal(result.lifecycleCount, lifecycleRows.length)
    assert.equal(result.passed, true, `${cellId}: ${JSON.stringify(result)}`)

    const missingLast = validateBoundedChoiceLifecyclePopulation(selectors, lifecycleRows.slice(0, -1))
    assert.equal(missingLast.passed, false, `${cellId} accepted a missing lifecycle row`)
    assert.deepEqual(missingLast.missingSelectors, [selectors.at(-1)])

    const duplicate = validateBoundedChoiceLifecyclePopulation(selectors, [...lifecycleRows, lifecycleRows[0]!])
    assert.equal(duplicate.passed, false, `${cellId} accepted a duplicate lifecycle row`)
    assert.deepEqual(duplicate.duplicateSelectors, [selectors[0]])

    const extra = validateBoundedChoiceLifecyclePopulation(selectors, [...lifecycleRows, {
      ...lifecycleRows[0]!,
      selector: `${selectors[0]} + .unexpected`,
    }])
    assert.equal(extra.passed, false, `${cellId} accepted an uncaptured lifecycle row`)
    assert.deepEqual(extra.extraSelectors, [`${selectors[0]} + .unexpected`])
  }
})
