import assert from 'node:assert/strict'
import { test } from 'node:test'
import { entryAsset, run } from './preview-preflight.mjs'

test('requires a production entry asset', () => {
  assert.equal(entryAsset('<script type="module" src="/mos/assets/index-abc.js"></script>'), '/mos/assets/index-abc.js')
  assert.throws(() => entryAsset('<div id="root"></div>'), /entry asset missing/)
})

test('refuses an incomplete verification command before opening a browser', async () => {
  await assert.rejects(run(['--url', 'http://127.0.0.1:4185/mos/']), /missing --sha/)
})
