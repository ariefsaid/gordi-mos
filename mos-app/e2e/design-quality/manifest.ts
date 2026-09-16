import { CAFE_CELL_INPUTS } from './manifest-cells/cafe.ts'
import { INBOX_CELL_INPUTS } from './manifest-cells/inbox.ts'
import { SIGNAL_CELL_INPUTS } from './manifest-cells/signals.ts'
import { TASK_CELL_INPUTS } from './manifest-cells/tasks.ts'
import { frozenPopulationErrors } from './baseline-contract.ts'

/**
 * The quantitative audit's coverage contract.
 *
 * This file is deliberately data-first. The browser specs consume the same route, role,
 * viewport, theme, language, and state values that the validator checks, so a test cannot
 * silently invent a dimension outside the review ledger.
 */

export const REQUIRED_DIMENSIONS = [
  'area',
  'journey',
  'route',
  'fixture',
  'viewport',
  'theme',
  'language',
  'state',
] as const

export const REQUIRED_RULE_FIELDS = [
  'id',
  'class',
  'population',
  'algorithm',
  'unit',
  'threshold',
  'artifact',
] as const

export type RequiredDimension = (typeof REQUIRED_DIMENSIONS)[number]
export type CoverageStatus = 'covered' | 'not-applicable' | 'blocked' | 'untested'
export type EnforcementClass = 'automatic' | 'census' | 'judgment'

/**
 * A state contract is deliberately declarative. `setup` names the deterministic
 * action/fixture that establishes the state and `assertion` names the rendered
 * evidence that proves it. A prose description alone does not make a cell
 * runnable; the browser runtime still has to observe the assertion.
 */
export type ManifestStateAction = {
  action: 'click' | 'fill' | 'press'
  selector: string
  value?: string
}

export type ManifestStateContract = {
  setup: ManifestStateAction[]
  assertion: {
    selector: string
    attribute?: string
    value?: string
  }
  negativeAssertion?: {
    selector: string
    attribute?: string
    value?: string
  }
  writes?: boolean
}

export type ManifestDimensions = Record<RequiredDimension, string[]>

export type ManifestCell = {
  id: string
  area: string
  journey: string
  route: string
  fixture: string
  viewport: string
  theme: string
  language: string
  state: string
  status: CoverageStatus
  stateContract?: ManifestStateContract
  authority?: string
  primary?: boolean
  note?: string
}

export type EnforcementRule = {
  id: string
  class: EnforcementClass
  population: string[]
  algorithm: string
  unit: string
  threshold: string
  artifact: string
  exceptionAuthority?: string
}

export type NamedManifestList = {
  selector: string
  authority: string
  routes?: string[]
  viewports?: string[]
  /** Scope to the fixtures whose face renders this group. One route can present more than
   *  one face — DD-MVP-11 sends a profile with no single assigned location to the location
   *  overview, which has no capture footer — and a group absent from a face that never
   *  renders it is not a finding. */
  fixtures?: string[]
  reveal?: {
    action: 'focus' | 'hover' | 'click'
    selector: string
  }
}

export type ManifestLists = {
  nativeSelectExceptions: NamedManifestList[]
  intentionalDataScrollers: NamedManifestList[]
  alignedPanelGroups: NamedManifestList[]
  primaryActionRegions: NamedManifestList[]
  decisionGroups: NamedManifestList[]
  meaningfulGraphics: NamedManifestList[]
  fullValuePaths: NamedManifestList[]
  touchSeparationGroups: NamedManifestList[]
}

export type DesignQualityManifest = {
  version: string
  name: string
  dimensions: ManifestDimensions
  primaryJourneys: string[]
  cells: ManifestCell[]
  rules: EnforcementRule[]
  lists: ManifestLists
  readiness?: 'ready' | 'incomplete'
  readinessErrors?: string[]
  candidateSha?: string
  sessionId?: string
}

export type ManifestValidation = {
  ok: boolean
  errors: string[]
}

