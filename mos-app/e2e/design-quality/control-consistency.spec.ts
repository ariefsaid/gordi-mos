import { expect, test } from '@playwright/test'

import { collectControlConsistency, exerciseBoundedChoices, exerciseControlStateColors } from './bounded-choices'
import { DESIGN_QUALITY_MANIFEST, isManifestCellRunnable } from './manifest'
import {
  failureFromControlConsistencyRow,
} from './change-gate.ts'
import {
  assertAuditEnvironment,
  assertAuditServer,
  auditEnabled,
  auditRun,
  cellsFor,
  compareAutomaticFailures,
  prepareAuditPage,
} from './runtime'

const context = {
  route: '/mos/work/tasks',
  journey: 'tasks-create',
  fixture: 'BAR_MEMBER',
  viewport: 'desktop-1440x900',
  theme: 'light',
  language: 'en',
  state: 'default',
}

test.describe.configure({ mode: 'serial' })

test('control census detects planted raw controls and matches native exceptions by selector', async ({ page }) => {
  await page.setContent(`
    <style>button { color: rgb(20,20,20); background: rgb(255,255,255); border: 1px solid rgb(20,20,20); height: 32px; }</style>
    <style>
      body { background: rgb(255, 255, 255); color: rgb(20, 20, 20); }
      button, a, select { box-sizing: border-box; display: inline-flex; height: 32px; border: 1px solid rgb(20, 20, 20); border-radius: 8px; color: rgb(20, 20, 20); background: rgb(255, 255, 255); }
      #weak-hover:hover { color: rgb(190, 190, 190); }
    </style>
    <main>
      <a id="skip" href="#main" style="position:fixed;top:-100px">Skip link</a>
      <button class="btn btn-outline">Classified</button>
      <button id="raw-button">Raw</button>
      <button class="btn btn-outline" style="border-color:rgb(220,220,220)">Weak boundary</button>
      <button class="btn btn-ghost" style="background:transparent">Transparent surface</button>
      <a id="weak-hover" class="btn btn-outline" href="#target">Weak hover link</a>
      <select id="raw-native"><option>Raw choice</option></select>
      <select id="approved-native"><option>Approved choice</option></select>
      <select data-select-native="true" aria-hidden="true"><option>Form bridge</option></select>
    </main>
  `)

  const rows = await collectControlConsistency(page, context, 'planted-cell', [{
    selector: '#approved-native',
    authority: 'DD-TEST approved native control',
  }])
  const population = JSON.parse(rows.find((row) => row.kind === 'population')!.measured)
  expect(population.populationSize).toBe(5)
  expect(population.nativeSelectPopulation).toBe(2)
  const good = rows.find((row) => row.selector.includes('button:nth-of-type(1)'))!
  expect(good.passed, good.measured).toBe(true)
  expect(rows.find((row) => row.selector.includes('button:nth-of-type(2)'))?.passed).toBe(false)
  const weakBoundary = rows.find((row) => row.selector.includes('button:nth-of-type(3)'))!
  expect(weakBoundary.passed).toBe(false)
  expect(JSON.parse(weakBoundary.measured).boundaryContrast).toBeLessThan(3)
  const transparentSurface = rows.find((row) => row.selector.includes('button:nth-of-type(4)'))!
  expect(transparentSurface.passed, transparentSurface.measured).toBe(true)
  expect(JSON.parse(transparentSurface.measured).textContrast).toBeGreaterThanOrEqual(4.5)
  const stateRows = await exerciseControlStateColors(page, context, 'planted-cell')
  expect(stateRows.some((row) => row.selector.includes('a:nth-of-type(1)'))).toBe(false)
  const weakHover = stateRows.find((row) => row.selector.includes('a:nth-of-type(2)') && row.state === 'hover')!
  expect(weakHover.passed).toBe(false)
  expect(JSON.parse(weakHover.measured).textContrast).toBeLessThan(4.5)
  const nativeRows = rows.filter((row) => row.kind === 'native-select')
  expect(nativeRows).toHaveLength(2)
  expect(nativeRows.find((row) => row.authority.includes('DD-TEST'))?.passed).toBe(true)
  expect(nativeRows.filter((row) => !row.passed)).toHaveLength(1)
})

