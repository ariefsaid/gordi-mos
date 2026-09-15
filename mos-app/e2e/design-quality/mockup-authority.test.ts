import assert from 'node:assert/strict'
import test from 'node:test'

import { DESIGN_QUALITY_MANIFEST } from './manifest.ts'
import {
  bindMockupToCell,
  parseMockupAuthorityEntry,
} from './mockup-authority.ts'

const repoRoot = '/workspace'
const exactTasksAuthority = {
  path: `${repoRoot}/docs/mockups/tasks-desktop.png`,
  authority: 'owner decision',
  requiredRegions: [],
  route: '/mos/work/tasks',
  viewport: '1440x900',
  cellId: 'tasks-default-desktop',
  fixture: 'VIEWER',
  theme: 'light',
  language: 'en',
  state: 'default',
}

test('requires an explicit manifest cellId even when route and viewport are supplied', () => {
  const routeAndViewportOnly = { ...exactTasksAuthority, cellId: undefined }

  assert.throws(
    () => parseMockupAuthorityEntry(routeAndViewportOnly, repoRoot),
    /cellId/i,
  )
})

test('rejects malformed requiredRegions instead of silently disabling region checks', () => {
  assert.throws(
    () => parseMockupAuthorityEntry({
      ...exactTasksAuthority,
      requiredRegions: 'toolbar',
    }, repoRoot),
    /requiredRegions.*array/i,
  )
})

test('rejects an authority binding when a declared dimension disagrees with its cellId', () => {
  const mismatches = {
    route: '/mos/inbox',
    viewport: '390x844',
    fixture: 'BAR_MEMBER',
    theme: 'dark',
    language: 'id',
    state: 'composer',
  } as const

  for (const [dimension, value] of Object.entries(mismatches)) {
    const entry = parseMockupAuthorityEntry({ ...exactTasksAuthority, [dimension]: value }, repoRoot)

    assert.throws(
      () => bindMockupToCell(entry, DESIGN_QUALITY_MANIFEST),
      new RegExp(dimension, 'i'),
      `expected ${dimension} mismatch to be rejected`,
    )
  }
})

test('rejects a route and viewport that do not match the selected cellId', () => {
  const entry = parseMockupAuthorityEntry({
    ...exactTasksAuthority,
    cellId: 'signals-default-phone',
  }, repoRoot)

  assert.throws(
    () => bindMockupToCell(entry, DESIGN_QUALITY_MANIFEST),
    /route|viewport/i,
  )
})

test('accepts an authority entry whose six dimensions match its explicit cellId', () => {
  const entry = parseMockupAuthorityEntry(exactTasksAuthority, repoRoot)
  const cell = bindMockupToCell(entry, DESIGN_QUALITY_MANIFEST)

  assert.equal(cell.id, 'tasks-default-desktop')
})
