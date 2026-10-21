import assert from 'node:assert/strict'
import { test } from 'node:test'
import { purgeSelfies } from './attendance-selfie-purge.mjs'

const json = (body, ok = true, status = 200) => ({ ok, status, json: async () => body })

test('AC-042 deletes queued selfies through the Storage API and then confirms them', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body) })
    if (url.endsWith('claim_attendance_selfie_purge')) return json([{ path: 'org/a/1.jpg' }, { path: 'org/b/2.jpg' }])
    return json({})
  }
  assert.deepEqual(await purgeSelfies({ url: 'http://x', key: 'k', fetchImpl }), { deleted: 2 })
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    'POST http://x/rest/v1/rpc/claim_attendance_selfie_purge',
    'DELETE http://x/storage/v1/object/attendance-selfies',
    'POST http://x/rest/v1/rpc/confirm_attendance_selfie_purged',
  ])
  assert.deepEqual(calls[1].body, { prefixes: ['org/a/1.jpg', 'org/b/2.jpg'] })
  assert.deepEqual(calls[2].body, { p_paths: ['org/a/1.jpg', 'org/b/2.jpg'] })
})

test('AC-042 with nothing queued it does nothing', async () => {
  let calls = 0
  const fetchImpl = async () => { calls += 1; return json([]) }
  assert.deepEqual(await purgeSelfies({ url: 'http://x', key: 'k', fetchImpl }), { deleted: 0 })
  assert.equal(calls, 1)
})

test('AC-042 a failed storage delete is not confirmed, so it is retried next run', async () => {
  const urls = []
  const fetchImpl = async (url) => {
    urls.push(url)
    if (url.endsWith('claim_attendance_selfie_purge')) return json([{ path: 'org/a/1.jpg' }])
    return json({}, false, 500)
  }
  await assert.rejects(purgeSelfies({ url: 'http://x', key: 'k', fetchImpl }), /storage delete failed: 500/)
  assert.ok(!urls.some((url) => url.endsWith('confirm_attendance_selfie_purged')))
})
