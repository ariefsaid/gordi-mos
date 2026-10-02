import assert from 'node:assert/strict'
import test from 'node:test'

import { assertAuditRoute } from './audit-route.ts'

test('audit route evidence rejects an authentication redirect with a valid main landmark', () => {
  assert.doesNotThrow(() => assertAuditRoute('http://localhost:5173/work/tasks?view=mine', '/work/tasks'))
  assert.throws(
    () => assertAuditRoute('http://localhost:5173/login', '/work/tasks'),
    /expected \/work\/tasks.*observed \/login/i,
  )
})
