/**
 * MCP server (Streamable HTTP, stateless, JSON responses): a thin adapter from MCP tool calls to the
 * api_v1 operations. It holds no authority: the caller's own token goes to the data API and
 * nowhere else, so the database (RLS, the agent fence, the operation's own rules) answers every call.
 *
 * Pure (fetch and clock injected) so it runs in Deno and in Vitest; index.ts wires the environment.
 */
import { verifyAgentToken, type AgentClaims } from './auth.ts'
import { TOOLS, TOOLS_BY_NAME } from './tools.ts'

export interface McpDeps {
  resource: string
  issuer: string
  jwksUrl: string
  dataApiUrl: string
  anonKey: string
  allowedOrigins: string[]
  fetch: typeof fetch
  now: () => number
  timeoutMs?: number
  log: (entry: Record<string, unknown>) => void
}

const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const MAX_MESSAGE = 500
const METADATA_PATH = '/.well-known/oauth-protected-resource'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const rpcResult = (id: unknown, result: unknown) => json({ jsonrpc: '2.0', id, result })
const rpcError = (id: unknown, code: number, message: string) => json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

function challenge(deps: McpDeps, invalid: boolean): Response {
  const pointer = `resource_metadata="${deps.resource.replace(/\/$/, '')}${METADATA_PATH}"`
  return json(
    { error: 'unauthorized' },
    401,
    { 'WWW-Authenticate': `Bearer ${invalid ? 'error="invalid_token", ' : ''}${pointer}` },
  )
}

interface ToolFailure { code: string; message: string; field: string | null }

const toolError = (f: ToolFailure) => ({
  isError: true,
  content: [{ type: 'text', text: f.message }],
  structuredContent: f,
})

function toolSuccess(value: unknown) {
  const structured = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : { result: value }
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: structured }
}

const clip = (s: string) => (s.length > MAX_MESSAGE ? `${s.slice(0, MAX_MESSAGE)}...` : s)

/** Maps a data-API error body to the structured tool error: {code: details, message, field: hint}. */
async function failureFrom(res: Response): Promise<ToolFailure> {
  let body: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(await res.text())
    if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>
  } catch { /* a non-JSON body gets the generic failure below */ }
  const s = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)
  return {
    code: s(body.details) ?? s(body.code) ?? `http_${res.status}`,
    message: clip(s(body.message) ?? 'The request could not be completed.'),
    field: s(body.hint),
  }
}

const invalidInput = (message: string, field: string): ToolFailure => ({ code: 'invalid_input', message, field })

async function callTool(
  name: string, args: Record<string, unknown>, token: string, deps: McpDeps,
): Promise<{ result: unknown; unauthorized?: true; outcome: string }> {
  const tool = TOOLS_BY_NAME.get(name)!
  const known = Object.keys(tool.inputSchema.properties)
  const unknownKey = Object.keys(args).find((k) => !known.includes(k))
  if (unknownKey) return { result: toolError(invalidInput(`Unknown input "${unknownKey}".`, unknownKey)), outcome: 'invalid_input' }
  const missing = (tool.inputSchema.required ?? []).find((k) => args[k] === undefined || args[k] === null)
  if (missing) return { result: toolError(invalidInput(`"${missing}" is required.`, missing)), outcome: 'invalid_input' }

  let res: Response
  try {
    res = await deps.fetch(`${deps.dataApiUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: deps.anonKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Content-Profile': 'api_v1',
        'Accept-Profile': 'api_v1',
      },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(deps.timeoutMs ?? 10_000),
    })
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')
    const f: ToolFailure = timedOut
      ? { code: 'timeout', message: 'The operation did not finish within 10 seconds.', field: null }
      : { code: 'unavailable', message: 'MOS could not be reached. Try again shortly.', field: null }
    return { result: toolError(f), outcome: f.code }
  }
  if (res.status === 401) return { result: null, unauthorized: true, outcome: 'unauthorized' }
  if (!res.ok) {
    const f = await failureFrom(res)
    return { result: toolError(f), outcome: f.code }
  }
  try {
    return { result: toolSuccess(await res.json()), outcome: 'ok' }
  } catch {
    return { result: toolError({ code: 'bad_response', message: 'MOS returned an unreadable answer.', field: null }), outcome: 'bad_response' }
  }
}

function metadata(deps: McpDeps): Response {
  return json(
    {
      resource: deps.resource,
      authorization_servers: [deps.issuer],
      bearer_methods_supported: ['header'],
      resource_name: 'Gordi MOS',
    },
    200,
    { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' },
  )
}

export async function mcpHandler(req: Request, deps: McpDeps): Promise<Response> {
  const url = new URL(req.url)
  const isMetadata = url.pathname.endsWith(METADATA_PATH)

  if (isMetadata) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' } })
    }
    if (!deps.resource || !deps.issuer) return json({ error: 'MCP_NOT_CONFIGURED' }, 503)
    return metadata(deps)
  }
  if (!deps.resource || !deps.issuer) return json({ error: 'MCP_NOT_CONFIGURED' }, 503)

  // Browser-origin requests are refused unless listed: an MCP endpoint is called by agent apps, not pages.
  const origin = req.headers.get('Origin')
  if (origin && !deps.allowedOrigins.includes(origin)) return json({ error: 'origin_not_allowed' }, 403)

  const header = req.headers.get('Authorization') ?? ''
  const bearer = /^Bearer (.+)$/i.exec(header)
  if (!bearer) return challenge(deps, false)
  const token = bearer[1]
  const verdict = await verifyAgentToken(token, {
    resource: deps.resource, issuer: deps.issuer, jwksUrl: deps.jwksUrl, fetch: deps.fetch, now: deps.now,
  })
  if (!verdict.ok) {
    deps.log({ event: 'auth_refused', reason: verdict.reason })
    return challenge(deps, true)
  }
  const claims: AgentClaims = verdict.claims

  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } })

  let message: unknown
  try {
    message = await req.json()
  } catch {
    return rpcError(null, -32700, 'Parse error')
  }
  if (typeof message !== 'object' || message === null || Array.isArray(message)) {
    return rpcError(null, -32600, 'Send one JSON-RPC message per request.')
  }
  const { id, method, params } = message as { id?: unknown; method?: unknown; params?: Record<string, unknown> }
  if (typeof method !== 'string') return rpcError(id, -32600, 'Invalid Request')
  if (id === undefined) return new Response(null, { status: 202 }) // notification

  switch (method) {
    case 'initialize': {
      const asked = typeof params?.protocolVersion === 'string' ? params.protocolVersion : ''
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'mos', title: 'Gordi MOS', version: '1' },
        instructions: 'Acts as the signed-in person, with that person\'s MOS permissions. Call whoami first.',
      })
    }
    case 'ping':
      return rpcResult(id, {})
    case 'tools/list':
      return rpcResult(id, { tools: TOOLS })
    case 'tools/call': {
      const name = params?.name
      if (typeof name !== 'string' || !TOOLS_BY_NAME.has(name)) return rpcError(id, -32602, 'Unknown tool.')
      const args = params?.arguments ?? {}
      if (typeof args !== 'object' || args === null || Array.isArray(args)) return rpcError(id, -32602, 'Tool arguments must be an object.')
      const started = Date.now()
      const out = await callTool(name, args as Record<string, unknown>, token, deps)
      deps.log({ event: 'tool_call', tool: name, person_id: claims.person_id, client_id: claims.client_id, outcome: out.outcome, latency_ms: Date.now() - started })
      if (out.unauthorized) return challenge(deps, true)
      return rpcResult(id, out.result)
    }
    default:
      return rpcError(id, -32601, 'Method not found.')
  }
}
