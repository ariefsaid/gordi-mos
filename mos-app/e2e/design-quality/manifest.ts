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
}

export type ManifestLists = {
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
  '/mos/cafe/log',
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
  cell('tasks-default-desktop', {
    area: 'tasks', journey: 'tasks-filter', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('tasks-default-phone', {
    area: 'tasks', journey: 'tasks-filter', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('signals-default-desktop', {
    area: 'signals', journey: 'signals-feed', route: '/mos/work/signals', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('signals-default-phone', {
    area: 'signals', journey: 'signals-feed', route: '/mos/work/signals', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('inbox-default-desktop', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('inbox-default-phone', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-opening-default-desktop', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-opening-default-phone', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-plan-default-desktop', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-plan-default-phone', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-log-default-desktop', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe/log', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-log-default-phone', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe/log', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-review-default-phone', {
    area: 'cafe-wip', journey: 'cafe-review', route: '/mos/cafe/review', fixture: 'BAR_SUPERVISOR',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-stock-default-desktop', {
    area: 'cafe-wip', journey: 'cafe-stock', route: '/mos/cafe/stock', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-stock-default-phone', {
    area: 'cafe-wip', journey: 'cafe-stock', route: '/mos/cafe/stock', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-pushes-default-desktop', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'ADMIN',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('cafe-pushes-default-phone', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'ADMIN',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'default', status: 'covered',
  }),
  cell('tasks-create-phone-en-light', {
    area: 'tasks', journey: 'tasks-create', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'create-draft', status: 'covered', primary: true,
  }),
  cell('tasks-create-desktop-id-dark', {
    area: 'tasks', journey: 'tasks-create', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'persistence-success', status: 'covered', primary: true,
  }),
  cell('tasks-filter-compact-en-light', {
    area: 'tasks', journey: 'tasks-filter', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'filtered-queue', status: 'covered',
    stateContract: {
      setup: [{ action: 'fill', selector: 'input[aria-label="Search tasks"]', value: '__design_audit_no_task_match__' }],
      assertion: { selector: '[data-collection-status="filtered-empty"]' },
    },
  }),
  cell('tasks-record-phone-id-dark', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'open-task', status: 'covered', primary: true,
  }),
  cell('tasks-record-desktop-en-light', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'MANAGER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'editable', status: 'covered', primary: true,
  }),
  cell('tasks-record-desktop-readonly', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'ORPHAN',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'read-only', status: 'covered',
    note: 'Role-correct read-only or denied record face is recorded explicitly.',
  }),
  cell('tasks-empty-phone', {
    area: 'tasks', journey: 'tasks-filter', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'empty-result', status: 'covered',
    stateContract: {
      setup: [{ action: 'fill', selector: 'input[aria-label="Search tasks"]', value: '__design_audit_no_task_match__' }],
      assertion: { selector: '[data-collection-status="filtered-empty"]' },
    },
  }),
  cell('tasks-error-phone', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'save-failure-retry', status: 'covered',
  }),
  cell('tasks-long-desktop', {
    area: 'tasks', journey: 'tasks-record', route: '/mos/work/tasks', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'id', state: 'long-content', status: 'covered',
  }),
  cell('signals-compose-phone-en-light', {
    area: 'signals', journey: 'signals-compose', route: '/mos/work/signals', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'composer', status: 'covered', primary: true,
  }),
  cell('signals-compose-desktop-id-dark', {
    area: 'signals', journey: 'signals-compose', route: '/mos/work/signals', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'delivery-failure-retry', status: 'covered', primary: true,
  }),
  cell('signals-feed-compact', {
    area: 'signals', journey: 'signals-feed', route: '/mos/work/signals', fixture: 'VIEWER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'populated-feed', status: 'covered',
    stateContract: {
      setup: [],
      assertion: { selector: '[data-testid="signal-feed"] [data-signal-id]' },
    },
  }),
  cell('signals-feed-phone-empty', {
    area: 'signals', journey: 'signals-feed', route: '/mos/work/signals', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'empty-filter-result', status: 'covered',
    stateContract: {
      setup: [{ action: 'fill', selector: 'input[aria-label="Cari Sinyal"]', value: '__design_audit_no_signal_match__' }],
      assertion: { selector: '[data-collection-status="filtered-empty"]' },
    },
  }),
  cell('signals-record-desktop', {
    area: 'signals', journey: 'signals-record', route: '/mos/work/signals', fixture: 'BAR_SUPERVISOR',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'record-panel', status: 'covered',
  }),
  cell('signals-retract-phone', {
    area: 'signals', journey: 'signals-record', route: '/mos/work/signals', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'retract-menu', status: 'covered',
  }),
  cell('inbox-unread-phone', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'unread', status: 'untested', primary: true,
    note: 'No read-only audit fixture currently guarantees at least one unread Inbox record.',
  }),
  cell('inbox-handled-desktop', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'handled', status: 'untested', primary: true,
    note: 'No read-only audit fixture currently guarantees at least one handled Inbox record.',
  }),
  cell('inbox-open-signal-compact', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'open-signal', status: 'covered',
  }),
  cell('inbox-tombstone-phone', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'retracted-tombstone', status: 'covered',
  }),
  cell('inbox-task-link-desktop', {
    area: 'inbox', journey: 'inbox-triage', route: '/mos/inbox', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'task-link', status: 'covered',
  }),
  cell('cafe-opening-assigned-phone', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'assigned-location', status: 'covered', primary: true,
    stateContract: {
      setup: [],
      assertion: { selector: '[data-testid="cafe-opening-location"]' },
    },
  }),
  cell('cafe-opening-switch-desktop', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'VIEWER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'multi-location-switch', status: 'covered', primary: true,
    stateContract: {
      setup: [{ action: 'click', selector: '.cafe-opening-location__change' }],
      assertion: { selector: '[id="cafe-opening-location-switcher"]' },
    },
  }),
  cell('cafe-opening-missing-compact', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'ORPHAN',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'missing-assignment', status: 'untested',
    note: 'ORPHAN is stopped by the authentication boundary; no linked no-location fixture exists.',
  }),
  cell('cafe-opening-failed-phone', {
    area: 'cafe-opening', journey: 'cafe-opening', route: '/mos/cafe', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'failed-configuration-load', status: 'covered',
  }),
  cell('cafe-plan-producing-phone', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'light', language: 'en', state: 'producing', status: 'covered', primary: true,
  }),
  cell('cafe-plan-receiving-desktop', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'AUDIT_RECEIVING_ONLY',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'receiving-only', status: 'covered', primary: true,
  }),
  cell('cafe-log-producing-compact', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe/log', fixture: 'BAR_MEMBER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'producing', status: 'covered', primary: true,
  }),
  cell('cafe-log-loading-phone', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe/log', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'loading', status: 'covered', primary: true,
  }),
  cell('cafe-log-success-desktop', {
    area: 'cafe-wip', journey: 'cafe-log', route: '/mos/cafe/log', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'success', status: 'covered', primary: true,
  }),
  cell('cafe-review-authorized-desktop', {
    area: 'cafe-wip', journey: 'cafe-review', route: '/mos/cafe/review', fixture: 'BAR_SUPERVISOR',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'default', status: 'covered', primary: true,
  }),
  cell('cafe-review-denied-phone', {
    area: 'cafe-wip', journey: 'cafe-review', route: '/mos/cafe/review', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'denied', status: 'covered', primary: true,
  }),
  cell('cafe-stock-empty-compact', {
    area: 'cafe-wip', journey: 'cafe-stock', route: '/mos/cafe/stock', fixture: 'VIEWER',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'empty', status: 'covered', primary: true,
  }),
  cell('cafe-stock-validation-phone', {
    area: 'cafe-wip', journey: 'cafe-stock', route: '/mos/cafe/stock', fixture: 'VIEWER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'validation', status: 'covered', primary: true,
  }),
  cell('cafe-pushes-authorized-desktop', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'ADMIN',
    viewport: 'desktop-1440x900', theme: 'light', language: 'en', state: 'success', status: 'covered', primary: true,
  }),
  cell('cafe-pushes-denied-phone', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'BAR_MEMBER',
    viewport: 'phone-390x844', theme: 'dark', language: 'id', state: 'denied', status: 'covered', primary: true,
  }),
  cell('cafe-pushes-error-compact', {
    area: 'cafe-wip', journey: 'cafe-pushes', route: '/mos/cafe/pushes', fixture: 'ADMIN',
    viewport: 'compact-1024x768', theme: 'light', language: 'en', state: 'error', status: 'covered',
  }),
  cell('cafe-wip-long-content', {
    area: 'cafe-wip', journey: 'cafe-plan', route: '/mos/cafe/plan', fixture: 'BAR_MEMBER',
    viewport: 'desktop-1440x900', theme: 'dark', language: 'id', state: 'long-content', status: 'covered',
  }),
]

