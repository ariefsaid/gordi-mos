import { expect, test } from '@playwright/test'

import {
  captureBoundedChoicePopulation,
  collectControlConsistency,
  exerciseBoundedChoices,
  exerciseControlStateColors,
  validateBoundedChoiceLifecyclePopulation,
} from './bounded-choices'
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
  compareAutomaticFailuresForLane,
  prepareAuditPage,
  writeAutomaticLaneSummary,
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
    <div id="bad-list" role="listbox" hidden style="position:fixed;left:-40px;top:64px;width:120px">
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
  const passing = rows.find((row) => row.selector === 'good')!
  expect(passing.passed, passing.measured).toBe(true)
  expect(JSON.parse(passing.measured).openTextContrast).toBeGreaterThanOrEqual(4.5)
  expect(JSON.parse(passing.measured).selectedTextContrast).toBeGreaterThanOrEqual(4.5)
  const broken = rows.find((row) => row.selector === 'bad')!
  expect(broken.passed).toBe(false)
  expect(JSON.parse(broken.measured).popupContained).toBe(false)
  expect(JSON.parse(broken.measured).focusReturnedAfterEscape).toBe(false)
  const noTypeahead = rows.find((row) => row.selector === 'no-typeahead')!
  expect(noTypeahead.passed).toBe(false)
  expect(JSON.parse(noTypeahead.measured).typeahead).toBe(false)
  const disabled = rows.find((row) => row.state === 'disabled')!
  expect(disabled.passed).toBe(true)
  expect(JSON.parse(disabled.measured).lifecycleApplicable).toBe(false)
  const popupOwner = rows.find((row) => row.selector === 'popup-owner')!
  expect(popupOwner.passed, popupOwner.measured).toBe(true)
  expect(JSON.parse(popupOwner.measured).selectedTextContrast).toBeGreaterThanOrEqual(4.5)
})

test('bounded-choice lifecycle follows an id through a rerender and label change', async ({ page }) => {
  await page.setContent(`
    <style>
      html, body { margin: 0; background: rgb(255,255,255); color: rgb(20,20,20); }
      body { padding: 16px; }
      button { box-sizing: border-box; display: inline-flex; height: 32px; border: 1px solid rgb(20,20,20); border-radius: 8px; color: rgb(20,20,20); background: rgb(255,255,255); }
      #rerender-list { position: fixed; left: 16px; top: 64px; width: 160px; height: 72px; padding: 0; border: 1px solid rgb(20,20,20); background: rgb(255,255,255); }
      #rerender-list [role="option"] { display: block; height: 32px; color: rgb(20,20,20); background: rgb(255,255,255); }
    </style>
    <main>
      <button id="rerender-choice" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="rerender-list" aria-label="12 tasks need attention">12 tasks need attention</button>
      <div id="rerender-list" role="listbox" hidden>
        <div id="rerender-a" role="option" aria-selected="true">Alpha</div>
        <div id="rerender-b" role="option">Beta</div>
      </div>
    </main>
    <script>
      const list = document.getElementById('rerender-list')
      const bindTrigger = (trigger) => {
        const open = () => {
          trigger.setAttribute('aria-expanded', 'true')
          list.hidden = false
          trigger.setAttribute('aria-activedescendant', 'rerender-a')
        }
        const close = () => {
          trigger.setAttribute('aria-expanded', 'false')
          list.hidden = true
          trigger.focus()
        }
        trigger.addEventListener('click', () => trigger.getAttribute('aria-expanded') === 'true' ? close() : open())
        trigger.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); open(); trigger.setAttribute('aria-activedescendant', 'rerender-b') }
          if (event.key.toLowerCase() === 'a') trigger.setAttribute('aria-activedescendant', 'rerender-a')
          if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') { event.preventDefault(); close() }
          if (event.key === 'Enter' && trigger.getAttribute('aria-expanded') === 'true') { event.preventDefault(); close() }
        })
        document.addEventListener('pointerdown', (event) => {
          if (!trigger.contains(event.target) && !list.contains(event.target)) close()
        })
      }
      bindTrigger(document.getElementById('rerender-choice'))
    </script>
  `)

  const captured = await captureBoundedChoicePopulation(page)
  expect(captured).toHaveLength(1)
  const capturedPath = captured[0]!.diagnosticSelector
  await page.evaluate(() => {
    const oldTrigger = document.getElementById('rerender-choice')!
    const inserted = document.createElement('button')
    inserted.textContent = 'Inserted during rerender'
    inserted.setAttribute('aria-hidden', 'true')
    inserted.style.display = 'block'
    inserted.style.marginTop = '4px'
    oldTrigger.before(inserted)
    const nextTrigger = oldTrigger.cloneNode(true) as HTMLElement
    nextTrigger.setAttribute('aria-label', '11 tasks need attention')
    nextTrigger.textContent = '11 tasks need attention'
    oldTrigger.replaceWith(nextTrigger)
    const list = document.getElementById('rerender-list')!
    const open = () => {
      nextTrigger.setAttribute('aria-expanded', 'true')
      list.hidden = false
      nextTrigger.setAttribute('aria-activedescendant', 'rerender-a')
    }
    const close = () => {
      nextTrigger.setAttribute('aria-expanded', 'false')
      list.hidden = true
      nextTrigger.focus()
    }
    nextTrigger.addEventListener('click', () => nextTrigger.getAttribute('aria-expanded') === 'true' ? close() : open())
    nextTrigger.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); open(); nextTrigger.setAttribute('aria-activedescendant', 'rerender-b') }
      if (event.key.toLowerCase() === 'a') nextTrigger.setAttribute('aria-activedescendant', 'rerender-a')
      if (event.key === 'Escape' && nextTrigger.getAttribute('aria-expanded') === 'true') { event.preventDefault(); close() }
      if (event.key === 'Enter' && nextTrigger.getAttribute('aria-expanded') === 'true') { event.preventDefault(); close() }
    })
    document.addEventListener('pointerdown', (event) => {
      const eventTarget = event.target as Node | null
      if (!nextTrigger.contains(eventTarget) && !list.contains(eventTarget)) close()
    })
  })

  const rows = await exerciseBoundedChoices(page, 'rerender-cell', context, captured)
  const row = rows.find((candidate) => candidate.selector === 'rerender-choice')!
  const measured = JSON.parse(row.measured) as { diagnosticSelector: string; label: string }
  expect(row.passed, row.measured).toBe(true)
  expect(measured.label).toBe('12 tasks need attention')
  expect(await page.locator('#rerender-choice').getAttribute('aria-label')).toBe('11 tasks need attention')
  expect(measured.diagnosticSelector).not.toBe(capturedPath)
  const population = validateBoundedChoiceLifecyclePopulation(captured, rows)
  expect(population.passed, JSON.stringify(population)).toBe(true)
  expect(population.expectedCount).toBe(1)
  expect(population.lifecycleCount).toBe(1)
})