const areas = ['tasks', 'signals', 'inbox', 'cafe-opening', 'cafe-wip']
const journeys = [
  'tasks-create',
  'tasks-filter',
  'tasks-record',
  'signals-compose',
  'signals-feed',
  'signals-record',
  'inbox-triage',
  'cafe-opening',
  'cafe-plan',
  'cafe-log',
  'cafe-review',
  'cafe-stock',
  'cafe-pushes',
]
const routes = [
  '/mos/work/tasks',
  '/mos/work/signals',
  '/mos/inbox',
  '/mos/cafe',
  '/mos/cafe/plan',
  // DD-MVP-17 retired /mos/cafe/log as a page: it redirects to the capture root, so the
  // cafe-log journey's cells measure /mos/cafe. A retired route cannot carry coverage, and
  // leaving it in this denominator failed the manifest contract outright.
  '/mos/cafe/review',
  '/mos/cafe/stock',
  '/mos/cafe/pushes',
]
const fixtures = ['BAR_MEMBER', 'BAR_SUPERVISOR', 'VIEWER', 'MANAGER', 'ADMIN', 'ORPHAN', 'AUDIT_RECEIVING_ONLY']
const viewports = ['phone-390x844', 'compact-1024x768', 'desktop-1440x900']
const themes = ['light', 'dark']
const languages = ['en', 'id']
const states = [
  'default',
  'create-draft',
  'filtered-queue',
  'filtered-empty',
  'open-task',
  'editable',
  'read-only',
  'persistence-success',
  'save-failure-retry',
  'empty-result',
  'composer',
  'populated-feed',
  'empty-filter-result',
  'record-panel',
  'retract-menu',
  'delivery-failure-retry',
  'unread',
  'handled',
  'open-signal',
  'retracted-tombstone',
  'task-link',
  'assigned-location',
  'multi-location-switch',
  'missing-assignment',
  'failed-configuration-load',
  'producing',
  'receiving-only',
  'denied',
  'empty',
  'loading',
  'validation',
  'success',
  'error',
  'long-content',
]

const dimensions: ManifestDimensions = {
  area: areas,
  journey: journeys,
  route: routes,
  fixture: fixtures,
  viewport: viewports,
  theme: themes,
  language: languages,
  state: states,
}

function cell(
  id: string,
  values: Omit<ManifestCell, 'id'>,
): ManifestCell {
  // The route landmark is the only state the harness can establish without a
  // product-owned setup hook. Keep the other cells visible in the structural
  // manifest, but make their lack of deterministic state machinery explicit so
  // the browser lane can skip them while it continues collecting route census
  // evidence. A cell may move to `covered` only when it supplies a contract.
  if (values.state !== 'default' && values.status === 'covered' && !values.stateContract) {
    return {
      id,
      ...values,
      status: 'untested',
      note: values.note ?? 'No deterministic state setup/assertion is registered; browser state measurement is skipped.',
    }
  }
  if (values.state === 'default' && !values.stateContract) {
    return {
      id,
      ...values,
      stateContract: {
        setup: [],
        assertion: { selector: 'main, [role="main"]' },
      },
    }
  }
  return { id, ...values }
}

const cells: ManifestCell[] = [
  ...TASK_CELL_INPUTS,
  ...SIGNAL_CELL_INPUTS,
  ...INBOX_CELL_INPUTS,
  ...CAFE_CELL_INPUTS,
].map(([id, values]) => cell(id, values))

