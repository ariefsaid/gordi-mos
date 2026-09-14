import { test, expect } from '@playwright/test'

import { DESIGN_QUALITY_MANIFEST, isManifestCellRunnable } from './manifest'
import { collectCardNesting } from './measurements'
import {
  assertAuditEnvironment,
  assertAuditServer,
  auditEnabled,
  auditRun,
  captureCell,
  cellsFor,
  observeManifestCellState,
  prepareAuditPage,
} from './runtime'

test.describe.configure({ mode: 'serial' })

type CensusContext = {
  route: string
  journey: string
  fixture: string
  viewport: string
  theme: string
  language: string
  state: string
}

test('anti-slop census entry point records numbers, controls, cards, headings, affordances, and copy', async ({ page }) => {
  test.skip(!auditEnabled(), 'set DESIGN_QUALITY_RUN=1 through scripts/design-quality-audit.sh')
  assertAuditEnvironment()
  const run = auditRun()
  await assertAuditServer(run.baseURL)

  const numberRows: Record<string, unknown>[] = []
  const controlRows: Record<string, unknown>[] = []
  const affordanceRows: Record<string, unknown>[] = []
  const copyRows: Record<string, unknown>[] = []
  const stateRows: Record<string, unknown>[] = []
  const screenshots: string[] = []
  const failures: string[] = []
  const runnableCells = cellsFor(DESIGN_QUALITY_MANIFEST).filter(isManifestCellRunnable)
  for (const cell of runnableCells) {
    await prepareAuditPage(page, run, cell)
    const observation = await observeManifestCellState(page, cell)
    const context: CensusContext = {
      route: cell.route,
      journey: cell.journey,
      fixture: cell.fixture,
      viewport: cell.viewport,
      theme: cell.theme,
      language: cell.language,
      state: cell.state,
    }
    const census = await page.evaluate((pageContext) => {
      const numberPattern = /\b\d[\d,.%]*\b/g
      const controlSelector = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"]'
      const controls = Array.from(document.querySelectorAll<HTMLElement>(controlSelector)).flatMap((element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) return []
        const labelledBy = element.getAttribute('aria-labelledby')
        const labelledText = labelledBy
          ? labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim()
          : ''
        return [{
        ...pageContext,
        role: element.getAttribute('role') || element.tagName.toLowerCase(),
        name: element.getAttribute('aria-label') || labelledText || element.getAttribute('title') || element.textContent?.trim() || '',
        action: element.getAttribute('data-action') || element.getAttribute('type') || '',
        axis: element.getAttribute('aria-controls') || element.getAttribute('name') || '',
        primary: element.matches('[data-variant="primary"], .button-primary, .btn-primary'),
        }]
      })
      const headings = Array.from(document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
      const textFragments = Array.from(document.querySelectorAll<HTMLElement>('body *')).flatMap((element) => {
        const style = getComputedStyle(element)
        if (style.display === 'none' || style.visibility === 'hidden') return []
        return Array.from(element.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent?.trim() || '')
          .filter(Boolean)
          .map((text) => ({ element: element.tagName.toLowerCase(), text }))
      })
      const numbers = textFragments.flatMap(({ element, text }) => {
        const values = text.match(numberPattern) || []
        return values.map((value) => ({
          ...pageContext,
          element,
          value,
          context: text,
          naked: text === value,
        }))
      })
      const affordances = Array.from(document.querySelectorAll<HTMLElement>('[title], [aria-label], [data-full-value], h1, h2, h3')).map((element) => ({
        ...pageContext,
        kind: element.tagName.toLowerCase(),
        accessibleName: element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.trim() || '',
        fullValue: element.getAttribute('data-full-value') || element.getAttribute('title') || element.textContent?.trim() || '',
      }))
      return {
        controls,
        headings: headings.map((element) => ({ ...pageContext, level: Number(element.tagName.slice(1)), text: element.innerText?.trim() || '' })),
        numbers,
        copy: textFragments.map(({ element, text }) => ({ ...pageContext, element, text })),
        affordances,
      }
    }, context)
    const cardNesting = await collectCardNesting(page, context)
    const nestedCards = cardNesting.filter((card) => card.nested)
    controlRows.push(...census.controls, ...cardNesting as unknown as Record<string, unknown>[])
    numberRows.push(...census.numbers)
    copyRows.push(...census.copy)
    affordanceRows.push(...census.affordances)
    stateRows.push({ ...context, status: observation.status, evidence: observation.evidence, nestedCards: nestedCards.length, headingCount: census.headings.length })
    screenshots.push(await captureCell(page, run, cell))
    if (observation.status !== 'covered') failures.push(`${cell.id}: ${observation.evidence}`)
    if (nestedCards.length > 0) failures.push(`${cell.id}: ${nestedCards.length} nested card containers`)
    if (census.headings.filter((heading) => heading.level === 1).length !== 1) failures.push(`${cell.id}: expected one h1`)
    for (let index = 1; index < census.headings.length; index += 1) {
      if (census.headings[index]!.level > census.headings[index - 1]!.level + 1) failures.push(`${cell.id}: skipped heading level`)
    }
    for (const control of census.controls) {
      if (!String(control.name).trim()) failures.push(`${cell.id}: unnamed ${control.role}`)
    }
    const axes = census.controls
      .filter((control) => String(control.axis).trim())
      .map((control) => `${control.action}|${control.axis}`)
    if (new Set(axes).size !== axes.length) failures.push(`${cell.id}: duplicate control action/axis pair`)
    for (const pathEntry of DESIGN_QUALITY_MANIFEST.lists.fullValuePaths) {
      const fullValue = await page.locator(pathEntry.selector).filter({ visible: true }).evaluateAll((elements) => elements.map((element) => ({
        text: element.textContent?.trim() || '',
        accessibleName: element.getAttribute('aria-label') || element.getAttribute('title') || '',
        value: element.getAttribute('data-full-value') || element.getAttribute('title') || element.textContent?.trim() || '',
      })))
      if (fullValue.length === 0) {
        failures.push(`${cell.id}: named full-value path ${pathEntry.selector} returned zero visible elements`)
        affordanceRows.push({ ...context, ruleId: 'identity.full-value', selector: pathEntry.selector, authority: pathEntry.authority, observed: false, passes: false })
      } else {
        for (const value of fullValue) {
          const passes = Boolean(value.value.trim() && (value.text.trim() || value.accessibleName.trim()))
          affordanceRows.push({ ...context, ruleId: 'identity.full-value', selector: pathEntry.selector, authority: pathEntry.authority, observed: true, passes, fullValue: value.value })
          if (!passes) failures.push(`${cell.id}: ${pathEntry.selector} has no discoverable full value`)
        }
      }
    }
    for (const group of DESIGN_QUALITY_MANIFEST.lists.decisionGroups) {
      const groupCount = await page.locator(group.selector).filter({ visible: true }).evaluateAll((elements) => elements.reduce((count, root) => count + root.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="radio"]').length, 0))
      const limit = group.selector.includes('nav') ? 5 : 4
      affordanceRows.push({ ...context, ruleId: 'cognitive.decision-load', selector: group.selector, authority: group.authority, count: groupCount, limit, observed: groupCount > 0, passes: groupCount > 0 && groupCount <= limit })
      if (groupCount === 0 || groupCount > limit) failures.push(`${cell.id}: decision group ${group.selector} has ${groupCount} visible choices (limit ${limit})`)
    }
  }

  await run.writer.writeCsv('number-census.csv', numberRows)
  await run.writer.writeCsv('control-census.csv', controlRows)
  await run.writer.writeCsv('affordance-census.csv', affordanceRows)
  await run.writer.writeCsv('copy-census.csv', copyRows)
  await run.writer.writeJson('anti-slop-summary.json', {
    cells: runnableCells.length,
    numberRows: numberRows.length,
    controlRows: controlRows.length,
    affordanceRows: affordanceRows.length,
    copyRows: copyRows.length,
    failures,
    screenshots,
  })
  expect(stateRows.length).toBe(runnableCells.length)
  expect(failures, `anti-slop census rules failed:\n${failures.slice(0, 50).join('\n')}`).toEqual([])
})
