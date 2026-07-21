import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  buildInventory,
  collectRouteDeclarations,
  extractDeliveryDecomposition,
  main,
  renderInventoryMarkdown,
  validateDesignContract,
  validateInventory,
} from './v3-live-inventory.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('V3 inventory classifies canonical, conditional, redirect, and DEV branches', () => {
  const inventory = buildInventory(repoRoot)
  const errors = validateInventory(inventory, repoRoot)
  assert.deepEqual(errors, [])
  const paths = new Set(inventory.routes.map((route) => route.path))
  for (const path of [
    '/', '/work/tasks', '/work/tasks/:taskId', '/work/signals', '/work/signals/:signalId',
    '/inbox', '/cafe', '/cafe/log', '/money', '/profile', '/admin/people',
    '/login', '/recovery', '/updates', '/ops', '/kitchen/log', '/dashboard',
  ]) {
    assert.equal(paths.has(path), true, `missing route ${path}`)
  }
})

test('V3 inventory counts PageFamilyFrame as shared frame + head evidence for the migrated representatives', () => {
  const inventory = buildInventory(repoRoot)
  const byPath = new Map(inventory.routes.map((route) => [route.path, route]))
  // The three Issue 3 representatives adopt the shared PageFamilyFrame helper, so the
  // scanner must still credit them with the shared frame AND the shared head.
  for (const path of ['/work/tasks', '/admin/people', '/work/objectives', '/work/projects']) {
    const route = byPath.get(path)
    assert.ok(route, `missing representative route ${path}`)
    assert.equal(route.frame, 'shared-page-frame', `${path} must keep shared frame evidence`)
    assert.equal(route.head, 'shared-page-head', `${path} must keep shared head evidence`)
    assert.equal(route.sourceEvidence.pageFrameUse, true, `${path} must record pageFrameUse`)
    assert.equal(route.sourceEvidence.pageHeadUse, true, `${path} must record pageHeadUse`)
  }
})

test('V3 inventory records canonical primitive jobs', () => {
  const inventory = buildInventory(repoRoot)
  assert.ok(inventory.routes.length >= 40, 'route inventory must cover the complete live route tree')
  assert.ok(inventory.sharedComponents.length >= 10, 'shared-component inventory must name the live primitive set')
  assert.ok(inventory.cssFamilies.length >= 10, 'style inventory must cover the surviving CSS families')
  for (const job of ['search', 'filter', 'sort', 'group', 'saved views', 'wide right panel', 'full page', 'phone full-screen']) {
    assert.ok(inventory.canonicalJobs.includes(job), `missing canonical job: ${job}`)
  }
})

test('V3 delivery sequence derives exact issue ownership from the master spec', () => {
  const spec = readFileSync(resolve(repoRoot, 'docs/specs/v3-redesign.spec.md'), 'utf8')
  const sequence = extractDeliveryDecomposition(spec)
  const inventory = buildInventory(repoRoot)
  const expectedNames = [
    'Documentation truth reset, live route/component inventory, and DESIGN.md reconciliation',
    'Storybook component/state/responsive matrix proving the reconciled DESIGN.md contract',
    'Page-family primitives and migration guards',
    'Shared overlay/panel/navigation host',
    'RecordViewer contract, field primitives, and Task adapter',
    'RecordCollection/view engine and Tasks/Signals adapters',
    'Inbox triage plus Deputy host integration',
    'Café canonical-record integration and Team-context correction',
    'Representative-slice rendered/driven owner gate; provisional IA ratification',
    'Structured-content schema ADR, storage/RLS, editor, and typed embeds',
    'Remaining route migration by page/component family',
    'Full cross-surface acceptance, stale-style removal, documentation closure, and owner walkthrough',
  ]
  assert.deepEqual(sequence.map((item) => item.issue), expectedNames.map((_, index) => index + 1))
  assert.deepEqual(sequence.map((item) => item.name), expectedNames)
  assert.deepEqual(inventory.deliverySequence, sequence)
  const markdown = renderInventoryMarkdown(inventory)
  for (const [issue, name] of sequence.slice(1, 9).map((item) => [item.issue, item.name])) {
    assert.match(markdown, new RegExp(`\\| ${issue} \\| ${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')} \\|`))
  }
  for (const path of [
    'DESIGN.md',
    'docs/backlog.md',
    'docs/agent-context.md',
    'docs/plans/2026-07-20-v3-design-foundation.md',
    'docs/reviews/v3-redesign.md',
  ]) {
    const currentDoc = readFileSync(resolve(repoRoot, path), 'utf8')
    for (const forbidden of [
      /Issue 2 owns the application migration/i,
      /Issue 2 or later gates/i,
      /rendered (?:computed-style )?acceptance remains deferred to Issue 2/i,
      /Issue 2 application component migration/i,
    ]) {
      assert.equal(forbidden.test(currentDoc), false, `${path} still collapses delivery ownership: ${forbidden}`)
    }
  }
})

