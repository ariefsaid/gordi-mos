import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, '..')
const SPEC_PATH = 'docs/specs/v3-redesign.spec.md'
const PREVIEW_PATH = 'mos-app/.storybook/preview.tsx'
const MAIN_PATH = 'mos-app/.storybook/main.ts'
const RUNNER_PATH = 'mos-app/.storybook/test-runner.ts'
const PACKAGE_JSON_PATH = 'mos-app/package.json'
const PACKAGE_LOCK_PATH = 'mos-app/package-lock.json'
const MATRIX_JSON_PATH = 'docs/reference/v3-storybook-matrix.json'
const MATRIX_MARKDOWN_PATH = 'docs/reference/v3-storybook-matrix.md'

const STORY_FILES = [
  'mos-app/src/stories/v3/foundation.stories.tsx',
  'mos-app/src/stories/v3/controls.stories.tsx',
  'mos-app/src/stories/v3/feedback.stories.tsx',
  'mos-app/src/stories/v3/page-compositions.stories.tsx',
  'mos-app/src/stories/v3/dense-collections.stories.tsx',
  'mos-app/src/stories/v3/overlays.stories.tsx',
  'mos-app/src/stories/v3/accessibility-responsive.stories.tsx',
]

const EXPECTED_STORIES = {
  'mos-app/src/stories/v3/foundation.stories.tsx': [
    'RuntimeTypography',
    'TokenRoles',
    'ResponsiveFrames',
    'FocusSurface',
  ],
  'mos-app/src/stories/v3/controls.stories.tsx': [
    'ButtonStateMatrix',
    'FieldStateMatrix',
    'SelectionAndStatus',
    'KeyboardFocus',
  ],
  'mos-app/src/stories/v3/feedback.stories.tsx': [
    'EmptyStateVariants',
    'ErrorAndRetry',
    'LoadingShells',
    'SavingAndSaved',
  ],
  'mos-app/src/stories/v3/page-compositions.stories.tsx': [
    'Workspace',
    'FocusedRecord',
    'Management',
  ],
  'mos-app/src/stories/v3/dense-collections.stories.tsx': [
    'ReadyDesktop',
    'ReadyIntermediate',
    'ReadyPhone',
    'Loading',
    'Empty',
    'FilteredEmpty',
    'Error',
  ],
  'mos-app/src/stories/v3/overlays.stories.tsx': [
    'CommandSearch',
    'Confirmation',
    'AnchoredMenu',
    'CurrentRecordPanelShell',
  ],
  'mos-app/src/stories/v3/accessibility-responsive.stories.tsx': [
    'RuntimeAndViewport',
    'KeyboardJourneys',
  ],
}