const rules: EnforcementRule[] = [
  { id: 'contrast.body', class: 'automatic', population: ['text', 'body'], algorithm: 'computed foreground/background WCAG relative luminance', unit: 'ratio', threshold: '>=4.5:1', artifact: 'contrast.csv' },
  { id: 'contrast.large-text', class: 'automatic', population: ['text', 'large'], algorithm: 'computed ratio for regular >=24px or bold >=18.67px', unit: 'ratio', threshold: '>=3:1', artifact: 'contrast.csv' },
  { id: 'contrast.control-focus', class: 'automatic', population: ['controls', 'focus-ring', 'meaningful-graphics'], algorithm: 'adjacent-color contrast of boundary/indicator', unit: 'ratio', threshold: '>=3:1', artifact: 'contrast.csv' },
  { id: 'focus.visibility', class: 'automatic', population: ['keyboard-focus-stops'], algorithm: 'tab traversal records visible focus and order', unit: 'boolean/order', threshold: 'every stop visible; no trap; ring >=2px', artifact: 'geometry.csv' },
  { id: 'touch.phone-target', class: 'automatic', population: ['actionable-controls'], algorithm: 'bounding box at phone viewport', unit: 'px', threshold: '>=44x44; adjacent separation >=8px', artifact: 'geometry.csv' },
  { id: 'geometry.horizontal-fit', class: 'automatic', population: ['document', 'main', 'panels', 'popovers', 'collections'], algorithm: 'scrollWidth <= clientWidth + 1', unit: 'px', threshold: '<=1px overflow', artifact: 'geometry.csv', exceptionAuthority: 'named intentionalDataScrollers entry' },
  { id: 'geometry.popup-fit', class: 'automatic', population: ['menus', 'listboxes', 'dialogs'], algorithm: 'opened bounding box within viewport with reachable scroll', unit: 'px/boolean', threshold: 'fully contained and selected item reachable', artifact: 'geometry.csv' },
  { id: 'identity.full-value', class: 'automatic', population: ['primary-record-identity'], algorithm: 'width, accessible name, and keyboard/touch full-value path', unit: 'px/boolean', threshold: 'width >0; truncated identity remains discoverable', artifact: 'affordance-census.csv', exceptionAuthority: 'named fullValuePaths entry' },
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
  { id: 'structure.nested-cards', class: 'automatic', population: ['card-containers'], algorithm: 'DOM card containment census', unit: 'count', threshold: 'zero page-structure nesting', artifact: 'control-census.csv' },
  { id: 'states.completeness', class: 'census', population: ['manifest-cells'], algorithm: 'state matrix coverage', unit: 'status', threshold: 'all applicable states rendered', artifact: 'state-matrix.csv' },
  { id: 'a11y.axe', class: 'automatic', population: ['required-stories', 'required-routes'], algorithm: 'axe/Storybook accessibility result classification', unit: 'violations', threshold: 'zero serious/critical; moderate classified', artifact: 'gate-log.txt' },
  { id: 'impeccable.detector', class: 'automatic', population: ['production-ui'], algorithm: 'vendored Impeccable detector result', unit: 'finding count', threshold: 'zero blocking; every advisory classified', artifact: 'impeccable.json' },
  { id: 'mockup.fidelity', class: 'judgment', population: ['approved-mockup-regions'], algorithm: 'comp-diff overall and per-region comparison', unit: 'score/status', threshold: 'overall >=0.75; no required missing/contradicted', artifact: 'mockup-diff', exceptionAuthority: 'current approved mockup authority' },
]

const emptyNamedLists: ManifestLists = {
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
      routes: ['/mos/cafe/log'],
      viewports: ['phone-390x844'],
    },
  ],
}

export const DESIGN_QUALITY_MANIFEST: DesignQualityManifest = {
  version: '1.0.0',
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
