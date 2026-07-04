// T32 — agent tool catalog v1 firewall (FR-P2-WT-005, AC-WT-005). The deputy exposes EXACTLY
// {query_entity, create_task, post_update} (+ compose_view registered separately when enabled) and
// NO provisioning/SECURITY-DEFINER RPC. A static scan of the action source asserts no privileged
// RPC call site exists.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BASE_ACTIONS } from './../../../../supabase/functions/agent-chat/actions'

describe('agent tool catalog v1 (T32, AC-WT-005)', () => {
  it('BASE_ACTIONS exposes exactly [query_entity, create_task, post_update] — no provisioning tool', () => {
    expect(BASE_ACTIONS.map((a) => a.name)).toEqual(['query_entity', 'create_task', 'post_update'])
  })

  it('every BASE_ACTION carries the required AgentAction shape (name/description/inputSchema/run)', () => {
    for (const a of BASE_ACTIONS) {
      expect(typeof a.name).toBe('string')
      expect(typeof a.description).toBe('string')
      expect(a.inputSchema).toBeTypeOf('object')
      expect(typeof a.run).toBe('function')
    }
  })

  it('the two writes are confirm:true (never auto-execute); the read is confirm:false', () => {
    const byName = new Map(BASE_ACTIONS.map((a) => [a.name, a]))
    expect(byName.get('query_entity')!.confirm).toBeFalsy()
    expect(byName.get('create_task')!.confirm).toBe(true)
    expect(byName.get('post_update')!.confirm).toBe(true)
  })

  it('no action source invokes a SECURITY DEFINER / shared.admin_* / .rpc(...) privileged call site', () => {
    // Static scan of the action module's own source (FR-P2-WT-005). The deputy's writes go through
    // the caller-JWT client under RLS — never a privileged provisioning RPC.
    const src = readFileSync(resolve(__dirname, '../../../../supabase/functions/agent-chat/actions.ts'), 'utf8')
    expect(src, 'no SECURITY DEFINER RPC').not.toMatch(/SECURITY\s+DEFINER/i)
    expect(src, 'no shared.admin_* RPC').not.toMatch(/shared\.admin_/i)
    expect(src, 'no .rpc(...) call site').not.toMatch(/\.rpc\s*\(/)
  })
})
