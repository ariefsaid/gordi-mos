import { test, expect } from '@playwright/test'

import { DESIGN_QUALITY_MANIFEST, isManifestCellRunnable, manifestWithCoverageResults } from './manifest'
import {
  collectCardNesting,
  collectControls,
  collectFocusStops,
  collectFocusTraversal,
  collectGeometry,
  collectHeadings,
  collectPrimaryActionRegions,
  collectTouchSeparation,
  collectTypography,
  collectVisibleContent,
  type VisibleContentRow,
} from './measurements'
import { failureFromVisibleContentRow, type AutomaticFailure } from './change-gate.ts'
import {
  assertAuditEnvironment,
  assertAuditServer,
  auditEnabled,
  auditRun,
  compareAutomaticFailuresForLane,
  captureCell,
  cellsFor,
  observeManifestCellState,
  prepareAuditPage,
  writeAutomaticLaneSummary,
} from './runtime'

test.describe.configure({ mode: 'serial' })

async function exerciseFullValuePaths(page: import('@playwright/test').Page, cell: import('./manifest').ManifestCell): Promise<string[]> {
  const exercised: string[] = []
  const paths = DESIGN_QUALITY_MANIFEST.lists.fullValuePaths.filter((entry) =>
    (!entry.routes || entry.routes.includes(cell.route))
    && (!entry.viewports || entry.viewports.includes(cell.viewport)),
  )
  for (const pathEntry of paths) {
    if (!pathEntry.reveal) continue
    const target = page.locator(pathEntry.selector).filter({ visible: true }).first()
    if (await target.count() === 0) continue
    const expected = (await target.getAttribute('data-full-value'))
      || (await target.getAttribute('title'))
      || (await target.textContent())
      || ''
    if (pathEntry.reveal.action === 'focus') await target.focus()
    else if (pathEntry.reveal.action === 'hover') await target.hover()
    else await target.click()
    const visibleReveal = page.locator(pathEntry.reveal.selector).filter({ visible: true })
    const text = await visibleReveal.allTextContents()
    if (expected.trim() && text.some((value) => value.trim().includes(expected.trim()))) {
      exercised.push(pathEntry.selector)
    }
    if (pathEntry.reveal.action === 'click') await page.keyboard.press('Escape')
  }
  return exercised
}

