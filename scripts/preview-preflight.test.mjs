import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { assertAssetDigest, assertBuildIdentity, assertRenderedRoute, entryAsset, run } from '../mos-app/scripts/preview-preflight.mjs'

test('requires a production entry asset', () => {
  assert.equal(entryAsset('<script type="module" src="/assets/index-abc.js"></script>'), '/assets/index-abc.js')
  assert.throws(() => entryAsset('<div id="root"></div>'), /entry asset missing/)
})

test('refuses an incomplete verification command before opening a browser', async () => {
  await assert.rejects(run(['--url', 'http://127.0.0.1:4185/']), /missing --sha/)
})

test('checks the production entry against the base path recorded in the build identity', () => {
  const identity = { sha: 'a'.repeat(40), clean: true, basePath: '/', assets: { 'index.html': 'hash', 'assets/index-abc.js': 'hash' } }
  assert.doesNotThrow(() => assertBuildIdentity(identity, identity.sha, '/assets/index-abc.js'))
  assert.throws(() => assertBuildIdentity(identity, 'b'.repeat(40), '/assets/index-abc.js'), /stale/)
  assert.throws(() => assertBuildIdentity({ ...identity, clean: false }, identity.sha, '/assets/index-abc.js'), /dirty/)
  assert.throws(() => assertBuildIdentity(identity, identity.sha, '/assets/index-other.js'), /does not cover/)
  assert.throws(() => assertBuildIdentity(identity, identity.sha, 'https://other.test/assets/index-abc.js'), /outside/)

  const nestedIdentity = { ...identity, basePath: '/preview/' }
  assert.doesNotThrow(() => assertBuildIdentity(nestedIdentity, nestedIdentity.sha, '/preview/assets/index-abc.js'))
  assert.throws(() => assertBuildIdentity(nestedIdentity, nestedIdentity.sha, '/assets/index-abc.js'), /outside/)
})

test('rejects a changed stylesheet even if the entry script is unchanged', () => {
  const digest = createHash('sha256').update('original CSS').digest('hex')
  assert.doesNotThrow(() => assertAssetDigest(Buffer.from('original CSS'), digest, 'assets/app.css'))
  assert.throws(() => assertAssetDigest(Buffer.from('changed CSS'), digest, 'assets/app.css'), /differs/)
})

test('authenticated marker must be unique on the requested preview origin and path', () => {
  const base = new URL('http://localhost:4185/')
  const route = new URL('work/tasks/123', base)
  assert.doesNotThrow(() => assertRenderedRoute(route.href, base, route, 1))
  assert.throws(() => assertRenderedRoute('http://other.example/work/tasks/123', base, route, 1), /not unique and exact/)
  assert.throws(() => assertRenderedRoute('http://localhost:4185/login', base, route, 1), /not unique and exact/)
  assert.throws(() => assertRenderedRoute(route.href, base, route, 2), /not unique and exact/)
})