test('bounded-choice outside-dismissal failure stops without a post-failure keyboard action', async ({ page }) => {
  await page.setContent(`
    <style>
      html, body { margin: 0; background: rgb(255,255,255); color: rgb(20,20,20); }
      main { padding: 16px; }
      button { box-sizing: border-box; display: inline-flex; height: 32px; border: 1px solid rgb(20,20,20); border-radius: 8px; color: rgb(20,20,20); background: rgb(255,255,255); }
      #outside-failure-list { position: fixed; left: 16px; top: 64px; width: 160px; height: 72px; padding: 0; border: 1px solid rgb(20,20,20); background: rgb(255,255,255); }
      #outside-failure-list [role="option"] { display: block; height: 32px; color: rgb(20,20,20); background: rgb(255,255,255); }
    </style>
    <main>
      <button id="outside-failure-choice" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="outside-failure-list" aria-label="Outside failure">Outside failure</button>
      <div id="outside-failure-list" role="listbox" hidden>
        <div id="outside-failure-a" role="option" aria-selected="true">Alpha</div>
        <div id="outside-failure-b" role="option">Beta</div>
      </div>
    </main>
    <script>
      const trigger = document.getElementById('outside-failure-choice')
      const list = document.getElementById('outside-failure-list')
      const state = { failed: false, postFailureKeys: 0 }
      window.__outsideFailureState = state
      const open = () => {
        trigger.setAttribute('aria-expanded', 'true')
        list.hidden = false
        trigger.setAttribute('aria-activedescendant', 'outside-failure-a')
      }
      const close = () => {
        trigger.setAttribute('aria-expanded', 'false')
        list.hidden = true
        trigger.focus()
      }
      trigger.addEventListener('click', () => trigger.getAttribute('aria-expanded') === 'true' ? close() : open())
      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); open(); trigger.setAttribute('aria-activedescendant', 'outside-failure-b') }
        if (event.key.toLowerCase() === 'a') { event.preventDefault(); trigger.setAttribute('aria-activedescendant', 'outside-failure-a') }
        if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') { event.preventDefault(); close() }
        if (event.key === 'Enter' && trigger.getAttribute('aria-expanded') === 'true') { event.preventDefault(); close() }
      })
      document.addEventListener('pointerdown', (event) => {
        if (!trigger.contains(event.target) && !list.contains(event.target)) state.failed = true
      }, true)
      document.addEventListener('keydown', (event) => {
        if (state.failed) state.postFailureKeys += 1
      }, true)
    </script>
  `)

  const captured = await captureBoundedChoicePopulation(page)
  const rows = await exerciseBoundedChoices(page, 'outside-dismissal-failure', context, captured)
  expect(rows).toHaveLength(1)
  const row = rows[0]!
  const measured = JSON.parse(row.measured) as { resolutionFailure?: { reason: string; passed: boolean } }
  expect(row.passed).toBe(false)
  expect(row.observed).toBe(false)
  expect(measured.resolutionFailure?.reason).toBe('outside-dismissal-failed')
  expect(measured.resolutionFailure?.passed).toBe(false)
  expect(await page.evaluate(() => (window as unknown as {
    __outsideFailureState: { failed: boolean; postFailureKeys: number }
  }).__outsideFailureState)).toEqual({ failed: true, postFailureKeys: 0 })
})

