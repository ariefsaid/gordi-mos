// T17, AC-P2-DI-002 — a typed grep: no `service_role`/`verifierClient` symbol is reachable from
// handler.ts's source (the deputy invariant is enforced by construction — HandlerDeps/DeputyContext
// never carry a service-role client; index.ts alone touches service_role, only for auth.getUser).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

describe('handler.ts deputy invariant — AC-P2-DI-002', () => {
  it('contains no service_role / verifierClient symbol anywhere in the source', () => {
    const source = readFileSync(
      resolve(__dirname, './../../../../supabase/functions/agent-chat/handler.ts'),
      'utf-8',
    )
    expect(source).not.toMatch(/service_role/i)
    expect(source).not.toMatch(/verifierClient/)
  })

  it('HandlerDeps has no rateGuard/usage FIELD DECLARATION (P2 scope — P3 threads them via a // P3: comment)', () => {
    const source = readFileSync(
      resolve(__dirname, './../../../../supabase/functions/agent-chat/handler.ts'),
      'utf-8',
    )
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
})
