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

test('occlusion judges reachability, not whichever row a band happens to sit over', async ({ page }) => {
  // A sticky band is the designed pattern: rows pass under it on the way past. The rule must
  // fail only content that can never be brought clear. Measuring at one scroll position cannot
  // tell those apart — at rest every below-fold row of a sticky-footer surface failed, and at
  // the bottom whichever row landed behind the sticky header failed while the rows after it
  // passed. These four plants pin both directions at both edges.
  const context = {
    route: '/planted',
    journey: 'planted',
    fixture: 'planted',
    viewport: 'desktop-1440x900',
    theme: 'light',
    language: 'en',
    state: 'default',
  }
  const occlusionRow = (rows: Awaited<ReturnType<typeof collectVisibleContent>>, nth: number) => {
    const row = rows.find((entry) => entry.kind === 'viewport-occlusion' && entry.selector.endsWith(`p:nth-of-type(${nth})`))
    expect(row, JSON.stringify(rows.filter((entry) => entry.kind === 'viewport-occlusion').map((entry) => entry.selector))).toBeDefined()
    return row!
  }

  // ── Bottom edge: a sticky footer with reserve below the list ───────────────
  const footerPage = (bandPull: string) => `
    <style>
      body { margin: 0; background: rgb(255,255,255); color: rgb(20,20,20); }
      .row { height: 120px; margin: 0; }
      .band { position: sticky; bottom: 0; height: 56px; background: rgb(230, 228, 224); margin-top: ${bandPull}; }
      main::after { content: ''; display: block; height: 160px; }
    </style>
    <main>
      ${Array.from({ length: 10 }, (_, i) => `<p class="row">Row ${i + 1}</p>`).join('')}
      <p class="row final-row">Final row</p>
      <div class="band">Sticky action band</div>
    </main>
  `

  // cssPath selectors carry only positional segments; the final row is main > p(11).
  await page.setContent(footerPage('0px'))
  const reserved = await collectVisibleContent(page, context, 'planted-reserved', [])
  expect(occlusionRow(reserved, 11).passed, occlusionRow(reserved, 11).measured).toBe(true)
  // A row in the middle of the list is reachable too — it is not failed for passing under
  // the band at whatever offset the collector happened to settle on.
  expect(occlusionRow(reserved, 6).passed, occlusionRow(reserved, 6).measured).toBe(true)

  // A band pulled up over the final row keeps covering it at every offset: a real defect.
  await page.setContent(footerPage('-88px'))
  const uncovered = await collectVisibleContent(page, context, 'planted-uncovered', [])
  const brokenFinal = occlusionRow(uncovered, 11)
  expect(brokenFinal.passed, brokenFinal.measured).toBe(false)
  expect(JSON.parse(brokenFinal.measured).centerCovered).toBe(true)

  // ── Top edge: a sticky header, which the bottom-only measurement could not see ──
  const headerPage = (headPull: string) => `
    <style>
      body { margin: 0; background: rgb(255,255,255); color: rgb(20,20,20); }
      .row { height: 120px; margin: 0; }
      .head { position: sticky; top: 0; height: 56px; background: rgb(230, 228, 224); margin-bottom: ${headPull}; }
    </style>
    <main>
      <div class="head">Sticky header</div>
      ${Array.from({ length: 12 }, (_, i) => `<p class="row">Row ${i + 1}</p>`).join('')}
    </main>
  `

  // Header in flow: every row can be scrolled clear of it, including the first.
  await page.setContent(headerPage('0px'))
  const headerClear = await collectVisibleContent(page, context, 'planted-header-clear', [])
  expect(occlusionRow(headerClear, 1).passed, occlusionRow(headerClear, 1).measured).toBe(true)
  expect(occlusionRow(headerClear, 6).passed, occlusionRow(headerClear, 6).measured).toBe(true)

  // Header pulled down over the first row: the page cannot scroll above its own top, so that
  // row has nowhere clear to go and must still fail, while later rows stay reachable.
  await page.setContent(headerPage('-56px'))
  const headerPinned = await collectVisibleContent(page, context, 'planted-header-pinned', [])
  const pinnedFirst = occlusionRow(headerPinned, 1)
  expect(pinnedFirst.passed, pinnedFirst.measured).toBe(false)
  // A 120px row under a 56px header keeps its centre clear, so the overlap ratio is what
  // carries this failure — assert that rather than a mechanism this plant does not exercise.
  expect(JSON.parse(pinnedFirst.measured).intersectionRatio).toBeGreaterThan(0.1)
  expect(occlusionRow(headerPinned, 8).passed, occlusionRow(headerPinned, 8).measured).toBe(true)
})

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