test('quantitative geometry, typography, controls, focus, and state entry point writes its census', async ({ page }) => {
  test.skip(!auditEnabled(), 'set DESIGN_QUALITY_RUN=1 through scripts/design-quality-audit.sh')
  assertAuditEnvironment()
  const run = auditRun()
  await assertAuditServer(run.baseURL)

  const geometry: Record<string, unknown>[] = []
  const controls: Record<string, unknown>[] = []
  const headings: Record<string, unknown>[] = []
  const focusStops: Record<string, unknown>[] = []
  const typography: Record<string, unknown>[] = []
  const touchSeparation: Record<string, unknown>[] = []
  const regionRows: Record<string, unknown>[] = []
  const cardRows: Record<string, unknown>[] = []
  const visibleContent: VisibleContentRow[] = []
  const screenshots: string[] = []
  const observations = new Map<string, { status: 'covered' | 'untested'; evidence: string }>()
  const failures: AutomaticFailure[] = []
  const addFailure = (
    ruleId: string,
    cellId: string,
    selector: string,
    state: string,
    message: string,
    measured?: unknown,
  ) => failures.push({ ruleId, cellId, selector, state, message, measured })
  for (const cell of cellsFor(DESIGN_QUALITY_MANIFEST).filter(isManifestCellRunnable)) {
    await prepareAuditPage(page, run, cell)
    const observation = await observeManifestCellState(page, cell)
    observations.set(cell.id, observation)
    if (observation.status !== 'covered') addFailure('state.coverage', cell.id, '__state__', cell.state, observation.evidence)
    const context = {
      route: cell.route,
      journey: cell.journey,
      fixture: cell.fixture,
      viewport: cell.viewport,
      theme: cell.theme,
      language: cell.language,
      state: cell.state,
    }
    const geometrySelectors = [...new Set([
      'body',
      'main',
      '[role="dialog"]',
      '[role="listbox"]',
      '[role="menu"]',
      '[data-scroll-container]',
      '[data-primary-action-region]',
      ...DESIGN_QUALITY_MANIFEST.lists.alignedPanelGroups.map((entry) => entry.selector),
      ...DESIGN_QUALITY_MANIFEST.lists.intentionalDataScrollers.map((entry) => entry.selector),
    ])]
    const cellGeometry = await collectGeometry(page, context, geometrySelectors)
    geometry.push(...cellGeometry)
    const cellControls = await collectControls(page, context)
    controls.push(...cellControls as unknown as Record<string, unknown>[])
    const cellHeadings = await collectHeadings(page, context)
    headings.push(...cellHeadings as unknown as Record<string, unknown>[])
    const cellFocusStops = await collectFocusStops(page, context)
    focusStops.push(...cellFocusStops as unknown as Record<string, unknown>[])
    const cellTypography = await collectTypography(page, context)
    typography.push(...cellTypography as unknown as Record<string, unknown>[])
    const focusTraversal = await collectFocusTraversal(page, context)
    focusStops.push(...focusTraversal.rows as unknown as Record<string, unknown>[])
    const cellCards = await collectCardNesting(page, context)
    cardRows.push(...cellCards as unknown as Record<string, unknown>[])
    const exercisedFullValueSelectors = await exerciseFullValuePaths(page, cell)
    const cellVisibleContent = await collectVisibleContent(page, context, cell.id, exercisedFullValueSelectors)
    visibleContent.push(...cellVisibleContent)
    const primaryRegions = DESIGN_QUALITY_MANIFEST.lists.primaryActionRegions.length > 0
      ? DESIGN_QUALITY_MANIFEST.lists.primaryActionRegions
      : [{ selector: 'main', authority: 'manifest default main region' }]
    const cellRegionRows = await collectPrimaryActionRegions(page, context, primaryRegions)
    regionRows.push(...cellRegionRows as unknown as Record<string, unknown>[])
    const touchGroups = DESIGN_QUALITY_MANIFEST.lists.touchSeparationGroups.filter((group) =>
      (!group.routes || group.routes.includes(cell.route))
      && (!group.viewports || group.viewports.includes(cell.viewport)),
    )
    const cellTouchRows = cell.viewport === 'phone-390x844'
      ? await collectTouchSeparation(page, context, touchGroups)
      : []
    touchSeparation.push(...cellTouchRows as unknown as Record<string, unknown>[])
    screenshots.push(await captureCell(page, run, cell, 'quantitative'))

    if (cellGeometry.length === 0) addFailure('geometry.census', cell.id, '__geometry__', cell.state, 'geometry census returned zero visible rows')
    for (const row of cellGeometry) {
      if (row.overflowX > 1 && !DESIGN_QUALITY_MANIFEST.lists.intentionalDataScrollers.some((entry) => row.selector.includes(entry.selector))) {
        addFailure('geometry.horizontal-fit', cell.id, row.selector, cell.state, `${row.selector} overflows horizontally by ${row.overflowX}px`, row)
      }
      if (row.selector.includes('[role="dialog"]') || row.selector.includes('[role="listbox"]') || row.selector.includes('[role="menu"]')) {
        const viewport = page.viewportSize()
        if (viewport && (row.x < 0 || row.y < 0 || row.right > viewport.width + 1 || row.bottom > viewport.height + 1)) {
          addFailure('geometry.viewport-fit', cell.id, row.selector, cell.state, `${row.selector} is outside the viewport (${row.x},${row.y},${row.right},${row.bottom})`, row)
        }
      }
    }
    if (cell.viewport === 'phone-390x844') {
      for (const control of cellControls) {
        if (control.width < 44 || control.height < 44) addFailure('touch.phone-target', cell.id, control.elementPath, cell.state, `${control.role} target is ${control.width}x${control.height}px`, control)
      }
    }
    for (const control of cellControls) {
      if (!control.accessibleName.trim()) addFailure('a11y.accessible-name', cell.id, control.elementPath, cell.state, `${control.role} has no accessible name`, control)
    }
    if (cellTypography.length === 0) addFailure('typography.census', cell.id, '__typography__', cell.state, 'typography census returned zero visible rows')
    for (const row of cellTypography) {
      const minimum = row.role === 'functional' || row.role === 'label' ? 11 : 12
      if (row.fontSize < minimum) addFailure('typography.font-size', cell.id, row.selector, cell.state, `${row.role} text is ${row.fontSize}px; minimum is ${minimum}px`, row)
      const leadingFloor = row.role === 'page-title' ? 1.2 : row.role === 'heading' ? 1.25 : row.role === 'body' || row.role === 'prose' ? 1.4 : 1.2
      if (row.visualText && row.leading < leadingFloor) addFailure('typography.leading', cell.id, row.selector, cell.state, `${row.role} leading is ${row.leading.toFixed(2)}; minimum is ${leadingFloor}`, row)
      if (row.tracking < -0.04 || ((row.role === 'body' || row.role === 'prose') && row.tracking > 0.05)) {
        addFailure('typography.tracking', cell.id, row.selector, cell.state, `${row.role} tracking is ${row.tracking.toFixed(3)}em`, row)
      }
      if (row.readingMeasure !== null && row.readingMeasure > 75) addFailure('typography.reading-measure', cell.id, row.selector, cell.state, `prose measure is ${row.readingMeasure.toFixed(1)}ch`, row)
    }
    if (focusTraversal.expectedStops > 0) {
      if (focusTraversal.rows.length < focusTraversal.expectedStops) addFailure('focus.keyboard-coverage', cell.id, '__focus__', cell.state, `keyboard focus reached ${focusTraversal.rows.length}/${focusTraversal.expectedStops} initial stops`, focusTraversal)
      if (focusTraversal.cycleDetected) addFailure('focus.keyboard-order', cell.id, '__focus__', cell.state, 'keyboard focus order repeated a stop', focusTraversal)
      for (const focus of focusTraversal.rows) {
        if (!focus.hasIndicator) addFailure('focus.visible-indicator', cell.id, focus.selector, cell.state, `${focus.role} has no visible 2px focus indicator`, focus)
      }
    }
    for (const row of cellRegionRows) {
      if (!row.observed || !row.passes) addFailure('actions.primary', cell.id, row.regionSelector, cell.state, `${row.regionSelector} has ${row.count} primary actions or is missing`, row)
    }
    for (const row of cellCards) {
      if (row.nested) addFailure('structure.nested-cards', cell.id, row.selector, cell.state, `nested card ${row.selector} inside ${row.ancestor}`, row)
    }
    for (const row of cellVisibleContent) {
      if (!row.observed || !row.passed) failures.push(failureFromVisibleContentRow(row as unknown as Record<string, unknown>))
    }
    if (cell.viewport === 'phone-390x844') {
      for (const row of cellTouchRows) {
        if (row.observed && !row.passes) addFailure('touch.target-separation', cell.id, row.groupSelector, cell.state, `${row.groupSelector} targets ${row.first} and ${row.second} are ${row.gap}px apart`, row)
        if (touchGroups.some((entry) => entry.selector === row.groupSelector) && !row.observed) addFailure('touch.target-separation', cell.id, row.groupSelector, cell.state, `touch separation group ${row.groupSelector} returned zero or one visible target`, row)
      }
    }
    const h1Count = cellHeadings.filter((heading) => heading.level === 1).length
    if (h1Count !== 1) addFailure('structure.heading-outline', cell.id, '__headings__', cell.state, `expected one h1, found ${h1Count}`, cellHeadings)
    for (let index = 1; index < cellHeadings.length; index += 1) {
      if (cellHeadings[index]!.level > cellHeadings[index - 1]!.level + 1) {
        addFailure('structure.heading-outline', cell.id, '__headings__', cell.state, `heading level skipped before ${cellHeadings[index]!.text}`, cellHeadings)
      }
    }
  }

  const observedManifest = manifestWithCoverageResults(DESIGN_QUALITY_MANIFEST, observations)
  const untested = observedManifest.cells.filter((cell) => cell.status === 'untested')
  const auditMode = process.env.DESIGN_AUDIT_MODE === 'change-gate' ? 'change-gate' : 'mvp-assessment'
  const coverageFailures: AutomaticFailure[] = untested.map((cell) => ({
    ruleId: 'state.coverage',
    cellId: cell.id,
    selector: '__state__',
    state: cell.state,
    message: cell.note || 'manifest cell was untested',
  }))
  const comparison = await compareAutomaticFailuresForLane(run, [...failures, ...coverageFailures])
  await run.writer.writeJson('manifest.json', observedManifest)
  await run.writer.writeCsv('geometry.csv', [...geometry, ...focusStops, ...typography, ...touchSeparation])
  await run.writer.writeCsv('control-census.csv', [...controls, ...regionRows, ...cardRows])
  await run.writer.writeCsv('state-matrix.csv', observedManifest.cells as unknown as Record<string, unknown>[])
  await run.writer.writeCsv('visible-content.csv', visibleContent as unknown as Record<string, unknown>[])
  await writeAutomaticLaneSummary(run, 'quantitative-summary.json', {
    ruleIds: DESIGN_QUALITY_MANIFEST.rules.filter((rule) => rule.artifact === 'geometry.csv').map((rule) => rule.id),
    geometryRows: geometry.length,
    controlRows: controls.length,
    headingRows: headings.length,
    focusRows: focusStops.length,
    typographyRows: typography.length,
    touchSeparationRows: touchSeparation.length,
    regionRows: regionRows.length,
    cardRows: cardRows.length,
    visibleContentRows: visibleContent.length,
    screenshots,
    failures: comparison.failures,
    allFailures: comparison.allFailures,
    inheritedFailures: comparison.inheritedFailures,
    newFailures: comparison.newFailures,
    failureCounts: {
      all: comparison.allFailures.length,
      inherited: comparison.inheritedFailures.length,
      new: comparison.newFailures.length,
    },
    untested: untested.map((cell) => cell.id),
    auditMode,
    automaticChecksPassed: comparison.automaticChecksPassed,
    completeStateCoverage: untested.length === 0,
  }, geometry.length + controls.length + headings.length + focusStops.length + typography.length + touchSeparation.length + regionRows.length + cardRows.length + visibleContent.length)
  expect(geometry.length + controls.length).toBeGreaterThan(0)
  expect(comparison.failures, `quantitative design rules failed:\n${comparison.failures.slice(0, 50).map((failure) => failure.message).join('\n')}`).toEqual([])
  if (auditMode === 'mvp-assessment') {
    expect(untested.map((cell) => cell.id), 'every manifest cell must have deterministic rendered state evidence').toEqual([])
  }
})
