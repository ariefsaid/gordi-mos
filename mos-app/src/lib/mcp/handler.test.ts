// @vitest-environment node
// The MCP server's HTTP seam: metadata, 401 challenge, JSON-RPC methods, tool calls, error mapping,
// and the no-passthrough rule. The data API is the recording fetch; no network.
import { describe, expect, it } from 'vitest'
import { resetJwksCache } from './../../../../supabase/functions/mcp/auth.ts'
import { mcpHandler, type McpDeps } from './../../../../supabase/functions/mcp/handler.ts'
import { TOOLS } from './../../../../supabase/functions/mcp/tools.ts'
import { ANON_KEY, DATA_API, goodClaims, headerOf, ISSUER, JWKS_URL, makeFetch, makeKeys, NOW, omit, RESOURCE, signJwt } from './testKit.ts'

// The challenge points here (reachable with no gateway route); the RFC 9728 root-path form is also served.
const METADATA_URL = `${RESOURCE}/.well-known/oauth-protected-resource`
const METADATA_ROOT_URL = 'https://mos.test/.well-known/oauth-protected-resource/functions/v1/mcp'

async function setup(dataResponse?: (init: RequestInit) => Response | Promise<Response>, over: Partial<McpDeps> = {}) {
  resetJwksCache()
  const keys = await makeKeys()
  const kit = makeFetch(keys, dataResponse)
  const logs: Record<string, unknown>[] = []
  const deps: McpDeps = {
    resource: RESOURCE, issuer: ISSUER, jwksUrl: JWKS_URL, dataApiUrl: DATA_API, anonKey: ANON_KEY,
    allowedOrigins: [], fetch: kit.fetchFn, now: () => NOW, log: (e) => logs.push(e), ...over,
  }
  const token = await signJwt(keys, goodClaims())
  const rpc = (method: string, params?: unknown, id: number | null = 1, bearer: string | null = token) =>
    mcpHandler(new Request(`${RESOURCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, ...(params === undefined ? {} : { params }) }),
    }), deps)
  return { keys, kit, deps, logs, token, rpc }
}
const call = (name: string, args?: unknown) => ({ name, arguments: args })

describe('protected resource metadata', () => {
  it('names this resource and the login service, without a token', async () => {
    const { deps, kit } = await setup()
    const res = await mcpHandler(new Request(METADATA_URL), deps)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ resource: RESOURCE, authorization_servers: [ISSUER], bearer_methods_supported: ['header'] })
    expect(kit.calls).toHaveLength(0)
  })

  it('is also served at the RFC 9728 root-path form when the gateway routes it', async () => {
    const { deps } = await setup()
    const res = await mcpHandler(new Request(METADATA_ROOT_URL), deps)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ resource: RESOURCE })
  })

  it('answers the preflight for the metadata document', async () => {
    const { deps } = await setup()
    const res = await mcpHandler(new Request(METADATA_URL, { method: 'OPTIONS', headers: { Origin: 'https://app.test' } }), deps)
    expect(res.status).toBe(204)
  })
})

describe('authentication', () => {
  it('challenges with a metadata URL that this handler itself answers', async () => {
    const { rpc, deps } = await setup()
    const challenged = await rpc('tools/list', undefined, 1, null)
    const advertised = /resource_metadata="([^"]+)"/.exec(challenged.headers.get('WWW-Authenticate') ?? '')?.[1]
    expect(advertised).toBeDefined()
    const doc = await mcpHandler(new Request(advertised!), deps)
    expect(doc.status).toBe(200)
    expect(await doc.json()).toMatchObject({ resource: RESOURCE })
  })

  it('challenges a missing token with the metadata pointer and calls nothing', async () => {
    const { rpc, kit } = await setup()
    const res = await rpc('tools/list', undefined, 1, null)
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe(`Bearer resource_metadata="${METADATA_URL}"`)
    expect(kit.calls).toHaveLength(0)
  })

  it.each([
    ['wrong audience', (c: Record<string, unknown>) => ({ ...c, aud: 'authenticated' })],
    ['no client_id (app token)', (c: Record<string, unknown>) => omit(c, 'client_id')],
    ['expired', (c: Record<string, unknown>) => ({ ...c, exp: NOW - 5 })],
    ['foreign issuer', (c: Record<string, unknown>) => ({ ...c, iss: 'https://evil.test' })],
  ])('refuses a token with %s: 401 invalid_token, no data-API call', async (_l, mutate) => {
    const { keys, kit, rpc } = await setup()
    const res = await rpc('tools/call', call('whoami', {}), 1, await signJwt(keys, mutate(goodClaims())))
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toBe(`Bearer error="invalid_token", resource_metadata="${METADATA_URL}"`)
    expect(kit.dataCalls()).toHaveLength(0)
  })

  it('refuses a badly signed token', async () => {
    const { rpc, kit } = await setup()
    const other = await makeKeys()
    const res = await rpc('tools/list', undefined, 1, await signJwt(other, goodClaims()))
    expect(res.status).toBe(401)
    expect(kit.dataCalls()).toHaveLength(0)
  })

  it('refuses a non-Bearer scheme', async () => {
    const { deps } = await setup()
    const res = await mcpHandler(new Request(RESOURCE, { method: 'POST', headers: { Authorization: 'Basic abc' }, body: '{}' }), deps)
    expect(res.status).toBe(401)
  })

  it('is unavailable, not open, when the resource or issuer is unset', async () => {
    const { rpc } = await setup(undefined, { resource: '' })
    expect((await rpc('ping')).status).toBe(503)
  })

  it('rejects a browser Origin that is not allow-listed, and admits one that is', async () => {
    const { deps, token } = await setup()
    const req = (origin: string) => mcpHandler(new Request(RESOURCE, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    }), { ...deps, allowedOrigins: ['https://app.test'] })
    expect((await req('https://evil.test')).status).toBe(403)
    expect((await req('https://app.test')).status).toBe(200)
  })

  it('gives an allow-listed origin CORS headers on answers and on the preflight, and no other origin', async () => {
    const { deps, token } = await setup(undefined, { allowedOrigins: ['https://app.test'] })
    const post = (origin: string) => mcpHandler(new Request(RESOURCE, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    }), deps)
    const ok = await post('https://app.test')
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test')
    expect(ok.headers.get('Vary')).toContain('Origin')
    expect((await post('https://evil.test')).headers.get('Access-Control-Allow-Origin')).toBeNull()

    const preflight = await mcpHandler(new Request(RESOURCE, { method: 'OPTIONS', headers: { Origin: 'https://app.test', 'Access-Control-Request-Method': 'POST' } }), deps)
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('https://app.test')
    expect(preflight.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('authorization')
    const foreignPreflight = await mcpHandler(new Request(RESOURCE, { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }), deps)
    expect(foreignPreflight.status).toBe(403)
  })

  it('exposes the challenge header to an allow-listed origin', async () => {
    const { deps } = await setup(undefined, { allowedOrigins: ['https://app.test'] })
    const res = await mcpHandler(new Request(RESOURCE, { method: 'POST', headers: { Origin: 'https://app.test' }, body: '{}' }), deps)
    expect(res.status).toBe(401)
    expect(res.headers.get('Access-Control-Expose-Headers')).toContain('WWW-Authenticate')
  })
})

describe('JSON-RPC lifecycle', () => {
  it('initializes with the tools capability and echoes a supported protocol version', async () => {
    const { rpc } = await setup()
    const body = await (await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })).json()
    expect(body).toMatchObject({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'mos' } } })
  })

  it('falls back to its own latest version for an unknown client version', async () => {
    const { rpc } = await setup()
    const body = await (await rpc('initialize', { protocolVersion: '1999-01-01' })).json()
    expect(typeof body.result.protocolVersion).toBe('string')
    expect(body.result.protocolVersion).not.toBe('1999-01-01')
  })

  it('answers ping and acknowledges a notification with 202', async () => {
    const { rpc } = await setup()
    expect(await (await rpc('ping')).json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} })
    const n = await rpc('notifications/initialized', undefined, null)
    expect(n.status).toBe(202)
    expect(await n.text()).toBe('')
  })

  it('lists every tool and makes no outbound call', async () => {
    const { rpc, kit } = await setup()
    const body = await (await rpc('tools/list')).json()
    expect(body.result.tools).toHaveLength(TOOLS.length)
    expect(body.result.tools.map((t: { name: string }) => t.name)).toContain('whoami')
    expect(kit.dataCalls()).toHaveLength(0)
  })

  it.each([
    ['an unknown method', 'nope/x', undefined, -32601],
    ['an unknown tool', 'tools/call', call('drop_everything', {}), -32602],
    ['non-object arguments', 'tools/call', call('whoami', [1]), -32602],
    ['a missing tool name', 'tools/call', {}, -32602],
  ])('returns a JSON-RPC error for %s', async (_l, method, params, code) => {
    const { rpc, kit } = await setup()
    const body = await (await rpc(method, params)).json()
    expect(body.error.code).toBe(code)
    expect(kit.dataCalls()).toHaveLength(0)
  })

  it('rejects a batch and unparseable JSON as invalid requests', async () => {
    const { deps, token } = await setup()
    const post = (body: string) => mcpHandler(new Request(RESOURCE, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body }), deps)
    expect((await (await post('[{"jsonrpc":"2.0","id":1,"method":"ping"}]')).json()).error.code).toBe(-32600)
    expect((await (await post('{nope')).json()).error.code).toBe(-32700)
  })

  it('offers no server-to-client stream: GET and DELETE are 405 with Allow: POST', async () => {
    const { deps, token } = await setup()
    for (const method of ['GET', 'DELETE']) {
      const res = await mcpHandler(new Request(RESOURCE, { method, headers: { Authorization: `Bearer ${token}` } }), deps)
      expect(res.status).toBe(405)
      expect(res.headers.get('Allow')).toBe('POST')
    }
  })
})

describe('tools/call', () => {
  it('calls exactly the api_v1 operation with the caller token and no other credential (no passthrough)', async () => {
    const { rpc, kit, token } = await setup(() => Response.json({ item: { id: 't1' } }))
    const res = await rpc('tools/call', call('get_task', { id: 'a5c1ae7f-3b3e-4e4b-8d35-7f0d0a5f9d11' }))
    const body = await res.json()
    expect(body.result.isError).toBeUndefined()
    expect(body.result.structuredContent).toEqual({ item: { id: 't1' } })
    expect(JSON.parse(body.result.content[0].text)).toEqual({ item: { id: 't1' } })

    expect(kit.dataCalls()).toHaveLength(1)
    const [c] = kit.dataCalls()
    expect(c.url).toBe(`${DATA_API}/rest/v1/rpc/get_task`)
    expect(c.init.method).toBe('POST')
    expect(headerOf(c.init, 'Authorization')).toBe(`Bearer ${token}`)
    expect(headerOf(c.init, 'Content-Profile')).toBe('api_v1')
    expect(headerOf(c.init, 'Accept-Profile')).toBe('api_v1')
    expect(headerOf(c.init, 'apikey')).toBe(ANON_KEY)
    expect(JSON.parse(String(c.init.body))).toEqual({ id: 'a5c1ae7f-3b3e-4e4b-8d35-7f0d0a5f9d11' })
    // The only other outbound call in the whole exchange is the key-set read, which carries no credential.
    for (const other of kit.calls.filter((x) => x !== c)) {
      expect(other.url).toBe(JWKS_URL)
      expect(headerOf(other.init, 'Authorization')).toBeNull()
    }
    // Every outbound Authorization value anywhere is the caller's own token.
    expect(kit.calls.map((x) => headerOf(x.init, 'Authorization')).filter(Boolean)).toEqual([`Bearer ${token}`])
  })

  it('sends an empty object for a no-argument tool', async () => {
    const { rpc, kit } = await setup(() => Response.json({ person: {} }))
    await rpc('tools/call', call('whoami'))
    expect(JSON.parse(String(kit.dataCalls()[0].init.body))).toEqual({})
  })

  it('rejects an unknown argument locally, naming the field', async () => {
    const { rpc, kit } = await setup()
    const body = await (await rpc('tools/call', call('get_task', { id: 'x', org_id: 'someone-elses' }))).json()
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent).toEqual({ code: 'invalid_input', message: expect.any(String), field: 'org_id' })
    expect(kit.dataCalls()).toHaveLength(0)
  })

  it('rejects a missing required argument locally, naming the field', async () => {
    const { rpc, kit } = await setup()
    const body = await (await rpc('tools/call', call('get_task', {}))).json()
    expect(body.result.structuredContent).toMatchObject({ code: 'invalid_input', field: 'id' })
    expect(kit.dataCalls()).toHaveLength(0)
  })

  it('maps a function error to isError with {code: details, message, field: hint}', async () => {
    const { rpc } = await setup(() => Response.json(
      { code: 'PT404', message: 'Task not found.', details: 'not_found', hint: 'id' }, { status: 404 }))
    const body = await (await rpc('tools/call', call('get_task', { id: 'x' }))).json()
    expect(body.result).toEqual({
      isError: true,
      content: [{ type: 'text', text: 'Task not found.' }],
      structuredContent: { code: 'not_found', message: 'Task not found.', field: 'id' },
    })
  })

  it('maps a fence refusal (forbidden) to a tool error', async () => {
    const { rpc } = await setup(() => Response.json({ code: 'PT403', message: 'Agent access is not available.', details: 'forbidden', hint: null }, { status: 403 }))
    const body = await (await rpc('tools/call', call('whoami', {}))).json()
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent).toEqual({ code: 'forbidden', message: 'Agent access is not available.', field: null })
  })

  it('maps a data-API error without the function shape by its own code and status', async () => {
    const { rpc } = await setup(() => Response.json({ code: 'PGRST202', message: 'no function' }, { status: 404 }))
    const body = await (await rpc('tools/call', call('whoami', {}))).json()
    expect(body.result.structuredContent).toEqual({ code: 'PGRST202', message: 'no function', field: null })
  })

  it('maps a non-JSON error body to a generic tool error', async () => {
    const { rpc } = await setup(() => new Response('<html>bad gateway</html>', { status: 502 }))
    const body = await (await rpc('tools/call', call('whoami', {}))).json()
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent.code).toBe('http_502')
    expect(JSON.stringify(body)).not.toContain('<html>')
  })

  it('turns a data-API 401 (token no longer valid) into an HTTP 401 challenge so the client re-authenticates', async () => {
    const { rpc } = await setup(() => Response.json({ code: 'PT401', message: 'jwt expired' }, { status: 401 }))
    const res = await rpc('tools/call', call('whoami', {}))
    expect(res.status).toBe(401)
    expect(res.headers.get('WWW-Authenticate')).toContain('invalid_token')
  })

  it('cuts a call off after the wall-clock limit and reports a timeout', async () => {
    const hang = (init: RequestInit) => new Promise<Response>((_res, rej) => {
      init.signal?.addEventListener('abort', () => rej(init.signal!.reason))
    })
    const { rpc } = await setup(hang, { timeoutMs: 25 })
    const body = await (await rpc('tools/call', call('whoami', {}))).json()
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent.code).toBe('timeout')
  })

  it('reports an unreachable data API as a tool error, not a crash', async () => {
    const { rpc } = await setup(() => { throw new Error('econnrefused') })
    const res = await rpc('tools/call', call('whoami', {}))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent.code).toBe('unavailable')
    expect(JSON.stringify(body)).not.toContain('econnrefused')
  })
})

describe('logging', () => {
  it('logs operation, person, client, outcome and latency, never the token', async () => {
    const { rpc, logs, token } = await setup(() => Response.json({ item: {} }))
    await rpc('tools/call', call('whoami', {}))
    const entry = logs.find((l) => l.tool === 'whoami')!
    expect(entry).toMatchObject({ tool: 'whoami', person_id: 'person-1', client_id: 'client-1', outcome: 'ok' })
    expect(typeof entry.latency_ms).toBe('number')
    expect(JSON.stringify(logs)).not.toContain(token)
  })
})