test('duplicate visible labels stay addressable by their distinct runtime ids', async ({ page }) => {
  await page.setContent(`
    <style>
      html, body { margin: 0; background: rgb(255,255,255); color: rgb(20,20,20); }
      main { padding: 16px; }
      button { box-sizing: border-box; display: inline-flex; height: 32px; margin-right: 8px; border: 1px solid rgb(20,20,20); border-radius: 8px; color: rgb(20,20,20); background: rgb(255,255,255); }
      #status-primary-list, #status-secondary-list { position: fixed; top: 64px; width: 160px; height: 72px; padding: 0; border: 1px solid rgb(20,20,20); background: rgb(255,255,255); }
      #status-primary-list { left: 16px; }
      #status-secondary-list { left: 220px; }
      [role="option"] { display: block; height: 32px; color: rgb(20,20,20); background: rgb(255,255,255); }
    </style>
    <main>
      <button id="status-primary" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="status-primary-list" aria-label="Status">Status</button>
      <button id="status-secondary" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="status-secondary-list" aria-label="Status">Status</button>
      <div id="status-primary-list" role="listbox" hidden>
        <div id="status-primary-a" role="option" aria-selected="true">Alpha</div>
        <div id="status-primary-b" role="option">Beta</div>
      </div>
      <div id="status-secondary-list" role="listbox" hidden>
        <div id="status-secondary-a" role="option" aria-selected="true">Alpha</div>
        <div id="status-secondary-b" role="option">Beta</div>
      </div>
    </main>
    <script>
      const selections = {}
      window.__boundedChoiceSelections = selections
      const bind = (trigger, list, prefix) => {
        const open = () => {
          trigger.setAttribute('aria-expanded', 'true')
          list.hidden = false
          trigger.setAttribute('aria-activedescendant', prefix + '-a')
        }
        const close = () => {
          trigger.setAttribute('aria-expanded', 'false')
          list.hidden = true
          trigger.focus()
        }
        trigger.addEventListener('click', () => trigger.getAttribute('aria-expanded') === 'true' ? close() : open())
        trigger.addEventListener('keydown', (event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); open(); trigger.setAttribute('aria-activedescendant', prefix + '-b') }
          if (event.key.toLowerCase() === 'a') { event.preventDefault(); trigger.setAttribute('aria-activedescendant', prefix + '-a') }
          if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') { event.preventDefault(); close() }
          if (event.key === 'Enter' && trigger.getAttribute('aria-expanded') === 'true') {
            event.preventDefault()
            selections[trigger.id] = trigger.getAttribute('aria-activedescendant')
            close()
          }
        })
        document.addEventListener('pointerdown', (event) => {
          if (!trigger.contains(event.target) && !list.contains(event.target)) close()
        })
      }
      bind(document.getElementById('status-primary'), document.getElementById('status-primary-list'), 'status-primary')
      bind(document.getElementById('status-secondary'), document.getElementById('status-secondary-list'), 'status-secondary')
    </script>
  `)

  const captured = await captureBoundedChoicePopulation(page)
  expect(captured.map((target) => target.id)).toEqual(['status-primary', 'status-secondary'])
  expect(captured.map((target) => target.label)).toEqual(['Status', 'Status'])
  const rows = await exerciseBoundedChoices(page, 'duplicate-labels', context, captured)
  expect(rows).toHaveLength(2)
  expect(rows.every((row) => row.passed), rows.map((row) => row.measured).join('\n')).toBe(true)
  expect(await page.evaluate(() => (window as unknown as {
    __boundedChoiceSelections: Record<string, string | null>
  }).__boundedChoiceSelections)).toEqual({
    'status-primary': 'status-primary-b',
    'status-secondary': 'status-secondary-b',
  })
})