test('bounded-choice driver catches clipped popups and broken Escape focus return', async ({ page }) => {
  await page.setContent(`
    <style>button { color: rgb(20,20,20); background: rgb(255,255,255); border: 1px solid rgb(20,20,20); height: 32px; }</style>
    <button id="good" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="good-list">Good picker</button>
    <div id="good-list" role="listbox" hidden>
      <div id="good-a" role="option" aria-selected="true">Alpha</div>
      <div id="good-b" role="option">Beta</div>
    </div>
    <button id="bad" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="bad-list">Broken picker</button>
    <div id="bad-list" role="listbox" hidden style="position:fixed;left:-40px;top:0;width:120px">
      <div id="bad-a" role="option" aria-selected="true">Alpha</div>
      <div id="bad-b" role="option">Beta</div>
    </div>
    <button id="no-typeahead" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="no-typeahead-list">No typeahead</button>
    <div id="no-typeahead-list" role="listbox" hidden>
      <div id="no-typeahead-a" role="option" aria-selected="true">Alpha</div>
      <div id="no-typeahead-b" role="option">Beta</div>
    </div>
    <button id="disabled" role="combobox" aria-haspopup="listbox" aria-expanded="false" disabled>Disabled picker</button>
    <button id="popup-owner" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="popup-owner-list">Popup-owned cursor</button>
    <div id="popup-owner-list" role="listbox" hidden tabindex="0">
      <div id="popup-owner-a" role="option" aria-selected="true"><span>Alpha</span></div>
      <div id="popup-owner-b" role="option"><span>Beta</span></div>
    </div>
    <script>
      for (const id of ['good', 'bad', 'no-typeahead']) {
        const trigger = document.getElementById(id)
        const list = document.getElementById(id + '-list')
        const open = () => { trigger.ariaExpanded = 'true'; list.hidden = false; trigger.setAttribute('aria-activedescendant', id + '-a') }
        const close = (restore) => { trigger.ariaExpanded = 'false'; list.hidden = true; if (restore) trigger.focus(); else { document.body.tabIndex = -1; document.body.focus() } }
        trigger.addEventListener('click', () => trigger.ariaExpanded === 'true' ? close(true) : open())
        trigger.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); if (trigger.ariaExpanded !== 'true') open(); trigger.setAttribute('aria-activedescendant', id + '-b') }
          if (id !== 'no-typeahead' && event.key.length === 1 && event.key.toLowerCase() === 'a') trigger.setAttribute('aria-activedescendant', id + '-a')
          if (event.key === 'Enter' && trigger.ariaExpanded === 'true') { event.preventDefault(); close(true) }
          if (event.key === 'Escape' && trigger.ariaExpanded === 'true') close(id === 'good')
        })
        document.addEventListener('pointerdown', (event) => {
          if (!trigger.contains(event.target) && !list.contains(event.target)) close(true)
        })
      }
      {
        const trigger = document.getElementById('popup-owner')
        const list = document.getElementById('popup-owner-list')
        const open = () => {
          trigger.ariaExpanded = 'true'
          list.hidden = false
          list.setAttribute('aria-activedescendant', 'popup-owner-a')
          list.focus()
        }
        const close = () => {
          trigger.ariaExpanded = 'false'
          list.hidden = true
          trigger.focus()
        }
        trigger.addEventListener('click', open)
        list.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown') list.setAttribute('aria-activedescendant', 'popup-owner-b')
          if (event.key.toLowerCase() === 'a') list.setAttribute('aria-activedescendant', 'popup-owner-a')
          if (event.key === 'Escape' || event.key === 'Enter') { event.preventDefault(); close() }
        })
        document.addEventListener('pointerdown', (event) => {
          if (!trigger.contains(event.target) && !list.contains(event.target)) close()
        })
      }
    </script>
  `)

  const rows = await exerciseBoundedChoices(page, 'planted-cell')
  expect(rows).toHaveLength(5)
  const passing = rows.find((row) => row.selector.includes('button:nth-of-type(1)'))!
  expect(passing.passed, passing.measured).toBe(true)
  expect(JSON.parse(passing.measured).openTextContrast).toBeGreaterThanOrEqual(4.5)
  expect(JSON.parse(passing.measured).selectedTextContrast).toBeGreaterThanOrEqual(4.5)
  const broken = rows.find((row) => row.selector.includes('button:nth-of-type(2)'))!
  expect(broken.passed).toBe(false)
  expect(JSON.parse(broken.measured).popupContained).toBe(false)
  expect(JSON.parse(broken.measured).focusReturnedAfterEscape).toBe(false)
  const noTypeahead = rows.find((row) => row.selector.includes('button:nth-of-type(3)'))!
  expect(noTypeahead.passed).toBe(false)
  expect(JSON.parse(noTypeahead.measured).typeahead).toBe(false)
  const disabled = rows.find((row) => row.state === 'disabled')!
  expect(disabled.passed).toBe(true)
  expect(JSON.parse(disabled.measured).lifecycleApplicable).toBe(false)
  const popupOwner = rows.find((row) => row.selector.includes('button:nth-of-type(5)'))!
  expect(popupOwner.passed, popupOwner.measured).toBe(true)
  expect(JSON.parse(popupOwner.measured).selectedTextContrast).toBeGreaterThanOrEqual(4.5)
})

