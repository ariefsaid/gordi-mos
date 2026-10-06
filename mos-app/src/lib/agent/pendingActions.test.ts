import { describe, expect, it, vi } from 'vitest'
import { createPendingActionStore } from './../../../../supabase/functions/agent-chat/pendingActions'
import type { PendingActionCreate } from './../../../../supabase/functions/agent-chat/pendingActions'

const id = '00000000-0000-4000-8000-000000000001'

function makeStore(row: unknown = null) {
  const insert = vi.fn(async () => ({ error: null }))
  const rpc = vi.fn(async () => ({ data: row, error: null }))
  const writer = { schema: vi.fn(() => ({ from: vi.fn(() => ({ insert })) })) }
  const caller = { schema: vi.fn(() => ({ rpc })) }
  return { store: createPendingActionStore(writer, caller), insert, rpc, writer, caller }
}

const action: PendingActionCreate = {
  id,
  actionName: 'create_task',
  args: { title: 'Stored title' },
  toolCallId: 'call-1',
  personId: 'person-1',
  orgId: 'org-1',
  expiresAt: '2026-10-05T12:05:00.000Z',
}

describe('server-bound pending actions', () => {
  it('writes the validated action and caller identity through the trusted writer', async () => {
    const { store, insert, writer } = makeStore()
    await expect(store.create(action)).resolves.toBe(true)
    expect(writer.schema).toHaveBeenCalledWith('shared')
    expect(insert).toHaveBeenCalledWith({
      id,
      org_id: 'org-1',
      person_id: 'person-1',
      action_name: 'create_task',
      args: { title: 'Stored title' },
      tool_call_id: 'call-1',
      expires_at: '2026-10-05T12:05:00.000Z',
    })
  })

  it('consumes by pending id through the caller identity and returns stored arguments', async () => {
    const { store, rpc, caller } = makeStore([{
      id,
      action_name: 'create_task',
      args: { title: 'Stored title' },
      tool_call_id: 'call-1',
    }])
    await expect(store.consume(id)).resolves.toEqual({
      id,
      actionName: 'create_task',
      args: { title: 'Stored title' },
      toolCallId: 'call-1',
    })
    expect(caller.schema).toHaveBeenCalledWith('shared')
    expect(rpc).toHaveBeenCalledWith('consume_agent_pending_action', { p_pending_id: id })
  })

  it('does not query storage for a malformed id and treats an empty consume as unavailable', async () => {
    const { store, rpc } = makeStore([])
    await expect(store.consume('not-a-uuid')).resolves.toBeNull()
    await expect(store.consume(id)).resolves.toBeNull()
    expect(rpc).toHaveBeenCalledTimes(1)
  })
})
