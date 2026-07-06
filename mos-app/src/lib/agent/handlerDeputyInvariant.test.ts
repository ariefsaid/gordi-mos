// T17/T31, AC-P2-DI-002 + NFR-P3-RP-001 — typed source guards for the deputy invariant. The
// deputy handler and P3a replay/question/notify seams must stay caller-JWT-only; index.ts alone
// may touch service_role, only for auth.getUser.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

function readAgentChatSource(file: string) {
  return readFileSync(
    resolve(__dirname, './../../../../supabase/functions/agent-chat', file),
    'utf-8',
  )
}

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
}

describe('agent-chat deputy invariant — AC-P2-DI-002 / NFR-P3-RP-001', () => {
  it('contains no service_role / verifierClient symbol anywhere in the source', () => {
    const source = readAgentChatSource('handler.ts')
    expect(source).not.toMatch(/service_role/i)
    expect(source).not.toMatch(/verifierClient/)
  })

  it('HandlerDeps has no rateGuard/usage FIELD DECLARATION (P2 scope — P3 threads them via a // P3: comment)', () => {
    const source = readAgentChatSource('handler.ts')
    const start = source.indexOf('interface HandlerDeps')
    const end = source.indexOf('\n}', start)
    const handlerDepsBlock = source
      .slice(start, end)
      // Strip line comments — a `// P3: rateGuard?...` note documents the FUTURE seam without
      // declaring the field today; only an actual `rateGuard:`/`usage:` property is disallowed.
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n')
    expect(handlerDepsBlock).not.toMatch(/\brateGuard\s*[?:]/)
    expect(handlerDepsBlock).not.toMatch(/\busage\s*[?:]/)
  })

  it('T31: replay enters through persist.deps only, preserving the caller-JWT Supabase client', () => {
    const handler = readAgentChatSource('handler.ts')
    expect(handler).toContain('replayRunHistory(persist.deps, req.runId)')
    expect(handler).not.toMatch(/replayRunHistory\(\s*deps\b/)
    expect(handler).not.toMatch(/replayRunHistory\(\s*\{/)
  })

  it('T31: replay reconstruction reads through deps.supabase and constructs no privileged client', () => {
    const replay = stripComments(readAgentChatSource('replay.ts'))
    expect(replay).toContain('deps.supabase')
    expect(replay).toContain(".from('agent_events')")
    expect(replay).toContain(".order('seq', { ascending: true })")
    expect(replay).toContain('.limit(MAX_RUN_EVENTS_READ)')
    expect(replay).not.toMatch(/createClient|service_role|verifierClient|Deno\.env|SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('T31: ask_user is intercepted before action lookup so it never routes through approval/write dispatch', () => {
    const handler = readAgentChatSource('handler.ts')
    const askUserBranch = handler.indexOf("toolName === 'ask_user'")
    const actionLookup = handler.indexOf('const action = actionByName.get(toolName)')
    expect(askUserBranch).toBeGreaterThan(-1)
    expect(actionLookup).toBeGreaterThan(-1)
    expect(askUserBranch).toBeLessThan(actionLookup)
  })

  it('T31: notify is self-only through ctx.supabase and adds no privileged-client seam', () => {
    const actions = stripComments(readAgentChatSource('actions.ts'))
    const start = actions.indexOf('export const notifyAction')
    const end = actions.indexOf('export const askUserAction', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const notifyBlock = actions.slice(start, end)
    expect(notifyBlock).toContain('ctx.supabase')
    expect(notifyBlock).toContain(".from('notifications')")
    expect(notifyBlock).toContain("severity: v.value.severity ?? 'info'")
    expect(notifyBlock).not.toMatch(/createClient|service_role|verifierClient|Deno\.env|SUPABASE_SERVICE_ROLE_KEY/)
  })
})