test('control consistency entry point writes a complete per-cell census', async ({ page }) => {
  test.setTimeout(360_000)
  test.skip(!auditEnabled(), 'set DESIGN_QUALITY_RUN=1 through scripts/design-quality-audit.sh')
  assertAuditEnvironment()
  const run = auditRun()
  await assertAuditServer(run.baseURL)
  const rows: Awaited<ReturnType<typeof collectControlConsistency>> = []

  for (const cell of cellsFor(DESIGN_QUALITY_MANIFEST).filter(isManifestCellRunnable)) {
    await prepareAuditPage(page, run, cell)
    const cellContext = {
      route: cell.route,
      journey: cell.journey,
      fixture: cell.fixture,
      viewport: cell.viewport,
      theme: cell.theme,
      language: cell.language,
      state: cell.state,
    }
    const nativeSelectExceptions = DESIGN_QUALITY_MANIFEST.lists.nativeSelectExceptions
      .filter((entry) => (!entry.routes || entry.routes.includes(cell.route))
        && (!entry.viewports || entry.viewports.includes(cell.viewport)))
      .map(({ selector, authority }) => ({ selector, authority }))
    const census = await collectControlConsistency(page, cellContext, cell.id, nativeSelectExceptions)
    const stateColors = await exerciseControlStateColors(page, cellContext, cell.id)
    const lifecycle = await exerciseBoundedChoices(page, cell.id, cellContext)
    rows.push(...census, ...stateColors, ...lifecycle)
  }

  const controlRows = rows.filter((row) => row.kind === 'control')
  const firstRunnableCell = DESIGN_QUALITY_MANIFEST.cells.find(isManifestCellRunnable)!.id
  for (const requiredState of ['disabled', 'error'] as const) {
    const count = controlRows.filter((row) => row.state === requiredState).length
    rows.push({
      cellId: firstRunnableCell,
      kind: 'control-state',
      selector: '__population__',
      component: 'all-controls',
      variant: 'state-face',
      size: 'all',
      state: requiredState,
      authority: 'issue #856 rendered population state contract',
      observed: true,
      passed: count > 0,
      measured: JSON.stringify({ state: requiredState, populationSize: count }),
    })
  }

  await run.writer.writeCsv('control-consistency.csv', rows as unknown as Record<string, unknown>[])
  const allFailures = rows
    .filter((row) => !row.passed)
    .map((row) => failureFromControlConsistencyRow(row as unknown as Record<string, unknown>))
  const comparison = await compareAutomaticFailures(run, allFailures)
  await run.writer.writeJson('control-consistency-summary.json', {
    rows: rows.length,
    auditMode: process.env.DESIGN_AUDIT_MODE === 'change-gate' ? 'change-gate' : 'mvp-assessment',
    failures: comparison.failures,
    allFailures: comparison.allFailures,
    inheritedFailures: comparison.inheritedFailures,
    newFailures: comparison.newFailures,
    failureCounts: {
      all: comparison.allFailures.length,
      inherited: comparison.inheritedFailures.length,
      new: comparison.newFailures.length,
    },
    automaticChecksPassed: comparison.automaticChecksPassed,
    baselineEvidenceDir: run.baselineEvidenceDir || null,
    baselineCandidateSha: run.baselineCandidateSha || run.mergeBaseSha || null,
    baselineSessionId: run.baselineSessionId || null,
    verificationBase: run.verificationBase || null,
    mergeBaseSha: run.mergeBaseSha || null,
  })
  expect(rows.length).toBeGreaterThan(0)
  expect(comparison.failures, `control consistency failures:\n${comparison.failures.slice(0, 80).map((failure) => `${failure.cellId} ${failure.ruleId} ${failure.selector}`).join('\n')}`).toEqual([])
})
