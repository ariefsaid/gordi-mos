import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildStorybookMatrix, renderStorybookMatrixMarkdown, validateStorybookMatrix } from './v3-storybook-matrix.mjs'

const repoRoot = new URL('..', import.meta.url)

test('Issue 2 matrix includes the master-spec boundary and all curated proof dimensions', () => {
  const matrix = buildStorybookMatrix(repoRoot)

  assert.equal(matrix.issueBoundary.issue2.name, 'Storybook component/state/responsive matrix proving the reconciled `DESIGN.md` contract.')
  assert.equal(matrix.issueBoundary.issue3.name, 'Page-family primitives and migration guards.')
  assert.equal(matrix.issueBoundary.issue9.name, 'Representative-slice rendered/driven owner gate; provisional IA ratification.')
  assert.deepEqual(matrix.viewports, ['desktop1280', 'intermediate', 'phone390'])
  assert.equal(matrix.scope.applicationMigration, false)
  assert.equal(matrix.scope.representativeAcceptance, false)
  assert.ok(matrix.storyCount > 0)
  assert.ok(matrix.stateEntryCount > 0)
  assert.ok(matrix.responsiveEntryCount > 0)
  assert.equal(renderStorybookMatrixMarkdown(matrix).endsWith('\n'), false)
  assert.deepEqual(validateStorybookMatrix(matrix), [])
})

test('Storybook matrix locks package.json and package-lock versions to the accepted stack', () => {
  const matrix = buildStorybookMatrix(repoRoot)
  assert.deepEqual(
    Object.fromEntries(Object.entries(matrix.packageVersions).map(([name, versions]) => [name, versions.resolved])),
    {
      storybook: '10.5.2',
      '@storybook/react-vite': '10.5.2',
      '@storybook/addon-a11y': '10.5.2',
      '@storybook/test-runner': '0.24.4',
    },
  )
  const drifted = structuredClone(matrix)
  drifted.packageVersions.storybook.resolved = '10.5.3'
  assert.match(validateStorybookMatrix(drifted).join('\n'), /package-lock resolved Storybook version mismatch: storybook/)
})

test('the guard rejects a matrix that drops a canonical source', () => {
  const matrix = buildStorybookMatrix(repoRoot)
  const broken = structuredClone(matrix)
  broken.canonicalComponents.Button = []

  assert.match(validateStorybookMatrix(broken).join('\n'), /Button/)
})

test('the guard derives canonical coverage from source imports and excludes only v3Matrix metadata', () => {
  const matrix = buildStorybookMatrix(repoRoot)
  const broken = structuredClone(matrix)
  const controls = broken.storyFiles.find((story) => story.path.endsWith('/controls.stories.tsx'))
  controls.sourceImports = controls.sourceImports.filter((source) => source.symbol !== 'Button')
  controls.excludesMatrixMetadata = false

  const errors = validateStorybookMatrix(broken).join('\n')
  assert.match(errors, /metadata canonical import is not an actual named production import: Button/)
  assert.match(errors, /exclude only v3Matrix/)
})

test('the guard rejects missing state, viewport, story, and runnable a11y entries', () => {
  const matrix = buildStorybookMatrix(repoRoot)
  const broken = structuredClone(matrix)
  broken.states = broken.states.filter((state) => state !== 'button.default')
  broken.responsive = broken.responsive.filter((viewport) => viewport !== 'phone390')
  broken.storyFiles[0].exists = false
  broken.a11y.testMode = false

  const errors = validateStorybookMatrix(broken).join('\n')
  assert.match(errors, /button.default/)
  assert.match(errors, /phone390/)
  assert.match(errors, /missing required Storybook story file/)
  assert.match(errors, /parameters\.a11y\.test/)
})

test('the guard rejects migration and representative acceptance claims', () => {
  const matrix = buildStorybookMatrix(repoRoot)
  const broken = structuredClone(matrix)
  broken.scope.applicationMigration = true
  broken.scope.representativeAcceptance = true

  assert.match(validateStorybookMatrix(broken).join('\n'), /application migration/)
  assert.match(validateStorybookMatrix(broken).join('\n'), /representative rendered acceptance/)
})