const REQUIRED_CANONICAL_COMPONENTS = {
  Button: { file: 'mos-app/src/components/ui/button.tsx', importPath: '@/components/ui/button' },
  TextInput: { file: 'mos-app/src/components/ui/text-input.tsx', importPath: '@/components/ui/text-input' },
  Select: { file: 'mos-app/src/components/ui/select.tsx', importPath: '@/components/ui/select' },
  Checkbox: { file: 'mos-app/src/components/ui/checkbox.tsx', importPath: '@/components/ui/checkbox' },
  Toggle: { file: 'mos-app/src/components/ui/toggle.tsx', importPath: '@/components/ui/toggle' },
  Pill: { file: 'mos-app/src/components/ui/pill.tsx', importPath: '@/components/ui/pill' },
  StatusPill: { file: 'mos-app/src/components/tasks/status-pill.tsx', importPath: '@/components/tasks/status-pill' },
  EmptyState: { file: 'mos-app/src/components/ui/state-kit.tsx', importPath: '@/components/ui/state-kit' },
  ErrorState: { file: 'mos-app/src/components/ui/state-kit.tsx', importPath: '@/components/ui/state-kit' },
  SkeletonRows: { file: 'mos-app/src/components/ui/state-kit.tsx', importPath: '@/components/ui/state-kit' },
  LoadingShell: { file: 'mos-app/src/components/ui/state-kit.tsx', importPath: '@/components/ui/state-kit' },
  PlanQtyStepper: { file: 'mos-app/src/components/kitchen/plan-qty-stepper.tsx', importPath: '@/components/kitchen/plan-qty-stepper' },
  PlanQtyCell: { file: 'mos-app/src/components/kitchen/plan-qty-cell.tsx', importPath: '@/components/kitchen/plan-qty-cell' },
  PageFrame: { file: 'mos-app/src/shell/page-frame.tsx', importPath: '@/shell/page-frame' },
  PageHead: { file: 'mos-app/src/shell/page-head.tsx', importPath: '@/shell/page-head' },
  DataTable: { file: 'mos-app/src/components/dashboard/data-table.tsx', importPath: '@/components/dashboard/data-table' },
  CommandMenu: { file: 'mos-app/src/components/command/command-menu.tsx', importPath: '@/components/command/command-menu' },
  ConfirmDialog: { file: 'mos-app/src/components/ui/confirm-dialog.tsx', importPath: '@/components/ui/confirm-dialog' },
  RowMenu: { file: 'mos-app/src/components/tasks/row-menu.tsx', importPath: '@/components/tasks/row-menu' },
  RecordPanelHost: { file: 'mos-app/src/shell/record-panel-host.tsx', importPath: '@/shell/record-panel-host' },
  ViewTabs: { file: 'mos-app/src/components/ui/view-tabs.tsx', importPath: '@/components/ui/view-tabs' },
  TasksIcon: { file: 'mos-app/src/shell/icons.tsx', importPath: '@/shell/icons' },
  CloseIcon: { file: 'mos-app/src/shell/icons.tsx', importPath: '@/shell/icons' },
}

const REQUIRED_JOBS = [
  'foundation.typography-roles',
  'foundation.spacing-rhythm',
  'foundation.colors-borders-radii-elevation',
  'foundation.icons',
  'foundation.focus-visible',
  'foundation.runtime-fonts-background',
  'foundation.responsive-frames',
  'controls.button-state-matrix',
  'controls.field-state-matrix',
  'controls.selection-status',
  'controls.keyboard-focus',
  'feedback.empty-variants',
  'feedback.error-retry',
  'feedback.loading-skeleton',
  'feedback.saving-saved',
  'feedback.validation-retry',
  'page-composition.workspace',
  'page-composition.focused-record',
  'page-composition.management',
  'dense-collection.realistic-gordi-records',
  'dense-collection.viewport-matrix',
  'dense-collection.state-matrix',
  'overlay.command-search',
  'overlay.confirmation',
  'overlay.anchored-menu',
  'overlay.current-record-panel-shell',
  'accessibility.runnable-a11y',
  'accessibility.runtime-proof',
  'accessibility.keyboard-focus',
]

const REQUIRED_STATES = [
  'button.default',
  'button.hover-documentation',
  'button.focus-visible',
  'button.active',
  'button.disabled',
  'button.loading-debt',
  'text-input.default',
  'text-input.focus-visible',
  'text-input.disabled',
  'text-input.error',
  'select.default',
  'select.focus-visible',
  'select.disabled',
  'select.error',
  'checkbox.default',
  'checkbox.checked',
  'checkbox.indeterminate',
  'checkbox.disabled',
  'toggle.default',
  'status.semantic-tones',
  'empty.quiet',
  'empty.next-step',
  'empty.awaiting',
  'empty.blank',
  'error.retry',
  'loading.skeleton-rows',
  'loading.shell',
  'feedback.saving',
  'feedback.saved',
  'feedback.validation-retry',
  'collection.ready',
  'collection.loading',
  'collection.empty',
  'collection.filtered-empty',
  'collection.error',
  'overlay.current-host-shell',
]

const REQUIRED_VIEWPORTS = ['desktop1280', 'intermediate', 'phone390']

