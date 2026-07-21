// V3 Issue 6 — deterministic conformance guard for the shared RecordCollection stack.
//
// This is a source-invariant guard (no timestamps, random ids, filesystem-order dependence, or
// generated cloud/database evidence): it reads a STABLE, SORTED set of source paths and proves the
// structural non-negotiables of the shared engine + the Task/Signal collection adapters. It is the
// machine proof behind docs/plans/2026-07-20-v3-record-collection.md Task 14.
//
// SCOPE: the guard protects the shared Issue-6 stack, typed adapters, and the live Task consumer.
// The latter is deliberately included now that TasksWorkspace has crossed the migration boundary:
// it must keep one hook/surface and cannot reacquire the legacy loaders/query owners.
//
// Structure mirrors scripts/v3-storybook-matrix.mjs: build(repoRoot) -> report, validate(report) ->
// sorted errors, main(argv) -> exit code. pre-merge-check.sh runs `--check`.

import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, '..')

const ENGINE_PATH = 'mos-app/src/lib/record-collection/engine.ts'
const HOOK_PATH = 'mos-app/src/lib/record-collection/use-record-collection.ts'
const TASK_ADAPTER_PATH = 'mos-app/src/components/tasks/task-collection-adapter.tsx'
const TASK_WORKSPACE_PATH = 'mos-app/src/components/tasks/tasks-workspace.tsx'
const TASK_TOOLBAR_PATH = 'mos-app/src/components/tasks/tasks-toolbar.tsx'
const TASK_LAYOUT_PATH = 'mos-app/src/pages/tasks-layout.tsx'
const SIGNAL_ADAPTER_PATH = 'mos-app/src/components/signals/signal-collection-adapter.tsx'
const LIVE_TASK_CONSUMER_PATHS = [TASK_WORKSPACE_PATH, TASK_TOOLBAR_PATH, TASK_LAYOUT_PATH]

// The stable, sorted source set the guard reads. Sorted so the manifest is filesystem-order-free.
const SOURCE_PATHS = [
  'mos-app/src/components/signals/signal-collection-adapter.tsx',
  'mos-app/src/components/tasks/task-collection-adapter.tsx',
  'mos-app/src/components/tasks/tasks-toolbar.tsx',
  'mos-app/src/components/tasks/tasks-workspace.tsx',
  'mos-app/src/lib/record-collection/collection-view-spec.ts',
  'mos-app/src/lib/record-collection/engine.ts',
  'mos-app/src/lib/record-collection/index.ts',
  'mos-app/src/lib/record-collection/query-state.ts',
  'mos-app/src/lib/record-collection/record-opening-contract.ts',
  'mos-app/src/lib/record-collection/types.ts',
  'mos-app/src/lib/record-collection/use-record-collection.ts',
  'mos-app/src/pages/tasks-layout.tsx',
]

// The adapter boundary must be typed end-to-end: no universal row, no arbitrary JSON query, no `any`.
// collection-view-spec.ts is excluded from the Record<string, unknown>/any scan because it validates
// UNTRUSTED persisted JSON, where `Record<string, unknown>` is the correct input type — it is still
// covered by the universal-row scan below.
const ADAPTER_BOUNDARY_FILES = [
  'mos-app/src/components/signals/signal-collection-adapter.tsx',
  'mos-app/src/components/tasks/task-collection-adapter.tsx',
  'mos-app/src/lib/record-collection/engine.ts',
  'mos-app/src/lib/record-collection/index.ts',
  'mos-app/src/lib/record-collection/query-state.ts',
  'mos-app/src/lib/record-collection/record-opening-contract.ts',
  'mos-app/src/lib/record-collection/types.ts',
  'mos-app/src/lib/record-collection/use-record-collection.ts',
]

// A universal record row type must appear NOWHERE in the shared stack (including the spec validator).
const UNIVERSAL_ROW_TOKENS = [/\bUniversalRecord\b/, /\bRecordRow\b/]
const ARBITRARY_QUERY_TOKENS = [/Record<\s*string\s*,\s*unknown\s*>/, /:\s*any\b/, /\bas\s+any\b/, /<\s*any\s*>/]

