import { createRequire } from 'node:module'

import { test, expect } from '@playwright/test'

import { DESIGN_QUALITY_MANIFEST, isManifestCellRunnable } from './manifest'
import {
  assertAuditEnvironment,
  assertAuditServer,
  auditEnabled,
  auditRun,
  cellsFor,
  compareAutomaticFailuresForLane,
  observeManifestCellState,
  prepareAuditPage,
  writeAutomaticLaneSummary,
} from './runtime'
import { type AutomaticFailure } from './change-gate.ts'

const require = createRequire(import.meta.url)
const axeScript = require.resolve('axe-core/axe.min.js') as string

type AxeNode = {
  html: string
  target: string[]
  failureSummary?: string
}

type AxeViolation = {
  id: string
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null
  help: string
  helpUrl: string
  nodes: AxeNode[]
}

type AxeResult = {
  version: string
  violations: AxeViolation[]
}

test.describe.configure({ mode: 'serial' })

test('axe-core scans every rendered audit route and records moderate findings', async ({ page }) => {
  test.skip(!auditEnabled(), 'set DESIGN_QUALITY_RUN=1 through scripts/design-quality-audit.sh')
  assertAuditEnvironment()
  const run = auditRun()
  await assertAuditServer(run.baseURL)

  const findings: Record<string, unknown>[] = []
  const blocking: Record<string, unknown>[] = []
  const moderate: Record<string, unknown>[] = []
  const versions = new Set<string>()
  let scans = 0
  const runnableCells = cellsFor(DESIGN_QUALITY_MANIFEST).filter(isManifestCellRunnable)
  for (const cell of runnableCells) {
    await prepareAuditPage(page, run, cell)
    const observation = await observeManifestCellState(page, cell)
    await page.addScriptTag({ path: axeScript })
    const result = await page.evaluate(async (): Promise<AxeResult> => {
      const axeApi = (globalThis as typeof globalThis & { axe?: { version: string; run: (context: Document) => Promise<{ violations: AxeViolation[] }> } }).axe
      if (!axeApi) throw new Error('axe-core did not load in the audit page')
      const scan = await axeApi.run(document)
      return { version: axeApi.version, violations: scan.violations }
    })
    scans += 1
    versions.add(result.version)
    for (const violation of result.violations) {
      const finding = {
        route: cell.route,
        journey: cell.journey,
        fixture: cell.fixture,
        viewport: cell.viewport,
        theme: cell.theme,
        language: cell.language,
        cellId: cell.id,
        state: cell.state,
        stateObserved: observation.status === 'covered',
        stateEvidence: observation.evidence,
        id: violation.id,
        impact: violation.impact || 'unknown',
        help: violation.help,
        helpUrl: violation.helpUrl,
        nodes: violation.nodes.length,
        targets: violation.nodes.flatMap((node) => node.target),
        failureSummaries: violation.nodes.map((node) => node.failureSummary || ''),
      }
      findings.push(finding)
      if (violation.impact === 'serious' || violation.impact === 'critical') blocking.push(finding)
      if (violation.impact === 'moderate') moderate.push(finding)
    }
  }

  const gateEntries = [
    `axe_version=${[...versions].sort().join(',') || 'unknown'}`,
    `axe_cells=${runnableCells.length}`,
    `axe_findings=${findings.length}`,
    `axe_moderate=${moderate.length}`,
    `axe_serious_or_critical=${blocking.length}`,
    ...findings.map((finding) => `axe_finding=${JSON.stringify(finding)}`),
  ]
  const allFailures: AutomaticFailure[] = blocking.flatMap((finding) => {
    const targets = Array.isArray(finding.targets) ? finding.targets as string[] : []
    return [{
      ruleId: 'a11y.axe',
      cellId: String(finding.cellId || ''),
      selector: targets.join('|') || '__axe__',
      state: String(finding.state || 'default'),
      message: String(finding.help || finding.id || 'axe blocking violation'),
      measured: finding,
    }]
  })
  const comparison = await compareAutomaticFailuresForLane(run, allFailures)
  await run.writer.writeGateLog(gateEntries)
  await writeAutomaticLaneSummary(run, 'axe-summary.json', {
    cells: runnableCells.length,
    auditMode: process.env.DESIGN_AUDIT_MODE === 'change-gate' ? 'change-gate' : 'mvp-assessment',
    scans,
    versions: [...versions],
    findings,
    moderate,
    failures: comparison.failures,
    allFailures: comparison.allFailures,
    inheritedFailures: comparison.inheritedFailures,
    newFailures: comparison.newFailures,
    blocking: comparison.failures,
    allBlocking: comparison.allFailures,
    inheritedBlocking: comparison.inheritedFailures,
    newBlocking: comparison.newFailures,
    automaticChecksPassed: comparison.automaticChecksPassed,
  }, scans)

  expect(scans, 'axe-core must scan every runnable manifest route cell').toBe(runnableCells.length)
  expect(comparison.failures, 'axe-core serious and critical violations must be fixed').toEqual([])
})