// The matrix builder owns the accepted Storybook stack. The live inventory consumes this
// evidence instead of copying package versions into a second, independently editable list.
const REQUIRED_STORYBOOK_PACKAGES = {
  storybook: '10.5.2',
  '@storybook/react-vite': '10.5.2',
  '@storybook/addon-a11y': '10.5.2',
  '@storybook/test-runner': '0.24.4',
}

const EXPECTED_BOUNDARIES = {
  issue2: 'Storybook component/state/responsive matrix proving the reconciled `DESIGN.md` contract.',
  issue3: 'Page-family primitives and migration guards.',
  issue9: 'Representative-slice rendered/driven owner gate; provisional IA ratification.',
}

const REQUIRED_DEBTS = [
  { story: 'mos-app/src/stories/v3/controls.stories.tsx', pattern: /Button loading state.*Issue 3/i, label: 'Button loading debt must name Issue 3' },
  { story: 'mos-app/src/stories/v3/overlays.stories.tsx', pattern: /RecordPanelHost.*Issue 4/i, label: 'RecordPanelHost debt must name Issue 4' },
]

function repoPath(repoRoot, relativePath) {
  const root = repoRoot instanceof URL ? fileURLToPath(repoRoot) : repoRoot
  return resolve(root, relativePath)
}

function fileExists(repoRoot, relativePath) {
  return existsSync(repoPath(repoRoot, relativePath))
}