// Legacy per-user Task view hooks: the shared engine owns saved views + presentation, so neither may
// be imported into the shared stack or the adapters after migration.
const LEGACY_HOOK_TOKENS = [/use-tasks-saved-view/, /use-tasks-view-pref/, /\buseTasksSavedView\b/, /\buseTasksViewPref\b/]
const LEGACY_LIVE_QUERY_TOKENS = [
  /\blistTasks\s*\(/,
  /\bgetBusinessUnits\s*\(/,
  /\bgetPeople\s*\(/,
  /\buseTasksSavedView\b/,
  /\buseTasksViewPref\b/,
  /\buseReactTable\b/,
  /\bgetFilteredRowModel\b/,
  /\bgetSortedRowModel\b/,
]

// The two raw storage columns for Task person fields. They are only legitimate inside the single
// `toTaskCollectionRecord` mapper; anywhere else in the adapter they are a leaked storage spelling.
const RAW_STORAGE_SPELLINGS = ['pic_id', 'supervisor_id']

const EXPECTED_TASK_PRESENTATIONS = ['card', 'table']
const EXPECTED_SIGNAL_PRESENTATIONS = ['feed', 'table']

function repoPath(repoRoot, relativePath) {
  const root = repoRoot instanceof URL ? fileURLToPath(repoRoot) : repoRoot
  return resolve(root, relativePath)
}

function readText(repoRoot, relativePath) {
  const path = repoPath(repoRoot, relativePath)
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

// Strip TS/TSX comments so prose ("never a disabled 'soon' placeholder") can't spoof a code guard.
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

/** Extract the string-literal members of a `type X = 'a' | 'b'` union, sorted. */
export function extractPresentationUnion(source, typeName) {
  const match = source.match(new RegExp(`export type ${typeName}\\s*=\\s*([^\\n]+)`))
  if (!match) return null
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
}

function countMatches(source, regex) {
  return (source.match(regex) ?? []).length
}

/** True when `spelling` occurs in `source` outside any body of a function named `fnName`. */
export function occursOutsideFunction(source, spelling, fnName) {
  // Blank out every `function fnName(...) { ... }` body (brace-balanced), then look for the spelling.
  let masked = source
  const header = new RegExp(`function\\s+${fnName}\\s*[<(]`, 'g')
  let guard = 0
  for (;;) {
    const start = masked.search(header)
    if (start < 0 || guard++ > 50) break
    const braceStart = masked.indexOf('{', start)
    if (braceStart < 0) break
    let depth = 0
    let end = braceStart
    for (; end < masked.length; end += 1) {
      if (masked[end] === '{') depth += 1
      else if (masked[end] === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    masked = masked.slice(0, start) + ' '.repeat(end - start + 1) + masked.slice(end + 1)
  }
  return masked.includes(spelling)
}

export function buildConformance(repoRoot = DEFAULT_REPO_ROOT) {
  const files = Object.fromEntries(SOURCE_PATHS.map((path) => [path, readText(repoRoot, path)]))
  const stripped = Object.fromEntries(
    Object.entries(files).map(([path, source]) => [path, source == null ? null : stripComments(source)]),
  )

  const engineSource = files[ENGINE_PATH] ?? ''
  const hookSource = files[HOOK_PATH] ?? ''
  const taskSource = files[TASK_ADAPTER_PATH] ?? ''
  const signalSource = files[SIGNAL_ADAPTER_PATH] ?? ''

  return {
    schemaVersion: 1,
    sourcePaths: [...SOURCE_PATHS].sort(),
    missingSources: SOURCE_PATHS.filter((path) => files[path] == null).sort(),
    engineExportCount: SOURCE_PATHS.reduce(
      (total, path) => total + countMatches(files[path] ?? '', /export\s+function\s+createRecordCollectionController\b/g),
      0,
    ),
    hookExportCount: SOURCE_PATHS.reduce(
      (total, path) => total + countMatches(files[path] ?? '', /export\s+function\s+useRecordCollection\b/g),
      0,
    ),
    universalRowHits: SOURCE_PATHS.flatMap((path) =>
      UNIVERSAL_ROW_TOKENS.filter((token) => stripped[path] != null && token.test(stripped[path])).map((token) => ({ path, token: token.source })),
    ),
    arbitraryQueryHits: ADAPTER_BOUNDARY_FILES.flatMap((path) =>
      ARBITRARY_QUERY_TOKENS.filter((token) => stripped[path] != null && token.test(stripped[path])).map((token) => ({ path, token: token.source })),
    ),
    legacyHookHits: [...ADAPTER_BOUNDARY_FILES].flatMap((path) =>
      LEGACY_HOOK_TOKENS.filter((token) => stripped[path] != null && token.test(stripped[path])).map((token) => ({ path, token: token.source })),
    ),
    liveTaskConsumerLegacyHits: LIVE_TASK_CONSUMER_PATHS.flatMap((path) =>
      LEGACY_LIVE_QUERY_TOKENS.filter((token) => stripped[path] != null && token.test(stripped[path])).map((token) => ({ path, token: token.source })),
    ),
    liveTaskWorkspaceUsesHook: stripped[TASK_WORKSPACE_PATH]?.includes('useRecordCollection') ?? false,
    liveTaskWorkspaceUsesSurface: stripped[TASK_WORKSPACE_PATH]?.includes('RecordCollectionSurface') ?? false,
    liveTaskWorkspaceUsesDescriptor: stripped[TASK_WORKSPACE_PATH]?.includes('taskCollectionDescriptor') ?? false,
    soonPlaceholderHits: [ENGINE_PATH, HOOK_PATH, TASK_ADAPTER_PATH, SIGNAL_ADAPTER_PATH]
      .filter((path) => stripped[path] != null && /\bsoon\b/i.test(stripped[path]))
      .map((path) => ({ path })),
    leakedRawSpellings: RAW_STORAGE_SPELLINGS.filter(
      (spelling) => stripped[TASK_ADAPTER_PATH] != null && occursOutsideFunction(stripped[TASK_ADAPTER_PATH], spelling, 'toTaskCollectionRecord'),
    ),
    taskPresentations: extractPresentationUnion(taskSource, 'TaskCollectionPresentation'),
    signalPresentations: extractPresentationUnion(signalSource, 'SignalCollectionPresentation'),
    engineHasHost: /engine/.test(ENGINE_PATH) && engineSource.includes('createRecordCollectionController'),
    hookBindsHost: hookSource.includes('bindOverlayHost'),
  }
}

export function validateConformance(report) {
  const errors = []

  for (const path of report.missingSources) errors.push(`missing required source: ${path}`)
  if (JSON.stringify(report.sourcePaths) !== JSON.stringify([...SOURCE_PATHS].sort())) {
    errors.push('source path manifest is not the stable sorted set')
  }

  if (report.engineExportCount !== 1) {
    errors.push(`expected exactly one createRecordCollectionController engine export, found ${report.engineExportCount}`)
  }
  if (report.hookExportCount !== 1) {
    errors.push(`expected exactly one useRecordCollection hook export, found ${report.hookExportCount}`)
  }

  for (const hit of report.universalRowHits) errors.push(`universal record row type ${hit.token} at ${hit.path}`)
  for (const hit of report.arbitraryQueryHits) errors.push(`untyped adapter boundary (${hit.token}) at ${hit.path}`)
  for (const hit of report.legacyHookHits) errors.push(`legacy Task view hook (${hit.token}) imported into the shared stack at ${hit.path}`)
  for (const hit of report.liveTaskConsumerLegacyHits) errors.push(`legacy Task query ownership (${hit.token}) in live consumer ${hit.path}`)
  for (const hit of report.soonPlaceholderHits) errors.push(`disabled "soon" presentation placeholder in the shared stack at ${hit.path}`)
  for (const spelling of report.leakedRawSpellings) {
    errors.push(`raw storage spelling "${spelling}" appears outside toTaskCollectionRecord in the Task adapter`)
  }

  if (JSON.stringify(report.taskPresentations) !== JSON.stringify(EXPECTED_TASK_PRESENTATIONS)) {
    errors.push(`Task live presentations must be exactly table/card, found ${JSON.stringify(report.taskPresentations)}`)
  }
  if (JSON.stringify(report.signalPresentations) !== JSON.stringify(EXPECTED_SIGNAL_PRESENTATIONS)) {
    errors.push(`Signal live presentations must be exactly feed/table, found ${JSON.stringify(report.signalPresentations)}`)
  }

  if (!report.liveTaskWorkspaceUsesHook) errors.push('live TasksWorkspace must consume useRecordCollection')
  if (!report.liveTaskWorkspaceUsesSurface) errors.push('live TasksWorkspace must render RecordCollectionSurface')
  if (!report.liveTaskWorkspaceUsesDescriptor) errors.push('live TasksWorkspace must use the typed Task collection descriptor')

  if (!report.hookBindsHost) errors.push('the React hook must bind the live overlay host (bindOverlayHost)')

  return [...new Set(errors)].sort()
}

export function main(argv = process.argv.slice(2), repoRoot = DEFAULT_REPO_ROOT) {
  if (argv[0] !== '--check') {
    process.stderr.write('Usage: node scripts/v3-record-collection-conformance.mjs --check\n')
    return 2
  }
  const errors = validateConformance(buildConformance(repoRoot))
  if (errors.length) {
    process.stderr.write(`V3 RecordCollection conformance failed:\n${errors.map((e) => `- ${e}`).join('\n')}\n`)
    return 1
  }
  process.stdout.write('V3 RecordCollection conformance: shared engine, single hook, typed adapters — OK.\n')
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main()
}
