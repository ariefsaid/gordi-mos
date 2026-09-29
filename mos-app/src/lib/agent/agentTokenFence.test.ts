// #1005 AC-025 — the Edge Function entry points refuse a client_id (agent) token with 401 before
// any auth or handler work. Deno.serve is captured so the real index.ts wiring is exercised.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient }))

type Serve = (req: Request) => Promise<Response>

function makeJwt(payload: object): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b(payload)}.sig`
}

async function loadServe(load: () => Promise<unknown>): Promise<Serve> {
  let serve: Serve | undefined
  vi.stubGlobal('Deno', {
    serve: (h: Serve) => { serve = h },
    env: { get: () => '' },
  })
  vi.resetModules()
  await load()
  if (!serve) throw new Error('index.ts did not register a handler')
  return serve
}

// import.meta.glob keeps the Deno-only entry points out of the app's typecheck.
const entries = import.meta.glob('../../../../supabase/functions/*/index.ts') as Record<string, () => Promise<unknown>>
const ENTRY_POINTS = ['agent-chat', 'compose-view'].map((name) => {
  const load = entries[`../../../../supabase/functions/${name}/index.ts`]
  if (!load) throw new Error(`no entry point for ${name}`)
  return [name, load] as const
})

describe.each(ENTRY_POINTS)('%s refuses agent tokens (#1005, AC-025)', (_name, load) => {
  beforeEach(() => { createClient.mockReset() })
  afterEach(() => { vi.unstubAllGlobals() })

  const call = (serve: Serve, jwt: string) =>
    serve(new Request('http://localhost/fn', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: '{}',
    }))

  it('returns 401 for a token with a client_id claim, before any auth call', async () => {
    const serve = await loadServe(load)
    const res = await call(serve, makeJwt({ org_id: 'o', person_id: 'p', client_id: 'client-1' }))
    expect(res.status).toBe(401)
    expect(createClient).not.toHaveBeenCalled()
  })

  it('lets the app’s own token continue to the auth check', async () => {
    createClient.mockReturnValue({ auth: { getUser: async () => ({ data: { user: null }, error: new Error('x') }) } })
    const serve = await loadServe(load)
    const res = await call(serve, makeJwt({ org_id: 'o', person_id: 'p' }))
    expect(res.status).toBe(401)
    expect(createClient).toHaveBeenCalled()
  })
})
