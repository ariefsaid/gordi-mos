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
  validateInventory,
} from './v3-live-inventory.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('AC-V3-014: live route inventory covers canonical, conditional, redirect, and dev branches', () => {
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

test('AC-V3-014: inventory records canonical primitive jobs', () => {
  const inventory = buildInventory(repoRoot)
  assert.ok(inventory.routes.length >= 40, 'route inventory must cover the complete live route tree')
  assert.ok(inventory.sharedComponents.length >= 10, 'shared-component inventory must name the live primitive set')
  assert.ok(inventory.cssFamilies.length >= 10, 'style inventory must cover the surviving CSS families')
  for (const job of ['search', 'filter', 'sort', 'group', 'saved views', 'wide right panel', 'full page', 'phone full-screen']) {
    assert.ok(inventory.canonicalJobs.includes(job), `missing canonical job: ${job}`)
  }
})

test('AC-V3-014: delivery sequence derives exact issue ownership from the master spec', () => {
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

test('AC-V3-001: DESIGN.md contains the binding V3 visual and interaction grammar', () => {
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

test('AC-V3-014: inventory renderer and CLI remain deterministic', () => {
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
