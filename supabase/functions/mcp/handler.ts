// MCP server (Streamable HTTP, stateless, JSON responses): a thin adapter from MCP tool calls to the
// api_v1 operations. It holds no authority: the caller's own token goes to the data API and
// nowhere else, so the database (RLS, the agent fence, the operation's own rules) answers every call.
//
// Pure (fetch and clock injected) so it runs in Deno and in Vitest; index.ts wires the environment.
import { verifyAgentToken, type AgentClaims } from './auth.ts'
import { TOOLS, TOOLS_BY_NAME } from './tools.ts'
import { readCappedText } from '../_shared/cappedBody.ts'

export type McpDeps = {
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
const MAX_BODY_BYTES = 1_048_576
const METADATA_PATH = '/.well-known/oauth-protected-resource'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const rpcResult = (id: unknown, result: unknown) => json({ jsonrpc: '2.0', id, result })
const rpcError = (id: unknown, code: number, message: string) => json({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

// The challenge names a URL this function answers on its own, so discovery needs no gateway route.
// (RFC 9728 lets `resource_metadata` be any URL; the root-path form is also served when routed.)
const metadataUrl = (resource: string): string => `${resource.replace(/\/$/, '')}${METADATA_PATH}`

function challenge(deps: McpDeps, invalid: boolean): Response {
  const pointer = `resource_metadata="${metadataUrl(deps.resource)}"`
  return json(
    { error: 'unauthorized' },
    401,
    { 'WWW-Authenticate': `Bearer ${invalid ? 'error="invalid_token", ' : ''}${pointer}` },
  )
}

export type ToolFailure = { code: string; message: string; field: string | null }

const toolError = (f: ToolFailure) => ({
  isError: true,
  content: [{ type: 'text', text: f.message }],
  structuredContent: f,
})

function toolSuccess(value: unknown) {
  const structured = typeof value === 'object' && value !== null && !Array.isArray(value) ? value : { result: value }
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: structured }
}

const GENERIC_FAILURE: ToolFailure = {
  code: 'request_failed',
  message: 'The request could not be completed.',
  field: null,
}

const ALLOWED_ERROR_CODES = new Set(['conflict', 'invalid_input', 'forbidden', 'rate_limited', 'rate_limit'])
const ALLOWED_PT_CODES: Record<string, string> = {
  PT400: 'invalid_input',
  PT403: 'forbidden',
  PT409: 'conflict',
  PT429: 'rate_limited',
}

const KNOWN_SAFE_MESSAGES = new Set([
  'This conflicts with another change. Try again.',
  'This Task changed since you read it. Read it again and retry.',
  'This Signal changed since you read it. Read it again and retry.',
  'This Project or Process changed since you read it. Read it again and retry.',
  'This Objective changed since you read it. Read it again and retry.',
  'This key result changed since you read it. Read it again and retry.',
  'transfer route changed since it was loaded',
  'A value is not allowed here.',
  'A required value is missing.',
  'A referenced record does not exist.',
  'A value has the wrong format.',
  "You don't have permission to do this in MOS.",
  "Archiving, restoring and retracting can't be done through the API or an agent. Do this in MOS.",
  "Deleting can't be done through the API or an agent. Do this in MOS.",
  "Objective settings and key-result targets can't be changed through the API or an agent. Do this in MOS.",
  "People, roles and access can't be changed through the API or an agent. Do this in MOS.",
  "Money can't be read or changed through the API or an agent yet. Do this in MOS.",
  'Too many changes in the last minute. Wait a moment and try again.',
])

const DEFAULT_MESSAGES: Record<string, string> = {
  conflict: 'This conflicts with another change. Try again.',
  invalid_input: 'The request contains invalid input.',
  forbidden: "You don't have permission to do this in MOS.",
  rate_limited: 'Too many changes in the last minute. Wait a moment and try again.',
}

const UNSAFE_PATTERNS = [
  /private/i,
  /database/i,
  /relation/i,
  /table\b/i,
  /column\b/i,
  /syntax/i,
  /violates/i,
  /\bsql\b/i,
  /pgrst/i,
  /\bpg_/i,
  /Agent access is not available/i,
  /\bselect\b/i,
  /\binsert\b/i,
  /\bupdate\b/i,
  /\bdelete from\b/i,
]

function isSafeMessage(msg: string): boolean {
  if (typeof msg !== 'string' || msg.length === 0 || msg.length > 500) return false
  if (KNOWN_SAFE_MESSAGES.has(msg)) return true
  if (UNSAFE_PATTERNS.some((pat) => pat.test(msg))) return false
  if (/[\r\n\x00-\x1f]/.test(msg)) return false
  return true
}

async function failureFrom(res: Response): Promise<ToolFailure> {
  if (res.status >= 500) {
    try { await res.body?.cancel() } catch { /* the response is already closed */ }
    return GENERIC_FAILURE
  }
  let body: Record<string, unknown>
  try {
    const text = await res.text()
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return GENERIC_FAILURE
    }
    body = parsed as Record<string, unknown>
  } catch {
    return GENERIC_FAILURE
  }

  const rawCode = typeof body.code === 'string' ? body.code : ''
  const rawDetails = typeof body.details === 'string' ? body.details : ''

  let normalizedCode: string | null = null
  if (ALLOWED_PT_CODES[rawCode]) {
    normalizedCode = ALLOWED_PT_CODES[rawCode]
  } else if (rawDetails && ALLOWED_ERROR_CODES.has(rawDetails)) {
    normalizedCode = rawDetails === 'rate_limit' ? 'rate_limited' : rawDetails
  } else if (rawDetails.startsWith('refused.')) {
    normalizedCode = 'forbidden'
  } else if (rawCode && ALLOWED_ERROR_CODES.has(rawCode)) {
    normalizedCode = rawCode === 'rate_limit' ? 'rate_limited' : rawCode
  }

  if (!normalizedCode) {
    return GENERIC_FAILURE
  }

  const rawMessage = typeof body.message === 'string' ? body.message : ''
  if (rawMessage && !isSafeMessage(rawMessage)) {
    return GENERIC_FAILURE
  }

  const message = rawMessage || DEFAULT_MESSAGES[normalizedCode] || GENERIC_FAILURE.message
  const rawField = typeof body.field === 'string' && body.field ? body.field : (typeof body.hint === 'string' && body.hint ? body.hint : null)
  const field = normalizedCode === 'invalid_input' ? rawField : null

  return {
    code: normalizedCode,
    message,
    field,
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
  // A required argument may be null only when its schema admits null (a numeric value that clears).
  const admitsNull = (argumentName: string) => {
    const type = tool.inputSchema.properties[argumentName]?.type
    return Array.isArray(type) && type.includes('null')
  }
  const missing = (tool.inputSchema.required ?? []).find((k) => args[k] === undefined || (args[k] === null && !admitsNull(k)))
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
    deps.log({ event: 'data_api_error', tool: name, status: res.status })
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

async function handle(req: Request, deps: McpDeps): Promise<Response> {
  const url = new URL(req.url)
  // Served at the canonical path and wherever the platform routes it under the function.
  const isMetadata = url.pathname.includes(METADATA_PATH)

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
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

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

  const text = await readCappedText(req, MAX_BODY_BYTES)
  if (text === null) return json({ error: 'payload_too_large' }, 413)
  let message: unknown
  try {
    message = JSON.parse(text)
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

// CORS only for allow-listed origins (a disallowed one is refused inside handle); the wrapper adds
// the headers to whatever handle returns, including the 401 challenge a browser client must read.
export async function mcpHandler(req: Request, deps: McpDeps): Promise<Response> {
  const res = await handle(req, deps)
  const origin = req.headers.get('Origin')
  if (!origin || !deps.allowedOrigins.includes(origin) || new URL(req.url).pathname.includes(METADATA_PATH)) return res
  const headers = new Headers(res.headers)
  headers.set('Access-Control-Allow-Origin', origin)
  headers.append('Vary', 'Origin')
  headers.set('Access-Control-Expose-Headers', 'WWW-Authenticate')
  if (req.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version')
    headers.set('Access-Control-Max-Age', '600')
  }
  return new Response(res.body, { status: res.status, headers })
}
