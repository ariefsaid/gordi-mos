import { strict as assert } from 'node:assert'
import { bearerMatches, handle, purgePhotos } from './handler.ts'

const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as unknown as Response
type Call = { url: string; method: string; body: any }
const recorder = (claimRows: unknown[], failStatus?: number) => {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method!, body: JSON.parse(init.body as string) })
    if (url.endsWith('claim_attendance_selfie_purge')) return json(claimRows)
    return failStatus && url.includes('/storage/') ? json({}, false, failStatus) : json({})
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

Deno.test('AC-042 deletes queued selfies through the Storage API and then confirms them', async () => {
  const { calls, fetchImpl } = recorder([{ bucket: 'attendance-selfies', path: 'org/a/1.jpg' }, { bucket: 'attendance-selfies', path: 'org/b/2.jpg' }])
  assert.deepEqual(await purgePhotos({ url: 'http://x', key: 'k', fetchImpl }), { deleted: 2 })
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [
    'POST http://x/rest/v1/rpc/claim_attendance_selfie_purge',
    'DELETE http://x/storage/v1/object/attendance-selfies',
    'POST http://x/rest/v1/rpc/confirm_attendance_selfie_purged',
  ])
  assert.deepEqual(calls[1].body, { prefixes: ['org/a/1.jpg', 'org/b/2.jpg'] })
  assert.deepEqual(calls[2].body, { p_bucket: 'attendance-selfies', p_paths: ['org/a/1.jpg', 'org/b/2.jpg'] })
})

Deno.test('AC-042 with nothing queued it does nothing', async () => {
  const { calls, fetchImpl } = recorder([])
  assert.deepEqual(await purgePhotos({ url: 'http://x', key: 'k', fetchImpl }), { deleted: 0 })
  assert.equal(calls.length, 1)
})

Deno.test('AC-042 a failed storage delete is not confirmed, so it is retried next run', async () => {
  const { calls, fetchImpl } = recorder([{ bucket: 'attendance-selfies', path: 'org/a/1.jpg' }], 500)
  await assert.rejects(purgePhotos({ url: 'http://x', key: 'k', fetchImpl }), /storage delete failed: 500/)
  assert.ok(!calls.some((c) => c.url.endsWith('confirm_attendance_selfie_purged')))
})

Deno.test("NFR-002 doctor's notes are deleted from their own bucket and confirmed", async () => {
  const { calls, fetchImpl } = recorder([{ bucket: 'attendance-selfies', path: 's/1.jpg' }, { bucket: 'staff-notes', path: 'n/2.jpg' }])
  assert.deepEqual(await purgePhotos({ url: 'http://x', key: 'k', fetchImpl }), { deleted: 2 })
  const deletes = calls.filter((c) => c.url.includes('/storage/v1/'))
  assert.deepEqual(deletes.map((c) => c.url), ['http://x/storage/v1/object/attendance-selfies', 'http://x/storage/v1/object/staff-notes'])
  assert.deepEqual(deletes[1].body, { prefixes: ['n/2.jpg'] })
  const confirms = calls.filter((c) => c.url.endsWith('confirm_attendance_selfie_purged'))
  assert.deepEqual(confirms.map((c) => c.body), [{ p_bucket: 'attendance-selfies', p_paths: ['s/1.jpg'] }, { p_bucket: 'staff-notes', p_paths: ['n/2.jpg'] }])
})

Deno.test('a claimed path in any other bucket is never deleted', async () => {
  const { calls, fetchImpl } = recorder([{ bucket: 'other', path: 'x.jpg' }])
  assert.deepEqual(await purgePhotos({ url: 'http://x', key: 'k', fetchImpl }), { deleted: 0 })
  assert.ok(!calls.some((c) => c.url.includes('/storage/')))
})

Deno.test('only a POST with the exact bearer secret runs the purge', async () => {
  const env = { url: 'http://x', key: 'k', secret: 's3' }
  const { calls, fetchImpl } = recorder([])
  const post = (auth?: string, method = 'POST') => new Request('http://f/', { method, headers: auth ? { Authorization: auth } : {} })
  assert.equal((await handle(post(), env, fetchImpl)).status, 401)
  assert.equal((await handle(post('Bearer wrong'), env, fetchImpl)).status, 401)
  assert.equal((await handle(post('Bearer s3', 'GET'), env, fetchImpl)).status, 405)
  assert.equal((await handle(post('Bearer s3'), { ...env, secret: '' }, fetchImpl)).status, 401)
  assert.equal(calls.length, 0)
  const ok = await handle(post('Bearer s3'), env, fetchImpl)
  assert.equal(ok.status, 200)
  assert.deepEqual(await ok.json(), { deleted: 0 })
  assert.equal(await bearerMatches('Bearer s3', 's3'), true)
})