test('V3 DESIGN contract contains the binding visual and interaction grammar', () => {
  const design = readFileSync(resolve(repoRoot, 'DESIGN.md'), 'utf8')
  for (const anchor of [
    'E7 visual foundation',
    'RecordViewer',
    'RecordCollection',
    'Focused record',
    'wide right panel',
    'Escape restores',
    '390px',
    ':focus-visible',
    'saved views',
  ]) {
    assert.equal(design.includes(anchor), true, `missing DESIGN.md V3 anchor: ${anchor}`)
  }
  for (const staleExample of [
    '`Write-Review`',
    '`Catalog-Manage`',
    '`/updates`',
    '`/ops`',
    '`/tasks`',
    '`/dashboard`',
    '`/kitchen/log`',
  ]) {
    assert.equal(design.includes(staleExample), false, `stale DESIGN.md example remains: ${staleExample}`)
  }
})

test('V3 DESIGN active-law guard rejects retired guidance and preserves the sanctioned Action Launcher', () => {
  const design = readFileSync(resolve(repoRoot, 'DESIGN.md'), 'utf8')
  assert.deepEqual(validateDesignContract(design), [])
})

test('V3 inventory renderer and CLI remain deterministic', () => {
  const inventory = buildInventory(repoRoot)
  const router = readFileSync(resolve(repoRoot, 'mos-app/src/router.tsx'), 'utf8')
  const declarations = collectRouteDeclarations(router)
  assert.equal(declarations.hasIndexRoute, true)
  assert.equal(declarations.pathLiterals.includes('work/tasks'), true)
  const markdown = renderInventoryMarkdown(inventory)
  assert.match(markdown, /^# V3 live route, component, and style inventory/m)
  assert.equal(markdown.endsWith('\n\n'), false)
  assert.equal(main(['--write'], repoRoot), 0)
  assert.equal(main(['--check'], repoRoot), 0)
})

test('V3 generated inventory rejects Storybook package metadata drift', () => {
  const inventory = buildInventory(repoRoot)
  const drifted = structuredClone(inventory)
  drifted.storybookMatrix.packageVersions['@storybook/test-runner'].declared = '0.25.0'
  assert.ok(validateInventory(drifted, repoRoot).includes('storybook matrix package versions are stale'))
})

test('V3 generated inventory rejects Storybook ownership mapping drift', () => {
  const inventory = buildInventory(repoRoot)
  const drifted = structuredClone(inventory)
  drifted.storybookMatrix.ownership.find((row) => row.path.endsWith('/overlays.stories.tsx')).responsive = ['desktop1280', 'intermediate']
  assert.ok(validateInventory(drifted, repoRoot).includes('storybook matrix ownership mapping is stale'))
})

test('V3 generated inventory rejects Task vocabulary guard drift', () => {
  const inventory = buildInventory(repoRoot)
  const drifted = structuredClone(inventory)
  drifted.storybookMatrix.taskVocabularyViolations = [{ path: 'mos-app/src/stories/v3/page-compositions.stories.tsx', line: 1, term: 'owner', text: 'owner: Aisyah Rahman' }]
  assert.ok(validateInventory(drifted, repoRoot).includes('storybook matrix Task vocabulary guard is stale'))
})
