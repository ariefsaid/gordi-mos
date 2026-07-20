import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { buildInventory, collectRouteDeclarations, main, renderInventoryMarkdown, validateInventory } from './v3-live-inventory.mjs'

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
