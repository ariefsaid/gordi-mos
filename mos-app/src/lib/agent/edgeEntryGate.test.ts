// @vitest-environment node
// Every edge function passes requireVerifiedClaims before it reads a claim, and answers CORS only
// for configured app origins. The source scan fails when a new function skips the gate; the entry
// tests exercise the real index.ts wiring with Deno.serve captured.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { machineEntryViolations } from './machineEntryScan'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.fn()
vi.mock('@supabase/supabase-js', () => ({ createClient }))

const FUNCTIONS_DIR = join(__dirname, '../../../../supabase/functions')

// Functions that authenticate without the shared gate, each with the reason. Nothing else may.
const OWN_VERIFICATION: Record<string, { reason: string; calls: RegExp; machine?: true }> = {
  // Accepts only agent tokens, which the shared gate refuses: verifyAgentToken checks the signature
  // against the login service's published keys plus iss, aud, exp and the required claims.
  mcp: { reason: 'agent-token verification', calls: /\bverifyAgentToken\(/ },
  // Machine-to-machine: called hourly by pg_cron with no user session, so there are no user claims
  // to gate. Accepts only the dedicated shared-secret bearer, compared in constant time.
  'attendance-photo-purge': { reason: 'shared-secret bearer', calls: /\bbearerMatches\(/, machine: true },
}

const functionNames = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)

// Source with comments removed, so a mention in prose never satisfies or trips a check.
const code = (path: string) => readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const entrySource = (name: string) =>
  ['index.ts', 'handler.ts']
    .map((f) => join(FUNCTIONS_DIR, name, f))
    .filter(existsSync)
    .map(code)
    .join('\n')

// The first point a request's body, claims or caller-bound client is used.
const FIRST_USE = /\breq\.(json|text|formData|arrayBuffer)\(|\breadCappedJson\(|\bverdict\.claims\b/

describe('edge function gate (source scan)', () => {
  it('finds the deployed functions', () => {
    expect(functionNames).toEqual(expect.arrayContaining(['agent-chat', 'compose-view', 'mcp']))
  })

  it.each(functionNames)('%s verifies the caller through the shared gate or its listed verifier', (name) => {
    const src = entrySource(name)
    const own = OWN_VERIFICATION[name]
    if (own) {
      expect(src).toMatch(own.calls)
      if (own.machine) expect(machineEntryViolations(src)).toEqual([])
      return
    }
    const gate = src.search(/\bconst\s+verdict\s*=\s*await\s+requireVerifiedClaims\(/)
    expect(gate, 'the gate is called and its verdict kept').toBeGreaterThanOrEqual(0)
    expect(src, 'a refused verdict returns').toMatch(/if\s*\(\s*!verdict\.ok\s*\)\s*\{?\s*return\b/)
    const firstUse = src.search(FIRST_USE)
    expect(firstUse, 'the request is used only after the gate').toBeGreaterThan(gate)
  })

  it('machine-entry check rejects a body read or an outbound call before bearerMatches', () => {
    const ok = "export async function handle(req) { if (!(await bearerMatches(h, s))) return json(1); return fetch(u) }"
    expect(machineEntryViolations(ok)).toEqual([])
    expect(machineEntryViolations("async function handle(req) { const b = await req.json(); if (!(await bearerMatches(h, s))) return x }")).toContain('request body is read')
    expect(machineEntryViolations("async function handle(req) { await supabase.storage.from('a').remove([]); if (!(await bearerMatches(h, s))) return x }")).toContain('service-role client or outbound call before bearerMatches')
    expect(machineEntryViolations("async function handle(req) { const c = createClient(u, k); if (!(await bearerMatches(h, s))) return x }")).toContain('service-role client or outbound call before bearerMatches')
    expect(machineEntryViolations("async function handle(req) { const r = bearerMatches(h, s); return fetch(u) }")).toContain('bearerMatches result is not checked with an early return')
  })

  // The protected-resource metadata document is public discovery data any client may read.
  const PUBLIC_WILDCARD = ['mcp/handler.ts']

  it.each(functionNames)('%s never sets a wildcard CORS origin outside public discovery data', (name) => {
    for (const f of readdirSync(join(FUNCTIONS_DIR, name)).filter((f) => f.endsWith('.ts'))) {
      if (PUBLIC_WILDCARD.includes(`${name}/${f}`)) continue
      expect(code(join(FUNCTIONS_DIR, name, f))).not.toMatch(/['"`]Access-Control-Allow-Origin['"`]\s*[:,]\s*['"`]\*['"`]/i)
    }
  })

  it('decodes token segments only through the shared helper, used by the gate and the agent-token verifier', () => {
    const decoders: string[] = []
    const segmentUsers: string[] = []
    const walk = (dir: string) => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, d.name)
        if (d.isDirectory()) { walk(p); continue }
        if (!d.name.endsWith('.ts')) continue
        const src = code(p)
        const rel = p.slice(FUNCTIONS_DIR.length + 1)
        if (/\batob\(/.test(src)) decoders.push(rel)
        if (/\bjwtSegment(\.ts)?['"`]/.test(src)) segmentUsers.push(rel)
      }
    }
    walk(FUNCTIONS_DIR)
    expect(decoders).toEqual(['_shared/jwtSegment.ts'])
    expect(segmentUsers.sort()).toEqual(['_shared/claims.ts', 'mcp/auth.ts'])
  })
})

type Serve = (req: Request) => Promise<Response>

function makeJwt(payload: object): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.sig`
}

const entries = import.meta.glob('../../../../supabase/functions/*/index.ts') as Record<string, () => Promise<unknown>>
const GATED = ['agent-chat', 'compose-view'].map((name) => {
  const load = entries[`../../../../supabase/functions/${name}/index.ts`]
  if (!load) throw new Error(`no entry point for ${name}`)
  return [name, load] as const
})

async function loadServe(load: () => Promise<unknown>, env: Record<string, string> = {}): Promise<Serve> {
  let serve: Serve | undefined
  vi.stubGlobal('Deno', { serve: (h: Serve) => { serve = h }, env: { get: (k: string) => env[k] } })
  vi.resetModules()
  await load()
  if (!serve) throw new Error('index.ts did not register a handler')
  return serve
}

describe.each(GATED)('%s entry point', (_name, load) => {
  beforeEach(() => { createClient.mockReset() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('refuses a token the verifier rejects, whatever claims it carries', async () => {
    const getUser = vi.fn(async () => ({ data: { user: null }, error: new Error('bad signature') }))
    createClient.mockReturnValue({ auth: { getUser } })
    const serve = await loadServe(load, { AGENT_MODEL_DEFAULT: 'm', AGENT_MODEL_API_KEY: 'k', AGENT_MODEL_BASE_URL: 'http://model' })
    const forged = makeJwt({ org_id: 'org-1', person_id: 'person-1', access_roles: ['admin'] })
    const res = await serve(new Request('http://localhost/fn', {
      method: 'POST',
      headers: { Authorization: `Bearer ${forged}`, 'Content-Type': 'application/json' },
      body: '{}',
    }))
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'UNAUTHORIZED', detail: 'invalid JWT' })
    expect(getUser).toHaveBeenCalledWith(forged)
  })

  it('answers a preflight from a configured origin and withholds the origin from others', async () => {
    const serve = await loadServe(load, { APP_ALLOWED_ORIGINS: 'https://app.example' })
    const preflight = (origin: string) => serve(new Request('http://localhost/fn', { method: 'OPTIONS', headers: { Origin: origin } }))
    expect((await preflight('https://app.example')).headers.get('Access-Control-Allow-Origin')).toBe('https://app.example')
    expect((await preflight('https://evil.example')).headers.get('Access-Control-Allow-Origin')).toBeNull()
  })
})

const agentChatLoad = entries['../../../../supabase/functions/agent-chat/index.ts']!
const composeViewLoad = entries['../../../../supabase/functions/compose-view/index.ts']!

type AssistantSettingResult = { data: unknown; error: unknown | null }
type AssistantSettings = { org: AssistantSettingResult; person: AssistantSettingResult; thrown?: 'org' | 'person' }

const ASSISTANT_GATED = [['agent-chat', agentChatLoad], ['compose-view', composeViewLoad]] as const

function mockAssistantClients(settings: AssistantSettings) {
  const getUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }))
  const verifier = { auth: { getUser } }
  const queries = new Map<string, { eq: ReturnType<typeof vi.fn> }>()
  const serviceRole = { schema: vi.fn(() => ({
    from: vi.fn((table: string) => {
      const result = table === 'org_module_settings' ? settings.org : settings.person
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        maybeSingle: settings.thrown === (table === 'org_module_settings' ? 'org' : 'person')
          ? vi.fn().mockRejectedValue(new Error('read threw'))
          : vi.fn().mockResolvedValue(result),
      }
      queries.set(table, query)
      return query
    }),
  })) }
  createClient.mockReturnValueOnce(verifier as never)
    .mockReturnValueOnce(serviceRole as never)
    .mockReturnValue({} as never)
  return { getUser, queries }
}

const enabledOrg = { data: { enabled: true }, error: null }
const inheritPerson = { data: null, error: null }

async function postAssistantEntry(serve: Serve, body = JSON.stringify({ org_id: 'spoof-org' })) {
  const jwt = makeJwt({ org_id: 'org-1', person_id: 'person-1', access_roles: ['admin'] })
  return serve(new Request('http://localhost/fn', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
    body,
  }))
}

describe.each(ASSISTANT_GATED)('%s per-person Assistant gate', (_name, load) => {
  beforeEach(() => { createClient.mockReset() })
  afterEach(() => { vi.unstubAllGlobals() })

  it.each([
    ['missing org row stays default-off despite Allow', { org: { data: null, error: null }, person: { data: { override: 'allow' }, error: null } }, 403],
    ['Org Off defeats personal Allow', { org: { data: { enabled: false }, error: null }, person: { data: { override: 'allow' }, error: null } }, 403],
    ['personal Block refuses an enabled org', { org: enabledOrg, person: { data: { override: 'block' }, error: null } }, 403],
    ['org read error fails closed', { org: { data: null, error: new Error('read failed') }, person: inheritPerson }, 503],
    ['person read error fails closed', { org: enabledOrg, person: { data: null, error: new Error('read failed') } }, 503],
    ['org read throw fails closed', { org: { data: null, error: null }, person: inheritPerson, thrown: 'org' }, 503],
    ['person read throw fails closed', { org: enabledOrg, person: inheritPerson, thrown: 'person' }, 503],
    ['malformed org row fails closed', { org: { data: { enabled: 'yes' }, error: null }, person: inheritPerson }, 503],
    ['malformed person row fails closed', { org: enabledOrg, person: { data: { override: 'grant' }, error: null } }, 503],
  ] as const)('%s before model work and scopes reads to verified claims', async (_case, settings, status) => {
    const { queries } = mockAssistantClients(settings)
    const serve = await loadServe(load)
    const response = await postAssistantEntry(serve, '{')
    expect(response.status).toBe(status)
    const responseBody = await response.json()
    expect(responseBody).toMatchObject({ error: status === 403 ? 'MODULE_OFF' : 'MODULE_AVAILABILITY_UNAVAILABLE' })
    expect(createClient).toHaveBeenCalledTimes(2)
    expect(queries.get('org_module_settings')?.eq.mock.calls).toEqual([
      ['org_id', 'org-1'], ['module_id', 'assistant'],
    ])
    expect(queries.get('person_module_settings')?.eq.mock.calls).toEqual([
      ['org_id', 'org-1'], ['person_id', 'person-1'], ['module_id', 'assistant'],
    ])
    if (status === 403) {
      expect(responseBody).toMatchObject({ detail: 'assistant is not available for this person' })
    }
  })

  it.each(['inherit', 'allow'] as const)('reaches model configuration for org On + personal %s', async (override) => {
    mockAssistantClients({ org: enabledOrg, person: { data: { override }, error: null } })
    const serve = await loadServe(load)
    const response = await postAssistantEntry(serve)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ error: 'MODEL_NOT_CONFIGURED' })
    expect(createClient).toHaveBeenCalledTimes(_name === 'agent-chat' ? 3 : 2)
  })
})

describe('compose-view Assistant gate ordering', () => {
  beforeEach(() => { createClient.mockReset() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('refuses before parsing malformed request JSON for a personal Block', async () => {
    mockAssistantClients({ org: enabledOrg, person: { data: { override: 'block' }, error: null } })
    const serve = await loadServe(composeViewLoad, {
      AGENT_MODEL_DEFAULT: 'm', AGENT_MODEL_API_KEY: 'k', AGENT_MODEL_BASE_URL: 'http://model',
    })

    const response = await postAssistantEntry(serve, '{')
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ error: 'MODULE_OFF' })
  })
})