test('missing, duplicate, and keyless bounded-choice identities fail before any action', async ({ page }) => {
  const scenarios = [
    {
      name: 'missing',
      markup: '<button id="missing-choice" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="Missing">Missing</button>',
      mutate: () => { document.getElementById('missing-choice')?.remove() },
      reason: 'missing',
    },
    {
      name: 'duplicate',
      markup: '<button id="duplicate-choice" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="Duplicate">Duplicate</button>',
      mutate: () => {
        const original = document.getElementById('duplicate-choice')!
        original.parentElement!.appendChild(original.cloneNode(true))
      },
      reason: 'ambiguous',
    },
    {
      name: 'keyless',
      markup: '<button role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="Keyless">Keyless</button>',
      mutate: () => {},
      reason: 'keyless',
    },
  ] as const

  for (const scenario of scenarios) {
    await page.setContent(`
      <style>body { margin: 16px; background: rgb(255,255,255); color: rgb(20,20,20); } button { width: 140px; height: 32px; color: rgb(20,20,20); background: rgb(255,255,255); border: 1px solid rgb(20,20,20); }</style>
      <main>${scenario.markup}</main>
    `)
    const captured = await captureBoundedChoicePopulation(page)
    await page.evaluate(() => {
      const actions = { click: 0, keydown: 0 }
      ;(window as unknown as { __boundedChoiceActions: typeof actions }).__boundedChoiceActions = actions
      document.addEventListener('click', () => { actions.click += 1 }, true)
      document.addEventListener('keydown', () => { actions.keydown += 1 }, true)
    })
    await page.evaluate(scenario.mutate)
    const rows = await exerciseBoundedChoices(page, `resolution-${scenario.name}`, context, captured)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    const measured = JSON.parse(row.measured) as { resolutionFailure?: { identity: string; reason: string; passed: boolean } }
    expect(row.passed).toBe(false)
    expect(row.observed).toBe(false)
    expect(measured.resolutionFailure?.reason).toBe(scenario.reason)
    expect(measured.resolutionFailure?.identity).toBeTruthy()
    expect(measured.resolutionFailure?.passed).toBe(false)
    const actions = await page.evaluate(() => (window as unknown as { __boundedChoiceActions: { click: number; keydown: number } }).__boundedChoiceActions)
    expect(actions).toEqual({ click: 0, keydown: 0 })
  }
})

test('duplicate bounded-choice ids captured before action remain invalid and inert', async ({ page }) => {
  await page.setContent(`
    <style>
      html, body { margin: 0; background: rgb(255,255,255); color: rgb(20,20,20); }
      main { padding: 16px; }
      button { box-sizing: border-box; display: inline-flex; width: 160px; height: 32px; margin-right: 8px; border: 1px solid rgb(20,20,20); border-radius: 8px; color: rgb(20,20,20); background: rgb(255,255,255); }
    </style>
    <main>
      <button id="duplicate-before-capture" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="Primary duplicate">Primary duplicate</button>
      <button id="duplicate-before-capture" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="Secondary duplicate">Secondary duplicate</button>
    </main>
  `)

  const captured = await captureBoundedChoicePopulation(page)
  expect(captured).toHaveLength(2)
  expect(captured.map((target) => target.id)).toEqual(['duplicate-before-capture', 'duplicate-before-capture'])
  expect(captured.every((target) => target.valid === false && target.invalidReason === 'duplicate')).toBe(true)
  await page.evaluate(() => {
    const actions = { scroll: 0, click: 0, keydown: 0 }
    ;(window as unknown as { __duplicateIdActions: typeof actions }).__duplicateIdActions = actions
    document.addEventListener('click', () => { actions.click += 1 }, true)
    document.addEventListener('keydown', () => { actions.keydown += 1 }, true)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => { actions.scroll += 1 },
    })
  })

  const rows = await exerciseBoundedChoices(page, 'duplicate-before-capture', context, captured)
  expect(rows).toHaveLength(2)
  expect(rows.every((row) => row.passed === false && row.observed === false)).toBe(true)
  for (const row of rows) {
    const measured = JSON.parse(row.measured) as { resolutionFailure?: { reason: string; passed: boolean } }
    expect(measured.resolutionFailure?.reason).toBe('ambiguous')
    expect(measured.resolutionFailure?.passed).toBe(false)
  }
  expect(await page.evaluate(() => (window as unknown as {
    __duplicateIdActions: { scroll: number; click: number; keydown: number }
  }).__duplicateIdActions)).toEqual({ scroll: 0, click: 0, keydown: 0 })

  const population = validateBoundedChoiceLifecyclePopulation(captured, rows)
  expect(population.expectedCount).toBe(2)
  expect(population.lifecycleCount).toBe(2)
  expect(population.duplicateIdentities).toEqual(['duplicate-before-capture'])
  expect(population.invalidIdentities).toEqual(['duplicate-before-capture'])
  expect(population.passed).toBe(false)
})

