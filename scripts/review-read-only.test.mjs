import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyReviewRequest } from './review-read-only.mjs'

const base = 'http://127.0.0.1:54321'

test('ordinary reads and permission-read RPCs remain available', () => {
  assert.equal(classifyReviewRequest('GET', `${base}/rest/v1/tasks?select=*`, base).allowed, true)
  for (const name of ['get_work_write_scopes', 'get_signal_post_authority',
    'is_cafe_affiliated', 'due_process_runs', 'can_retract_signal']) {
    assert.equal(classifyReviewRequest('POST', `${base}/rest/v1/rpc/${name}`, base).allowed, true, name)
  }
  assert.equal(classifyReviewRequest('POST', `${base}/auth/v1/token?grant_type=refresh_token`, base).allowed, true)
  assert.equal(classifyReviewRequest('POST', 'https://other.example/rest/v1/rpc/get_work_write_scopes', base).allowed, false)
  assert.equal(classifyReviewRequest('POST', 'https://other.example/auth/v1/token?grant_type=refresh_token', base).allowed, false)
})

test('autosave and all unclassified writes are refused', () => {
  for (const [method, path] of [
    ['PATCH', '/rest/v1/tasks?id=eq.1'],
    ['POST', '/rest/v1/tasks'],
    ['DELETE', '/rest/v1/stream_items?id=eq.1'],
    ['POST', '/rest/v1/rpc/transition_follow_up'],
    ['POST', '/rest/v1/rpc/new_unknown_rpc'],
    ['POST', '/storage/v1/object/review-file'],
    ['POST', '/auth/v1/token?grant_type=password'],
  ]) {
    assert.equal(classifyReviewRequest(method, `${base}${path}`, base).allowed, false, `${method} ${path}`)
  }
})
