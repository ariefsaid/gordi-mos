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
import {
  assertAuditEnvironment,
  assertAuditServer,
  auditEnabled,
  auditRun,
  captureCell,
  cellsFor,
  prepareAuditPage,
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

async function setupState(page: Parameters<typeof collectContrast>[0], state: InteractionState): Promise<StateSetup> {
  if (state === 'default') return { applicable: true, selector: DEFAULT_SELECTOR, measure: 'text' }
  if (state === 'hover' || state === 'focus') {
    const target = page.locator(ACTIONABLE_SELECTOR).filter({ visible: true }).first()
    if (await target.count() === 0) return { applicable: false, selector: '', measure: 'text' }
    if (state === 'hover') await target.hover()
    else {
      await target.evaluate((element) => {
        document.getElementById('design-audit-focus-origin')?.remove()
        const origin = document.createElement('span')
        origin.id = 'design-audit-focus-origin'
        origin.tabIndex = -1
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
  await run.writer.writeJson('contrast-summary.json', {
    states: INTERACTION_STATES,
    rows: rows.length,
    applicableStates: applicability.filter((entry) => entry.applicable).length,
    notApplicableStates: applicability.filter((entry) => !entry.applicable).length,
    failures: rows.filter((row) => !row.passes || !row.observed).map((row) => ({ state: row.state, selector: row.selector, kind: row.kind, ratio: row.ratio, threshold: row.threshold })),
    applicability,
    screenshots,
  })
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.filter((row) => !row.passes || !row.observed), 'contrast or applicable interaction-state checks failed').toEqual([])
  expect(contrastThreshold('text', false)).toBe(4.5)
  expect(contrastThreshold('text', true)).toBe(3)
  expect(contrastThreshold('boundary')).toBe(3)
})
