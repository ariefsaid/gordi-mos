// @vitest-environment node
// The Edge entry point wires Deno.serve to the handler and, unlike the other functions, does NOT
// refuse tokens carrying client_id: this function is the one that requires them.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

type Serve = (req: Request) => Promise<Response>
const entry = import.meta.glob('../../../../supabase/functions/mcp/index.ts') as Record<string, () => Promise<unknown>>
const load = Object.values(entry)[0]

async function serveWith(env: Record<string, string>): Promise<Serve> {
  let serve: Serve | undefined
  vi.stubGlobal('Deno', { serve: (h: Serve) => { serve = h }, env: { get: (k: string) => env[k] } })
  vi.resetModules()
  await load()
  if (!serve) throw new Error('index.ts did not register a handler')
  return serve
}

describe('mcp entry point', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('serves the metadata document built from its environment', async () => {
    const serve = await serveWith({ MCP_RESOURCE: 'https://mos.test/functions/v1/mcp', MCP_AUTH_ISSUER: 'https://mos.test/auth/v1', SUPABASE_URL: 'http://kong:8000' })
    const res = await serve(new Request('https://mos.test/functions/v1/mcp/.well-known/oauth-protected-resource'))
    expect(await res.json()).toMatchObject({ resource: 'https://mos.test/functions/v1/mcp', authorization_servers: ['https://mos.test/auth/v1'] })
  })

  it('challenges an unauthenticated call rather than refusing it as an agent token', async () => {
    const serve = await serveWith({ MCP_RESOURCE: 'https://mos.test/functions/v1/mcp', MCP_AUTH_ISSUER: 'https://mos.test/auth/v1', SUPABASE_URL: 'http://kong:8000' })
    const res = await serve(new Request('https://mos.test/functions/v1/mcp', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain('resource_metadata=')
  })

  it('does not use the app-token gate, which refuses agent tokens', () => {
    const dir = join(__dirname, '../../../../supabase/functions/mcp')
    for (const f of ['index.ts', 'handler.ts', 'auth.ts']) {
      expect(readFileSync(join(dir, f), 'utf8')).not.toMatch(/requireVerifiedClaims/)
    }
  })

  it('takes the data-API URL and key from the platform, never a service key', () => {
    const src = readFileSync(join(__dirname, '../../../../supabase/functions/mcp/index.ts'), 'utf8')
    expect(src).not.toMatch(/SERVICE_ROLE/)
  })
})