const rules: EnforcementRule[] = [
  { id: 'contrast.body', class: 'automatic', population: ['text', 'body'], algorithm: 'computed foreground/background WCAG relative luminance', unit: 'ratio', threshold: '>=4.5:1', artifact: 'contrast.csv' },
  { id: 'contrast.large-text', class: 'automatic', population: ['text', 'large'], algorithm: 'computed ratio for regular >=24px or bold >=18.67px', unit: 'ratio', threshold: '>=3:1', artifact: 'contrast.csv' },
  { id: 'contrast.control-focus', class: 'automatic', population: ['controls', 'focus-ring', 'meaningful-graphics'], algorithm: 'adjacent-color contrast of boundary/indicator', unit: 'ratio', threshold: '>=3:1', artifact: 'contrast.csv' },
  { id: 'focus.visibility', class: 'automatic', population: ['keyboard-focus-stops'], algorithm: 'tab traversal records visible focus and order', unit: 'boolean/order', threshold: 'every stop visible; no trap; ring >=2px', artifact: 'geometry.csv' },
  { id: 'touch.phone-target', class: 'automatic', population: ['actionable-controls'], algorithm: 'bounding box at phone viewport', unit: 'px', threshold: '>=44x44; adjacent separation >=8px', artifact: 'geometry.csv' },
  { id: 'geometry.horizontal-fit', class: 'automatic', population: ['document', 'main', 'panels', 'popovers', 'collections'], algorithm: 'scrollWidth <= clientWidth + 1', unit: 'px', threshold: '<=1px overflow', artifact: 'geometry.csv', exceptionAuthority: 'named intentionalDataScrollers entry' },
  { id: 'geometry.popup-fit', class: 'automatic', population: ['menus', 'listboxes', 'dialogs'], algorithm: 'opened bounding box within viewport with reachable scroll', unit: 'px/boolean', threshold: 'fully contained and selected item reachable', artifact: 'geometry.csv' },
  { id: 'identity.full-value', class: 'automatic', population: ['primary-record-identity'], algorithm: 'width, accessible name, and keyboard/touch full-value path', unit: 'px/boolean', threshold: 'width >0; truncated identity remains discoverable', artifact: 'affordance-census.csv', exceptionAuthority: 'named fullValuePaths entry' },
  { id: 'content.text-truncation', class: 'automatic', population: ['visible-text'], algorithm: 'scroll/client geometry, line clamp, and text-overflow with an exercised visible reveal path', unit: 'px/boolean', threshold: 'unclipped or full value visibly revealed in the same cell', artifact: 'visible-content.csv', exceptionAuthority: 'named fullValuePaths entry' },
  { id: 'geometry.viewport-occlusion', class: 'automatic', population: ['visible-text', 'actionable-controls', 'persistent-bands'], algorithm: 'target/band intersection and center coverage with reachable viewport height', unit: 'ratio/boolean', threshold: '<=10% intersection; center uncovered; fully reachable', artifact: 'visible-content.csv' },
  { id: 'touch.phone-separation', class: 'automatic', population: ['every-visible-phone-control'], algorithm: 'nearest actionable neighbour in the same semantic container', unit: 'px/count', threshold: 'target >=44x44; nearest edge distance >=8; population >0', artifact: 'visible-content.csv' },
  { id: 'geometry.rail-containment', class: 'automatic', population: ['rail', 'main-scroll-region'], algorithm: 'rail top delta before/after driven main scroll', unit: 'px', threshold: '<=1px; document scroll remains zero', artifact: 'geometry.csv' },
  { id: 'geometry.split-panels', class: 'automatic', population: ['aligned-panel-groups'], algorithm: 'sibling panel height difference', unit: 'px', threshold: '<=1px unless authority says independent', artifact: 'geometry.csv', exceptionAuthority: 'named alignedPanelGroups entry' },
  { id: 'type.minimum-size', class: 'automatic', population: ['body', 'functional-ui'], algorithm: 'computed font-size', unit: 'px', threshold: 'body >=12; functional >=11', artifact: 'geometry.csv' },
  { id: 'type.leading', class: 'automatic', population: ['page-title', 'heading', 'label', 'body'], algorithm: 'computed line-height / font-size by DESIGN role', unit: 'ratio', threshold: 'role token floor', artifact: 'geometry.csv' },
  { id: 'type.tracking', class: 'automatic', population: ['text'], algorithm: 'computed letter-spacing in em', unit: 'em', threshold: '>=-0.04; body <=0.05', artifact: 'geometry.csv' },
  { id: 'type.reading-measure', class: 'automatic', population: ['prose-containers'], algorithm: 'container width / 1ch', unit: 'ch', threshold: '<=75ch; DESIGN stricter value wins', artifact: 'geometry.csv' },
  { id: 'structure.heading-outline', class: 'automatic', population: ['page-headings'], algorithm: 'ordered heading level census', unit: 'count/order', threshold: 'one h1; no skipped level', artifact: 'control-census.csv' },
  { id: 'actions.primary', class: 'census', population: ['primaryActionRegions'], algorithm: 'visible solid-primary action census by region', unit: 'count', threshold: '<=1 per region; one create route', artifact: 'control-census.csv', exceptionAuthority: 'named primaryActionRegions entry' },
  { id: 'cognitive.decision-load', class: 'census', population: ['decisionGroups'], algorithm: 'simultaneously visible choices per group', unit: 'count', threshold: '<=4; workspace nav <=5', artifact: 'control-census.csv', exceptionAuthority: 'named decisionGroups entry' },
  { id: 'controls.duplicate-axes', class: 'census', population: ['controls'], algorithm: 'label/action/state axis census', unit: 'count', threshold: 'zero undocumented duplicates', artifact: 'control-census.csv' },
  { id: 'controls.native-select', class: 'automatic', population: ['visible-native-selects'], algorithm: 'rendered select census excluding hidden shared-component form bridges', unit: 'count', threshold: 'zero unless an exact named exception cites authority', artifact: 'control-consistency.csv', exceptionAuthority: 'named nativeSelectExceptions entry' },
  { id: 'controls.bounded-choice-lifecycle', class: 'automatic', population: ['rendered-comboboxes', 'rendered-listboxes'], algorithm: 'drive closed, open, selected, disabled, error, Arrow key, typeahead, Enter, Escape, outside dismissal, and focus return states', unit: 'boolean/state', threshold: 'every applicable transition passes; disabled and error represented across the population', artifact: 'control-consistency.csv' },
  { id: 'controls.popup-containment', class: 'automatic', population: ['opened-choice-popups'], algorithm: 'opened popup viewport geometry plus active option reachability', unit: 'px/boolean', threshold: 'fully contained and active option reachable', artifact: 'control-consistency.csv' },
  { id: 'controls.bounded-choice-contrast', class: 'automatic', population: ['bounded-choice-states'], algorithm: 'computed foreground/background WCAG relative luminance for each driven state', unit: 'ratio', threshold: '>=4.5:1 text; >=3:1 boundaries and state indicators', artifact: 'control-consistency.csv' },
  { id: 'controls.variant-classification', class: 'census', population: ['buttons', 'links', 'bounded-choices', 'chips', 'pills'], algorithm: 'classify each visible control by approved component, variant, size, state, and authority', unit: 'count/boolean', threshold: 'every control classified; zero raw unclassified controls; population >0 per runnable cell', artifact: 'control-consistency.csv' },
  { id: 'controls.variant-consistency', class: 'automatic', population: ['classified-control-groups'], algorithm: 'compare computed geometry and colors within component, variant, size, and state groups', unit: 'px/count', threshold: '<=1px geometry spread; identical resolved foreground and background colors', artifact: 'control-consistency.csv' },
  { id: 'structure.nested-cards', class: 'automatic', population: ['card-containers'], algorithm: 'DOM card containment census', unit: 'count', threshold: 'zero page-structure nesting', artifact: 'control-census.csv' },
  { id: 'states.completeness', class: 'census', population: ['manifest-cells'], algorithm: 'state matrix coverage', unit: 'status', threshold: 'all applicable states rendered', artifact: 'state-matrix.csv' },
  { id: 'a11y.axe', class: 'automatic', population: ['required-stories', 'required-routes'], algorithm: 'axe/Storybook accessibility result classification', unit: 'violations', threshold: 'zero serious/critical; moderate classified', artifact: 'gate-log.txt' },
  { id: 'impeccable.detector', class: 'automatic', population: ['production-ui'], algorithm: 'vendored Impeccable detector result', unit: 'finding count', threshold: 'zero blocking; every advisory classified', artifact: 'impeccable.json' },
  { id: 'mockup.fidelity', class: 'judgment', population: ['approved-mockup-regions'], algorithm: 'comp-diff overall and per-region comparison', unit: 'score/status', threshold: 'overall >=0.75; no required missing/contradicted', artifact: 'mockup-diff', exceptionAuthority: 'current approved mockup authority' },
]

