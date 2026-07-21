import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildConformance,
  extractPresentationUnion,
  main,
  occursOutsideFunction,
  stripComments,
  validateConformance,
} from './v3-record-collection-conformance.mjs'

const repoRoot = new URL('..', import.meta.url)

test('the shared RecordCollection stack passes every conformance invariant on the current tree', () => {
  const report = buildConformance(repoRoot)

  assert.deepEqual(report.missingSources, [])
  assert.equal(report.engineExportCount, 1)
  assert.equal(report.hookExportCount, 1)
  assert.deepEqual(report.taskPresentations, ['card', 'table'])
  assert.deepEqual(report.signalPresentations, ['feed', 'table'])
  assert.equal(report.hookBindsHost, true)
  assert.deepEqual(validateConformance(report), [])
})

test('--check exits 0 against the real tree', () => {
  assert.equal(main(['--check'], repoRoot), 0)
  assert.equal(main([], repoRoot), 2) // usage error without --check
})

test('the guard rejects a second engine export or a missing single hook path', () => {
  const report = buildConformance(repoRoot)

  const twoEngines = { ...report, engineExportCount: 2 }
  assert.match(validateConformance(twoEngines).join('\n'), /exactly one createRecordCollectionController/)

  const noHook = { ...report, hookExportCount: 0 }
  assert.match(validateConformance(noHook).join('\n'), /exactly one useRecordCollection/)
})

test('the guard rejects a universal row type, an untyped boundary, or a leaked storage spelling', () => {
  const report = buildConformance(repoRoot)

  const universal = { ...report, universalRowHits: [{ path: 'engine.ts', token: '\\bUniversalRecord\\b' }] }
  assert.match(validateConformance(universal).join('\n'), /universal record row type/)

  const untyped = { ...report, arbitraryQueryHits: [{ path: 'task-collection-adapter.tsx', token: ':\\s*any\\b' }] }
  assert.match(validateConformance(untyped).join('\n'), /untyped adapter boundary/)

  const leaked = { ...report, leakedRawSpellings: ['pic_id'] }
  assert.match(validateConformance(leaked).join('\n'), /raw storage spelling "pic_id".*toTaskCollectionRecord/)
})

test('the guard rejects a legacy Task view hook or a disabled "soon" placeholder in the shared stack', () => {
  const report = buildConformance(repoRoot)

  const legacy = { ...report, legacyHookHits: [{ path: 'engine.ts', token: 'useTasksViewPref' }] }
  assert.match(validateConformance(legacy).join('\n'), /legacy Task view hook/)

  const soon = { ...report, soonPlaceholderHits: [{ path: 'task-collection-adapter.tsx' }] }
  assert.match(validateConformance(soon).join('\n'), /disabled "soon" presentation placeholder/)
})

test('the guard rejects drifted Task or Signal live presentations', () => {
  const report = buildConformance(repoRoot)

  const badTask = { ...report, taskPresentations: ['board', 'card', 'table'] }
  assert.match(validateConformance(badTask).join('\n'), /Task live presentations must be exactly table\/card/)

  const badSignal = { ...report, signalPresentations: ['feed'] }
  assert.match(validateConformance(badSignal).join('\n'), /Signal live presentations must be exactly feed\/table/)
})

test('stripComments removes prose so a commented "soon" cannot spoof the placeholder guard', () => {
  const withComment = `// never a disabled "soon" tab\nconst live = 'card'\n/* soon */`
  assert.equal(/\bsoon\b/i.test(stripComments(withComment)), false)
  assert.equal(stripComments(withComment).includes("'card'"), true)
})

test('occursOutsideFunction confines a spelling to its named function body', () => {
  const confined = `function toTaskCollectionRecord(r) { return r.pic_id }\nconst k = 1`
  const leaked = `const bad = row.pic_id\nfunction toTaskCollectionRecord(r) { return r.supervisor_id }`
  assert.equal(occursOutsideFunction(confined, 'pic_id', 'toTaskCollectionRecord'), false)
  assert.equal(occursOutsideFunction(leaked, 'pic_id', 'toTaskCollectionRecord'), true)
})

test('extractPresentationUnion reads the sorted literal members of a presentation type', () => {
  assert.deepEqual(
    extractPresentationUnion("export type X = 'table' | 'card'", 'X'),
    ['card', 'table'],
  )
  assert.equal(extractPresentationUnion('no such type here', 'X'), null)
})
