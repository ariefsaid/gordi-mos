// T18 (P3a Phase D) — askUserAction guard stub (ADR-0045 §2 port, FR-P3-AU-001). Mirrors
// composeViewAction's pattern: the catalog entry exists (name/description/inputSchema/confirm)
// but run() is never called directly — the handler dispatches ask_user specially (a
// status{kind:'question'} emit + end-stream), NOT via dispatchAction/dispatchActionForced. Not a
// write tool: confirm is falsy (no approval chip; it's a question/answer turn).
import { describe, it, expect } from 'vitest'
import { askUserAction } from './../../../../supabase/functions/agent-chat/actions'
import type { DeputyContext } from './runtime/port'

describe('askUserAction (T18, FR-P3-AU-001)', () => {
  it('is registered as ask_user, NOT a confirm:true write action (no approval chip)', () => {
    expect(askUserAction.name).toBe('ask_user')
    expect(askUserAction.confirm).toBeFalsy()
  })

  it('carries ASK_USER_SCHEMA as its inputSchema', () => {
    expect(askUserAction.inputSchema).toBeTruthy()
    expect((askUserAction.inputSchema as { required?: string[] }).required).toContain('prompt')
  })

  it('run() is a guard stub — throws if ever called directly (the handler dispatches specially)', () => {
    expect(() => askUserAction.run({}, {} as DeputyContext)).toThrow()
  })
})