const emptyNamedLists: ManifestLists = {
  nativeSelectExceptions: [],
  intentionalDataScrollers: [],
  alignedPanelGroups: [],
  primaryActionRegions: [],
  decisionGroups: [],
  meaningfulGraphics: [],
  fullValuePaths: [],
  touchSeparationGroups: [
    {
      selector: '.kl-footer-actions',
      authority: 'DESIGN.md phone target spacing; Café Log exposes adjacent Discard and Submit actions',
      routes: ['/mos/cafe'],
      viewports: ['phone-390x844'],
      // The capture footer rides the capture face. A profile without a single assigned
      // location gets the location overview first (DD-MVP-11), which has no footer to
      // measure — the group was reported missing there once the root became the capture
      // surface and both faces started sharing this route.
      fixtures: ['BAR_MEMBER'],
    },
  ],
}

export const DESIGN_QUALITY_MANIFEST: DesignQualityManifest = {
  version: '1.1.0',
  name: 'mvp-quantitative-ui-quality',
  dimensions,
  primaryJourneys: ['tasks-create', 'tasks-record', 'signals-compose', 'inbox-triage', 'cafe-opening', 'cafe-plan', 'cafe-log'],
  cells,
  rules,
  lists: emptyNamedLists,
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function validateManifest(manifest: DesignQualityManifest): ManifestValidation {
  const errors: string[] = []
  errors.push(...frozenPopulationErrors(Array.isArray(manifest.cells) ? manifest.cells : []))
  if (!isNonEmptyString(manifest.version)) errors.push('manifest version is required')
  if (!isNonEmptyString(manifest.name)) errors.push('manifest name is required')
  const actualDimensions = Object.keys(manifest.dimensions ?? {})
  if (JSON.stringify(actualDimensions) !== JSON.stringify(REQUIRED_DIMENSIONS)) {
    errors.push(`dimensions must declare exactly: ${REQUIRED_DIMENSIONS.join(', ')}`)
  }

  for (const dimension of REQUIRED_DIMENSIONS) {
    const values = manifest.dimensions?.[dimension]
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => !isNonEmptyString(value))) {
      errors.push(`dimension ${dimension} must be a non-empty list of strings`)
    }
  }

  if (!Array.isArray(manifest.cells) || manifest.cells.length === 0) {
    errors.push('manifest must contain at least one coverage cell')
  }

  const dimensionsRecord = manifest.dimensions ?? ({} as ManifestDimensions)
  const missingValues = new Map<RequiredDimension, Set<string>>(
    REQUIRED_DIMENSIONS.map((dimension) => [dimension, new Set(dimensionsRecord[dimension] ?? [])]),
  )
  const ids = new Set<string>()
  for (const cellEntry of manifest.cells ?? []) {
    if (!isNonEmptyString(cellEntry.id)) errors.push('every cell requires a non-empty id')
    else if (ids.has(cellEntry.id)) errors.push(`cell id is duplicated: ${cellEntry.id}`)
    else ids.add(cellEntry.id)
    for (const dimension of REQUIRED_DIMENSIONS) {
      const value = cellEntry[dimension]
      if (!isNonEmptyString(value)) {
        errors.push(`cell ${cellEntry.id || '<unknown>'} is missing ${dimension}`)
        continue
      }
      if (!dimensionsRecord[dimension]?.includes(value)) {
        errors.push(`cell ${cellEntry.id || '<unknown>'} uses unknown ${dimension} ${value}`)
      }
      missingValues.get(dimension)?.delete(value)
    }
    if (!['covered', 'not-applicable', 'blocked', 'untested'].includes(cellEntry.status)) {
      errors.push(`cell ${cellEntry.id || '<unknown>'} has invalid status ${cellEntry.status}`)
    }
    if (cellEntry.status === 'not-applicable' && !isNonEmptyString(cellEntry.authority)) {
      errors.push(`cell ${cellEntry.id || '<unknown>'} is not-applicable without authority`)
    }
    if ((cellEntry.status === 'blocked' || cellEntry.status === 'untested') && !isNonEmptyString(cellEntry.note)) {
      errors.push(`cell ${cellEntry.id || '<unknown>'} is ${cellEntry.status} without an explicit reason`)
    }
    if (cellEntry.status === 'covered') {
      if (!Array.isArray(cellEntry.stateContract?.setup)) {
        errors.push(`cell ${cellEntry.id || '<unknown>'} is covered without deterministic state setup`)
      }
      for (const action of cellEntry.stateContract?.setup ?? []) {
        if (!['click', 'fill', 'press'].includes(action.action) || !isNonEmptyString(action.selector)) {
          errors.push(`cell ${cellEntry.id || '<unknown>'} has an invalid state setup action`)
        }
        if ((action.action === 'fill' || action.action === 'press') && !isNonEmptyString(action.value)) {
          errors.push(`cell ${cellEntry.id || '<unknown>'} ${action.action} setup requires a value`)
        }
      }
      if (!isNonEmptyString(cellEntry.stateContract?.assertion?.selector)) {
        errors.push(`cell ${cellEntry.id || '<unknown>'} is covered without deterministic state assertion`)
      }
      if (cellEntry.state !== 'default') {
        const assertionSelector = cellEntry.stateContract?.assertion?.selector?.trim() ?? ''
        if (/^main(?:\s*,\s*\[role=["']main["']\])?$/.test(assertionSelector)) {
          errors.push(`cell ${cellEntry.id || '<unknown>'} uses a generic main landmark as non-default state evidence`)
        }
        if (!isNonEmptyString(cellEntry.stateContract?.negativeAssertion?.selector)) {
          errors.push(`cell ${cellEntry.id || '<unknown>'} has no negative assertion distinguishing it from default`)
        }
      }
    }
  }
  for (const dimension of REQUIRED_DIMENSIONS) {
    const missing = [...(missingValues.get(dimension) ?? [])]
    if (missing.length > 0) errors.push(`${dimension} values lack coverage: ${missing.join(', ')}`)
  }

  if (!Array.isArray(manifest.primaryJourneys) || manifest.primaryJourneys.length === 0) {
    errors.push('manifest must declare primaryJourneys')
  }
  for (const journey of manifest.primaryJourneys ?? []) {
    const journeyCells = (manifest.cells ?? []).filter((entry) => entry.journey === journey)
    if (journeyCells.length === 0) {
      errors.push(`primary journey ${journey} has no cells`)
      continue
    }
    for (const viewport of ['phone-390x844', 'desktop-1440x900']) {
      if (!journeyCells.some((entry) => entry.viewport === viewport)) {
        errors.push(`primary journey ${journey} lacks ${viewport} coverage`)
      }
    }
  }

  for (const rule of manifest.rules ?? []) {
    for (const field of REQUIRED_RULE_FIELDS) {
      const value = rule[field]
      if (field === 'population') {
        if (!Array.isArray(value)) errors.push(`rule ${rule.id || '<unknown>'} population must be an array`)
      } else if (!isNonEmptyString(value)) {
        errors.push(`rule ${rule.id || '<unknown>'} is missing ${field}`)
      }
    }
    if (!['automatic', 'census', 'judgment'].includes(rule.class)) {
      errors.push(`rule ${rule.id || '<unknown>'} has invalid enforcement class ${rule.class}`)
    }
  }

  const listNames: (keyof ManifestLists)[] = [
    'nativeSelectExceptions',
    'intentionalDataScrollers',
    'alignedPanelGroups',
    'primaryActionRegions',
    'decisionGroups',
    'meaningfulGraphics',
    'fullValuePaths',
    'touchSeparationGroups',
  ]
  for (const listName of listNames) {
    const entries = manifest.lists?.[listName]
    if (!Array.isArray(entries)) {
      errors.push(`named list ${listName} must be present, even when empty`)
      continue
    }
    for (const entry of entries) {
      if (!isNonEmptyString(entry.selector) || !isNonEmptyString(entry.authority)) {
        errors.push(`named list ${listName} entries require selector and authority`)
      }
      if (listName === 'fullValuePaths'
        && (!['focus', 'hover', 'click'].includes(entry.reveal?.action ?? '')
          || !isNonEmptyString(entry.reveal?.selector))) {
        errors.push(`named list fullValuePaths entry ${entry.selector || '<unknown>'} requires a driven visible reveal`)
      }
      if (entry.routes?.some((route) => !manifest.dimensions.route.includes(route))) {
        errors.push(`named list ${listName} entry uses a route outside the manifest dimensions`)
      }
      if (entry.viewports?.some((viewport) => !manifest.dimensions.viewport.includes(viewport))) {
        errors.push(`named list ${listName} entry uses a viewport outside the manifest dimensions`)
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Readiness is intentionally a second check. A structurally valid manifest may
 * record blocked or untested cells while a browser run continues collecting
 * evidence for every runnable cell.
 */
export function validateManifestReadiness(manifest: DesignQualityManifest): ManifestValidation {
  const structural = validateManifest(manifest)
  const errors = [...structural.errors]
  for (const cellEntry of manifest.cells ?? []) {
    if (cellEntry.status === 'blocked' || cellEntry.status === 'untested') {
      errors.push(`cell ${cellEntry.id || '<unknown>'} is ${cellEntry.status}; readiness cannot be green`)
    }
    if (cellEntry.status === 'covered' && (!Array.isArray(cellEntry.stateContract?.setup) || !cellEntry.stateContract?.assertion?.selector)) {
      errors.push(`cell ${cellEntry.id || '<unknown>'} lacks a runnable deterministic state contract`)
    }
  }
  return { ok: errors.length === 0, errors }
}

export function assertManifestValid(manifest: DesignQualityManifest): void {
  const result = validateManifest(manifest)
  if (!result.ok) throw new Error(`design-quality manifest is incomplete:\n- ${result.errors.join('\n- ')}`)
}

export function assertManifestReady(manifest: DesignQualityManifest): void {
  const result = validateManifestReadiness(manifest)
  if (!result.ok) throw new Error(`design-quality manifest is not ready:\n- ${result.errors.join('\n- ')}`)
}

export function isManifestCellRunnable(cellEntry: ManifestCell): boolean {
  return cellEntry.status === 'covered'
    && Array.isArray(cellEntry.stateContract?.setup)
    && isNonEmptyString(cellEntry.stateContract?.assertion?.selector)
}

export function manifestWithRunMetadata(
  manifest: DesignQualityManifest,
  candidateSha: string,
  sessionId: string,
): DesignQualityManifest {
  assertManifestValid(manifest)
  return { ...structuredClone(manifest), candidateSha, sessionId }
}

/** Build JSON-safe metadata for the runner without changing the shared source manifest. */
export function manifestForArtifact(
  candidateSha: string,
  sessionId: string,
): DesignQualityManifest {
  return manifestWithRunMetadata(DESIGN_QUALITY_MANIFEST, candidateSha, sessionId)
}

/** Apply observed browser state results before the artifact is marked ready. */
export function manifestWithCoverageResults(
  manifest: DesignQualityManifest,
  observations: ReadonlyMap<string, { status: 'covered' | 'untested'; evidence: string }>,
): DesignQualityManifest {
  const next = structuredClone(manifest)
  next.cells = next.cells.map((cellEntry) => {
    if (cellEntry.status === 'not-applicable' || cellEntry.status === 'blocked' || cellEntry.status === 'untested') {
      return { ...cellEntry, note: cellEntry.note ?? `state is ${cellEntry.status}; browser measurement was skipped` }
    }
    const observation = observations.get(cellEntry.id)
    if (!observation) return { ...cellEntry, status: 'untested', note: 'No browser observation was recorded for this cell.' }
    return { ...cellEntry, status: observation.status, note: observation.evidence }
  })
  const readiness = validateManifestReadiness(next)
  return {
    ...next,
    readiness: readiness.ok ? 'ready' : 'incomplete',
    readinessErrors: readiness.errors,
  }
}

export { areas as MVP_AREAS, journeys as MVP_JOURNEYS, routes as MVP_ROUTES, fixtures as AUDIT_FIXTURES, viewports as AUDIT_VIEWPORTS, themes as AUDIT_THEMES, languages as AUDIT_LANGUAGES, states as AUDIT_STATES }
