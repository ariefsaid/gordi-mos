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
} from './measurements'
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
  const screenshots: string[] = []
  const observations = new Map<string, { status: 'covered' | 'untested'; evidence: string }>()
  const failures: string[] = []
  for (const cell of cellsFor(DESIGN_QUALITY_MANIFEST).filter(isManifestCellRunnable)) {
    await prepareAuditPage(page, run, cell)
    const observation = await observeManifestCellState(page, cell)
    observations.set(cell.id, observation)
    if (observation.status !== 'covered') failures.push(`${cell.id}: ${observation.evidence}`)
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
    const primaryRegions = DESIGN_QUALITY_MANIFEST.lists.primaryActionRegions.length > 0
      ? DESIGN_QUALITY_MANIFEST.lists.primaryActionRegions
      : [{ selector: 'main', authority: 'manifest default main region' }]
    const cellRegionRows = await collectPrimaryActionRegions(page, context, primaryRegions)
    regionRows.push(...cellRegionRows as unknown as Record<string, unknown>[])
    const touchGroups = DESIGN_QUALITY_MANIFEST.lists.touchSeparationGroups.length > 0
      ? DESIGN_QUALITY_MANIFEST.lists.touchSeparationGroups
      : [{ selector: 'main', authority: 'manifest default actionable surface' }]
    const cellTouchRows = cell.viewport === 'phone-390x844'
      ? await collectTouchSeparation(page, context, touchGroups)
      : []
    touchSeparation.push(...cellTouchRows as unknown as Record<string, unknown>[])
    screenshots.push(await captureCell(page, run, cell))

    if (cellGeometry.length === 0) failures.push(`${cell.id}: geometry census returned zero visible rows`)
    for (const row of cellGeometry) {
      if (row.overflowX > 1 && !DESIGN_QUALITY_MANIFEST.lists.intentionalDataScrollers.some((entry) => row.selector.includes(entry.selector))) {
        failures.push(`${cell.id}: ${row.selector} overflows horizontally by ${row.overflowX}px`)
      }
      if (row.selector.includes('[role="dialog"]') || row.selector.includes('[role="listbox"]') || row.selector.includes('[role="menu"]')) {
        const viewport = page.viewportSize()
        if (viewport && (row.x < 0 || row.y < 0 || row.right > viewport.width + 1 || row.bottom > viewport.height + 1)) {
          failures.push(`${cell.id}: ${row.selector} is outside the viewport (${row.x},${row.y},${row.right},${row.bottom})`)
        }
      }
    }
    if (cell.viewport === 'phone-390x844') {
      for (const control of cellControls) {
        if (control.width < 44 || control.height < 44) failures.push(`${cell.id}: ${control.role} target is ${control.width}x${control.height}px`)
      }
    }
    for (const control of cellControls) {
      if (!control.accessibleName.trim()) failures.push(`${cell.id}: ${control.role} has no accessible name`)
    }
    if (cellTypography.length === 0) failures.push(`${cell.id}: typography census returned zero visible rows`)
    for (const row of cellTypography) {
      const minimum = row.role === 'functional' ? 11 : 12
      if (row.fontSize < minimum) failures.push(`${cell.id}: ${row.role} text is ${row.fontSize}px; minimum is ${minimum}px`)
      const leadingFloor = row.role === 'page-title' ? 1.2 : row.role === 'heading' ? 1.25 : row.role === 'body' || row.role === 'prose' ? 1.4 : 1.2
      if (row.leading < leadingFloor) failures.push(`${cell.id}: ${row.role} leading is ${row.leading.toFixed(2)}; minimum is ${leadingFloor}`)
      if (row.tracking < -0.04 || ((row.role === 'body' || row.role === 'prose') && row.tracking > 0.05)) {
        failures.push(`${cell.id}: ${row.role} tracking is ${row.tracking.toFixed(3)}em`)
      }
      if (row.readingMeasure !== null && row.readingMeasure > 75) failures.push(`${cell.id}: prose measure is ${row.readingMeasure.toFixed(1)}ch`)
    }
    if (focusTraversal.expectedStops > 0) {
      if (focusTraversal.rows.length !== focusTraversal.expectedStops) failures.push(`${cell.id}: keyboard focus reached ${focusTraversal.rows.length}/${focusTraversal.expectedStops} stops`)
      if (focusTraversal.cycleDetected) failures.push(`${cell.id}: keyboard focus order repeated a stop`)
      for (const focus of focusTraversal.rows) {
        if (!focus.hasIndicator) failures.push(`${cell.id}: ${focus.role} has no visible 2px focus indicator`)
      }
    }
    for (const row of cellRegionRows) {
      if (!row.observed || !row.passes) failures.push(`${cell.id}: ${row.regionSelector} has ${row.count} primary actions or is missing`)
    }
    for (const row of cellCards) {
      if (row.nested) failures.push(`${cell.id}: nested card ${row.selector} inside ${row.ancestor}`)
    }
    if (cell.viewport === 'phone-390x844') {
      for (const row of cellTouchRows) {
        if (row.observed && !row.passes) failures.push(`${cell.id}: ${row.groupSelector} targets ${row.first} and ${row.second} are ${row.gap}px apart`)
        if (DESIGN_QUALITY_MANIFEST.lists.touchSeparationGroups.some((entry) => entry.selector === row.groupSelector) && !row.observed) failures.push(`${cell.id}: touch separation group ${row.groupSelector} returned zero or one visible target`)
      }
    }
    const h1Count = cellHeadings.filter((heading) => heading.level === 1).length
    if (h1Count !== 1) failures.push(`${cell.id}: expected one h1, found ${h1Count}`)
    for (let index = 1; index < cellHeadings.length; index += 1) {
      if (cellHeadings[index]!.level > cellHeadings[index - 1]!.level + 1) {
        failures.push(`${cell.id}: heading level skipped before ${cellHeadings[index]!.text}`)
      }
    }
  }

  const observedManifest = manifestWithCoverageResults(DESIGN_QUALITY_MANIFEST, observations)
  const untested = observedManifest.cells.filter((cell) => cell.status === 'untested')
  await run.writer.writeJson('manifest.json', observedManifest)
  await run.writer.writeCsv('geometry.csv', [...geometry, ...focusStops, ...typography, ...touchSeparation])
  await run.writer.writeCsv('control-census.csv', [...controls, ...regionRows, ...cardRows])
  await run.writer.writeCsv('state-matrix.csv', observedManifest.cells as unknown as Record<string, unknown>[])
  await run.writer.writeJson('quantitative-summary.json', {
    ruleIds: DESIGN_QUALITY_MANIFEST.rules.filter((rule) => rule.artifact === 'geometry.csv').map((rule) => rule.id),
    geometryRows: geometry.length,
    controlRows: controls.length,
    headingRows: headings.length,
    focusRows: focusStops.length,
    typographyRows: typography.length,
    touchSeparationRows: touchSeparation.length,
    regionRows: regionRows.length,
    cardRows: cardRows.length,
    screenshots,
    failures,
    untested: untested.map((cell) => cell.id),
  })
  expect(geometry.length + controls.length).toBeGreaterThan(0)
  expect(failures, `quantitative design rules failed:\n${failures.slice(0, 50).join('\n')}`).toEqual([])
  expect(untested.map((cell) => cell.id), 'every manifest cell must have deterministic rendered state evidence').toEqual([])
})
