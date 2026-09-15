import assert from 'node:assert/strict'
import test from 'node:test'

import { assertAuditRoute } from './audit-route.ts'

test('audit route evidence rejects an authentication redirect with a valid main landmark', () => {
  assert.doesNotThrow(() => assertAuditRoute('http://localhost:5173/mos/work/tasks?view=mine', '/mos/work/tasks'))
  assert.throws(
    () => assertAuditRoute('http://localhost:5173/mos/login', '/mos/work/tasks'),
    /expected \/mos\/work\/tasks.*observed \/mos\/login/i,
  )
})