test('Signals composer runtime fixture keeps caller ids associated with their listboxes', async ({ page }) => {
  await page.setContent(`
    <style>
      html, body { margin: 0; background: rgb(255,255,255); color: rgb(20,20,20); }
      main { padding: 16px; }
      button { box-sizing: border-box; display: inline-flex; width: 180px; height: 32px; margin-right: 8px; border: 1px solid rgb(20,20,20); border-radius: 8px; color: rgb(20,20,20); background: rgb(255,255,255); }
    </style>
    <main>
      <button id="signals-compose-attention" aria-haspopup="listbox" aria-expanded="false" aria-label="Attention">FYI</button>
      <div id="signals-compose-attention-listbox" role="listbox" hidden></div>
      <button id="signals-compose-team" role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-label="Team">Choose a team</button>
      <div id="signals-compose-team-listbox" role="listbox" hidden></div>
    </main>
    <script>
      for (const id of ['signals-compose-attention', 'signals-compose-team']) {
        const trigger = document.getElementById(id)
        const list = document.getElementById(id + '-listbox')
        trigger.addEventListener('click', () => {
          trigger.setAttribute('aria-expanded', 'true')
          trigger.setAttribute('aria-controls', list.id)
          list.hidden = false
        })
      }
    </script>
  `)

  const captured = await captureBoundedChoicePopulation(page)
  expect(captured.map((target) => target.id)).toEqual(['signals-compose-attention', 'signals-compose-team'])
  for (const id of ['signals-compose-attention', 'signals-compose-team']) {
    const trigger = page.locator(`#${id}`)
    await trigger.click()
    const popupId = await trigger.getAttribute('aria-controls')
    expect(popupId).toBe(`${id}-listbox`)
    const popup = page.locator(`#${popupId}`)
    expect(await popup.count()).toBe(1)
    expect(await popup.getAttribute('role')).toBe('listbox')
  }
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
    // Freeze bounded-choice semantic identities before state exercises can
    // scroll the page. Both the denominator and lifecycle pass consume this
    // same set.
    const capturedBoundedChoices = await captureBoundedChoicePopulation(page)
    const census = await collectControlConsistency(page, cellContext, cell.id, nativeSelectExceptions, capturedBoundedChoices)
    const stateColors = await exerciseControlStateColors(page, cellContext, cell.id)
    const lifecycle = await exerciseBoundedChoices(page, cell.id, cellContext, capturedBoundedChoices)
    const lifecyclePopulation = validateBoundedChoiceLifecyclePopulation(capturedBoundedChoices, lifecycle)
    const populationRow = census.find((row) => row.kind === 'population')
    const population = populationRow ? JSON.parse(populationRow.measured) as { boundedChoicePopulation?: number } : {}
    const populationMatchesCapture = population.boundedChoicePopulation === lifecyclePopulation.expectedCount
    if (populationRow) {
      const measured = JSON.parse(populationRow.measured) as Record<string, unknown>
      populationRow.passed = populationRow.passed && populationMatchesCapture && lifecyclePopulation.passed
      populationRow.measured = JSON.stringify({
        ...measured,
        boundedChoiceLifecycle: {
          denominator: population.boundedChoicePopulation,
          captured: lifecyclePopulation.expectedCount,
          lifecycle: lifecyclePopulation.lifecycleCount,
          missingIdentities: lifecyclePopulation.missingIdentities,
          duplicateIdentities: lifecyclePopulation.duplicateIdentities,
          extraIdentities: lifecyclePopulation.extraIdentities,
          failedIdentities: lifecyclePopulation.failedIdentities,
          keylessIdentities: lifecyclePopulation.keylessIdentities,
          invalidIdentities: lifecyclePopulation.invalidIdentities,
        },
      })
    }
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
  const comparison = await compareAutomaticFailuresForLane(run, allFailures)
  await writeAutomaticLaneSummary(run, 'control-consistency-summary.json', {
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
  }, rows.length)
  expect(rows.length).toBeGreaterThan(0)
  expect(comparison.failures, `control consistency failures:\n${comparison.failures.slice(0, 80).map((failure) => `${failure.cellId} ${failure.ruleId} ${failure.selector}`).join('\n')}`).toEqual([])
})
