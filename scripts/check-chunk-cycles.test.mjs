import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findCycle, staticImports } from '../mos-app/scripts/check-chunk-cycles.mjs'

test('reads static imports and re-exports, not dynamic imports', () => {
  const code = 'import{a as b}from"./vendor-x.js";import"./side.js";export{c}from"./re.js";const d=()=>import("./lazy.js");'
  assert.deepEqual(staticImports(code), ['vendor-x.js', 'side.js', 're.js'])
})

test('names the chunks of a two-chunk cycle', () => {
  assert.deepEqual(findCycle({ 'vendor.js': ['vendor-react.js'], 'vendor-react.js': ['vendor.js'] }), [
    'vendor.js',
    'vendor-react.js',
    'vendor.js',
  ])
})

test('accepts a diamond and a missing target', () => {
  assert.equal(findCycle({ 'a.js': ['b.js', 'c.js'], 'b.js': ['d.js'], 'c.js': ['d.js'], 'd.js': ['gone.js'] }), null)
})