function readText(repoRoot, relativePath) {
  const path = repoPath(repoRoot, relativePath)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function readJson(repoRoot, relativePath) {
  const source = readText(repoRoot, relativePath)
  if (!source) return {}
  try {
    return JSON.parse(source)
  } catch {
    return {}
  }
}

function packageDependencyVersion(packageJson, packageName) {
  return packageJson.devDependencies?.[packageName] ?? packageJson.dependencies?.[packageName] ?? null
}

function collectStorybookPackageVersions(repoRoot) {
  const packageJson = readJson(repoRoot, PACKAGE_JSON_PATH)
  const packageLock = readJson(repoRoot, PACKAGE_LOCK_PATH)
  const rootLock = packageLock.packages?.[''] ?? {}
  return Object.fromEntries(Object.entries(REQUIRED_STORYBOOK_PACKAGES).map(([name, required]) => [name, {
    required,
    declared: packageDependencyVersion(packageJson, name),
    lockDeclared: rootLock.devDependencies?.[name] ?? rootLock.dependencies?.[name] ?? null,
    resolved: packageLock.packages?.[`node_modules/${name}`]?.version ?? null,
  }]))
}

export function extractDeliverySequence(specText) {
  const section = specText.match(/^## 12\. Delivery decomposition\n([\s\S]*?)(?=^## 13\.)/m)?.[1] ?? ''
  return [...section.matchAll(/^\s*(\d+)\.\s+(.+)$/gm)].map((match) => ({ issue: Number(match[1]), name: match[2].trim() }))
}

function extractBalancedObject(source, marker) {
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) return null
  const start = source.indexOf('{', markerIndex)
  if (start < 0) return null
  let depth = 0
  let quote = null
  let escaped = false
  for (let index = start; index < source.length; index += 1) {
    const character = source[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  return null
}

function parseStoryMetadata(source) {
  const objectSource = extractBalancedObject(source, 'export const v3Matrix')
  if (!objectSource) return { metadata: null, error: 'missing export const v3Matrix object' }
  try {
    const jsonSource = objectSource
      .replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3')
      .replace(/,\s*([}\]])/g, '$1')
      .replaceAll("'", '"')
    return { metadata: JSON.parse(jsonSource), error: null }
  } catch (error) {
    return { metadata: null, error: `invalid v3Matrix JSON-compatible object: ${error.message}` }
  }
}

function collectStoryExports(source) {
  return [...source.matchAll(/export const ([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'v3Matrix')
}

function collectNamedImports(source) {
  const imports = []
  for (const match of source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    for (const specifier of match[1].split(',')) {
      const symbol = specifier.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()
      if (symbol) imports.push({ symbol, importPath: match[2] })
    }
  }
  return imports
}

function uniqueSorted(values) {
  return [...new Set(values)].sort()
}

function canonicalComponentsFrom(storyFiles) {
  const components = Object.fromEntries(Object.keys(REQUIRED_CANONICAL_COMPONENTS).map((symbol) => [symbol, []]))
  for (const story of storyFiles) {
    for (const item of story.sourceImports ?? []) {
      const expectation = REQUIRED_CANONICAL_COMPONENTS[item.symbol]
      if (!expectation || expectation.importPath !== item.importPath) continue
      components[item.symbol].push({ file: expectation.file, importPath: item.importPath, story: story.path, evidence: 'named production import' })
    }
  }
  for (const symbol of Object.keys(components)) {
    components[symbol] = components[symbol].sort((left, right) => `${left.file}:${left.story}`.localeCompare(`${right.file}:${right.story}`))
  }
  return components
}

export function buildStorybookMatrix(repoRoot = DEFAULT_REPO_ROOT) {
  const root = repoRoot instanceof URL ? repoRoot : resolve(repoRoot)
  const specText = readText(root, SPEC_PATH)
  const deliverySequence = extractDeliverySequence(specText)
  const issueByNumber = Object.fromEntries(deliverySequence.map((entry) => [entry.issue, entry]))
  const storyFiles = STORY_FILES.map((path) => {
    const source = readText(root, path)
    const parsed = parseStoryMetadata(source)
    return {
      path,
      exists: fileExists(root, path),
      exports: collectStoryExports(source),
      sourceImports: collectNamedImports(source),
      excludesMatrixMetadata: /excludeStories\s*:\s*\/\^v3Matrix\$\//.test(source),
      metadata: parsed.metadata,
      metadataError: parsed.error,
    }
  })
  const canonicalComponents = canonicalComponentsFrom(storyFiles)
  const allMetadata = storyFiles.map((story) => story.metadata).filter(Boolean)
  const previewText = readText(root, PREVIEW_PATH)
  const mainText = readText(root, MAIN_PATH)
  const runnerText = readText(root, RUNNER_PATH)
  const matrix = {
    schemaVersion: 1,
    packageVersions: collectStorybookPackageVersions(root),
    issueBoundary: {
      issue2: issueByNumber[2] ?? { issue: 2, name: '' },
      issue3: issueByNumber[3] ?? { issue: 3, name: '' },
      issue9: issueByNumber[9] ?? { issue: 9, name: '' },
    },
    storyFiles: storyFiles.map(({ path, exists, exports, sourceImports, excludesMatrixMetadata, metadataError, metadata }) => ({
      path,
      exists,
      exports,
      sourceImports,
      excludesMatrixMetadata,
      canonicalImports: metadata?.canonicalImports ?? [],
      debts: metadata?.debt ?? [],
      metadataError,
    })),
    canonicalComponents,
    jobs: uniqueSorted(allMetadata.flatMap((metadata) => metadata.jobs ?? [])),
    states: uniqueSorted(allMetadata.flatMap((metadata) => metadata.states ?? [])),
    responsive: uniqueSorted(allMetadata.flatMap((metadata) => metadata.responsive ?? [])),
    debts: allMetadata.flatMap((metadata) => metadata.debt ?? []),
    viewports: REQUIRED_VIEWPORTS,
    a11y: {
      addonConfigured: mainText.includes('@storybook/addon-a11y'),
      testMode: /a11y\s*:\s*\{[\s\S]*?test\s*:\s*['"]error['"]/.test(previewText),
      runnerConfigured: runnerText.includes('postVisit') && runnerText.includes('waitForPageReady'),
      mechanism: 'storybook-addon-a11y-test-runner',
    },
    serviceBoundary: {
      configured: mainText.includes('v3-storybook-service-boundary')
        && mainText.includes('tasksMockPath')
        && mainText.includes('supabaseMockPath')
        && mainText.includes("@/lib/db/tasks")
        && mainText.includes("@/lib/supabase"),
      productionImportRule: 'Storybook-only aliases replace @/lib/db/tasks and @/lib/supabase; production Vite does not load .storybook/main.ts.',
    },
    scope: {
      applicationMigration: allMetadata.some((metadata) => metadata.scope?.applicationMigration === true),
      representativeAcceptance: allMetadata.some((metadata) => metadata.scope?.representativeAcceptance === true),
      futureIssue4Host: allMetadata.some((metadata) => metadata.scope?.futureIssue4Host === true),
    },
  }
  matrix.storyCount = matrix.storyFiles.reduce((total, story) => total + story.exports.length, 0)
  matrix.stateEntryCount = matrix.states.length
  matrix.responsiveEntryCount = matrix.responsive.length
  matrix.canonicalJobCount = Object.values(matrix.canonicalComponents).filter((sources) => sources.length > 0).length
  return matrix
}

function hasCanonicalSource(matrix, symbol, expectation) {
  return (matrix.canonicalComponents?.[symbol] ?? []).some((source) => source.file === expectation.file && source.importPath === expectation.importPath)
}

function hasNamedProductionImport(matrix, symbol, expectation) {
  return (matrix.storyFiles ?? []).some((story) => (story.sourceImports ?? []).some((source) => source.symbol === symbol && source.importPath === expectation.importPath))
}

export function validateStorybookMatrix(matrix) {
  const errors = []
  for (const [name, required] of Object.entries(REQUIRED_STORYBOOK_PACKAGES)) {
    const versions = matrix.packageVersions?.[name]
    if (!versions) {
      errors.push(`missing Storybook package metadata: ${name}`)
      continue
    }
    if (versions.required !== required) errors.push(`matrix package requirement drifted: ${name}`)
    if (versions.declared !== required) errors.push(`package.json Storybook version mismatch: ${name}=${versions.declared ?? 'missing'}; expected ${required}`)
    if (versions.lockDeclared !== required) errors.push(`package-lock root Storybook version mismatch: ${name}=${versions.lockDeclared ?? 'missing'}; expected ${required}`)
    if (versions.resolved !== required) errors.push(`package-lock resolved Storybook version mismatch: ${name}=${versions.resolved ?? 'missing'}; expected ${required}`)
    if (versions.declared !== versions.lockDeclared) errors.push(`package metadata/lock drift: ${name}`)
  }
  const issueBoundary = matrix.issueBoundary ?? {}
  if (issueBoundary.issue2?.name !== EXPECTED_BOUNDARIES.issue2) errors.push('Issue 2 delivery boundary does not match master spec')
  if (issueBoundary.issue3?.name !== EXPECTED_BOUNDARIES.issue3) errors.push('Issue 3 delivery boundary does not match master spec')
  if (issueBoundary.issue9?.name !== EXPECTED_BOUNDARIES.issue9) errors.push('Issue 9 delivery boundary does not match master spec')
  if (matrix.scope?.applicationMigration === true) errors.push('matrix claims application migration')
  if (matrix.scope?.representativeAcceptance === true) errors.push('matrix claims representative rendered acceptance')
  if (matrix.scope?.futureIssue4Host === true) errors.push('matrix claims future Issue 4 host behavior')

  for (const path of STORY_FILES) {
    const story = matrix.storyFiles?.find((candidate) => candidate.path === path)
    if (!story?.exists) errors.push(`missing required Storybook story file: ${path}`)
    if (story?.metadataError) errors.push(`${path}: ${story.metadataError}`)
    if (!story?.excludesMatrixMetadata) errors.push(`${path}: must exclude only v3Matrix from CSF story indexing`)
    for (const name of EXPECTED_STORIES[path] ?? []) if (!story?.exports.includes(name)) errors.push(`missing story export ${name} in ${path}`)
    for (const item of story?.canonicalImports ?? []) {
      if (!(story.sourceImports ?? []).some((source) => source.symbol === item.symbol && source.importPath === item.importPath)) {
        errors.push(`${path}: metadata canonical import is not an actual named production import: ${item.symbol}`)
      }
    }
  }
  if (matrix.storyCount !== Object.values(EXPECTED_STORIES).flat().length) errors.push(`story export count must be ${Object.values(EXPECTED_STORIES).flat().length}, received ${matrix.storyCount}`)
  for (const [symbol, expectation] of Object.entries(REQUIRED_CANONICAL_COMPONENTS)) {
    if (!hasNamedProductionImport(matrix, symbol, expectation)) errors.push(`missing actual named production import for ${symbol}: ${expectation.importPath}`)
    if (!hasCanonicalSource(matrix, symbol, expectation)) errors.push(`missing canonical source for ${symbol}: ${expectation.file}`)
  }
  for (const job of REQUIRED_JOBS) if (!matrix.jobs?.includes(job)) errors.push(`missing matrix job: ${job}`)
  for (const state of REQUIRED_STATES) if (!matrix.states?.includes(state)) errors.push(`missing matrix state: ${state}`)
  for (const viewport of REQUIRED_VIEWPORTS) if (!matrix.responsive?.includes(viewport)) errors.push(`missing responsive viewport: ${viewport}`)
  if (JSON.stringify(matrix.viewports) !== JSON.stringify(REQUIRED_VIEWPORTS)) errors.push('viewport presets must be desktop1280, intermediate, phone390')
  if (!matrix.a11y?.addonConfigured) errors.push('Storybook main config does not register @storybook/addon-a11y')
  if (!matrix.a11y?.testMode) errors.push("Storybook preview must set parameters.a11y.test to 'error'")
  if (!matrix.a11y?.runnerConfigured) errors.push('Storybook test-runner must configure postVisit with waitForPageReady')
  if (!matrix.serviceBoundary?.configured) errors.push('Storybook overlay service boundary is not configured')
  for (const debt of REQUIRED_DEBTS) {
    const story = matrix.storyFiles?.find((candidate) => candidate.path === debt.story)
    const text = (story?.debts ?? []).join(' ')
    if (!debt.pattern.test(text)) errors.push(debt.label)
  }
  return uniqueSorted(errors)
}

function markdownList(values) {
  return values.length ? values.map((value) => `- ${value}`).join('\n') : '- —'
}

export function renderStorybookMatrixMarkdown(matrix) {
  const packageVersion = (name) => matrix.packageVersions?.[name]?.resolved ?? 'missing'
  const canonicalRows = Object.entries(matrix.canonicalComponents)
    .map(([symbol, sources]) => `| ${symbol} | ${sources.map((source) => `${source.file} :: ${source.story}`).join('<br>') || '—'} |`)
    .join('\n')
  return [
    '# V3 Storybook component/state/responsive matrix',
    '',
    'This deterministic artifact is Issue 2 workbench evidence. It proves canonical story coverage and responsive/a11y configuration; it does not claim application migration or the Issue 9 representative rendered/driven owner gate.',
    '',
    '## Package and runner',
    '',
    `- Storybook: \`${packageVersion('storybook')}\` with \`@storybook/react-vite@${packageVersion('@storybook/react-vite')}\``,
    `- Addon: \`@storybook/addon-a11y@${packageVersion('@storybook/addon-a11y')}\``,
    `- Isolated runner: \`@storybook/test-runner@${packageVersion('@storybook/test-runner')}\` (external Playwright/Jest CLI; not a Storybook addon)`,
    '- A11y mechanism: `@storybook/addon-a11y` with `parameters.a11y.test: \'error\'` executed by `test-storybook`; no Vitest 4 path',
    '',
    '## Totals',
    '',
    `- Story exports: **${matrix.storyCount}**`,
    `- State entries: **${matrix.stateEntryCount}**`,
    `- Responsive entries: **${matrix.responsiveEntryCount}**`,
    `- Canonical component jobs represented: **${matrix.canonicalJobCount}**`,
    `- Viewports: **${matrix.viewports.join(', ')}**`,
    '',
    '## Scope claims',
    '',
    `- Application migration completed: **${matrix.scope.applicationMigration ? 'yes' : 'no'}**`,
    `- Representative rendered acceptance completed: **${matrix.scope.representativeAcceptance ? 'yes' : 'no'}**`,
    `- Future Issue 4 host behavior claimed: **${matrix.scope.futureIssue4Host ? 'yes' : 'no'}**`,
    '',
    '## Known gaps and later owners',
    '',
    markdownList(matrix.debts ?? []),
    '',
    '## Master-spec boundary',
    '',
    `- Issue 2: ${matrix.issueBoundary.issue2.name}`,
    `- Issue 3 unlock: owner approval after this evidence; ${matrix.issueBoundary.issue3.name}`,
    `- Issue 9 remains separate: ${matrix.issueBoundary.issue9.name}`,
    '',
    '## Jobs',
    '',
    markdownList(matrix.jobs),
    '',
    '## States',
    '',
    markdownList(matrix.states),
    '',
    '## Responsive proof',
    '',
    markdownList(matrix.responsive),
    '',
    '## Canonical production imports',
    '',
    '| Symbol | Story source evidence |',
    '| --- | --- |',
    canonicalRows,
    '',
    '## Accessibility configuration',
    '',
    `- Addon configured: **${matrix.a11y.addonConfigured ? 'yes' : 'no'}**`,
    `- ` + '`parameters.a11y.test: \'error\'`' + `: **${matrix.a11y.testMode ? 'yes' : 'no'}**`,
    `- External runner readiness hook: **${matrix.a11y.runnerConfigured ? 'postVisit + waitForPageReady' : 'missing'}**`,
    `- Storybook-only service boundary: **${matrix.serviceBoundary?.configured ? 'configured' : 'missing'}**`,
  ].join('\n')
}

function stableJson(matrix) {
  return `${JSON.stringify(matrix, null, 2)}\n`
}

function printErrors(errors) {
  process.stderr.write(`V3 Storybook matrix validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`)
}

export function main(argv = process.argv.slice(2), repoRoot = DEFAULT_REPO_ROOT) {
  const mode = argv[0]
  if (!['--write', '--check'].includes(mode)) {
    process.stderr.write('Usage: node scripts/v3-storybook-matrix.mjs --write|--check\n')
    return 2
  }
  const matrix = buildStorybookMatrix(repoRoot)
  const errors = validateStorybookMatrix(matrix)
  if (errors.length) {
    printErrors(errors)
    return 1
  }
  const json = stableJson(matrix)
  const markdown = `${renderStorybookMatrixMarkdown(matrix)}\n`
  const jsonPath = repoPath(repoRoot, MATRIX_JSON_PATH)
  const markdownPath = repoPath(repoRoot, MATRIX_MARKDOWN_PATH)
  if (mode === '--write') {
    writeFileSync(jsonPath, json)
    writeFileSync(markdownPath, markdown)
    process.stdout.write(`Wrote ${MATRIX_JSON_PATH}\nWrote ${MATRIX_MARKDOWN_PATH}\n`)
    return 0
  }
  const stale = []
  if (!existsSync(jsonPath) || readFileSync(jsonPath, 'utf8') !== json) stale.push(MATRIX_JSON_PATH)
  if (!existsSync(markdownPath) || readFileSync(markdownPath, 'utf8') !== markdown) stale.push(MATRIX_MARKDOWN_PATH)
  if (stale.length) {
    process.stderr.write(`Stale or missing Storybook matrix artifact(s): ${stale.join(', ')}. Run --write.\n`)
    return 1
  }
  process.stdout.write(`Storybook matrix current: ${matrix.storyCount} stories, ${matrix.stateEntryCount} state entries, ${matrix.responsiveEntryCount} responsive entries.\n`)
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) process.exitCode = main()
