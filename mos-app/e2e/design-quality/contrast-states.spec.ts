import { test, expect, type Locator } from '@playwright/test'

import { DESIGN_QUALITY_MANIFEST, isManifestCellRunnable } from './manifest'
import {
  collectContrast,
  contrastThreshold,
  interactionStateSelector,
  INTERACTION_STATES,
  type ContrastRow,
  type InteractionState,
} from './measurements'
import { type AutomaticFailure } from './change-gate.ts'
import {
  assertAuditEnvironment,
  assertAuditServer,
  auditEnabled,
  auditRun,
  captureCell,
  cellsFor,
  compareAutomaticFailuresForLane,
  observeManifestCellState,
  prepareAuditPage,
  writeAutomaticLaneSummary,
} from './runtime'

test.describe.configure({ mode: 'serial' })

const DEFAULT_SELECTOR = 'body, main, h1, h2, h3, p, label, button, a[href], [role="button"]'
const ACTIONABLE_SELECTOR = 'main button, main a[href], main input, main select, main textarea, main [role="button"], main [role="link"], main [role="tab"]'

async function elementSelector(target: Locator): Promise<string> {
  return target.evaluate((element) => {
    const segments: string[] = []
    let current: HTMLElement | null = element as HTMLElement
    while (current && current !== document.body) {
      let ordinal = 1
      let sibling = current.previousElementSibling
      while (sibling) {
        if (sibling.tagName === current.tagName) ordinal += 1
        sibling = sibling.previousElementSibling
      }
      segments.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${ordinal})`)
      current = current.parentElement
    }
    return ['body', ...segments].join(' > ')
  })
}

type StateSetup = {
  applicable: boolean
  selector: string
  measure: 'text' | 'both'
}

async function firstKeyboardActionable(page: Parameters<typeof collectContrast>[0]): Promise<Locator | null> {
  const candidates = page.locator(ACTIONABLE_SELECTOR).filter({ visible: true })
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index)
    const reachable = await candidate.evaluate((element) => {
      if (!(element instanceof HTMLElement)) return false
      if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return false
      return element.tabIndex >= 0
    })
    if (reachable) return candidate
  }
  return null
}

async function waitForContrastCellSettled(
  page: Parameters<typeof collectContrast>[0],
  cell: (typeof DESIGN_QUALITY_MANIFEST)['cells'][number],
): Promise<void> {
  // The route's query and permission requests run after DOMContentLoaded. Let those requests
  // settle before choosing the first interaction target; otherwise a permission-controlled
  // action can be selected and removed while its generated diagnostic path is being measured.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {})
  // Keep the manifest assertion as the readiness seam for this cell. If it cannot be observed,
  // continue into setup so a real missing target still follows the collector's existing
  // unobserved-row behavior instead of being silently omitted here.
  await observeManifestCellState(page, cell)
}

async function setupState(page: Parameters<typeof collectContrast>[0], state: InteractionState): Promise<StateSetup> {
  if (state === 'default') return { applicable: true, selector: DEFAULT_SELECTOR, measure: 'text' }
  if (state === 'hover' || state === 'focus') {
    const target = state === 'focus'
      ? await firstKeyboardActionable(page)
      : page.locator(ACTIONABLE_SELECTOR).filter({ visible: true }).first()
    if (!target || await target.count() === 0) return { applicable: false, selector: '', measure: 'text' }
    if (state === 'hover') await target.hover()
    else {
      await target.evaluate((element) => {
        document.getElementById('design-audit-focus-origin')?.remove()
        const origin = document.createElement('span')
        origin.id = 'design-audit-focus-origin'
        // Keep the temporary origin in the sequential focus order. Starting Tab from a
        // programmatically focused tabindex=-1 node is browser-dependent and intermittently
        // restarts at the document chrome instead of advancing to the adjacent audit target.
        origin.tabIndex = 0
        origin.setAttribute('aria-hidden', 'true')
        element.parentNode?.insertBefore(origin, element)
        origin.focus()
      })
      let reachedTarget = false
      try {
        await page.keyboard.press('Tab')
        reachedTarget = await target.evaluate((element) => document.activeElement === element)
      } finally {
        await page.evaluate(() => document.getElementById('design-audit-focus-origin')?.remove())
      }
      if (!reachedTarget) throw new Error('Keyboard focus did not reach the first actionable audit target')
    }
    return { applicable: true, selector: await elementSelector(target), measure: state === 'focus' ? 'both' : 'text' }
  }
  const selector = interactionStateSelector(state)
  const target = page.locator(selector).filter({ visible: true })
  const hasVisibleText = await target.evaluateAll((elements) => elements.some((element) => (element as HTMLElement).innerText?.trim().length > 0))
  return { applicable: hasVisibleText, selector, measure: 'text' }
}

test('focus setup skips a disabled first action and reaches the next keyboard target', async ({ page }) => {
  await page.setContent(`
    <main>
      <button disabled>Unavailable</button>
      <button>Continue</button>
    </main>
  `)

  const setup = await setupState(page, 'focus')

  expect(setup.applicable).toBe(true)
  await expect(page.getByRole('button', { name: 'Continue' })).toBeFocused()
})

test('icon-only controls are measured on their glyph under the foreground boundary fallback', async ({ page }) => {
  // DD-MVP-19: a borderless control may carry its affordance in the glyph. The boundary
  // collector must observe that glyph instead of reporting "unobserved", and it must still
  // fail a glyph that misses the 3:1 control floor — both arms of the fallback are pinned.
  await page.setContent(`
    <main>
      <button id="ok-icon" aria-label="Inbox" style="border: none; background: transparent; color: rgb(20, 20, 20); display: inline-flex; padding: 8px;">
        <svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="currentColor"/></svg>
      </button>
      <button id="weak-icon" aria-label="Archive" style="border: none; background: transparent; color: rgb(222, 220, 214); display: inline-flex; padding: 8px;">
        <svg width="16" height="16" viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="currentColor"/></svg>
      </button>
    </main>
  `)

  const context = {
    route: '/planted',
    journey: 'planted',
    fixture: 'planted',
    viewport: 'desktop-1440x900',
    theme: 'light',
    language: 'en',
    state: 'default',
  }
  const rows = await collectContrast(page, context, 'default', 'button#ok-icon, button#weak-icon', { measure: 'boundary', allowForegroundBoundary: true })
  expect(rows).toHaveLength(2)
  // Both rows carry the combined input selector; document order puts #ok-icon first.
  const [ok, weak] = rows
  expect(ok.observed, JSON.stringify(ok)).toBe(true)
  expect(ok.passes, JSON.stringify(ok)).toBe(true)
  expect(ok.selector, JSON.stringify(ok)).toContain('foreground')
  expect(weak.observed, JSON.stringify(weak)).toBe(true)
  expect(weak.passes, JSON.stringify(weak)).toBe(false)
  expect(weak.ratio ?? 0).toBeLessThan(3)
})

test('contrast setup waits for a populated cell before sampling a transient permission action', async ({ page }) => {
  await page.setContent(`
    <main>
      <h1>Signals</h1>
      <span id="transient-share"><button type="button" style="color: rgb(20, 20, 20); background: white">Share Signal</button></span>
      <button id="stable-action" type="button" style="color: rgb(20, 20, 20); background: white">Continue</button>
      <div data-testid="signal-feed"></div>
    </main>
    <script>
      setTimeout(() => {
        document.querySelector('[data-testid="signal-feed"]').innerHTML = '<div data-signal-id="settled">Signal</div>'
        document.querySelector('#transient-share').remove()
      }, 30)
    </script>
  `)

  const cell = DESIGN_QUALITY_MANIFEST.cells.find((entry) => entry.id === 'signals-feed-compact')!
  await waitForContrastCellSettled(page, cell)

  const setup = await setupState(page, 'hover')
  expect(setup.applicable).toBe(true)
  expect(await page.locator(setup.selector).getAttribute('id')).toBe('stable-action')

  const rows = await collectContrast(page, {
    route: cell.route,
    journey: cell.journey,
    fixture: cell.fixture,
    viewport: cell.viewport,
    theme: cell.theme,
    language: cell.language,
    state: cell.state,
  }, 'hover', setup.selector, { measure: setup.measure })
  expect(rows).toHaveLength(1)
  expect(rows[0]?.observed).toBe(true)
  expect(rows[0]?.passes).toBe(true)
})

test('contrast state entry point records browser-computed ratios for each interaction state', async ({ page }) => {
  test.skip(!auditEnabled(), 'set DESIGN_QUALITY_RUN=1 through scripts/design-quality-audit.sh')
  assertAuditEnvironment()
  const run = auditRun()
  await assertAuditServer(run.baseURL)

  const rows: ContrastRow[] = []
  const screenshots: string[] = []
  const applicability: Array<{ route: string; state: string; applicable: boolean; evidence: string }> = []
  for (const cell of cellsFor(DESIGN_QUALITY_MANIFEST).filter(isManifestCellRunnable)) {
    await prepareAuditPage(page, run, cell)
    await waitForContrastCellSettled(page, cell)
    const context = {
      route: cell.route,
      journey: cell.journey,
      fixture: cell.fixture,
      viewport: cell.viewport,
      theme: cell.theme,
      language: cell.language,
      state: cell.state,
    }
    for (const state of INTERACTION_STATES) {
      const setup = await setupState(page, state)
      applicability.push({ ...context, state, applicable: setup.applicable, evidence: setup.applicable ? `visible target: ${setup.selector}` : 'no visible target for this interaction state' })
      if (!setup.applicable) continue
      rows.push(...await collectContrast(page, context, state, setup.selector, { measure: setup.measure }))
    }
    for (const graphic of DESIGN_QUALITY_MANIFEST.lists.meaningfulGraphics) {
      const target = page.locator(graphic.selector).filter({ visible: true })
      const applicable = await target.count() > 0
      applicability.push({ ...context, state: 'meaningful-graphics', applicable, evidence: applicable ? `visible graphic: ${graphic.selector}` : `named graphic selector did not match: ${graphic.selector}` })
      const graphicRows = await collectContrast(page, context, 'meaningful-graphics', graphic.selector, { measure: 'boundary', allowForegroundBoundary: true })
      rows.push(...graphicRows)
    }
    screenshots.push(await captureCell(page, run, cell, 'contrast'))
  }
  await run.writer.writeCsv('contrast.csv', rows as unknown as Record<string, unknown>[])
  const allFailures: AutomaticFailure[] = rows
    .filter((row) => !row.passes || !row.observed)
    .map((row) => ({
      ruleId: row.kind === 'boundary' ? 'contrast.boundary' : 'contrast.text',
      cellId: `${row.route}|${row.journey}|${row.fixture}|${row.viewport}|${row.theme}|${row.language}`,
      selector: row.selector,
      state: row.state,
      message: `${row.kind} contrast is below its threshold`,
      measured: row,
    }))
  const comparison = await compareAutomaticFailuresForLane(run, allFailures)
  await writeAutomaticLaneSummary(run, 'contrast-summary.json', {
    states: INTERACTION_STATES,
    rows: rows.length,
    applicableStates: applicability.filter((entry) => entry.applicable).length,
    notApplicableStates: applicability.filter((entry) => !entry.applicable).length,
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
    applicability,
    screenshots,
  }, rows.length)
  expect(rows.length).toBeGreaterThan(0)
  expect(comparison.failures, 'contrast or applicable interaction-state checks failed').toEqual([])
  expect(contrastThreshold('text', false)).toBe(4.5)
  expect(contrastThreshold('text', true)).toBe(3)
  expect(contrastThreshold('boundary')).toBe(3)
})
