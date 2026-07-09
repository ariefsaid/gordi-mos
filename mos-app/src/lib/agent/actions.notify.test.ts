// T12 — notify action (P3a self-notification, FR-P3-NT-001/002). The deputy drops a note into the
// CALLER'S OWN inbox: the insert omits owner_id (DB default + RLS pin it to the caller), so the model
// can never address another person; confirm:false (a self-note is not a consequential external write).
import { describe, it, expect } from 'vitest'
import { notifyAction } from './../../../../supabase/functions/agent-chat/actions'
import type { DeputyContext } from './runtime/port'

function fakeCtx(capture: { insert?: Record<string, unknown> }) {
  return {
    personId: 'person-caller',
    orgId: 'org-a',
    supabase: {
      schema: () => ({
        from: () => ({
          insert: (row: Record<string, unknown>) => {
            capture.insert = row
            return { select: () => ({ single: async () => ({ data: { id: 'notif-1' }, error: null }) }) }
          },
        }),
      }),
    },
  } as unknown as DeputyContext
}

describe('notify action (T12, FR-P3-NT-001/002)', () => {
  it('FR-P3-NT-001: is self-only + confirm:false (never auto-executes a write to anyone else)', () => {
    expect(notifyAction.name).toBe('notify')
    expect(notifyAction.confirm).toBeFalsy()
  })

  it('FR-P3-NT-002: inserts title/body/severity but NEVER an owner_id (RLS pins it to the caller)', async () => {
    const capture: { insert?: Record<string, unknown> } = {}
    const res = await notifyAction.run(
      { title: 'Follow up on cups vendor', body: 'chase Friday', severity: 'warning' },
      fakeCtx(capture),
    )
    expect(res).toEqual({ id: 'notif-1' })
    expect(capture.insert).toEqual({
      title: 'Follow up on cups vendor',
      body: 'chase Friday',
      severity: 'warning',
    })
    // The load-bearing invariant: the model cannot address another owner.
    expect(capture.insert).not.toHaveProperty('owner_id')
    expect(capture.insert).not.toHaveProperty('org_id')
  })

  it('FR-P3-NT-001: severity defaults to info when omitted', async () => {
    const capture: { insert?: Record<string, unknown> } = {}
    await notifyAction.run({ title: 'Plain note' }, fakeCtx(capture))
    expect(capture.insert).toMatchObject({ title: 'Plain note', severity: 'info', body: null })
  })

  it('FR-P3-NT-002: rejects an empty/oversized title without inserting', async () => {
    const capture: { insert?: Record<string, unknown> } = {}
    const res = await notifyAction.run({ title: '   ' }, fakeCtx(capture))
    expect(res).toHaveProperty('error')
    expect(capture.insert).toBeUndefined()
  })
})
